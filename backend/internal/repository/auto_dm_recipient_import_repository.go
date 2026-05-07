package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoDMRecipientImportRepository struct{ DB *gorm.DB }

type AutoDMRecipientImportSummary struct {
	Batches      int64
	Imported     int64
	Skipped      int64
	ErrorBatches int64
}

func NewAutoDMRecipientImportRepository(db *gorm.DB) *AutoDMRecipientImportRepository {
	return &AutoDMRecipientImportRepository{DB: db}
}

func (r *AutoDMRecipientImportRepository) Create(row *model.AutoDMRecipientImport) error {
	return r.DB.Create(row).Error
}

func (r *AutoDMRecipientImportRepository) ListByUser(userID uint, limit int) ([]model.AutoDMRecipientImport, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var rows []model.AutoDMRecipientImport
	err := r.DB.Where("user_id = ?", userID).
		Order("imported_at DESC, id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *AutoDMRecipientImportRepository) SummaryBetween(userID uint, from, to time.Time, accountID uint) (AutoDMRecipientImportSummary, error) {
	var out AutoDMRecipientImportSummary
	q := r.DB.Model(&model.AutoDMRecipientImport{}).
		Select("COUNT(*) AS batches, COALESCE(SUM(imported), 0) AS imported, COALESCE(SUM(skipped), 0) AS skipped, COALESCE(SUM(CASE WHEN error_summary <> '' THEN 1 ELSE 0 END), 0) AS error_batches").
		Where("user_id = ?", userID)
	if accountID > 0 {
		q = q.Where("x_account_id = ?", accountID)
	}
	if !from.IsZero() {
		q = q.Where("imported_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("imported_at < ?", to)
	}
	err := q.Scan(&out).Error
	return out, err
}

func (r *AutoDMRecipientImportRepository) ListRecentErrorsBetween(userID uint, from, to time.Time, accountID uint, limit int) ([]model.AutoDMRecipientImport, error) {
	if limit <= 0 || limit > 20 {
		limit = 5
	}
	var rows []model.AutoDMRecipientImport
	q := r.DB.Where("user_id = ? AND error_summary <> ''", userID)
	if accountID > 0 {
		q = q.Where("x_account_id = ?", accountID)
	}
	if !from.IsZero() {
		q = q.Where("imported_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("imported_at < ?", to)
	}
	err := q.Order("imported_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}
