package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type OAFBotGenerationFeedbackRepository struct{ DB *gorm.DB }

func NewOAFBotGenerationFeedbackRepository(db *gorm.DB) *OAFBotGenerationFeedbackRepository {
	return &OAFBotGenerationFeedbackRepository{DB: db}
}

func (r *OAFBotGenerationFeedbackRepository) ListRecentNegativeByUserSince(userID uint, since time.Time, limit int) ([]model.OAFBotGenerationFeedback, error) {
	if limit <= 0 {
		limit = 200
	}
	if limit > 1000 {
		limit = 1000
	}
	var rows []model.OAFBotGenerationFeedback
	err := r.DB.Where("user_id = ? AND rating = ? AND created_at >= ?", userID, "negative", since).
		Order("id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *OAFBotGenerationFeedbackRepository) Create(row *model.OAFBotGenerationFeedback) error {
	return r.DB.Create(row).Error
}

func (r *OAFBotGenerationFeedbackRepository) DeleteByUserBotAndID(userID, botID, id uint) error {
	return r.DB.Where("user_id = ? AND bot_id = ? AND id = ?", userID, botID, id).Delete(&model.OAFBotGenerationFeedback{}).Error
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

func (r *OAFBotGenerationFeedbackRepository) ListRecentByUserBots(userID uint, botIDs []uint, limitPerBot int) ([]model.OAFBotGenerationFeedback, error) {
	if len(botIDs) == 0 {
		return []model.OAFBotGenerationFeedback{}, nil
	}
	if limitPerBot <= 0 {
		limitPerBot = 10
	}
	if limitPerBot > 50 {
		limitPerBot = 50
	}
	var rows []model.OAFBotGenerationFeedback
	ranked := r.DB.Model(&model.OAFBotGenerationFeedback{}).
		Select("*, ROW_NUMBER() OVER (PARTITION BY bot_id ORDER BY id DESC) AS rn").
		Where("user_id = ? AND bot_id IN ?", userID, botIDs)
	err := r.DB.Table("(?) AS ranked_feedback", ranked).
		Where("rn <= ?", limitPerBot).
		Order("bot_id ASC, id DESC").
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

func (r *OAFBotGenerationFeedbackRepository) ListRecentNegativeByUserBotScene(userID, botID uint, scene string, limit int) ([]model.OAFBotGenerationFeedback, error) {
	if limit <= 0 {
		limit = 8
	}
	if limit > 30 {
		limit = 30
	}
	var rows []model.OAFBotGenerationFeedback
	err := r.DB.Where("user_id = ? AND bot_id = ? AND scene = ? AND rating = ?", userID, botID, scene, "negative").
		Order("id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *OAFBotGenerationFeedbackRepository) ListRecentByUserBotScene(userID, botID uint, scene string, limit int) ([]model.OAFBotGenerationFeedback, error) {
	if limit <= 0 {
		limit = 12
	}
	if limit > 50 {
		limit = 50
	}
	var rows []model.OAFBotGenerationFeedback
	err := r.DB.Where("user_id = ? AND bot_id = ? AND scene = ?", userID, botID, scene).
		Order("id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *OAFBotGenerationFeedbackRepository) ListRecentNegativeByUserBotScenes(userID, botID uint, scenes []string, limit int) ([]model.OAFBotGenerationFeedback, error) {
	if len(scenes) == 0 {
		return []model.OAFBotGenerationFeedback{}, nil
	}
	if limit <= 0 {
		limit = 8
	}
	if limit > 30 {
		limit = 30
	}
	var rows []model.OAFBotGenerationFeedback
	err := r.DB.Where("user_id = ? AND bot_id = ? AND scene IN ? AND rating = ?", userID, botID, scenes, "negative").
		Order("id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}
