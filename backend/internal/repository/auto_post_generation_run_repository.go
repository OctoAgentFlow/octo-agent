package repository

import (
	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoPostGenerationRunRepository struct {
	DB *gorm.DB
}

func NewAutoPostGenerationRunRepository(db *gorm.DB) *AutoPostGenerationRunRepository {
	return &AutoPostGenerationRunRepository{DB: db}
}

func (r *AutoPostGenerationRunRepository) Create(run *model.AutoPostGenerationRun) error {
	return r.DB.Create(run).Error
}

func (r *AutoPostGenerationRunRepository) ListByUser(userID uint, limit int) ([]model.AutoPostGenerationRun, error) {
	if limit <= 0 {
		limit = 50
	}
	var rows []model.AutoPostGenerationRun
	err := r.DB.Where("user_id = ?", userID).Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}
