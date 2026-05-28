package service

import (
	"context"
	"crypto/rand"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	autoDMDefaultIntervalMinutes = 60
	autoDMMaxSendAttempts        = 3
	autoDMNoAccountReason        = "Auto DM skipped: no connected X account is available."
	autoDMNoTokenReason          = "Auto DM skipped: connected X account is missing an access token."
	autoDMNoRecipientReason      = "Auto DM skipped: no eligible recent interaction recipient was found."
)

type AutoDMService struct {
	accountRepo     *repository.TwitterAccountRepository
	automationRepo  *repository.AutomationRepository
	activityRepo    *repository.ActivityRepository
	taskRepo        *repository.AutoDMTaskRepository
	ruleRepo        *repository.AutoDMRecipientRuleRepository
	importRepo      *repository.AutoDMRecipientImportRepository
	userRepo        *repository.UserRepository
	oafBotRepo      *repository.OAFBotRepository
	contentRepo     *repository.ContentLibraryRepository
	usageRepo       *repository.AIGenerationUsageRepository
	ai              *AIService
	frontendBaseURL string
}

func NewAutoDMService(
	accountRepo *repository.TwitterAccountRepository,
	automationRepo *repository.AutomationRepository,
	activityRepo *repository.ActivityRepository,
	taskRepo *repository.AutoDMTaskRepository,
	ruleRepo *repository.AutoDMRecipientRuleRepository,
	importRepo *repository.AutoDMRecipientImportRepository,
	userRepo *repository.UserRepository,
	oafBotRepo *repository.OAFBotRepository,
	contentRepo *repository.ContentLibraryRepository,
	usageRepo *repository.AIGenerationUsageRepository,
	ai *AIService,
	frontendBaseURL string,
) *AutoDMService {
	return &AutoDMService{
		accountRepo:     accountRepo,
		automationRepo:  automationRepo,
		activityRepo:    activityRepo,
		taskRepo:        taskRepo,
		ruleRepo:        ruleRepo,
		importRepo:      importRepo,
		userRepo:        userRepo,
		oafBotRepo:      oafBotRepo,
		contentRepo:     contentRepo,
		usageRepo:       usageRepo,
		ai:              ai,
		frontendBaseURL: strings.TrimRight(strings.TrimSpace(frontendBaseURL), "/"),
	}
}

type autoDMCandidate struct {
	UserID   string
	Username string
	Message  string
}

type autoDMFailure struct {
	Category     string
	Reason       string
	Retryable    bool
	RetryAfterAt *time.Time
}

type autoDMFailureError struct {
	category string
	message  string
}

func (e *autoDMFailureError) Error() string { return e.message }

type autoDMRecipientDecision struct {
	Allowed bool
	Reason  string
}

// RunTick advances Auto DM candidate generation and sends approved tasks.
func (s *AutoDMService) RunTick(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	now := time.Now().UTC()
	if err := s.sendApprovedTasks(ctx, now); err != nil {
		zap.L().Warn("auto dm: send approved tasks failed", zap.Error(err))
	}
	configs, err := s.automationRepo.ListDueDMAutomationConfigs(50, now)
	if err != nil {
		zap.L().Warn("auto dm: list due configs failed", zap.Error(err))
		return
	}
	for i := range configs {
		runCtx := requestid.NewContext(ctx, "scheduler")
		if err := s.runOnce(runCtx, &configs[i], now); err != nil {
			zap.L().Warn("auto dm: config tick failed",
				zap.Uint("user_id", configs[i].UserID),
				zap.Uint("config_id", configs[i].ID),
				zap.Error(err))
		}
	}
}

func (s *AutoDMService) runOnce(ctx context.Context, cfg *model.AutomationConfig, now time.Time) error {
	if cfg == nil {
		return nil
	}
	user, err := s.userRepo.GetByID(cfg.UserID)
	if err != nil {
		return err
	}
	if err := subscription.AssertUserMayProduceContent(user, now); err != nil {
		return s.finishRun(cfg, now, "Paused")
	}

	accounts, err := s.accountRepo.ListByUserID(cfg.UserID)
	if err != nil {
		return err
	}
	account := firstAutoDMAccount(accounts)
	if account == nil {
		if err := s.createDMAudit(cfg.UserID, 0, "—", "capability_check", "failed", "account_missing", "activity.preview.dmSkipped", autoDMNoAccountReason, true, now); err != nil {
			return err
		}
		return s.finishRun(cfg, now, "Needs Review")
	}
	handle := formatXAccountHandle(account.Username)
	if strings.TrimSpace(account.AccessToken) == "" {
		if err := s.createDMAudit(cfg.UserID, account.ID, handle, "capability_check", "failed", "token_missing", "activity.preview.dmSkipped", autoDMNoTokenReason, true, now); err != nil {
			return err
		}
		return s.finishRun(cfg, now, "Needs Review")
	}
	if missing := missingDMSendScopes(account.OAuthScopes); len(missing) > 0 {
		reason := "Auto DM blocked: reconnect this X account with OAuth scopes " + strings.Join(missing, ", ") + "."
		if err := s.createDMAudit(cfg.UserID, account.ID, handle, "capability_check", "failed", "missing_oauth_scope", "activity.preview.dmCapabilityMissing", reason, true, now); err != nil {
			return err
		}
		return s.finishRun(cfg, now, "Needs Review")
	}
	candidate, err := s.findAutoDMCandidate(ctx, cfg.UserID, account)
	if err != nil {
		reason := "Auto DM recipient lookup failed: " + err.Error()
		if err := s.createDMAudit(cfg.UserID, account.ID, handle, "interaction_lookup", "failed", "recipient_lookup_failed", "activity.preview.dmCapabilityMissing", reason, true, now); err != nil {
			return err
		}
		return s.finishRun(cfg, now, "Needs Review")
	}
	if candidate == nil {
		if err := s.createDMAudit(cfg.UserID, account.ID, handle, "interaction_only", "failed", "no_eligible_recipient", "activity.preview.dmSkipped", autoDMNoRecipientReason, true, now); err != nil {
			return err
		}
		return s.finishRun(cfg, now, "Needs Review")
	}

	if cfg.SafetyRequireApproval {
		if err := s.createDMAuditWithCandidate(cfg.UserID, account.ID, handle, "interaction_only", "review", "recipient_rule_pending", "activity.preview.dmDryRunReview", "", true, candidate, now); err != nil {
			return err
		}
		zap.L().Info("auto dm: dry-run review created",
			zap.String("request_id", requestid.FromContext(ctx)),
			zap.Uint("user_id", cfg.UserID),
			zap.Uint("x_account_id", account.ID))
		return s.finishRun(cfg, now, "Needs Review")
	}

	if err := s.createDMAuditWithCandidate(cfg.UserID, account.ID, handle, "interaction_only", "approved", "approved_pending_real_send", "activity.preview.dmDryRunReview", "", false, candidate, now); err != nil {
		return err
	}
	return s.finishRun(cfg, now, "Queued")
}

