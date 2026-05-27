package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoPostDraftRepository struct {
	DB *gorm.DB
}

func NewAutoPostDraftRepository(db *gorm.DB) *AutoPostDraftRepository {
	return &AutoPostDraftRepository{DB: db}
}

func (r *AutoPostDraftRepository) ListByUser(userID uint, limit int) ([]model.AutoPostDraft, error) {
	if limit <= 0 {
		limit = 50
	}
	var rows []model.AutoPostDraft
	err := r.DB.Where("user_id = ?", userID).Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *AutoPostDraftRepository) ListByPlan(userID, planID uint, limit int) ([]model.AutoPostDraft, error) {
	if limit <= 0 {
		limit = 20
	}
	var rows []model.AutoPostDraft
	err := r.DB.Where("user_id = ? AND plan_id = ?", userID, planID).Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *AutoPostDraftRepository) GetByUserAndID(userID, id uint) (*model.AutoPostDraft, error) {
	var row model.AutoPostDraft
	err := r.DB.Where("user_id = ? AND id = ?", userID, id).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoPostDraftRepository) RecentByAccount(userID, xAccountID uint, limit int) ([]model.AutoPostDraft, error) {
	if limit <= 0 {
		limit = 10
	}
	var rows []model.AutoPostDraft
	err := r.DB.Where("user_id = ? AND x_account_id = ?", userID, xAccountID).Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *AutoPostDraftRepository) Create(draft *model.AutoPostDraft) error {
	return r.DB.Create(draft).Error
}

func (r *AutoPostDraftRepository) Save(draft *model.AutoPostDraft) error {
	return r.DB.Save(draft).Error
}

func (r *AutoPostDraftRepository) CountCreatedBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.AutoPostDraft{}).
		Where("user_id = ?", userID).
		Where("created_at >= ? AND created_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

func (r *AutoPostDraftRepository) CountCreatedBetweenForAccount(userID, xAccountID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.AutoPostDraft{}).
		Where("user_id = ? AND x_account_id = ?", userID, xAccountID).
		Where("created_at >= ? AND created_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

func (r *AutoPostDraftRepository) CountStatusByUserBots(userID uint, botIDs []uint, status string) (map[uint]int, error) {
	out := map[uint]int{}
	if len(botIDs) == 0 {
		return out, nil
	}
	type row struct {
		BotID uint
		Count int
	}
	var rows []row
	err := r.DB.Model(&model.AutoPostDraft{}).
		Select("bot_id, COUNT(*) AS count").
		Where("user_id = ? AND bot_id IN ? AND status = ?", userID, botIDs, status).
		Group("bot_id").
		Scan(&rows).Error
	for _, item := range rows {
		out[item.BotID] = item.Count
	}
	return out, err
}

func (r *AutoPostDraftRepository) ExistsContentHashForAccountSince(userID, xAccountID uint, contentHash string, since time.Time) (bool, error) {
	if contentHash == "" {
		return false, nil
	}
	var n int64
	err := r.DB.Model(&model.AutoPostDraft{}).
		Where("user_id = ? AND x_account_id = ? AND content_hash = ?", userID, xAccountID, contentHash).
		Where("created_at >= ?", since).
		Count(&n).Error
	if err != nil {
		return false, err
	}
	return n > 0, nil
}
