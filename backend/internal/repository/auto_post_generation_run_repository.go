package repository

import (
	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoPostGenerationRunRepository struct {
	DB *gorm.DB
}

type AutoPostGenerationRunListQuery struct {
	UserID     uint
	Status     string
	XAccountID uint
	Page       int
	PageSize   int
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

func (r *AutoPostGenerationRunRepository) List(query AutoPostGenerationRunListQuery) ([]model.AutoPostGenerationRun, int64, error) {
	page := query.Page
	if page <= 0 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	q := r.DB.Model(&model.AutoPostGenerationRun{}).Where("user_id = ?", query.UserID)
	if query.Status != "" {
		q = q.Where("status = ?", query.Status)
	}
	if query.XAccountID > 0 {
		q = q.Where("x_account_id = ?", query.XAccountID)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []model.AutoPostGenerationRun
	err := q.Order("created_at DESC, id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error
	return rows, total, err
}
