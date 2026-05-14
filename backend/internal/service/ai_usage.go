package service

import (
	"errors"
	"time"

	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"
)

var ErrAIGenerationQuotaExceeded = errors.New("monthly AI generation quota exceeded; upgrade your plan to continue")

func assertAIGenerationQuota(userRepo *repository.UserRepository, usageRepo *repository.AIGenerationUsageRepository, userID uint, now time.Time) error {
	if userRepo == nil || usageRepo == nil {
		return nil
	}
	user, err := userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	limits := subscription.LimitsForUser(user)
	if limits.AIGenerationsMonthly <= 0 {
		return ErrAIGenerationQuotaExceeded
	}
	used, err := usageRepo.CountByUserMonth(userID, repository.UsageMonth(now))
	if err != nil {
		return err
	}
	if used >= limits.AIGenerationsMonthly {
		return ErrAIGenerationQuotaExceeded
	}
	return nil
}

func currentAIGenerationUsage(usageRepo *repository.AIGenerationUsageRepository, userID uint, now time.Time) int64 {
	if usageRepo == nil {
		return 0
	}
	used, err := usageRepo.CountByUserMonth(userID, repository.UsageMonth(now))
	if err != nil {
		return 0
	}
	return used
}

func botIDForUsage(bot *model.OAFBot) uint {
	if bot == nil {
		return 0
	}
	return bot.ID
}
