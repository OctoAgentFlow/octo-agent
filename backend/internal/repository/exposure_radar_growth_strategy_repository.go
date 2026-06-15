package repository

import (
	"strings"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type ExposureRadarGrowthStrategyRepository struct {
	DB *gorm.DB
}

func NewExposureRadarGrowthStrategyRepository(db *gorm.DB) *ExposureRadarGrowthStrategyRepository {
	return &ExposureRadarGrowthStrategyRepository{DB: db}
}

func (r *ExposureRadarGrowthStrategyRepository) Get(userID uint, region string, botID uint, xAccountID uint) (*model.ExposureRadarGrowthStrategy, error) {
	var row model.ExposureRadarGrowthStrategy
	err := r.DB.Where("user_id = ? AND region = ? AND bot_id = ? AND x_account_id = ?", userID, strings.TrimSpace(region), botID, xAccountID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *ExposureRadarGrowthStrategyRepository) Save(record *model.ExposureRadarGrowthStrategy) error {
	return r.DB.Save(record).Error
}