func firstAutoDMAccount(accounts []model.TwitterAccount) *model.TwitterAccount {
	for i := range accounts {
		if strings.TrimSpace(accounts[i].Status) == "disconnected" {
			continue
		}
		return &accounts[i]
	}
	return nil
}

func (s *AutoDMService) createDMAudit(userID, accountID uint, handle, recipientSource, status, capabilityStatus, previewKey, reason string, approvalRequired bool, at time.Time) error {
	return s.createDMAuditWithCandidate(userID, accountID, handle, recipientSource, status, capabilityStatus, previewKey, reason, approvalRequired, nil, at)
}

func (s *AutoDMService) createDMAuditWithCandidate(userID, accountID uint, handle, recipientSource, status, capabilityStatus, previewKey, reason string, approvalRequired bool, candidate *autoDMCandidate, at time.Time) error {
	if s.taskRepo != nil {
		var open bool
		var err error
		if candidate != nil && strings.TrimSpace(candidate.UserID) != "" {
			open, err = s.taskRepo.HasTaskForRecipient(userID, accountID, candidate.UserID)
		} else {
			open, err = s.taskRepo.HasOpenCapabilityTask(userID, accountID, capabilityStatus)
		}
		if err != nil {
			return err
		}
		if open {
			return nil
		}
	}
	logStatus := status
	if logStatus == "approved" {
		logStatus = "review"
	}
	log := &model.ActivityLog{
		UserID:        userID,
		XAccountID:    accountID,
		Type:          "dm",
		Status:        logStatus,
		PreviewKey:    previewKey,
		AccountHandle: handle,
		ExecutedAt:    at,
		ErrorMessage:  truncateErrMsg(reason),
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		return err
	}
	if s.taskRepo == nil {
		return nil
	}
	recipientUserID := ""
	recipientUsername := ""
	messagePreview := autoDMMessagePreview(recipientSource, candidate)
	if candidate != nil {
		recipientUserID = strings.TrimSpace(candidate.UserID)
		recipientUsername = strings.TrimSpace(candidate.Username)
	}
	task := &model.AutoDMTask{
		UserID:            userID,
		XAccountID:        accountID,
		AccountHandle:     handle,
		RecipientSource:   recipientSource,
		RecipientUserID:   recipientUserID,
		RecipientUsername: recipientUsername,
		MessagePreview:    messagePreview,
		Status:            status,
		CapabilityStatus:  capabilityStatus,
		FailureReason:     truncateErrMsg(reason),
		ApprovalRequired:  approvalRequired,
		ActivityLogID:     log.ID,
		GeneratedAt:       at,
	}
	if status == "approved" {
		task.ApprovedAt = &at
	}
	return s.taskRepo.Create(task)
}

func (s *AutoDMService) findAutoDMCandidate(ctx context.Context, userID uint, account *model.TwitterAccount) (*autoDMCandidate, error) {
	if account == nil {
		return nil, nil
	}
	token := strings.TrimSpace(account.AccessToken)
	twitterUserID := strings.TrimSpace(account.TwitterUserID)
	if token == "" || twitterUserID == "" {
		return nil, nil
	}
	rootIDs, err := twitter.ListUserRootTweetIDs(ctx, nil, token, twitterUserID, 5)
	if err != nil {
		return nil, err
	}
	for _, rootID := range rootIDs {
		replies, err := twitter.ListDirectRepliesFromOthers(ctx, nil, token, rootID, twitterUserID)
		if err != nil {
			return nil, err
		}
		for _, reply := range replies {
			if strings.TrimSpace(reply.AuthorID) == "" {
				continue
			}
			exists, err := s.taskRepo.HasTaskForRecipient(userID, account.ID, reply.AuthorID)
			if err != nil {
				return nil, err
			}
			if exists {
				continue
			}
			decision, err := s.autoDMRecipientAllowed(userID, account.ID, reply.AuthorID, true)
			if err != nil {
				return nil, err
			}
			if !decision.Allowed {
				continue
			}
			message := s.generateAutoDMMessage(ctx, userID, account.ID, reply.AuthorUsername, reply.Text)
			return &autoDMCandidate{
				UserID:   reply.AuthorID,
				Username: replyAuthorDisplay(reply.AuthorUsername),
				Message:  message,
			}, nil
		}
	}
	return nil, nil
}

