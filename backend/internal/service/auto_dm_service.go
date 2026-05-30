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
	autoDMRecipientCooldown      = 24 * time.Hour
	autoDMInboundScanInterval    = 6 * time.Hour
	autoDMInboundLookupWindow    = 30 * 24 * time.Hour
	autoDMNoAccountReason        = "Auto DM skipped: no connected X account is available."
	autoDMNoTokenReason          = "Auto DM skipped: connected X account is missing an access token."
	autoDMNoRecipientReason      = "Auto DM skipped: no eligible recent interaction recipient was found."
)

type AutoDMService struct {
	accountRepo     *repository.TwitterAccountRepository
	automationRepo  *repository.AutomationRepository
	activityRepo    *repository.ActivityRepository
	taskRepo        *repository.AutoDMTaskRepository
	inboundRepo     *repository.AutoDMInboundEventRepository
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
	inboundRepo *repository.AutoDMInboundEventRepository,
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
		inboundRepo:     inboundRepo,
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
	UserID           string
	Username         string
	Segment          string
	Message          string
	GenerationReason string
	Candidates       []AutoDMCandidate
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
	if err := s.scanInboundReplies(ctx, now); err != nil {
		zap.L().Warn("auto dm: scan inbound replies failed", zap.Error(err))
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
		RecipientSegment:  normalizeAutoDMRecipientSegment(autoDMRecipientSegment(candidate)),
		MessagePreview:    messagePreview,
		GenerationReason:  autoDMGenerationReason(candidate),
		MessageVariants:   encodeAutoDMVariants(autoDMCandidates(candidate)),
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
			segment := "lead"
			if rule, err := s.ruleRepo.GetByRecipient(userID, account.ID, reply.AuthorID); err == nil && rule != nil {
				segment = normalizeAutoDMRecipientSegment(rule.RecipientSegment)
			}
			generated := s.generateAutoDMCandidates(ctx, userID, account.ID, reply.AuthorUsername, segment, reply.Text)
			return &autoDMCandidate{
				UserID:           reply.AuthorID,
				Username:         replyAuthorDisplay(reply.AuthorUsername),
				Segment:          segment,
				Message:          generated.Text,
				GenerationReason: generated.GenerationReason,
				Candidates:       generated.Candidates,
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

func (s *AutoDMService) Overview(userID uint, now time.Time) (*dto.AutoDMOverviewResponse, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	limits := subscription.LimitsForUser(user)
	periodStart, periodEnd := autoDMUsagePeriod(user, now)
	monthlyUsed, err := s.activityRepo.CountSuccessByTypeBetween(userID, "dm", periodStart, now)
	if err != nil {
		return nil, err
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	dailyUsed, err := s.activityRepo.CountSuccessByTypeBetween(userID, "dm", dayStart, now)
	if err != nil {
		return nil, err
	}
	dailyLimit := autoDMConservativeDailySendLimit(user)
	out := &dto.AutoDMOverviewResponse{
		PlanCode:        subscription.NormalizePlanCode(user.SubscriptionPlanCode),
		MonthlyLimit:    limits.MonthlyAutoDMs,
		MonthlyUsed:     monthlyUsed,
		MonthlyRemain:   remainingQuota(limits.MonthlyAutoDMs, monthlyUsed),
		DailySoftLimit:  dailyLimit,
		DailyUsed:       dailyUsed,
		DailyRemaining:  remainingQuota(dailyLimit, dailyUsed),
		QuotaExhausted:  limits.MonthlyAutoDMs <= 0 || monthlyUsed >= limits.MonthlyAutoDMs || dailyLimit <= 0 || dailyUsed >= dailyLimit,
		UpgradeRequired: limits.MonthlyAutoDMs <= 0 || monthlyUsed >= limits.MonthlyAutoDMs,
	}
	segmentMetrics, err := s.segmentMetrics(userID, periodStart, now, 0)
	if err != nil {
		return nil, err
	}
	out.SegmentMetrics = segmentMetrics
	if !periodStart.IsZero() {
		out.PeriodStart = periodStart.UTC().Format(time.RFC3339)
	}
	if !periodEnd.IsZero() {
		out.PeriodEnd = periodEnd.UTC().Format(time.RFC3339)
		out.NextResetAt = periodEnd.UTC().Format(time.RFC3339)
	}
	return out, nil
}

func (s *AutoDMService) segmentMetrics(userID uint, from, to time.Time, accountID uint) ([]dto.AutoDMSegmentMetric, error) {
	segments := []string{"lead", "partner", "community", "investor", "existing_user"}
	metrics := make(map[string]*dto.AutoDMSegmentMetric, len(segments))
	for _, segment := range segments {
		metrics[segment] = &dto.AutoDMSegmentMetric{Segment: segment, ReplyTrackingAvailable: true}
	}
	if s.taskRepo != nil {
		rows, err := s.taskRepo.CountBySegmentAndStatusBetween(userID, from, to, accountID)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			segment := normalizeAutoDMRecipientSegment(row.Segment)
			item := metrics[segment]
			if item == nil {
				item = &dto.AutoDMSegmentMetric{Segment: segment, ReplyTrackingAvailable: true}
				metrics[segment] = item
				segments = append(segments, segment)
			}
			switch row.Status {
			case "sent":
				item.Sent += row.Count
			case "failed":
				item.Failed += row.Count
			case "blocked":
				item.Blocked += row.Count
			case "review", "approved", "sending":
				item.Review += row.Count
			}
		}
		replyRows, err := s.taskRepo.CountRepliesBySegmentBetween(userID, from, to, accountID)
		if err != nil {
			return nil, err
		}
		for _, row := range replyRows {
			segment := normalizeAutoDMRecipientSegment(row.Segment)
			item := metrics[segment]
			if item == nil {
				item = &dto.AutoDMSegmentMetric{Segment: segment, ReplyTrackingAvailable: true}
				metrics[segment] = item
				segments = append(segments, segment)
			}
			item.Replies += row.Count
		}
	}
	if s.ruleRepo != nil {
		rows, err := s.ruleRepo.CountBySegmentAndStatusBetween(userID, from, to, accountID)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			if row.Status != repository.AutoDMRecipientUnsubscribed {
				continue
			}
			segment := normalizeAutoDMRecipientSegment(row.Segment)
			item := metrics[segment]
			if item == nil {
				item = &dto.AutoDMSegmentMetric{Segment: segment, ReplyTrackingAvailable: true}
				metrics[segment] = item
				segments = append(segments, segment)
			}
			item.Unsubscribed += row.Count
		}
	}
	out := make([]dto.AutoDMSegmentMetric, 0, len(segments))
	for _, segment := range segments {
		item := metrics[segment]
		if item == nil {
			continue
		}
		denom := item.Sent + item.Failed
		if denom > 0 {
			item.SendSuccessRatePct = int((item.Sent*100 + denom/2) / denom)
		}
		if item.Sent > 0 && item.ReplyTrackingAvailable {
			item.ReplyRatePct = int((item.Replies*100 + item.Sent/2) / item.Sent)
		}
		out = append(out, *item)
	}
	return out, nil
}

func (s *AutoDMService) ListRecipientRules(userID uint, query dto.AutoDMRecipientRuleQuery) (*dto.AutoDMRecipientRulesResponse, error) {
	if s.ruleRepo == nil {
		return &dto.AutoDMRecipientRulesResponse{Items: []dto.AutoDMRecipientRuleItem{}}, nil
	}
	rows, total, err := s.ruleRepo.ListByUser(userID, repository.AutoDMRecipientRuleListQuery{
		Search:     query.Search,
		Status:     query.Status,
		Segment:    normalizeAutoDMRecipientSegmentForQuery(query.Segment),
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

func (s *AutoDMService) UpdateTaskMessage(userID, taskID uint, message string) (*dto.AutoDMTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, taskID)
	if err != nil {
		return nil, err
	}
	message = truncateRunes(strings.TrimSpace(message), 240)
	if message == "" {
		return nil, errors.New("auto dm message is required")
	}
	if err := s.taskRepo.UpdateMessagePreview(task, message); err != nil {
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

func (s *AutoDMService) DeleteTask(userID, taskID uint) error {
	task, err := s.taskRepo.GetByUserAndID(userID, taskID)
	if err != nil {
		return err
	}
	if strings.TrimSpace(task.Status) == "sent" || strings.TrimSpace(task.DMEventID) != "" || task.SentAt != nil {
		return errors.New("sent auto dm tasks cannot be deleted")
	}
	return s.taskRepo.DeleteUnsentByUserAndID(userID, taskID)
}

func (s *AutoDMService) SetRecipientRuleFromTask(userID, taskID uint, status, segment, reason string) (*dto.AutoDMRecipientRuleItem, error) {
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
		normalizeAutoDMRecipientSegment(segment),
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

func (s *AutoDMService) UpdateRecipientRule(userID, ruleID uint, status, segment, reason string) (*dto.AutoDMRecipientRuleItem, error) {
	status = strings.TrimSpace(status)
	if !repository.IsAutoDMRecipientRuleStatus(status) {
		return nil, errors.New("invalid auto dm recipient rule status")
	}
	now := time.Now().UTC()
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "Updated from Auto DM recipient manager."
	}
	normalizedSegment := ""
	if strings.TrimSpace(segment) != "" {
		normalizedSegment = normalizeAutoDMRecipientSegment(segment)
	}
	rule, err := s.ruleRepo.UpdateStatusByID(userID, ruleID, status, normalizedSegment, reason, "manual", now)
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
	} else if _, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, accountID); err != nil {
		return nil, errors.New("x account not found")
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
		recipientID, username, segment, skip, rowErr := parseAutoDMImportRow(row)
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
			segment,
			repository.AutoDMRecipientAllowlisted,
			"manual_consent_import",
			"Imported as an explicit opt-in Auto DM recipient.",
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
		Source:       "manual_consent_import",
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

func (s *AutoDMService) PreviewRecipientImport(userID uint, req dto.AutoDMRecipientImportRequest) (*dto.AutoDMRecipientImportPreviewResponse, error) {
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
	} else if _, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, accountID); err != nil {
		return nil, errors.New("x account not found")
	}
	reader := csv.NewReader(strings.NewReader(req.CSV))
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true
	out := &dto.AutoDMRecipientImportPreviewResponse{Rows: []dto.AutoDMRecipientImportPreviewRow{}}
	seen := map[string]int{}
	line := 0
	for {
		row, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		line++
		if err != nil {
			out.Skipped++
			msg := fmt.Sprintf("line %d: %v", line, err)
			out.Errors = append(out.Errors, msg)
			out.Rows = append(out.Rows, dto.AutoDMRecipientImportPreviewRow{Line: line, Status: "invalid", Message: err.Error()})
			continue
		}
		recipientID, username, segment, skip, rowErr := parseAutoDMImportRow(row)
		if skip {
			if rowErr != "" {
				out.Skipped++
				msg := fmt.Sprintf("line %d: %s", line, rowErr)
				out.Errors = append(out.Errors, msg)
				out.Rows = append(out.Rows, dto.AutoDMRecipientImportPreviewRow{Line: line, RecipientUserID: recipientID, RecipientUsername: username, RecipientSegment: segment, Status: "invalid", Message: rowErr})
			}
			continue
		}
		out.Valid++
		preview := dto.AutoDMRecipientImportPreviewRow{
			Line:              line,
			RecipientUserID:   recipientID,
			RecipientUsername: username,
			RecipientSegment:  segment,
			Status:            "ready",
			Message:           "Ready to import as explicit opt-in recipient.",
		}
		if firstLine, ok := seen[recipientID]; ok {
			out.DuplicatesInFile++
			out.Skipped++
			preview.Status = "duplicate_in_file"
			preview.Message = fmt.Sprintf("Duplicate of line %d.", firstLine)
			out.Rows = append(out.Rows, preview)
			continue
		}
		seen[recipientID] = line
		existing, err := s.ruleRepo.GetByRecipient(userID, accountID, recipientID)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			out.Skipped++
			preview.Status = "invalid"
			preview.Message = err.Error()
			out.Errors = append(out.Errors, fmt.Sprintf("line %d: %v", line, err))
			out.Rows = append(out.Rows, preview)
			continue
		}
		if existing != nil {
			out.Existing++
			preview.Status = "existing"
			preview.Message = "Recipient rule already exists; import will update it as allowlisted."
		} else {
			out.WillImport++
		}
		out.Rows = append(out.Rows, preview)
	}
	if out.Valid == 0 && out.Skipped == 0 {
		out.Warnings = append(out.Warnings, "No importable rows found. Expected CSV columns: recipient_user_id, username.")
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

func (s *AutoDMService) scanInboundReplies(ctx context.Context, now time.Time) error {
	if s.taskRepo == nil || s.inboundRepo == nil || s.accountRepo == nil {
		return nil
	}
	tasks, err := s.taskRepo.ListSentAwaitingInboundScan(5, now, now.Add(-autoDMInboundScanInterval), now.Add(-autoDMInboundLookupWindow))
	if err != nil {
		return err
	}
	for i := range tasks {
		task := tasks[i]
		if err := s.scanInboundReplyForTask(ctx, &task, now); err != nil {
			zap.L().Warn("auto dm: inbound reply scan failed",
				zap.Uint("task_id", task.ID),
				zap.Uint("user_id", task.UserID),
				zap.Error(err))
		}
	}
	return nil
}

func (s *AutoDMService) scanInboundReplyForTask(ctx context.Context, task *model.AutoDMTask, now time.Time) error {
	if task == nil || task.SentAt == nil || strings.TrimSpace(task.RecipientUserID) == "" {
		return nil
	}
	account, err := s.accountRepo.GetConnectedByUserAndAccountID(task.UserID, task.XAccountID)
	if err != nil {
		_ = s.taskRepo.MarkInboundScanned(task.ID, now)
		return err
	}
	if strings.TrimSpace(account.AccessToken) == "" || len(missingDMReadScopes(account.OAuthScopes)) > 0 {
		_ = s.taskRepo.MarkInboundScanned(task.ID, now)
		return nil
	}
	events, err := twitter.ListDirectMessageEventsWithParticipant(ctx, account.AccessToken, task.RecipientUserID, 100)
	if err != nil {
		_ = s.taskRepo.MarkInboundScanned(task.ID, now)
		return err
	}
	reply, repliedAt := firstInboundReplyEvent(events, task, account.TwitterUserID)
	if strings.TrimSpace(reply.ID) == "" {
		return s.taskRepo.MarkInboundScanned(task.ID, now)
	}
	if err := s.inboundRepo.CreateIgnore(&model.AutoDMInboundEvent{
		UserID:            task.UserID,
		XAccountID:        task.XAccountID,
		AutoDMTaskID:      task.ID,
		RecipientUserID:   task.RecipientUserID,
		RecipientUsername: task.RecipientUsername,
		RecipientSegment:  normalizeAutoDMRecipientSegment(task.RecipientSegment),
		DMConversationID:  strings.TrimSpace(reply.DMConversationID),
		DMEventID:         strings.TrimSpace(reply.ID),
		SenderID:          strings.TrimSpace(reply.SenderID),
		Text:              truncateErrMsg(reply.Text),
		EventCreatedAt:    repliedAt,
		DetectedAt:        now,
	}); err != nil {
		return err
	}
	return s.taskRepo.MarkInboundReply(task.ID, reply.ID, repliedAt, now)
}

func firstInboundReplyEvent(events []twitter.DirectMessageEvent, task *model.AutoDMTask, connectedTwitterUserID string) (twitter.DirectMessageEvent, time.Time) {
	if task == nil || task.SentAt == nil {
		return twitter.DirectMessageEvent{}, time.Time{}
	}
	recipientID := strings.TrimSpace(task.RecipientUserID)
	ownID := strings.TrimSpace(connectedTwitterUserID)
	sentAt := task.SentAt.UTC()
	var best twitter.DirectMessageEvent
	var bestAt time.Time
	for _, event := range events {
		if !isAutoDMMessageCreateEvent(event.EventType) {
			continue
		}
		if strings.TrimSpace(event.ID) == "" || strings.TrimSpace(event.ID) == strings.TrimSpace(task.DMEventID) {
			continue
		}
		senderID := strings.TrimSpace(event.SenderID)
		if senderID == "" || senderID != recipientID || senderID == ownID {
			continue
		}
		createdAt, err := parseXEventTime(event.CreatedAt)
		if err != nil || createdAt.Before(sentAt) || createdAt.Equal(sentAt) {
			continue
		}
		if bestAt.IsZero() || createdAt.Before(bestAt) {
			best = event
			bestAt = createdAt
		}
	}
	return best, bestAt
}

func isAutoDMMessageCreateEvent(eventType string) bool {
	switch strings.ToLower(strings.TrimSpace(eventType)) {
	case "", "message_create", "messagecreate", "dm_event":
		return true
	default:
		return strings.Contains(strings.ToLower(eventType), "message")
	}
}

func parseXEventTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, errors.New("empty x event time")
	}
	if t, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return t.UTC(), nil
	}
	t, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, err
	}
	return t.UTC(), nil
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
	recentlySent, err := s.taskRepo.HasSentToRecipientSince(task.UserID, task.XAccountID, task.RecipientUserID, now.Add(-autoDMRecipientCooldown))
	if err != nil {
		return nil, nil, false, err
	}
	if recentlySent {
		return nil, nil, false, newAutoDMFailureError("recipient_cooldown", "auto dm recipient was contacted within the last 24 hours")
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

func isAutoDMOptInSource(source string) bool {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "inbound_dm", "campaign_keyword", "manual_consent", "manual_consent_import", "site_form", "task":
		return true
	default:
		return false
	}
}

func (s *AutoDMService) autoDMRecipientAllowed(userID, accountID uint, recipientUserID string, candidateLookup bool) (autoDMRecipientDecision, error) {
	if s.ruleRepo == nil {
		return autoDMRecipientDecision{Allowed: false, Reason: "auto dm requires an explicit opt-in recipient rule"}, nil
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
			if !isAutoDMOptInSource(rule.Source) {
				return autoDMRecipientDecision{Allowed: false, Reason: "auto dm recipient is allowlisted but missing an explicit opt-in source"}, nil
			}
			return autoDMRecipientDecision{Allowed: true}, nil
		}
	}
	if candidateLookup {
		return autoDMRecipientDecision{Allowed: false, Reason: "auto dm recipient has not opted in"}, nil
	}
	return autoDMRecipientDecision{Allowed: false, Reason: "auto dm recipient has not opted in"}, nil
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

func parseAutoDMImportRow(row []string) (recipientID, username, segment string, skip bool, rowErr string) {
	if len(row) == 0 {
		return "", "", "", true, ""
	}
	recipientID = strings.TrimSpace(row[0])
	if strings.EqualFold(recipientID, "recipient_user_id") || strings.EqualFold(recipientID, "user_id") {
		return "", "", "", true, ""
	}
	if recipientID == "" {
		return "", "", "", true, ""
	}
	if !isAutoDMRecipientID(recipientID) {
		return "", "", "", true, "recipient_user_id must be numeric"
	}
	if len(row) > 1 {
		rawUsername := strings.TrimSpace(row[1])
		if rawUsername != "" {
			username = replyAuthorDisplay(rawUsername)
		}
	}
	if len(row) > 2 {
		segment = normalizeAutoDMRecipientSegment(row[2])
	}
	if segment == "" {
		segment = "lead"
	}
	return recipientID, username, segment, false, ""
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

func normalizeAutoDMRecipientSegment(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "partner", "partners":
		return "partner"
	case "community", "community_member", "member":
		return "community"
	case "investor", "investors":
		return "investor"
	case "existing_user", "existing-user", "customer", "user":
		return "existing_user"
	case "lead", "prospect", "":
		return "lead"
	default:
		return "lead"
	}
}

func normalizeAutoDMRecipientSegmentForQuery(value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return normalizeAutoDMRecipientSegment(value)
}

func autoDMStrategyForSegment(segment string) string {
	switch normalizeAutoDMRecipientSegment(segment) {
	case "partner":
		return "Treat the recipient as a potential partner. Use collaborative language, mention mutual audience or co-marketing fit, and avoid a direct sales pitch."
	case "community":
		return "Treat the recipient as a community member. Be warm, conversational, and invite lightweight discussion or group participation without pressure."
	case "investor":
		return "Treat the recipient as an investor or analyst. Emphasize traction, market narrative, differentiation, and a concise reason to learn more; avoid financial promises."
	case "existing_user":
		return "Treat the recipient as an existing or likely product user. Be helpful, support-oriented, and focus on activation, next-step guidance, or feedback."
	default:
		return "Treat the recipient as a qualified lead. Be helpful and specific, offer a low-friction next step, and avoid sounding like cold outreach."
	}
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
			dailyLimit := autoDMConservativeDailySendLimit(u)
			if dailyLimit <= 0 {
				return true, "daily_quota"
			}
			dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
			if n, err := s.activityRepo.CountSuccessByTypeBetween(userID, "dm", dayStart, now); err != nil {
				zap.L().Warn("auto dm: count daily sends failed", zap.Uint("user_id", userID), zap.Error(err))
			} else if n >= dailyLimit {
				return true, "daily_quota"
			}
			limit := subscription.LimitsForUser(u).MonthlyAutoDMs
			if limit <= 0 {
				return true, "monthly_quota"
			}
			periodStart, _ := autoDMUsagePeriod(u, now)
			n, err := s.activityRepo.CountSuccessByTypeBetween(userID, "dm", periodStart, now)
			if err != nil {
				zap.L().Warn("auto dm: count monthly sends failed", zap.Uint("user_id", userID), zap.Error(err))
			} else if n >= limit {
				return true, "monthly_quota"
			}
		}
	}
	return false, ""
}

