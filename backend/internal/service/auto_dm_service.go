package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
)

const (
	autoDMDefaultIntervalMinutes = 60
	autoDMNoAccountReason        = "Auto DM skipped: no connected X account is available."
	autoDMNoTokenReason          = "Auto DM skipped: connected X account is missing an access token."
	autoDMNoRecipientReason      = "Auto DM skipped: no eligible recent interaction recipient was found."
)

type AutoDMService struct {
	accountRepo    *repository.TwitterAccountRepository
	automationRepo *repository.AutomationRepository
	activityRepo   *repository.ActivityRepository
	taskRepo       *repository.AutoDMTaskRepository
	userRepo       *repository.UserRepository
}

func NewAutoDMService(
	accountRepo *repository.TwitterAccountRepository,
	automationRepo *repository.AutomationRepository,
	activityRepo *repository.ActivityRepository,
	taskRepo *repository.AutoDMTaskRepository,
	userRepo *repository.UserRepository,
) *AutoDMService {
	return &AutoDMService{
		accountRepo:    accountRepo,
		automationRepo: automationRepo,
		activityRepo:   activityRepo,
		taskRepo:       taskRepo,
		userRepo:       userRepo,
	}
}

type autoDMCandidate struct {
	UserID   string
	Username string
	Message  string
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
			return &autoDMCandidate{
				UserID:   reply.AuthorID,
				Username: replyAuthorDisplay(reply.AuthorUsername),
				Message:  autoDMMessageForCandidate(reply.AuthorUsername),
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

func (s *AutoDMService) ApproveTask(userID, taskID uint) (*dto.AutoDMTaskItem, error) {
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

func (s *AutoDMService) sendApprovedTasks(ctx context.Context, now time.Time) error {
	if s.taskRepo == nil {
		return nil
	}
	tasks, err := s.taskRepo.ListApprovedForSending(20)
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
		if markErr := s.failDMTask(task, err.Error(), now); markErr != nil {
			return markErr
		}
		return err
	}
	if skip {
		return nil
	}
	reserved, err := s.taskRepo.ReserveForSending(task)
	if err != nil {
		return err
	}
	if !reserved {
		return nil
	}
	conversationID, eventID, apiErr := twitter.SendDirectMessage(ctx, account.AccessToken, task.RecipientUserID, task.MessagePreview)
	if apiErr != nil {
		msg := truncateErrMsg(apiErr.Error())
		var pub *twitter.PublishError
		if errors.As(apiErr, &pub) {
			msg = truncateErrMsg(pub.Error())
		}
		if err := s.failDMTask(task, msg, now); err != nil {
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
		return nil, nil, false, errors.New("auto dm task is missing recipient_user_id")
	}
	if strings.TrimSpace(task.MessagePreview) == "" {
		return nil, nil, false, errors.New("auto dm task is missing message text")
	}
	if strings.TrimSpace(task.RecipientSource) != "interaction_only" {
		return nil, nil, false, errors.New("auto dm task recipient rule is not allowed for real send")
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
		return nil, nil, false, errors.New(autoDMNoTokenReason)
	}
	if strings.TrimSpace(account.TwitterUserID) == strings.TrimSpace(task.RecipientUserID) {
		return nil, nil, false, errors.New("auto dm task cannot send to the connected account itself")
	}
	if missing := missingDMSendScopes(account.OAuthScopes); len(missing) > 0 {
		return nil, nil, false, errors.New("reconnect this X account with OAuth scopes " + strings.Join(missing, ", "))
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
		return nil, nil, false, errors.New("auto dm message contains blocked keyword: " + blocked)
	}
	return account, cfg, false, nil
}

func (s *AutoDMService) failDMTask(task *model.AutoDMTask, reason string, at time.Time) error {
	reason = truncateErrMsg(reason)
	if err := s.taskRepo.MarkFailed(task, reason); err != nil {
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

func (s *AutoDMService) dmSendLimitsExceeded(userID uint, cfg *model.AutomationConfig, now time.Time) (bool, string) {
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if cfg != nil && cfg.FrequencyDailyLimit > 0 {
		n, err := s.activityRepo.CountSuccessByTypeBetween(userID, "dm", dayStart, now)
		if err != nil {
			zap.L().Warn("auto dm: count daily sends failed", zap.Uint("user_id", userID), zap.Error(err))
		} else if int(n) >= cfg.FrequencyDailyLimit {
			return true, "daily_limit"
		}
	}
	hourStart := now.Add(-time.Hour)
	if cfg != nil && cfg.SafetyMaxPerHour > 0 {
		n, err := s.activityRepo.CountSuccessByTypeBetween(userID, "dm", hourStart, now)
		if err != nil {
			zap.L().Warn("auto dm: count hourly sends failed", zap.Uint("user_id", userID), zap.Error(err))
		} else if int(n) >= cfg.SafetyMaxPerHour {
			return true, "hourly_limit"
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
		FailureReason:     task.FailureReason,
		ApprovalRequired:  task.ApprovalRequired,
		ActivityLogID:     task.ActivityLogID,
		DMConversationID:  task.DMConversationID,
		DMEventID:         task.DMEventID,
		GeneratedAt:       task.GeneratedAt.UTC().Format(time.RFC3339),
	}
	if task.ApprovedAt != nil {
		out.ApprovedAt = task.ApprovedAt.UTC().Format(time.RFC3339)
	}
	if task.BlockedAt != nil {
		out.BlockedAt = task.BlockedAt.UTC().Format(time.RFC3339)
	}
	if task.SentAt != nil {
		out.SentAt = task.SentAt.UTC().Format(time.RFC3339)
	}
	return out
}
