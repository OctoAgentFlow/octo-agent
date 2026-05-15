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

func (r *AutoPostPlanRepository) GetByID(id uint) (*model.AutoPostPlan, error) {
	var row model.AutoPostPlan
	err := r.DB.First(&row, id).Error
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

func (r *AutoPostPlanRepository) ListDueEnabled(limit int, now time.Time) ([]model.AutoPostPlan, error) {
	if limit <= 0 {
		limit = 20
	}
	var rows []model.AutoPostPlan
	err := r.DB.Where("enabled = ?", true).
		Where("(next_run_at IS NULL OR next_run_at <= ?)", now).
		Order("COALESCE(next_run_at, created_at) ASC, id ASC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *AutoPostPlanRepository) TryClaimDue(id uint, now time.Time, staleBefore time.Time) (bool, error) {
	tx := r.DB.Model(&model.AutoPostPlan{}).
		Where("id = ? AND enabled = ?", id, true).
		Where("(next_run_at IS NULL OR next_run_at <= ?)", now).
		Where("(processing_at IS NULL OR processing_at < ?)", staleBefore).
		Updates(map[string]any{
			"processing_at": now,
			"updated_at":    now,
		})
	return tx.RowsAffected == 1, tx.Error
}

func (r *AutoPostPlanRepository) FinishScheduler(id uint, lastRunAt *time.Time, nextRunAt time.Time) error {
	updates := map[string]any{
		"processing_at": nil,
		"next_run_at":   nextRunAt,
		"updated_at":    time.Now().UTC(),
	}
	if lastRunAt != nil {
		updates["last_run_at"] = *lastRunAt
	}
	return r.DB.Model(&model.AutoPostPlan{}).Where("id = ?", id).Updates(updates).Error
}

func (r *AutoPostPlanRepository) TouchRun(plan *model.AutoPostPlan, at time.Time) error {
	plan.LastRunAt = &at
	return r.Save(plan)
}
