package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutomationRepository struct {
	DB *gorm.DB
}

func NewAutomationRepository(db *gorm.DB) *AutomationRepository {
	return &AutomationRepository{DB: db}
}

func (r *AutomationRepository) EnsureDefaults(userID uint) error {
	defaults := []model.AutomationConfig{
		{
			UserID:                   userID,
			Type:                     "post",
			Enabled:                  false,
			State:                    "Paused",
			FrequencyIntervalMinutes: 180,
			FrequencyDailyLimit:      6,
			Tone:                     "Professional",
			SafetyRequireApproval:    true,
			SafetyMaxPerHour:         2,
			SafetyBlockedKeywords:    `["airdrop","giveaway"]`,
		},
		{
			UserID:                   userID,
			Type:                     "reply",
			Enabled:                  false,
			State:                    "Paused",
			FrequencyIntervalMinutes: 15,
			FrequencyDailyLimit:      120,
			Tone:                     "Friendly",
			SafetyRequireApproval:    false,
			SafetyMaxPerHour:         30,
			SafetyBlockedKeywords:    `["price","pump"]`,
		},
		{
			UserID:                   userID,
			Type:                     "dm",
			Enabled:                  false,
			State:                    "Paused",
			FrequencyIntervalMinutes: 60,
			FrequencyDailyLimit:      40,
			Tone:                     "Web3-native",
			SafetyRequireApproval:    true,
			SafetyMaxPerHour:         10,
			SafetyBlockedKeywords:    `["seed phrase","private key"]`,
		},
	}

	for _, item := range defaults {
		var count int64
		if err := r.DB.Model(&model.AutomationConfig{}).Where("user_id = ? AND type = ?", userID, item.Type).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			now := time.Now()
			if item.Enabled {
				item.LastRunAt = &now
				next := now.Add(time.Duration(item.FrequencyIntervalMinutes) * time.Minute)
				item.NextRunAt = &next
			} else {
				item.NextRunAt = nil
			}
			if err := r.DB.Create(&item).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func (r *AutomationRepository) ListByUser(userID uint) ([]model.AutomationConfig, error) {
	var modules []model.AutomationConfig
	err := r.DB.Where("user_id = ?", userID).Order("id ASC").Find(&modules).Error
	return modules, err
}

func (r *AutomationRepository) GetByUserAndType(userID uint, typ string) (*model.AutomationConfig, error) {
	var cfg model.AutomationConfig
	err := r.DB.Where("user_id = ? AND type = ?", userID, typ).First(&cfg).Error
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (r *AutomationRepository) Save(cfg *model.AutomationConfig) error {
	return r.DB.Save(cfg).Error
}

const AutomationTypeReply = "reply"

// ListUserIDsWithReplyAutomationEnabled returns user ids with reply automation on and an active subscription.
func (r *AutomationRepository) ListUserIDsWithReplyAutomationEnabled(limit int) ([]uint, error) {
	if limit <= 0 {
		limit = 50
	}
	now := time.Now().UTC()
	var ids []uint
	err := r.DB.Model(&model.AutomationConfig{}).
		Select("automation_configs.user_id").
		Joins(`INNER JOIN users ON users.id = automation_configs.user_id AND users.subscription_status = ? AND users.subscription_expires_at IS NOT NULL AND users.subscription_expires_at > ?`,
			"active", now).
		Where("automation_configs.type = ? AND automation_configs.enabled = ?", AutomationTypeReply, true).
		Limit(limit).
		Pluck("automation_configs.user_id", &ids).Error
	return ids, err
}
