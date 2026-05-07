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

func (r *AutoDMRecipientRuleRepository) GetByToken(token string) (*model.AutoDMRecipientRule, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, gorm.ErrRecordNotFound
	}
	var row model.AutoDMRecipientRule
	err := r.DB.Where("unsubscribe_token = ?", token).First(&row).Error
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

func (r *AutoDMRecipientRuleRepository) Upsert(userID, accountID uint, recipientUserID, username, status, source, reason, unsubscribeToken string, at time.Time) (*model.AutoDMRecipientRule, error) {
	rule := &model.AutoDMRecipientRule{
		UserID:            userID,
		XAccountID:        accountID,
		RecipientUserID:   strings.TrimSpace(recipientUserID),
		RecipientUsername: strings.TrimSpace(username),
		Status:            strings.TrimSpace(status),
		UnsubscribeToken:  strings.TrimSpace(unsubscribeToken),
		Source:            strings.TrimSpace(source),
		Reason:            strings.TrimSpace(reason),
		LastMatchedAt:     &at,
	}
	err := r.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}, {Name: "x_account_id"}, {Name: "recipient_user_id"}},
		DoUpdates: clause.Assignments(map[string]any{
			"recipient_username": rule.RecipientUsername,
			"status":             rule.Status,
			"unsubscribe_token":  gorm.Expr("CASE WHEN unsubscribe_token = '' OR unsubscribe_token IS NULL THEN ? ELSE unsubscribe_token END", rule.UnsubscribeToken),
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

func (r *AutoDMRecipientRuleRepository) MarkUnsubscribedByToken(token string, at time.Time) (*model.AutoDMRecipientRule, error) {
	row, err := r.GetByToken(token)
	if err != nil {
		return nil, err
	}
	if err := r.DB.Model(&model.AutoDMRecipientRule{}).Where("id = ?", row.ID).Updates(map[string]any{
		"status":          AutoDMRecipientUnsubscribed,
		"source":          "preference_center",
		"reason":          "Recipient unsubscribed from public preference center.",
		"last_matched_at": at,
	}).Error; err != nil {
		return nil, err
	}
	return r.GetByToken(token)
}

func IsAutoDMRecipientRuleStatus(status string) bool {
	switch strings.TrimSpace(status) {
	case AutoDMRecipientAllowlisted, AutoDMRecipientBlocked, AutoDMRecipientUnsubscribed:
		return true
	default:
		return false
	}
}
