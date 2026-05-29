package repository

import (
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type TrendFeedbackRepository struct{ DB *gorm.DB }

type TrendFeedbackListQuery struct {
	UserID       uint
	BotID        uint
	OnlyNegative bool
	Since        time.Time
	Limit        int
}

type TrendFeedbackQualitySignal struct {
	NormalizedName string
	Irrelevant     int64
	TooForced      int64
	TotalNegative  int64
}

func NewTrendFeedbackRepository(db *gorm.DB) *TrendFeedbackRepository {
	return &TrendFeedbackRepository{DB: db}
}

func (r *TrendFeedbackRepository) Create(row *model.TrendFeedback) error {
	return r.DB.Create(row).Error
}

func (r *TrendFeedbackRepository) ListRecent(query TrendFeedbackListQuery) ([]model.TrendFeedback, error) {
	limit := query.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	q := r.DB.Model(&model.TrendFeedback{}).
		Where("user_id = ?", query.UserID).
		Order("created_at DESC, id DESC").
		Limit(limit)
	if query.OnlyNegative {
		q = q.Where("rating IN ?", []string{"irrelevant", "too_forced"})
	}
	if query.BotID > 0 {
		q = q.Where("(bot_id = ? OR bot_id = 0)", query.BotID)
	}
	if !query.Since.IsZero() {
		q = q.Where("created_at >= ?", query.Since)
	}
	var rows []model.TrendFeedback
	err := q.Find(&rows).Error
	return rows, err
}

func (r *TrendFeedbackRepository) DeleteByUserAndID(userID, id uint) error {
	return r.DB.Where("user_id = ? AND id = ?", userID, id).Delete(&model.TrendFeedback{}).Error
}

func (r *TrendFeedbackRepository) ListQualitySignals(since time.Time, minTotal int64, limit int) (map[string]TrendFeedbackQualitySignal, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	if minTotal <= 0 {
		minTotal = 2
	}
	type row struct {
		NormalizedName string
		Irrelevant     int64
		TooForced      int64
		TotalNegative  int64
	}
	q := r.DB.Model(&model.TrendFeedback{}).
		Select(`
			normalized_name,
			SUM(CASE WHEN rating = 'irrelevant' THEN 1 ELSE 0 END) AS irrelevant,
			SUM(CASE WHEN rating = 'too_forced' THEN 1 ELSE 0 END) AS too_forced,
			COUNT(*) AS total_negative
		`).
		Where("rating IN ?", []string{"irrelevant", "too_forced"}).
		Group("normalized_name").
		Having("COUNT(*) >= ?", minTotal).
		Order("total_negative DESC").
		Limit(limit)
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since)
	}
	var rows []row
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]TrendFeedbackQualitySignal, len(rows))
	for _, item := range rows {
		key := strings.TrimSpace(item.NormalizedName)
		if key == "" {
			continue
		}
		out[key] = TrendFeedbackQualitySignal{
			NormalizedName: key,
			Irrelevant:     item.Irrelevant,
			TooForced:      item.TooForced,
			TotalNegative:  item.TotalNegative,
		}
	}
	return out, nil
}

func (r *TrendFeedbackRepository) ListRecentNegative(userID, botID uint, since time.Time, limit int) ([]model.TrendFeedback, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	q := r.DB.Model(&model.TrendFeedback{}).
		Where("user_id = ?", userID).
		Where("rating IN ?", []string{"irrelevant", "too_forced"}).
		Order("created_at DESC, id DESC").
		Limit(limit)
	if botID > 0 {
		q = q.Where("(bot_id = ? OR bot_id = 0)", botID)
	}
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since)
	}
	var rows []model.TrendFeedback
	err := q.Find(&rows).Error
	return rows, err
}

func (r *TrendFeedbackRepository) ListRecentPositive(userID, botID uint, since time.Time, limit int) ([]model.TrendFeedback, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	q := r.DB.Model(&model.TrendFeedback{}).
		Where("user_id = ?", userID).
		Where("rating = ?", "relevant").
		Order("created_at DESC, id DESC").
		Limit(limit)
	if botID > 0 {
		q = q.Where("(bot_id = ? OR bot_id = 0)", botID)
	}
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since)
	}
	var rows []model.TrendFeedback
	err := q.Find(&rows).Error
	return rows, err
}

func NormalizeFeedbackRating(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "relevant", "irrelevant", "too_forced":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func (r *TrendFeedbackRepository) UpsertOperationRule(rule *model.TrendOperationRule) error {
	return r.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "normalized_name"}, {Name: "rule_type"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"trend_name",
			"category",
			"reason",
			"source",
			"operator_id",
			"enabled",
			"updated_at",
		}),
	}).Create(rule).Error
}

func (r *TrendFeedbackRepository) ListActiveOperationRules() (map[string][]model.TrendOperationRule, error) {
	var rows []model.TrendOperationRule
	if err := r.DB.Where("enabled = ?", true).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := map[string][]model.TrendOperationRule{}
	for _, row := range rows {
		key := strings.TrimSpace(row.NormalizedName)
		if key == "" {
			continue
		}
		out[key] = append(out[key], row)
	}
	return out, nil
}

func (r *TrendFeedbackRepository) ListOperationRules(limit int) ([]model.TrendOperationRule, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	var rows []model.TrendOperationRule
	err := r.DB.Order("enabled DESC, updated_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *TrendFeedbackRepository) UpdateOperationRuleEnabled(id uint, enabled bool, operatorID uint) (*model.TrendOperationRule, error) {
	var row model.TrendOperationRule
	if err := r.DB.First(&row, id).Error; err != nil {
		return nil, err
	}
	row.Enabled = enabled
	row.OperatorID = operatorID
	if err := r.DB.Save(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}
