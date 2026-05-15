package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoPostPlanRepository struct {
	DB *gorm.DB
}

func NewAutoPostPlanRepository(db *gorm.DB) *AutoPostPlanRepository {
	return &AutoPostPlanRepository{DB: db}
}

func (r *AutoPostPlanRepository) ListByUser(userID uint) ([]model.AutoPostPlan, error) {
	var rows []model.AutoPostPlan
	err := r.DB.Where("user_id = ?", userID).Order("updated_at DESC, id DESC").Find(&rows).Error
	return rows, err
}

func (r *AutoPostPlanRepository) GetByUserAndID(userID, id uint) (*model.AutoPostPlan, error) {
	var row model.AutoPostPlan
	err := r.DB.Where("user_id = ? AND id = ?", userID, id).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoPostPlanRepository) GetByUserAndAccount(userID, xAccountID uint) (*model.AutoPostPlan, error) {
	var row model.AutoPostPlan
	err := r.DB.Where("user_id = ? AND x_account_id = ?", userID, xAccountID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoPostPlanRepository) Create(plan *model.AutoPostPlan) error {
	return r.DB.Create(plan).Error
}

func (r *AutoPostPlanRepository) Save(plan *model.AutoPostPlan) error {
	return r.DB.Save(plan).Error
}

func (r *AutoPostPlanRepository) TouchRun(plan *model.AutoPostPlan, at time.Time) error {
	plan.LastRunAt = &at
	return r.Save(plan)
}
