package repository

import (
	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type OAFBotGenerationFeedbackRepository struct{ DB *gorm.DB }

func NewOAFBotGenerationFeedbackRepository(db *gorm.DB) *OAFBotGenerationFeedbackRepository {
	return &OAFBotGenerationFeedbackRepository{DB: db}
}

func (r *OAFBotGenerationFeedbackRepository) Create(row *model.OAFBotGenerationFeedback) error {
	return r.DB.Create(row).Error
}

func (r *OAFBotGenerationFeedbackRepository) ListRecentByUserBot(userID, botID uint, limit int) ([]model.OAFBotGenerationFeedback, error) {
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}
	var rows []model.OAFBotGenerationFeedback
	err := r.DB.Where("user_id = ? AND bot_id = ?", userID, botID).
		Order("id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *OAFBotGenerationFeedbackRepository) ListRecentNegativeByUserBot(userID, botID uint, limit int) ([]model.OAFBotGenerationFeedback, error) {
	if limit <= 0 {
		limit = 8
	}
	if limit > 30 {
		limit = 30
	}
	var rows []model.OAFBotGenerationFeedback
	err := r.DB.Where("user_id = ? AND bot_id = ? AND rating = ?", userID, botID, "negative").
		Order("id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}
