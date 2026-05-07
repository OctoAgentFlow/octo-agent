package repository

import (
	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type UserNotificationSettingRepository struct{ DB *gorm.DB }

func NewUserNotificationSettingRepository(db *gorm.DB) *UserNotificationSettingRepository {
	return &UserNotificationSettingRepository{DB: db}
}

func (r *UserNotificationSettingRepository) GetByUserID(userID uint) (*model.UserNotificationSetting, error) {
	var setting model.UserNotificationSetting
	if err := r.DB.Where("user_id = ?", userID).First(&setting).Error; err != nil {
		return nil, err
	}
	return &setting, nil
}

func (r *UserNotificationSettingRepository) Create(setting *model.UserNotificationSetting) error {
	return r.DB.Create(setting).Error
}

func (r *UserNotificationSettingRepository) Save(setting *model.UserNotificationSetting) error {
	return r.DB.Save(setting).Error
}
