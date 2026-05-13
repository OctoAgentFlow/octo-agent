package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoCommentTaskRepository struct {
	DB *gorm.DB
}

func NewAutoCommentTaskRepository(db *gorm.DB) *AutoCommentTaskRepository {
	return &AutoCommentTaskRepository{DB: db}
}

func (r *AutoCommentTaskRepository) ListByUser(userID uint, limit int) ([]model.AutoCommentTask, error) {
	if limit <= 0 {
		limit = 50
	}
	var rows []model.AutoCommentTask
	err := r.DB.Where("user_id = ?", userID).Order("detected_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *AutoCommentTaskRepository) GetByUserAndID(userID, id uint) (*model.AutoCommentTask, error) {
	var row model.AutoCommentTask
	err := r.DB.Where("user_id = ? AND id = ?", userID, id).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoCommentTaskRepository) ExistsForTargetTweet(userID, xAccountID uint, tweetID string) (bool, error) {
	var n int64
	err := r.DB.Model(&model.AutoCommentTask{}).
		Where("user_id = ? AND x_account_id = ? AND target_tweet_id = ?", userID, xAccountID, tweetID).
		Count(&n).Error
	return n > 0, err
}

func (r *AutoCommentTaskRepository) Create(task *model.AutoCommentTask) error {
	return r.DB.Create(task).Error
}

func (r *AutoCommentTaskRepository) Save(task *model.AutoCommentTask) error {
	return r.DB.Save(task).Error
}

func (r *AutoCommentTaskRepository) CountSuccessBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.AutoCommentTask{}).
		Where("user_id = ? AND status = ?", userID, "sent").
		Where("sent_at >= ? AND sent_at <= ?", from, to).
		Count(&n).Error
	return n, err
}
