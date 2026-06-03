package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoReplyDraftRepository struct {
	DB *gorm.DB
}

func NewAutoReplyDraftRepository(db *gorm.DB) *AutoReplyDraftRepository {
	return &AutoReplyDraftRepository{DB: db}
}

func (r *AutoReplyDraftRepository) ListByUser(userID uint, limit int) ([]model.AutoReplyDraft, error) {
	if limit <= 0 {
		limit = 50
	}
	var rows []model.AutoReplyDraft
	err := r.DB.Where("user_id = ?", userID).Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *AutoReplyDraftRepository) GetByUserAndID(userID, id uint) (*model.AutoReplyDraft, error) {
	var row model.AutoReplyDraft
	err := r.DB.Where("user_id = ? AND id = ?", userID, id).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoReplyDraftRepository) GetByCommentTweet(userID, xAccountID uint, commentTweetID string) (*model.AutoReplyDraft, error) {
	var row model.AutoReplyDraft
	err := r.DB.Where("user_id = ? AND x_account_id = ? AND comment_tweet_id = ?", userID, xAccountID, commentTweetID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoReplyDraftRepository) Create(task *model.AutoReplyDraft) error {
	return r.DB.Create(task).Error
}

func (r *AutoReplyDraftRepository) Save(task *model.AutoReplyDraft) error {
	return r.DB.Save(task).Error
}

func (r *AutoReplyDraftRepository) DeleteByUserAndID(userID, id uint) error {
	return r.DB.Where("user_id = ? AND id = ?", userID, id).Delete(&model.AutoReplyDraft{}).Error
}

func (r *AutoReplyDraftRepository) CountCreatedBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.AutoReplyDraft{}).
		Where("user_id = ?", userID).
		Where("created_at >= ? AND created_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

func (r *AutoReplyDraftRepository) CountStatusByUserBots(userID uint, botIDs []uint, status string) (map[uint]int, error) {
	out := map[uint]int{}
	if len(botIDs) == 0 {
		return out, nil
	}
	type row struct {
		BotID uint
		Count int
	}
	var rows []row
	err := r.DB.Model(&model.AutoReplyDraft{}).
		Select("bot_id, COUNT(*) AS count").
		Where("user_id = ? AND bot_id IN ? AND status = ?", userID, botIDs, status).
		Group("bot_id").
		Scan(&rows).Error
	for _, item := range rows {
		out[item.BotID] = item.Count
	}
	return out, err
}