func (s *AutoDMService) ListTasks(userID uint) (*dto.AutoDMTasksResponse, error) {
	rows, err := s.taskRepo.ListByUser(userID, 20)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoDMTaskItem, 0, len(rows))
	for i := range rows {
		items = append(items, autoDMTaskToDTO(&rows[i]))
	}
	return &dto.AutoDMTasksResponse{Items: items}, nil
}

func (s *AutoDMService) ListRecipientRules(userID uint, query dto.AutoDMRecipientRuleQuery) (*dto.AutoDMRecipientRulesResponse, error) {
	if s.ruleRepo == nil {
		return &dto.AutoDMRecipientRulesResponse{Items: []dto.AutoDMRecipientRuleItem{}}, nil
	}
	rows, total, err := s.ruleRepo.ListByUser(userID, repository.AutoDMRecipientRuleListQuery{
		Search:     query.Search,
		Status:     query.Status,
		XAccountID: query.XAccountID,
		Limit:      query.Limit,
	})
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoDMRecipientRuleItem, 0, len(rows))
	for i := range rows {
		items = append(items, s.autoDMRecipientRuleToDTO(&rows[i]))
	}
	return &dto.AutoDMRecipientRulesResponse{Items: items, Total: total}, nil
}

func (s *AutoDMService) ListRecipientImports(userID uint) (*dto.AutoDMRecipientImportsResponse, error) {
	if s.importRepo == nil {
		return &dto.AutoDMRecipientImportsResponse{Items: []dto.AutoDMRecipientImportItem{}}, nil
	}
	rows, err := s.importRepo.ListByUser(userID, 20)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoDMRecipientImportItem, 0, len(rows))
	for i := range rows {
		items = append(items, autoDMRecipientImportToDTO(&rows[i]))
	}
	return &dto.AutoDMRecipientImportsResponse{Items: items}, nil
}

func (s *AutoDMService) ApproveTask(userID, taskID uint) (*dto.AutoDMTaskItem, error) {
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypeDM, "approve dm task"); err != nil {
		return nil, err
	}
	task, err := s.taskRepo.GetByUserAndID(userID, taskID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if err := s.taskRepo.Approve(task, now); err != nil {
		return nil, err
	}
	updated, err := s.taskRepo.GetByUserAndID(userID, taskID)
	if err != nil {
		return nil, err
	}
	out := autoDMTaskToDTO(updated)
	return &out, nil
}

func (s *AutoDMService) BlockTask(userID, taskID uint, reason string) (*dto.AutoDMTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, taskID)
	if err != nil {
		return nil, err
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "Blocked by user before real DM send."
	}
	now := time.Now().UTC()
	if err := s.taskRepo.Block(task, truncateErrMsg(reason), now); err != nil {
		return nil, err
	}
	updated, err := s.taskRepo.GetByUserAndID(userID, taskID)
	if err != nil {
		return nil, err
	}
	out := autoDMTaskToDTO(updated)
	return &out, nil
}

func (s *AutoDMService) RetryTask(userID, taskID uint) (*dto.AutoDMTaskItem, error) {
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypeDM, "retry dm task"); err != nil {
		return nil, err
	}
	task, err := s.taskRepo.GetByUserAndID(userID, taskID)
	if err != nil {
		return nil, err
	}
	if !task.Retryable || strings.TrimSpace(task.Status) != "failed" {
		return nil, errors.New("auto dm task is not retryable")
	}
	if task.AttemptCount >= autoDMMaxSendAttempts {
		return nil, errors.New("auto dm task reached retry limit")
	}
	now := time.Now().UTC()
	if err := s.taskRepo.Requeue(task, now); err != nil {
		return nil, err
	}
	updated, err := s.taskRepo.GetByUserAndID(userID, taskID)
	if err != nil {
		return nil, err
	}
	out := autoDMTaskToDTO(updated)
	return &out, nil
}

func (s *AutoDMService) SetRecipientRuleFromTask(userID, taskID uint, status, reason string) (*dto.AutoDMRecipientRuleItem, error) {
	status = strings.TrimSpace(status)
	if !repository.IsAutoDMRecipientRuleStatus(status) {
		return nil, errors.New("invalid auto dm recipient rule status")
	}
	task, err := s.taskRepo.GetByUserAndID(userID, taskID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(task.RecipientUserID) == "" {
		return nil, errors.New("auto dm task is missing recipient_user_id")
	}
	now := time.Now().UTC()
	rule, err := s.ruleRepo.Upsert(
		userID,
		task.XAccountID,
		task.RecipientUserID,
		task.RecipientUsername,
		status,
		"task",
		reason,
		mustAutoDMUnsubscribeToken(),
		now,
	)
	if err != nil {
		return nil, err
	}
	if err := s.createRecipientRuleActivity(userID, task.XAccountID, task.AccountHandle, "activity.preview.dmRecipientRuleUpdated", status, reason, now); err != nil {
		return nil, err
	}
	if status == repository.AutoDMRecipientBlocked || status == repository.AutoDMRecipientUnsubscribed {
		blockReason := "Auto DM recipient marked as " + status
		if strings.TrimSpace(reason) != "" {
			blockReason += ": " + strings.TrimSpace(reason)
		}
		_ = s.taskRepo.Block(task, truncateErrMsg(blockReason), now)
	}
	out := s.autoDMRecipientRuleToDTO(rule)
	return &out, nil
}

func (s *AutoDMService) UpdateRecipientRule(userID, ruleID uint, status, reason string) (*dto.AutoDMRecipientRuleItem, error) {
	status = strings.TrimSpace(status)
	if !repository.IsAutoDMRecipientRuleStatus(status) {
		return nil, errors.New("invalid auto dm recipient rule status")
	}
	now := time.Now().UTC()
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "Updated from Auto DM recipient manager."
	}
	rule, err := s.ruleRepo.UpdateStatusByID(userID, ruleID, status, reason, "manual", now)
	if err != nil {
		return nil, err
	}
	activityReason := fmt.Sprintf("Recipient %s marked %s. %s", rule.RecipientUserID, status, reason)
	if err := s.createRecipientRuleActivity(userID, rule.XAccountID, "", "activity.preview.dmRecipientRuleUpdated", status, activityReason, now); err != nil {
		return nil, err
	}
	out := s.autoDMRecipientRuleToDTO(rule)
	return &out, nil
}

