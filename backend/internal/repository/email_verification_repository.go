package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type EmailVerificationRepository struct {
	DB *gorm.DB
}

func NewEmailVerificationRepository(db *gorm.DB) *EmailVerificationRepository {
	return &EmailVerificationRepository{DB: db}
}

func (r *EmailVerificationRepository) Create(rec *model.EmailVerificationCode) error {
	return r.DB.Create(rec).Error
}

func (r *EmailVerificationRepository) GetLatestValid(email, purpose, code string) (*model.EmailVerificationCode, error) {
	var rec model.EmailVerificationCode
	err := r.DB.
		Where("email = ? AND purpose = ? AND code = ? AND used_at IS NULL AND expired_at > ?", email, purpose, code, time.Now()).
		Order("id DESC").
		First(&rec).Error
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

func (r *EmailVerificationRepository) MarkUsed(id uint) error {
	now := time.Now()
	return r.DB.Model(&model.EmailVerificationCode{}).
		Where("id = ? AND used_at IS NULL", id).
		Update("used_at", &now).Error
}

func (r *EmailVerificationRepository) DeleteByID(id uint) error {
	return r.DB.Where("id = ?", id).Delete(&model.EmailVerificationCode{}).Error
}

func (r *EmailVerificationRepository) GetLatestUnexpiredByEmailPurpose(email, purpose string) (*model.EmailVerificationCode, error) {
	var rec model.EmailVerificationCode
	err := r.DB.
		Where("email = ? AND purpose = ? AND used_at IS NULL AND expired_at > ?", email, purpose, time.Now()).
		Order("id DESC").
		First(&rec).Error
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

func (r *EmailVerificationRepository) CleanupExpired(batchSize int) (int64, error) {
	if batchSize <= 0 {
		batchSize = 500
	}
	result := r.DB.
		Where("expired_at <= ? OR used_at IS NOT NULL", time.Now()).
		Limit(batchSize).
		Delete(&model.EmailVerificationCode{})
	return result.RowsAffected, result.Error
}
