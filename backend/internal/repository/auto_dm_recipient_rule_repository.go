package repository

import (
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	AutoDMRecipientAllowlisted  = "allowlisted"
	AutoDMRecipientBlocked      = "blocked"
	AutoDMRecipientUnsubscribed = "unsubscribed"
)

type AutoDMRecipientRuleRepository struct{ DB *gorm.DB }

func NewAutoDMRecipientRuleRepository(db *gorm.DB) *AutoDMRecipientRuleRepository {
	return &AutoDMRecipientRuleRepository{DB: db}
}

func (r *AutoDMRecipientRuleRepository) ListByUser(userID uint, limit int) ([]model.AutoDMRecipientRule, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var rows []model.AutoDMRecipientRule
	err := r.DB.Where("user_id = ?", userID).
		Order("updated_at DESC, id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *AutoDMRecipientRuleRepository) GetByRecipient(userID, accountID uint, recipientUserID string) (*model.AutoDMRecipientRule, error) {
	recipientUserID = strings.TrimSpace(recipientUserID)
	if recipientUserID == "" {
		return nil, gorm.ErrRecordNotFound
	}
	var row model.AutoDMRecipientRule
	err := r.DB.Where("user_id = ? AND x_account_id = ? AND recipient_user_id = ?", userID, accountID, recipientUserID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoDMRecipientRuleRepository) CountAllowlisted(userID, accountID uint) (int64, error) {
	var n int64
	err := r.DB.Model(&model.AutoDMRecipientRule{}).
		Where("user_id = ? AND x_account_id = ? AND status = ?", userID, accountID, AutoDMRecipientAllowlisted).
		Count(&n).Error
	return n, err
}

func (r *AutoDMRecipientRuleRepository) Upsert(userID, accountID uint, recipientUserID, username, status, source, reason string, at time.Time) (*model.AutoDMRecipientRule, error) {
	rule := &model.AutoDMRecipientRule{
		UserID:            userID,
		XAccountID:        accountID,
		RecipientUserID:   strings.TrimSpace(recipientUserID),
		RecipientUsername: strings.TrimSpace(username),
		Status:            strings.TrimSpace(status),
		Source:            strings.TrimSpace(source),
		Reason:            strings.TrimSpace(reason),
		LastMatchedAt:     &at,
	}
	err := r.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}, {Name: "x_account_id"}, {Name: "recipient_user_id"}},
		DoUpdates: clause.Assignments(map[string]any{
			"recipient_username": rule.RecipientUsername,
			"status":             rule.Status,
			"source":             rule.Source,
			"reason":             rule.Reason,
			"last_matched_at":    at,
			"updated_at":         at,
		}),
	}).Create(rule).Error
	if err != nil {
		return nil, err
	}
	return r.GetByRecipient(userID, accountID, recipientUserID)
}

func IsAutoDMRecipientRuleStatus(status string) bool {
	switch strings.TrimSpace(status) {
	case AutoDMRecipientAllowlisted, AutoDMRecipientBlocked, AutoDMRecipientUnsubscribed:
		return true
	default:
		return false
	}
}