func (s *AutoDMService) BulkUpdateRecipientRules(userID uint, req dto.AutoDMRecipientRuleBulkRequest) (*dto.AutoDMRecipientRuleBulkResponse, error) {
	status := strings.TrimSpace(req.Status)
	if !repository.IsAutoDMRecipientRuleStatus(status) {
		return nil, errors.New("invalid auto dm recipient rule status")
	}
	ids := uniqueAutoDMRuleIDs(req.IDs)
	if len(ids) == 0 {
		return nil, errors.New("auto dm recipient rule ids are required")
	}
	if len(ids) > 100 {
		return nil, errors.New("auto dm recipient rule bulk update is limited to 100 items")
	}
	now := time.Now().UTC()
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		reason = "Bulk updated from Auto DM recipient manager."
	}
	rows, err := s.ruleRepo.UpdateStatusByIDs(userID, ids, status, reason, "manual_bulk", now)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoDMRecipientRuleItem, 0, len(rows))
	for i := range rows {
		row := &rows[i]
		activityReason := fmt.Sprintf("Recipient %s marked %s in bulk update. %s", row.RecipientUserID, status, reason)
		if err := s.createRecipientRuleActivity(userID, row.XAccountID, "", "activity.preview.dmRecipientRuleUpdated", status, activityReason, now); err != nil {
			return nil, err
		}
		items = append(items, s.autoDMRecipientRuleToDTO(row))
	}
	return &dto.AutoDMRecipientRuleBulkResponse{Updated: len(items), Items: items}, nil
}