func autoDMConservativeDailySendLimit(u *model.User) int64 {
	if u == nil {
		return 0
	}
	switch subscription.NormalizePlanCode(u.SubscriptionPlanCode) {
	case subscription.PlanBasic:
		return 5
	case subscription.PlanPlus:
		return 20
	case subscription.PlanPro:
		return 80
	case subscription.PlanProPlus:
		return 150
	default:
		return 0
	}
}

func autoDMUsagePeriod(u *model.User, now time.Time) (time.Time, time.Time) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	end := now.UTC().AddDate(0, 1, 0)
	if u != nil && u.SubscriptionExpiresAt != nil {
		end = u.SubscriptionExpiresAt.UTC()
	}
	start := now.UTC().AddDate(0, -1, 0)
	if u != nil && u.SubscriptionStartedAt != nil && u.SubscriptionStartedAt.Before(end) {
		start = u.SubscriptionStartedAt.UTC()
	}
	if !end.After(start) {
		end = start.AddDate(0, 1, 0)
	}
	return start, end
}

func remainingQuota(limit, used int64) int64 {
	if limit <= 0 {
		return 0
	}
	if used >= limit {
		return 0
	}
	return limit - used
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
	required := []string{"dm.read", "dm.write", "tweet.read", "users.read"}
	missing := make([]string, 0, len(required))
	for _, scope := range required {
		if !have[scope] {
			missing = append(missing, scope)
		}
	}
	return missing
}

