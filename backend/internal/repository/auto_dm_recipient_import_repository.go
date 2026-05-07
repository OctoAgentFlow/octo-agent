package repository

import (
	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoDMRecipientImportRepository struct{ DB *gorm.DB }

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