func (s *AutoDMService) ImportRecipientRules(userID uint, req dto.AutoDMRecipientImportRequest) (*dto.AutoDMRecipientImportResponse, error) {
	if s.ruleRepo == nil {
		return nil, errors.New("auto dm recipient rules are not configured")
	}
	accountID := req.XAccountID
	if accountID == 0 {
		account, err := s.firstConnectedAccountForUser(userID)
		if err != nil {
			return nil, err
		}
		accountID = account.ID
	}
	reader := csv.NewReader(strings.NewReader(req.CSV))
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true
	now := time.Now().UTC()
	out := &dto.AutoDMRecipientImportResponse{Items: []dto.AutoDMRecipientRuleItem{}}
	line := 0
	for {
		row, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		line++
		if err != nil {
			out.Skipped++
			out.Errors = append(out.Errors, fmt.Sprintf("line %d: %v", line, err))
			continue
		}
		recipientID, username, skip, rowErr := parseAutoDMImportRow(row)
		if skip {
			if rowErr != "" {
				out.Skipped++
				out.Errors = append(out.Errors, fmt.Sprintf("line %d: %s", line, rowErr))
			}
			continue
		}
		rule, err := s.ruleRepo.Upsert(
			userID,
			accountID,
			recipientID,
			username,
			repository.AutoDMRecipientAllowlisted,
			"csv_import",
			"Imported from Auto DM allowlist CSV.",
			mustAutoDMUnsubscribeToken(),
			now,
		)
		if err != nil {
			out.Skipped++
			out.Errors = append(out.Errors, fmt.Sprintf("line %d: %v", line, err))
			continue
		}
		out.Imported++
		out.Items = append(out.Items, s.autoDMRecipientRuleToDTO(rule))
	}
	batch := &model.AutoDMRecipientImport{
		UserID:       userID,
		XAccountID:   accountID,
		Source:       "csv_import",
		Imported:     out.Imported,
		Skipped:      out.Skipped,
		ErrorSummary: marshalAutoDMImportErrors(out.Errors),
		ImportedAt:   now,
	}
	if s.importRepo != nil {
		if err := s.importRepo.Create(batch); err != nil {
			return nil, err
		}
		out.Batch = ptrAutoDMImportDTO(autoDMRecipientImportToDTO(batch))
	}
	if out.Imported > 0 {
		accountHandle := ""
		if account, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, accountID); err == nil {
			accountHandle = formatXAccountHandle(account.Username)
		}
		if err := s.createRecipientRuleActivity(userID, accountID, accountHandle, "activity.preview.dmRecipientImport", repository.AutoDMRecipientAllowlisted, fmt.Sprintf("Imported %d Auto DM allowlist recipients (%d skipped).", out.Imported, out.Skipped), now); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (s *AutoDMService) GetPreference(token string) (*dto.AutoDMPreferenceResponse, error) {
	rule, err := s.ruleRepo.GetByToken(token)
	if err != nil {
		return nil, err
	}
	return &dto.AutoDMPreferenceResponse{
		RecipientUsername: rule.RecipientUsername,
		Status:            rule.Status,
	}, nil
}

func (s *AutoDMService) PublicUnsubscribe(token string) (*dto.AutoDMPreferenceResponse, error) {
	now := time.Now().UTC()
	rule, err := s.ruleRepo.MarkUnsubscribedByToken(token, now)
	if err != nil {
		return nil, err
	}
	_ = s.createRecipientRuleActivity(rule.UserID, rule.XAccountID, "", "activity.preview.dmRecipientRuleUpdated", repository.AutoDMRecipientUnsubscribed, "Recipient unsubscribed from public preference center.", now)
	return &dto.AutoDMPreferenceResponse{
		RecipientUsername: rule.RecipientUsername,
		Status:            rule.Status,
	}, nil
}

func (s *AutoDMService) sendApprovedTasks(ctx context.Context, now time.Time) error {
	if s.taskRepo == nil {
		return nil
	}
	tasks, err := s.taskRepo.ListReadyForSending(20, now, autoDMMaxSendAttempts)
	if err != nil {
		return err
	}
	for i := range tasks {
		task := tasks[i]
		if err := s.sendOneApprovedTask(ctx, &task, now); err != nil {
			zap.L().Warn("auto dm: approved task send failed",
				zap.Uint("task_id", task.ID),
				zap.Uint("user_id", task.UserID),
				zap.Error(err))
		}
	}
	return nil
}

func (s *AutoDMService) sendOneApprovedTask(ctx context.Context, task *model.AutoDMTask, now time.Time) error {
	if task == nil {
		return nil
	}
	account, cfg, skip, err := s.validateApprovedSend(task, now)
	if err != nil {
		if markErr := s.failDMTask(task, classifyAutoDMFailure(err, now), now); markErr != nil {
			return markErr
		}
		return err
	}
	if skip {
		return nil
	}
	reserved, err := s.taskRepo.ReserveForSending(task, now, autoDMMaxSendAttempts)
	if err != nil {
		return err
	}
	if !reserved {
		return nil
	}
	conversationID, eventID, apiErr := twitter.SendDirectMessage(ctx, account.AccessToken, task.RecipientUserID, task.MessagePreview)
	if apiErr != nil {
		failure := classifyAutoDMFailure(apiErr, now)
		if err := s.failDMTask(task, failure, now); err != nil {
			return err
		}
		return apiErr
	}
	if err := s.taskRepo.MarkSent(task, conversationID, eventID, now); err != nil {
		return err
	}
	log := &model.ActivityLog{
		UserID:        task.UserID,
		XAccountID:    task.XAccountID,
		Type:          "dm",
		Status:        "success",
		PreviewKey:    "activity.preview.dmSendSuccess",
		AccountHandle: task.AccountHandle,
		ExecutedAt:    now,
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		return err
	}
	zap.L().Info("auto dm: sent",
		zap.Uint("task_id", task.ID),
		zap.Uint("user_id", task.UserID),
		zap.Uint("x_account_id", task.XAccountID),
		zap.String("dm_event_id", eventID),
		zap.String("tone", cfg.Tone))
	return nil
}

func (s *AutoDMService) validateApprovedSend(task *model.AutoDMTask, now time.Time) (*model.TwitterAccount, *model.AutomationConfig, bool, error) {
	if strings.TrimSpace(task.RecipientUserID) == "" {
		return nil, nil, false, newAutoDMFailureError("missing_recipient", "auto dm task is missing recipient_user_id")
	}
	if strings.TrimSpace(task.MessagePreview) == "" {
		return nil, nil, false, newAutoDMFailureError("empty_message", "auto dm task is missing message text")
	}
	if strings.TrimSpace(task.RecipientSource) != "interaction_only" {
		return nil, nil, false, newAutoDMFailureError("unsafe_recipient_rule", "auto dm task recipient rule is not allowed for real send")
	}
	user, err := s.userRepo.GetByID(task.UserID)
	if err != nil {
		return nil, nil, false, err
	}
	if err := subscription.AssertUserMayProduceContent(user, now); err != nil {
		return nil, nil, false, err
	}
	account, err := s.accountRepo.GetConnectedByUserAndAccountID(task.UserID, task.XAccountID)
	if err != nil {
		return nil, nil, false, err
	}
	if strings.TrimSpace(account.AccessToken) == "" {
		return nil, nil, false, newAutoDMFailureError("token_missing", autoDMNoTokenReason)
	}
	if strings.TrimSpace(account.TwitterUserID) == strings.TrimSpace(task.RecipientUserID) {
		return nil, nil, false, newAutoDMFailureError("self_recipient", "auto dm task cannot send to the connected account itself")
	}
	decision, err := s.autoDMRecipientAllowed(task.UserID, task.XAccountID, task.RecipientUserID, false)
	if err != nil {
		return nil, nil, false, err
	}
	if !decision.Allowed {
		return nil, nil, false, newAutoDMFailureError("recipient_rule_blocked", decision.Reason)
	}
	if missing := missingDMSendScopes(account.OAuthScopes); len(missing) > 0 {
		return nil, nil, false, newAutoDMFailureError("missing_oauth_scope", "reconnect this X account with OAuth scopes "+strings.Join(missing, ", "))
	}
	cfg, err := s.automationRepo.GetByUserAndType(task.UserID, repository.AutomationTypeDM)
	if err != nil {
		return nil, nil, false, err
	}
	if hit, reason := s.dmSendLimitsExceeded(task.UserID, cfg, now); hit {
		zap.L().Debug("auto dm: skip approved task due limits",
			zap.Uint("task_id", task.ID),
			zap.Uint("user_id", task.UserID),
			zap.String("reason", reason))
		return account, cfg, true, nil
	}
	if blocked := blockedKeywordInMessage(cfg.SafetyBlockedKeywords, task.MessagePreview); blocked != "" {
		return nil, nil, false, newAutoDMFailureError("blocked_keyword", "auto dm message contains blocked keyword: "+blocked)
	}
	return account, cfg, false, nil
}

func (s *AutoDMService) failDMTask(task *model.AutoDMTask, failure autoDMFailure, at time.Time) error {
	reason := truncateErrMsg(failure.Reason)
	if err := s.taskRepo.MarkFailed(task, reason, failure.Category, failure.Retryable, failure.RetryAfterAt); err != nil {
		return err
	}
	log := &model.ActivityLog{
		UserID:        task.UserID,
		XAccountID:    task.XAccountID,
		Type:          "dm",
		Status:        "failed",
		PreviewKey:    "activity.preview.dmSendFailed",
		AccountHandle: task.AccountHandle,
		ExecutedAt:    at,
		ErrorMessage:  reason,
	}
	return s.activityRepo.DB.Create(log).Error
}

func classifyAutoDMFailure(err error, now time.Time) autoDMFailure {
	if err == nil {
		return autoDMFailure{Category: "unknown", Reason: "unknown auto dm failure"}
	}
	var known *autoDMFailureError
	if errors.As(err, &known) {
		return autoDMFailure{Category: known.category, Reason: known.Error()}
	}
	var pub *twitter.PublishError
	if errors.As(err, &pub) {
		if pub.RateLimited {
			delay := pub.RetryAfter
			if delay <= 0 {
				delay = 30 * time.Minute
			}
			retryAt := now.Add(delay)
			return autoDMFailure{
				Category:     "rate_limited",
				Reason:       pub.Error(),
				Retryable:    true,
				RetryAfterAt: &retryAt,
			}
		}
		if pub.StatusCode >= 500 {
			retryAt := now.Add(15 * time.Minute)
			return autoDMFailure{
				Category:     "x_server_error",
				Reason:       pub.Error(),
				Retryable:    true,
				RetryAfterAt: &retryAt,
			}
		}
		if pub.StatusCode == 401 || pub.StatusCode == 403 {
			return autoDMFailure{Category: "x_permission_denied", Reason: pub.Error()}
		}
		if pub.StatusCode == 404 {
			return autoDMFailure{Category: "recipient_unavailable", Reason: pub.Error()}
		}
		return autoDMFailure{Category: "x_api_rejected", Reason: pub.Error()}
	}
	retryAt := now.Add(10 * time.Minute)
	return autoDMFailure{
		Category:     "network_or_unknown",
		Reason:       err.Error(),
		Retryable:    true,
		RetryAfterAt: &retryAt,
	}
}

func newAutoDMFailureError(category, message string) error {
	return &autoDMFailureError{category: strings.TrimSpace(category), message: strings.TrimSpace(message)}
}

func (s *AutoDMService) autoDMRecipientAllowed(userID, accountID uint, recipientUserID string, candidateLookup bool) (autoDMRecipientDecision, error) {
	if s.ruleRepo == nil {
		return autoDMRecipientDecision{Allowed: true}, nil
	}
	recipientUserID = strings.TrimSpace(recipientUserID)
	if recipientUserID == "" {
		return autoDMRecipientDecision{Allowed: false, Reason: "auto dm recipient is missing"}, nil
	}
	rule, err := s.ruleRepo.GetByRecipient(userID, accountID, recipientUserID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return autoDMRecipientDecision{}, err
	}
	if rule != nil {
		switch strings.TrimSpace(rule.Status) {
		case repository.AutoDMRecipientBlocked:
			return autoDMRecipientDecision{Allowed: false, Reason: "auto dm recipient is blocked"}, nil
		case repository.AutoDMRecipientUnsubscribed:
			return autoDMRecipientDecision{Allowed: false, Reason: "auto dm recipient is unsubscribed"}, nil
		case repository.AutoDMRecipientAllowlisted:
			return autoDMRecipientDecision{Allowed: true}, nil
		}
	}
	allowlistCount, err := s.ruleRepo.CountAllowlisted(userID, accountID)
	if err != nil {
		return autoDMRecipientDecision{}, err
	}
	if allowlistCount > 0 {
		return autoDMRecipientDecision{Allowed: false, Reason: "auto dm recipient is not allowlisted"}, nil
	}
	if candidateLookup {
		return autoDMRecipientDecision{Allowed: true}, nil
	}
	return autoDMRecipientDecision{Allowed: true}, nil
}

func (s *AutoDMService) firstConnectedAccountForUser(userID uint) (*model.TwitterAccount, error) {
	accounts, err := s.accountRepo.ListByUserID(userID)
	if err != nil {
		return nil, err
	}
	account := firstAutoDMAccount(accounts)
	if account == nil {
		return nil, errors.New(autoDMNoAccountReason)
	}
	return account, nil
}

func parseAutoDMImportRow(row []string) (recipientID, username string, skip bool, rowErr string) {
	if len(row) == 0 {
		return "", "", true, ""
	}
	recipientID = strings.TrimSpace(row[0])
	if strings.EqualFold(recipientID, "recipient_user_id") || strings.EqualFold(recipientID, "user_id") {
		return "", "", true, ""
	}
	if recipientID == "" {
		return "", "", true, ""
	}
	if !isAutoDMRecipientID(recipientID) {
		return "", "", true, "recipient_user_id must be numeric"
	}
	if len(row) > 1 {
		rawUsername := strings.TrimSpace(row[1])
		if rawUsername != "" {
			username = replyAuthorDisplay(rawUsername)
		}
	}
	return recipientID, username, false, ""
}

func isAutoDMRecipientID(value string) bool {
	if value == "" {
		return false
	}
	for _, ch := range value {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

func uniqueAutoDMRuleIDs(ids []uint) []uint {
	seen := map[uint]struct{}{}
	out := make([]uint, 0, len(ids))
	for _, id := range ids {
		if id == 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func (s *AutoDMService) createRecipientRuleActivity(userID, accountID uint, accountHandle, previewKey, status, reason string, at time.Time) error {
	if s.activityRepo == nil {
		return nil
	}
	handle := strings.TrimSpace(accountHandle)
	if handle == "" && accountID > 0 {
		if account, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, accountID); err == nil {
			handle = formatXAccountHandle(account.Username)
		}
	}
	if handle == "" {
		handle = "—"
	}
	message := strings.TrimSpace(reason)
	if message == "" && strings.TrimSpace(status) != "" {
		message = "Recipient rule status: " + strings.TrimSpace(status)
	}
	log := &model.ActivityLog{
		UserID:        userID,
		XAccountID:    accountID,
		Type:          "dm",
		Status:        "success",
		PreviewKey:    previewKey,
		AccountHandle: handle,
		ExecutedAt:    at,
		ErrorMessage:  truncateErrMsg(message),
	}
	return s.activityRepo.DB.Create(log).Error
}

func marshalAutoDMImportErrors(errors []string) string {
	if len(errors) == 0 {
		return ""
	}
	raw, err := json.Marshal(errors)
	if err != nil {
		return ""
	}
	return string(raw)
}

func parseAutoDMImportErrors(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []string{raw}
	}
	return out
}

func autoDMRecipientImportToDTO(row *model.AutoDMRecipientImport) dto.AutoDMRecipientImportItem {
	return dto.AutoDMRecipientImportItem{
		ID:         row.ID,
		XAccountID: row.XAccountID,
		Source:     row.Source,
		Imported:   row.Imported,
		Skipped:    row.Skipped,
		Errors:     parseAutoDMImportErrors(row.ErrorSummary),
		ImportedAt: row.ImportedAt.UTC().Format(time.RFC3339),
	}
}

func ptrAutoDMImportDTO(item dto.AutoDMRecipientImportItem) *dto.AutoDMRecipientImportItem {
	return &item
}

func mustAutoDMUnsubscribeToken() string {
	token, err := newAutoDMUnsubscribeToken()
	if err != nil {
		return hex.EncodeToString([]byte(fmt.Sprintf("%d", time.Now().UnixNano())))
	}
	return token
}

func newAutoDMUnsubscribeToken() (string, error) {
	var buf [24]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

func (s *AutoDMService) dmSendLimitsExceeded(userID uint, cfg *model.AutomationConfig, now time.Time) (bool, string) {
	if s.userRepo != nil {
		if u, err := s.userRepo.GetByID(userID); err == nil {
			limit := subscription.LimitsForUser(u).MonthlyAutoDMs
			if limit <= 0 {
				return true, "monthly_quota"
			}
			monthStart := startOfUTCMonth(now)
			n, err := s.activityRepo.CountSuccessByTypeBetween(userID, "dm", monthStart, now)
			if err != nil {
				zap.L().Warn("auto dm: count monthly sends failed", zap.Uint("user_id", userID), zap.Error(err))
			} else if n >= limit {
				return true, "monthly_quota"
			}
		}
	}
	return false, ""
}

func (s *AutoDMService) finishRun(cfg *model.AutomationConfig, now time.Time, state string) error {
	cfg.LastRunAt = &now
	next := now.Add(time.Duration(autoDMIntervalMinutes(cfg)) * time.Minute)
	cfg.NextRunAt = &next
	if strings.TrimSpace(state) != "" {
		cfg.State = state
	}
	return s.automationRepo.Save(cfg)
}

func autoDMIntervalMinutes(cfg *model.AutomationConfig) int {
	if cfg == nil || cfg.FrequencyIntervalMinutes <= 0 {
		return autoDMDefaultIntervalMinutes
	}
	return cfg.FrequencyIntervalMinutes
}

func missingDMSendScopes(scopes string) []string {
	have := map[string]bool{}
	for _, s := range strings.Fields(strings.TrimSpace(scopes)) {
		have[strings.ToLower(strings.TrimSpace(s))] = true
	}
	required := []string{"dm.read", "dm.write", "users.read"}
	missing := make([]string, 0, len(required))
	for _, scope := range required {
		if !have[scope] {
			missing = append(missing, scope)
		}
	}
	return missing
}

func autoDMMessageForCandidate(username string) string {
	name := replyAuthorDisplay(username)
	return "Thanks for engaging with our post, " + name + " — appreciate it. If this is not useful, feel free to ignore."
}

func (s *AutoDMService) generateAutoDMMessage(ctx context.Context, userID, xAccountID uint, username, recentInteraction string) string {
	fallback := autoDMMessageForCandidate(username)
	if s == nil || s.ai == nil {
		return fallback
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return fallback
	}
	bot, _ := s.botForAccount(userID, xAccountID)
	botID := botIDForUsage(bot)
	input := autoDMInputFromBot(username, recentInteraction, bot)
	input.ContentContext = contentContextForGeneration(s.contentRepo, userID, xAccountID, botID, recentInteraction, username, bot)
	generated, err := s.ai.GenerateAutoDM(ctx, input)
	if err != nil || strings.TrimSpace(generated.Text) == "" {
		return fallback
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, botID, "dm", now, generated.Usage); err != nil {
		zap.L().Warn("auto dm: record ai usage failed", zap.Uint("user_id", userID), zap.Error(err))
	}
	return generated.Text
}

func (s *AutoDMService) botForAccount(userID, xAccountID uint) (*model.OAFBot, error) {
	if s.oafBotRepo == nil {
		return nil, nil
	}
	bot, err := s.oafBotRepo.GetByUserAndTwitterAccountID(userID, xAccountID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return bot, err
}

func autoDMInputFromBot(username, recentInteraction string, bot *model.OAFBot) GenerateAutoDMInput {
	in := GenerateAutoDMInput{
		RecipientUsername: username,
		RecentInteraction: recentInteraction,
		Tone:              "friendly and useful",
	}
	if bot == nil {
		return in
	}
	in.HasBot = true
	in.Name = bot.Name
	in.Occupation = bot.Occupation
	in.Industry = bot.Industry
	in.IdentitySummary = bot.IdentitySummary
	in.VoiceTone = bot.VoiceTone
	in.Topics = decodeStringList(bot.Topics)
	in.GrowthGoal = bot.GrowthGoal
	in.ProjectOneLiner = bot.ProjectOneLiner
	in.TargetAudience = bot.TargetAudience
	in.CoreValueProps = bot.CoreValueProps
	in.ProductFeatures = bot.ProductFeatures
	in.Differentiators = bot.Differentiators
	in.PreferredCTA = bot.PreferredCTA
	in.WebsiteURL = bot.WebsiteURL
	in.TelegramURL = bot.TelegramURL
	in.DiscordURL = bot.DiscordURL
	in.DocsURL = bot.DocsURL
	in.CTAPolicy = bot.CTAPolicy
	in.Keywords = decodeStringList(bot.Keywords)
	in.ComplianceNotes = bot.ComplianceNotes
	in.AvoidClaims = decodeStringList(bot.AvoidClaims)
	in.PrimaryLanguage = bot.PrimaryLanguage
	in.LanguageStrategy = bot.LanguageStrategy
	return in
}

func autoDMMessagePreview(recipientSource string, candidate *autoDMCandidate) string {
	if candidate != nil && strings.TrimSpace(candidate.Message) != "" {
		return strings.TrimSpace(candidate.Message)
	}
	switch strings.TrimSpace(recipientSource) {
	case "interaction_only":
		return "Draft only: send a short opt-in follow-up to an explicitly engaged user."
	case "capability_check":
		return "Capability check only: no recipient selected and no message sent."
	default:
		return "Draft only: pending recipient rule and approval."
	}
}

func blockedKeywordInMessage(rawKeywords, message string) string {
	message = strings.ToLower(strings.TrimSpace(message))
	if message == "" {
		return ""
	}
	var keywords []string
	if err := json.Unmarshal([]byte(strings.TrimSpace(rawKeywords)), &keywords); err != nil {
		return ""
	}
	for _, keyword := range keywords {
		kw := strings.ToLower(strings.TrimSpace(keyword))
		if kw != "" && strings.Contains(message, kw) {
			return keyword
		}
	}
	return ""
}

func autoDMTaskToDTO(task *model.AutoDMTask) dto.AutoDMTaskItem {
	out := dto.AutoDMTaskItem{
		ID:                task.ID,
		XAccountID:        task.XAccountID,
		AccountHandle:     task.AccountHandle,
		RecipientSource:   task.RecipientSource,
		RecipientUserID:   task.RecipientUserID,
		RecipientUsername: task.RecipientUsername,
		MessagePreview:    task.MessagePreview,
		Status:            task.Status,
		CapabilityStatus:  task.CapabilityStatus,
		FailureCategory:   task.FailureCategory,
		FailureReason:     task.FailureReason,
		Retryable:         task.Retryable,
		AttemptCount:      task.AttemptCount,
		ApprovalRequired:  task.ApprovalRequired,
		ActivityLogID:     task.ActivityLogID,
		DMConversationID:  task.DMConversationID,
		DMEventID:         task.DMEventID,
		GeneratedAt:       task.GeneratedAt.UTC().Format(time.RFC3339),
	}
	if task.ApprovedAt != nil {
		out.ApprovedAt = task.ApprovedAt.UTC().Format(time.RFC3339)
	}
	if task.RetryAfterAt != nil {
		out.RetryAfterAt = task.RetryAfterAt.UTC().Format(time.RFC3339)
	}
	if task.LastAttemptAt != nil {
		out.LastAttemptAt = task.LastAttemptAt.UTC().Format(time.RFC3339)
	}
	if task.BlockedAt != nil {
		out.BlockedAt = task.BlockedAt.UTC().Format(time.RFC3339)
	}
	if task.SentAt != nil {
		out.SentAt = task.SentAt.UTC().Format(time.RFC3339)
	}
	return out
}

func (s *AutoDMService) autoDMRecipientRuleToDTO(rule *model.AutoDMRecipientRule) dto.AutoDMRecipientRuleItem {
	out := dto.AutoDMRecipientRuleItem{
		ID:                rule.ID,
		XAccountID:        rule.XAccountID,
		RecipientUserID:   rule.RecipientUserID,
		RecipientUsername: rule.RecipientUsername,
		Status:            rule.Status,
		UnsubscribeToken:  rule.UnsubscribeToken,
		UnsubscribeURL:    s.autoDMUnsubscribeURL(rule.UnsubscribeToken),
		Source:            rule.Source,
		Reason:            rule.Reason,
	}
	if rule.LastMatchedAt != nil {
		out.LastMatchedAt = rule.LastMatchedAt.UTC().Format(time.RFC3339)
	}
	if !rule.UpdatedAt.IsZero() {
		out.UpdatedAt = rule.UpdatedAt.UTC().Format(time.RFC3339)
	}
	return out
}

func (s *AutoDMService) autoDMUnsubscribeURL(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	path := "/unsubscribe/" + url.PathEscape(token)
	if strings.TrimSpace(s.frontendBaseURL) == "" {
		return path
	}
	return strings.TrimRight(s.frontendBaseURL, "/") + path
}
