package service

import (
	"context"
	"strings"
	"time"

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
	userRepo       *repository.UserRepository
}

func NewAutoDMService(
	accountRepo *repository.TwitterAccountRepository,
	automationRepo *repository.AutomationRepository,
	activityRepo *repository.ActivityRepository,
	userRepo *repository.UserRepository,
) *AutoDMService {
	return &AutoDMService{
		accountRepo:    accountRepo,
		automationRepo: automationRepo,
		activityRepo:   activityRepo,
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
		if err := s.createDMActivity(cfg.UserID, 0, "—", "failed", "activity.preview.dmSkipped", autoDMNoAccountReason, now); err != nil {
			return err
		}
		return s.finishRun(cfg, now, "Needs Review")
	}
	handle := formatXAccountHandle(account.Username)
	if strings.TrimSpace(account.AccessToken) == "" {
		if err := s.createDMActivity(cfg.UserID, account.ID, handle, "failed", "activity.preview.dmSkipped", autoDMNoTokenReason, now); err != nil {
			return err
		}
		return s.finishRun(cfg, now, "Needs Review")
	}

	if cfg.SafetyRequireApproval {
		if err := s.createDMActivity(cfg.UserID, account.ID, handle, "review", "activity.preview.dmDryRunReview", "", now); err != nil {
			return err
		}
		zap.L().Info("auto dm: dry-run review created",
			zap.String("request_id", requestid.FromContext(ctx)),
			zap.Uint("user_id", cfg.UserID),
			zap.Uint("x_account_id", account.ID))
		return s.finishRun(cfg, now, "Needs Review")
	}

	if err := s.createDMActivity(cfg.UserID, account.ID, handle, "failed", "activity.preview.dmCapabilityMissing", autoDMPermissionReason, now); err != nil {
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

func (s *AutoDMService) createDMActivity(userID, accountID uint, handle, status, previewKey, reason string, at time.Time) error {
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
	return s.activityRepo.DB.Create(log).Error
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
