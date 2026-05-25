package repository

import (
	"encoding/json"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	AIGenerationSceneAutoPost           = "auto_post"
	AIGenerationSceneAutoReply          = "auto_reply"
	AIGenerationSceneAutoComment        = "auto_comment"
	AIGenerationSceneOAFBotTestGenerate = "oaf_bot_test_generate"

	defaultAIInputTokensPerGeneration  = int64(3000)
	defaultAIOutputTokensPerGeneration = int64(120)
	defaultAIEstimatedCostCents        = int64(1)
)

type AIGenerationUsageRepository struct{ DB *gorm.DB }

func NewAIGenerationUsageRepository(db *gorm.DB) *AIGenerationUsageRepository {
	return &AIGenerationUsageRepository{DB: db}
}

func UsageMonth(t time.Time) string {
	return t.UTC().Format("2006-01")
}

func (r *AIGenerationUsageRepository) CountByUserMonth(userID uint, month string) (int64, error) {
	var total int64
	err := r.DB.Model(&model.AIGenerationUsage{}).
		Select("COALESCE(SUM(count), 0)").
		Where("user_id = ? AND month = ?", userID, month).
		Scan(&total).Error
	return total, err
}

func (r *AIGenerationUsageRepository) ListByUserBot(userID, botID uint, limit int) ([]model.AIGenerationUsage, error) {
	if limit <= 0 {
		limit = 12
	}
	if limit > 100 {
		limit = 100
	}
	var rows []model.AIGenerationUsage
	err := r.DB.Where("user_id = ? AND bot_id = ?", userID, botID).
		Order("month DESC, updated_at DESC, id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *AIGenerationUsageRepository) Increment(userID, botID uint, scene string, at time.Time, delta int64) error {
	return r.IncrementWithCost(userID, botID, scene, at, delta, 0, 0, "")
}

func (r *AIGenerationUsageRepository) IncrementWithCost(userID, botID uint, scene string, at time.Time, delta, inputTokens, outputTokens int64, modelName string) error {
	if delta <= 0 {
		delta = 1
	}
	row := model.AIGenerationUsage{
		UserID: userID,
		BotID:  botID,
		Scene:  scene,
		Month:  UsageMonth(at),
		Count:  delta,
	}
	if err := r.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "user_id"},
			{Name: "bot_id"},
			{Name: "scene"},
			{Name: "month"},
		},
		DoUpdates: clause.Assignments(map[string]any{
			"count":      gorm.Expr("count + ?", delta),
			"updated_at": at.UTC(),
		}),
	}).Create(&row).Error; err != nil {
		return err
	}
	return r.recordEstimatedAICost(userID, botID, scene, at, delta, inputTokens, outputTokens, modelName)
}

func (r *AIGenerationUsageRepository) recordEstimatedAICost(userID, botID uint, scene string, at time.Time, delta, inputTokens, outputTokens int64, modelName string) error {
	if delta <= 0 {
		delta = 1
	}
	unitBasis := "provider_usage"
	if inputTokens <= 0 && outputTokens <= 0 {
		unitBasis = "estimated_default"
		inputTokens = defaultAIInputTokensPerGeneration * delta
		outputTokens = defaultAIOutputTokensPerGeneration * delta
	}
	details, _ := json.Marshal(map[string]any{
		"scene":      scene,
		"model":      modelName,
		"unit_basis": unitBasis,
	})
	row := model.CostUsageLedger{
		UserID:             userID,
		BotID:              botID,
		SourceType:         "ai_generation",
		Provider:           "openai",
		Metric:             "chat_completion",
		Quantity:           delta,
		InputTokens:        inputTokens,
		OutputTokens:       outputTokens,
		EstimatedCostCents: estimatedOpenAICostCents(inputTokens, outputTokens, delta),
		Currency:           "USD",
		OccurredAt:         at.UTC(),
		Details:            string(details),
	}
	return r.DB.Create(&row).Error
}

func estimatedOpenAICostCents(inputTokens, outputTokens, delta int64) int64 {
	if inputTokens <= 0 && outputTokens <= 0 {
		if delta <= 0 {
			delta = 1
		}
		return defaultAIEstimatedCostCents * delta
	}
	// Mirrors subscription.DefaultUnitCosts: $0.40/M input and $1.60/M output.
	microCents := inputTokens*40 + outputTokens*160
	cents := (microCents + 999999) / 1000000
	if cents <= 0 {
		return 1
	}
	return cents
}
