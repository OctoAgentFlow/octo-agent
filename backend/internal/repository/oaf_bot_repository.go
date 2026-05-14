package repository

import (
	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type OAFBotRepository struct{ DB *gorm.DB }

func NewOAFBotRepository(db *gorm.DB) *OAFBotRepository {
	return &OAFBotRepository{DB: db}
}

func (r *OAFBotRepository) ListByUserID(userID uint) ([]model.OAFBot, error) {
	var bots []model.OAFBot
	if err := r.DB.Where("user_id = ?", userID).Order("id DESC").Find(&bots).Error; err != nil {
		return nil, err
	}
	return bots, nil
}

func (r *OAFBotRepository) CountByUserID(userID uint) (int64, error) {
	var count int64
	if err := r.DB.Model(&model.OAFBot{}).Where("user_id = ?", userID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *OAFBotRepository) Create(bot *model.OAFBot) error {
	return r.DB.Create(bot).Error
}

func (r *OAFBotRepository) Save(bot *model.OAFBot) error {
	return r.DB.Save(bot).Error
}

func (r *OAFBotRepository) GetByUserAndID(userID, id uint) (*model.OAFBot, error) {
	var bot model.OAFBot
	if err := r.DB.Where("id = ? AND user_id = ?", id, userID).First(&bot).Error; err != nil {
		return nil, err
	}
	return &bot, nil
}

func (r *OAFBotRepository) GetByUserAndTwitterAccountID(userID, twitterAccountID uint) (*model.OAFBot, error) {
	var bot model.OAFBot
	if err := r.DB.Where("user_id = ? AND twitter_account_id = ?", userID, twitterAccountID).Order("id DESC").First(&bot).Error; err != nil {
		return nil, err
	}
	return &bot, nil
}

func (r *OAFBotRepository) GetByUserAndTwitterAccountIDExcludingBot(userID, twitterAccountID, excludeBotID uint) (*model.OAFBot, error) {
	var bot model.OAFBot
	query := r.DB.Where("user_id = ? AND twitter_account_id = ?", userID, twitterAccountID)
	if excludeBotID != 0 {
		query = query.Where("id <> ?", excludeBotID)
	}
	if err := query.Order("id DESC").First(&bot).Error; err != nil {
		return nil, err
	}
	return &bot, nil
}
