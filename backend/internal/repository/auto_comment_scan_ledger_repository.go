package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoCommentScanLedgerRepository struct {
	DB *gorm.DB
}

func NewAutoCommentScanLedgerRepository(db *gorm.DB) *AutoCommentScanLedgerRepository {
	return &AutoCommentScanLedgerRepository{DB: db}
}

func (r *AutoCommentScanLedgerRepository) Create(row *model.AutoCommentScanLedger) error {
	return r.DB.Create(row).Error
}

func (r *AutoCommentScanLedgerRepository) CountByUserBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.AutoCommentScanLedger{}).
		Where("user_id = ?", userID).
		Where("scanned_at >= ? AND scanned_at <= ?", from, to).
		Count(&n).Error
	return n, err
}
