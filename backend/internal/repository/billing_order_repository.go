package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type BillingOrderRepository struct{ DB *gorm.DB }

func NewBillingOrderRepository(db *gorm.DB) *BillingOrderRepository {
	return &BillingOrderRepository{DB: db}
}

func (r *BillingOrderRepository) Create(o *model.BillingOrder) error {
	return r.DB.Create(o).Error
}

func (r *BillingOrderRepository) GetByID(id uint) (*model.BillingOrder, error) {
	var o model.BillingOrder
	if err := r.DB.First(&o, id).Error; err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *BillingOrderRepository) GetByUserAndID(userID, id uint) (*model.BillingOrder, error) {
	var o model.BillingOrder
	if err := r.DB.Where("user_id = ? AND id = ?", userID, id).First(&o).Error; err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *BillingOrderRepository) ListByUser(userID uint, limit int) ([]model.BillingOrder, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var orders []model.BillingOrder
	err := r.DB.Where("user_id = ?", userID).
		Order("id DESC").
		Limit(limit).
		Find(&orders).Error
	return orders, err
}

func (r *BillingOrderRepository) ExpireStaleByUser(userID uint, now time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).
		Where("user_id = ? AND status IN ? AND expired_at < ?", userID, []string{"pending", "failed"}, now).
		Updates(map[string]any{
			"status":          "expired",
			"failure_reason":  "order expired before payment confirmation",
			"last_checked_at": now,
		}).Error
}

func (r *BillingOrderRepository) ExpireStaleByID(id uint, now time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).
		Where("id = ? AND status IN ? AND expired_at < ?", id, []string{"pending", "failed"}, now).
		Updates(map[string]any{
			"status":          "expired",
			"failure_reason":  "order expired before payment confirmation",
			"last_checked_at": now,
		}).Error
}

func (r *BillingOrderRepository) ExpireStaleByUserAndID(userID, id uint, now time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).
		Where("user_id = ? AND id = ? AND status IN ? AND expired_at < ?", userID, id, []string{"pending", "failed"}, now).
		Updates(map[string]any{
			"status":          "expired",
			"failure_reason":  "order expired before payment confirmation",
			"last_checked_at": now,
		}).Error
}

func (r *BillingOrderRepository) MarkFailed(id uint, txHash, reason string, checkedAt time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).Where("id = ?", id).Updates(map[string]any{
		"status":          "failed",
		"tx_hash":         txHash,
		"failure_reason":  reason,
		"last_checked_at": checkedAt,
	}).Error
}

func (r *BillingOrderRepository) MarkPaid(id uint, txHash string, paidAt time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).Where("id = ?", id).Updates(map[string]any{
		"status":          "paid",
		"tx_hash":         txHash,
		"paid_at":         paidAt,
		"failure_reason":  "",
		"last_checked_at": paidAt,
	}).Error
}
