package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	AIGenerationSceneAutoPost           = "auto_post"
	AIGenerationSceneAutoComment        = "auto_comment"
	AIGenerationSceneOAFBotTestGenerate = "oaf_bot_test_generate"
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
	return r.DB.Clauses(clause.OnConflict{
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
	}).Create(&row).Error
}