func missingDMReadScopes(scopes string) []string {
	have := map[string]bool{}
	for _, s := range strings.Fields(strings.TrimSpace(scopes)) {
		have[strings.ToLower(strings.TrimSpace(s))] = true
	}
	required := []string{"dm.read", "tweet.read", "users.read"}
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

func (s *AutoDMService) generateAutoDMCandidates(ctx context.Context, userID, xAccountID uint, username, segment, recentInteraction string) AIGeneratedAutoDMCandidates {
	fallback := autoDMMessageForCandidate(username)
	fallbackCandidate := AutoDMCandidate{Type: "helpful_followup", Label: "Helpful follow-up", Message: fallback}
	if s == nil || s.ai == nil {
		return AIGeneratedAutoDMCandidates{Text: fallback, GenerationReason: "Generated from a safe fallback because AI generation is unavailable.", Candidates: []AutoDMCandidate{fallbackCandidate}}
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return AIGeneratedAutoDMCandidates{Text: fallback, GenerationReason: "Generated from a safe fallback because AI generation quota is unavailable.", Candidates: []AutoDMCandidate{fallbackCandidate}}
	}
	bot, _ := s.botForAccount(userID, xAccountID)
	botID := botIDForUsage(bot)
	input := autoDMInputFromBot(username, recentInteraction, bot)
	input.RecipientSegment = normalizeAutoDMRecipientSegment(segment)
	input.DMStrategy = autoDMStrategyForSegment(segment)
	input.ContentContext = contentContextForGeneration(s.contentRepo, userID, xAccountID, botID, recentInteraction, username, bot)
	generated, err := s.ai.GenerateAutoDMCandidates(ctx, input)
	if err != nil || strings.TrimSpace(generated.Text) == "" {
		return AIGeneratedAutoDMCandidates{Text: fallback, GenerationReason: "Generated from a safe fallback because AI candidate generation failed.", Candidates: []AutoDMCandidate{fallbackCandidate}}
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, botID, "dm", now, generated.Usage); err != nil {
		zap.L().Warn("auto dm: record ai usage failed", zap.Uint("user_id", userID), zap.Error(err))
	}
	return generated
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

func autoDMGenerationReason(candidate *autoDMCandidate) string {
	if candidate == nil {
		return ""
	}
	return truncateRunes(strings.TrimSpace(candidate.GenerationReason), 1000)
}

func autoDMRecipientSegment(candidate *autoDMCandidate) string {
	if candidate == nil {
		return "lead"
	}
	return normalizeAutoDMRecipientSegment(candidate.Segment)
}

func autoDMCandidates(candidate *autoDMCandidate) []AutoDMCandidate {
	if candidate == nil {
		return nil
	}
	if len(candidate.Candidates) > 0 {
		return candidate.Candidates
	}
	if strings.TrimSpace(candidate.Message) == "" {
		return nil
	}
	return []AutoDMCandidate{{Type: "helpful_followup", Label: "Helpful follow-up", Message: candidate.Message}}
}

func encodeAutoDMVariants(items []AutoDMCandidate) string {
	clean := make([]AutoDMCandidate, 0, len(items))
	for _, item := range items {
		message := strings.TrimSpace(item.Message)
		if message == "" {
			continue
		}
		typ := normalizeAutoDMCandidateType(item.Type)
		clean = append(clean, AutoDMCandidate{
			Type:    typ,
			Label:   firstNonEmpty(strings.TrimSpace(item.Label), defaultAutoDMCandidateLabel(typ)),
			Message: truncateRunes(message, 240),
		})
		if len(clean) >= 3 {
			break
		}
	}
	if len(clean) == 0 {
		return ""
	}
	raw, _ := json.Marshal(clean)
	return string(raw)
}

func decodeAutoDMVariants(raw string) []dto.AutoDMMessageVariantItem {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var rows []AutoDMCandidate
	if err := json.Unmarshal([]byte(raw), &rows); err != nil {
		return nil
	}
	out := make([]dto.AutoDMMessageVariantItem, 0, len(rows))
	for _, row := range rows {
		message := strings.TrimSpace(row.Message)
		if message == "" {
			continue
		}
		typ := normalizeAutoDMCandidateType(row.Type)
		out = append(out, dto.AutoDMMessageVariantItem{
			Type:    typ,
			Label:   firstNonEmpty(strings.TrimSpace(row.Label), defaultAutoDMCandidateLabel(typ)),
			Message: truncateRunes(message, 240),
		})
		if len(out) >= 3 {
			break
		}
	}
	return out
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
		RecipientSegment:  normalizeAutoDMRecipientSegment(task.RecipientSegment),
		MessagePreview:    task.MessagePreview,
		GenerationReason:  task.GenerationReason,
		MessageVariants:   decodeAutoDMVariants(task.MessageVariants),
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
		Diagnostics:       autoDMTaskDiagnostics(task),
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
	if task.LastInboundScanAt != nil {
		out.LastInboundScanAt = task.LastInboundScanAt.UTC().Format(time.RFC3339)
	}
	if task.InboundReplyAt != nil {
		out.InboundReplyAt = task.InboundReplyAt.UTC().Format(time.RFC3339)
	}
	if strings.TrimSpace(task.InboundReplyEventID) != "" {
		out.InboundReplyEventID = strings.TrimSpace(task.InboundReplyEventID)
	}
	if task.BlockedAt != nil {
		out.BlockedAt = task.BlockedAt.UTC().Format(time.RFC3339)
	}
	if task.SentAt != nil {
		out.SentAt = task.SentAt.UTC().Format(time.RFC3339)
	}
	return out
}

func autoDMTaskDiagnostics(task *model.AutoDMTask) []dto.AutoDMDiagnosticItem {
	if task == nil {
		return nil
	}
	items := []dto.AutoDMDiagnosticItem{}
	add := func(key, label, status, severity, detail string) {
		items = append(items, dto.AutoDMDiagnosticItem{Key: key, Label: label, Status: status, Severity: severity, Detail: detail})
	}
	if strings.TrimSpace(task.RecipientUserID) == "" {
		add("recipient", "Recipient", "blocked", "error", "Missing recipient_user_id; real DM cannot be sent.")
	} else {
		add("recipient", "Recipient", "ok", "info", "Recipient user ID is present.")
	}
	switch task.CapabilityStatus {
	case "approved_pending_real_send":
		add("send_state", "Send state", "ok", "info", "Approved and waiting for the sender.")
	case "recipient_rule_pending":
		add("recipient_rule", "Recipient rule", "review", "warning", "Needs explicit allowlist confirmation before real send.")
	case "missing_oauth_scope":
		add("oauth_scope", "X OAuth scopes", "blocked", "error", "Reconnect the X account with dm.read, dm.write, tweet.read and users.read.")
	case "token_missing":
		add("x_token", "X access token", "blocked", "error", "Connected X account is missing a usable access token.")
	case "no_eligible_recipient":
		add("recipient_lookup", "Recipient lookup", "blocked", "warning", "No eligible opt-in recipient was found in recent interactions.")
	case "recipient_lookup_failed":
		add("recipient_lookup", "Recipient lookup", "blocked", "error", "Recipient lookup failed; check the failure reason.")
	case "account_missing":
		add("x_account", "X account", "blocked", "error", "No connected X account is available.")
	default:
		if strings.TrimSpace(task.CapabilityStatus) != "" {
			add("capability", "Capability", "review", "warning", task.CapabilityStatus)
		}
	}
	if strings.TrimSpace(task.FailureCategory) != "" || strings.TrimSpace(task.FailureReason) != "" {
		severity := "error"
		status := "blocked"
		if task.Retryable {
			severity = "warning"
			status = "retryable"
		}
		detail := strings.TrimSpace(task.FailureReason)
		if detail == "" {
			detail = task.FailureCategory
		}
		add("failure", "Last failure", status, severity, detail)
	}
	if task.Status == "sent" {
		add("sent", "Delivery", "ok", "success", "DM was sent successfully.")
	}
	if task.Status == "blocked" {
		add("blocked", "Manual decision", "blocked", "warning", "This task was blocked from the Auto DM workbench.")
	}
	return items
}

func (s *AutoDMService) autoDMRecipientRuleToDTO(rule *model.AutoDMRecipientRule) dto.AutoDMRecipientRuleItem {
	out := dto.AutoDMRecipientRuleItem{
		ID:                rule.ID,
		XAccountID:        rule.XAccountID,
		RecipientUserID:   rule.RecipientUserID,
		RecipientUsername: rule.RecipientUsername,
		RecipientSegment:  normalizeAutoDMRecipientSegment(rule.RecipientSegment),
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
