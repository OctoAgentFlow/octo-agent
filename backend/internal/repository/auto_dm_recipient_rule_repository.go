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

type AutoDMRecipientRuleListQuery struct {
	Search     string
	Status     string
	Segment    string
	XAccountID uint
	Limit      int
}

type AutoDMRecipientRuleStatusCount struct {
	Status string
	Count  int64
}

type AutoDMRecipientRuleSegmentStatusCount struct {
	Segment string
	Status  string
	Count   int64
}

func NewAutoDMRecipientRuleRepository(db *gorm.DB) *AutoDMRecipientRuleRepository {
	return &AutoDMRecipientRuleRepository{DB: db}
}

func (r *AutoDMRecipientRuleRepository) ListByUser(userID uint, query AutoDMRecipientRuleListQuery) ([]model.AutoDMRecipientRule, int64, error) {
	if query.Limit <= 0 || query.Limit > 200 {
		query.Limit = 100
	}
	q := r.DB.Model(&model.AutoDMRecipientRule{}).Where("user_id = ?", userID)
	if query.XAccountID > 0 {
		q = q.Where("x_account_id = ?", query.XAccountID)
	}
	if IsAutoDMRecipientRuleStatus(query.Status) {
		q = q.Where("status = ?", strings.TrimSpace(query.Status))
	}
	if segment := strings.TrimSpace(query.Segment); segment != "" {
		q = q.Where("recipient_segment = ?", segment)
	}
	search := strings.TrimSpace(query.Search)
	if search != "" {
		like := "%" + search + "%"
		q = q.Where("(recipient_user_id LIKE ? OR recipient_username LIKE ? OR recipient_segment LIKE ? OR reason LIKE ?)", like, like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []model.AutoDMRecipientRule
	err := q.
		Order("updated_at DESC, id DESC").
		Limit(query.Limit).
		Find(&rows).Error
	return rows, total, err
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

func (r *AutoDMRecipientRuleRepository) CountByStatus(userID, accountID uint) ([]AutoDMRecipientRuleStatusCount, error) {
	var rows []AutoDMRecipientRuleStatusCount
	q := r.DB.Model(&model.AutoDMRecipientRule{}).
		Select("status, COUNT(*) AS count").
		Where("user_id = ?", userID)
	if accountID > 0 {
		q = q.Where("x_account_id = ?", accountID)
	}
	err := q.Group("status").Scan(&rows).Error
	return rows, err
}

func (r *AutoDMRecipientRuleRepository) CountBySegmentAndStatusBetween(userID uint, from, to time.Time, accountID uint) ([]AutoDMRecipientRuleSegmentStatusCount, error) {
	segmentExpr := "COALESCE(NULLIF(TRIM(recipient_segment), ''), 'lead')"
	q := r.DB.Model(&model.AutoDMRecipientRule{}).
		Select(segmentExpr+" AS segment, status, COUNT(*) AS count").
		Where("user_id = ?", userID)
	if accountID > 0 {
		q = q.Where("x_account_id = ?", accountID)
	}
	if !from.IsZero() {
		q = q.Where("updated_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("updated_at < ?", to)
	}
	var rows []AutoDMRecipientRuleSegmentStatusCount
	err := q.Group(segmentExpr + ", status").Scan(&rows).Error
	return rows, err
}

func (r *AutoDMRecipientRuleRepository) Upsert(userID, accountID uint, recipientUserID, username, segment, status, source, reason, unsubscribeToken string, at time.Time) (*model.AutoDMRecipientRule, error) {
	rule := &model.AutoDMRecipientRule{
		UserID:            userID,
		XAccountID:        accountID,
		RecipientUserID:   strings.TrimSpace(recipientUserID),
		RecipientUsername: strings.TrimSpace(username),
		RecipientSegment:  strings.TrimSpace(segment),
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
			"recipient_segment":  rule.RecipientSegment,
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

func (r *AutoDMRecipientRuleRepository) UpdateStatusByID(userID, ruleID uint, status, segment, reason, source string, at time.Time) (*model.AutoDMRecipientRule, error) {
	status = strings.TrimSpace(status)
	if !IsAutoDMRecipientRuleStatus(status) {
		return nil, gorm.ErrInvalidData
	}
	var row model.AutoDMRecipientRule
	if err := r.DB.Where("id = ? AND user_id = ?", ruleID, userID).First(&row).Error; err != nil {
		return nil, err
	}
	if err := r.DB.Model(&model.AutoDMRecipientRule{}).Where("id = ? AND user_id = ?", ruleID, userID).Updates(map[string]any{
		"status":            status,
		"recipient_segment": gorm.Expr("CASE WHEN ? = '' THEN recipient_segment ELSE ? END", strings.TrimSpace(segment), strings.TrimSpace(segment)),
		"source":            strings.TrimSpace(source),
		"reason":            strings.TrimSpace(reason),
		"last_matched_at":   at,
		"updated_at":        at,
	}).Error; err != nil {
		return nil, err
	}
	if err := r.DB.Where("id = ? AND user_id = ?", ruleID, userID).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoDMRecipientRuleRepository) UpdateStatusByIDs(userID uint, ids []uint, status, reason, source string, at time.Time) ([]model.AutoDMRecipientRule, error) {
	status = strings.TrimSpace(status)
	if !IsAutoDMRecipientRuleStatus(status) {
		return nil, gorm.ErrInvalidData
	}
	if len(ids) == 0 {
		return []model.AutoDMRecipientRule{}, nil
	}
	err := r.DB.Model(&model.AutoDMRecipientRule{}).
		Where("user_id = ? AND id IN ?", userID, ids).
		Updates(map[string]any{
			"status":          status,
			"source":          strings.TrimSpace(source),
			"reason":          strings.TrimSpace(reason),
			"last_matched_at": at,
			"updated_at":      at,
		}).Error
	if err != nil {
		return nil, err
	}
	var rows []model.AutoDMRecipientRule
	err = r.DB.Where("user_id = ? AND id IN ?", userID, ids).
		Order("updated_at DESC, id DESC").
		Find(&rows).Error
	return rows, err
}

func IsAutoDMRecipientRuleStatus(status string) bool {
	switch strings.TrimSpace(status) {
	case AutoDMRecipientAllowlisted, AutoDMRecipientBlocked, AutoDMRecipientUnsubscribed:
		return true
	default:
		return false
	}
}
