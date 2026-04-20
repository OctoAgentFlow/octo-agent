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

func (r *BillingOrderRepository) MarkPaid(id uint, txHash string, paidAt time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).Where("id = ?", id).Updates(map[string]any{
		"status":  "paid",
		"tx_hash": txHash,
		"paid_at": paidAt,
	}).Error
}
