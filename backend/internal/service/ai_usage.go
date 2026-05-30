package service

import (
	"context"
	"errors"
	"time"

	"octo-agent/backend/internal/alert"
	openaiint "octo-agent/backend/internal/integration/openai"
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

func recordAIGenerationUsage(usageRepo *repository.AIGenerationUsageRepository, userID, botID uint, scene string, now time.Time, usage openaiint.TextUsage) error {
	if usageRepo == nil {
		return nil
	}
	notifyPromptGuardUsageAnomaly(userID, botID, scene, usage)
	return usageRepo.IncrementWithCost(userID, botID, scene, now, 1, usage.InputTokens, usage.OutputTokens, usage.Model, promptGuardUsageDetails(usage))
}

func promptGuardUsageDetails(usage openaiint.TextUsage) map[string]any {
	return map[string]any{
		"prompt_guard_enabled":     usage.PromptGuardEnabled,
		"system_language":          usage.SystemLanguage,
		"context_language":         usage.ContextLanguage,
		"expected_output_language": usage.ExpectedOutputLanguage,
		"actual_output_language":   usage.ActualOutputLanguage,
		"retry_count":              usage.RetryCount,
	}
}

func notifyPromptGuardUsageAnomaly(userID, botID uint, scene string, usage openaiint.TextUsage) {
	if promptGuardSystemLanguageViolation(usage) {
		alert.Notify(context.Background(), alert.Event{
			Level:      alert.LevelError,
			Category:   alert.CategoryLLM,
			Title:      "Prompt Guard system prompt language violation",
			Message:    "Prompt Guard detected a non-English system prompt in AI usage metadata.",
			UserID:     userID,
			ResourceID: botID,
			Fields: map[string]any{
				"scene":           scene,
				"bot_id":          botID,
				"system_language": usage.SystemLanguage,
				"model":           usage.Model,
			},
		})
	}
	if promptGuardLanguageMismatchAfterRetry(usage) {
		alert.Notify(context.Background(), alert.Event{
			Level:      alert.LevelWarning,
			Category:   alert.CategoryLLM,
			Title:      "Prompt Guard output language mismatch after retry",
			Message:    "AI output language still differs from the expected output language after Prompt Guard retry.",
			UserID:     userID,
			ResourceID: botID,
			Fields: map[string]any{
				"scene":                    scene,
				"bot_id":                   botID,
				"system_language":          usage.SystemLanguage,
				"context_language":         usage.ContextLanguage,
				"expected_output_language": usage.ExpectedOutputLanguage,
				"actual_output_language":   usage.ActualOutputLanguage,
				"retry_count":              usage.RetryCount,
				"model":                    usage.Model,
			},
		})
	}
}

func promptGuardSystemLanguageViolation(usage openaiint.TextUsage) bool {
	return usage.PromptGuardEnabled && usage.SystemLanguage != "" && usage.SystemLanguage != "English"
}

func promptGuardLanguageMismatchAfterRetry(usage openaiint.TextUsage) bool {
	return usage.PromptGuardEnabled &&
		usage.RetryCount > 0 &&
		usage.ExpectedOutputLanguage != "" &&
		usage.ActualOutputLanguage != "" &&
		usage.ExpectedOutputLanguage != usage.ActualOutputLanguage
}

func botIDForUsage(bot *model.OAFBot) uint {
	if bot == nil {
		return 0
	}
	return bot.ID
}
