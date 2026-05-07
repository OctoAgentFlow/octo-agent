package service

import (
	"context"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
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
	autoDMPermissionReason       = "Auto DM real send is disabled until X DM API permission and safe recipient rules are confirmed."
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

// RunTick advances Auto DM into a visible dry-run/capability-check loop.
func (s *AutoDMService) RunTick(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	now := time.Now().UTC()
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

	if cfg.SafetyRequireApproval {
		if err := s.createDMAudit(cfg.UserID, account.ID, handle, "interaction_only", "review", "recipient_rule_pending", "activity.preview.dmDryRunReview", "", true, now); err != nil {
			return err
		}
		zap.L().Info("auto dm: dry-run review created",
			zap.String("request_id", requestid.FromContext(ctx)),
			zap.Uint("user_id", cfg.UserID),
			zap.Uint("x_account_id", account.ID))
		return s.finishRun(cfg, now, "Needs Review")
	}

	if err := s.createDMAudit(cfg.UserID, account.ID, handle, "interaction_only", "failed", "approval_required", "activity.preview.dmCapabilityMissing", autoDMPermissionReason, false, now); err != nil {
		return err
	}
	return s.finishRun(cfg, now, "Needs Review")
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
	if s.taskRepo != nil {
		open, err := s.taskRepo.HasOpenCapabilityTask(userID, accountID, capabilityStatus)
		if err != nil {
			return err
		}
		if open {
			return nil
		}
	}
	log := &model.ActivityLog{
		UserID:        userID,
		XAccountID:    accountID,
		Type:          "dm",
		Status:        status,
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
	task := &model.AutoDMTask{
		UserID:           userID,
		XAccountID:       accountID,
		AccountHandle:    handle,
		RecipientSource:  recipientSource,
		MessagePreview:   autoDMMessagePreview(recipientSource),
		Status:           status,
		CapabilityStatus: capabilityStatus,
		FailureReason:    truncateErrMsg(reason),
		ApprovalRequired: approvalRequired,
		ActivityLogID:    log.ID,
		GeneratedAt:      at,
	}
	return s.taskRepo.Create(task)
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

func autoDMMessagePreview(recipientSource string) string {
	switch strings.TrimSpace(recipientSource) {
	case "interaction_only":
		return "Draft only: send a short opt-in follow-up to an explicitly engaged user."
	case "capability_check":
		return "Capability check only: no recipient selected and no message sent."
	default:
		return "Draft only: pending recipient rule and approval."
	}
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
