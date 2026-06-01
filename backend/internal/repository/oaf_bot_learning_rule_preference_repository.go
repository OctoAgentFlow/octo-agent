package repository

import (
	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type OAFBotLearningRulePreferenceRepository struct {
	DB *gorm.DB
}

func NewOAFBotLearningRulePreferenceRepository(db *gorm.DB) *OAFBotLearningRulePreferenceRepository {
	return &OAFBotLearningRulePreferenceRepository{DB: db}
}

func (r *OAFBotLearningRulePreferenceRepository) ListByUserBot(userID, botID uint) ([]model.OAFBotLearningRulePreference, error) {
	var rows []model.OAFBotLearningRulePreference
	err := r.DB.Where("user_id = ? AND bot_id = ?", userID, botID).Order("feedback_issue ASC").Find(&rows).Error
	return rows, err
}

func (r *OAFBotLearningRulePreferenceRepository) Upsert(row *model.OAFBotLearningRulePreference) error {
	return r.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "bot_id"}, {Name: "feedback_issue"}},
		DoUpdates: clause.AssignmentColumns([]string{"user_id", "status", "updated_at"}),
	}).Create(row).Error
}
