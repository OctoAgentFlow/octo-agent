package repository

import (
	"errors"
	"strings"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ReferralRepository struct{ DB *gorm.DB }

func NewReferralRepository(db *gorm.DB) *ReferralRepository {
	return &ReferralRepository{DB: db}
}

func (r *ReferralRepository) InviteByUser(userID uint) (*model.ReferralInvite, error) {
	var invite model.ReferralInvite
	err := r.DB.Where("user_id = ?", userID).First(&invite).Error
	if err != nil {
		return nil, err
	}
	return &invite, nil
}

func (r *ReferralRepository) InviteByCode(code string) (*model.ReferralInvite, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	var invite model.ReferralInvite
	err := r.DB.Where("code = ? AND enabled = ?", code, true).First(&invite).Error
	if err != nil {
		return nil, err
	}
	return &invite, nil
}

func (r *ReferralRepository) CreateInvite(invite *model.ReferralInvite) error {
	return r.DB.Create(invite).Error
}

func (r *ReferralRepository) CreateRecord(tx *gorm.DB, record *model.ReferralRecord) error {
	if tx == nil {
		tx = r.DB
	}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(record).Error
}

func (r *ReferralRepository) RecordByInvitee(inviteeUserID uint) (*model.ReferralRecord, error) {
	var record model.ReferralRecord
	err := r.DB.Where("invitee_user_id = ?", inviteeUserID).First(&record).Error
	if err != nil {
		return nil, err
	}
	return &record, nil
}

func (r *ReferralRepository) IncrementUseCount(tx *gorm.DB, inviteID uint) error {
	if tx == nil {
		tx = r.DB
	}
	return tx.Model(&model.ReferralInvite{}).Where("id = ?", inviteID).UpdateColumn("use_count", gorm.Expr("use_count + 1")).Error
}

func (r *ReferralRepository) MarkSignupRewarded(tx *gorm.DB, id uint, value any) error {
	if tx == nil {
		tx = r.DB
	}
	return tx.Model(&model.ReferralRecord{}).Where("id = ? AND signup_rewarded_at IS NULL", id).Update("signup_rewarded_at", value).Error
}

func (r *ReferralRepository) MarkFirstPurchaseRewarded(tx *gorm.DB, id uint, value any) error {
	if tx == nil {
		tx = r.DB
	}
	return tx.Model(&model.ReferralRecord{}).Where("id = ? AND first_purchase_rewarded_at IS NULL", id).Update("first_purchase_rewarded_at", value).Error
}

func IsReferralNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}
