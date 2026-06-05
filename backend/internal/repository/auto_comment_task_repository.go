package repository

import (
	"errors"
	"fmt"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const autoCommentQueueOrder = "CASE WHEN status IN ('ready_to_publish','approved','pending_review','review','draft') THEN 0 WHEN status IN ('handled','rejected','failed','blocked','sent','published') THEN 2 ELSE 1 END ASC, opportunity_score DESC, detected_at DESC, id DESC"

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
	if limit > 500 {
		limit = 500
	}
	var rows []model.AutoCommentTask
	err := r.DB.Where("user_id = ? AND status <> ?", userID, "skipped").Order(autoCommentQueueOrder).Limit(limit * 3).Find(&rows).Error
	if err != nil {
		return nil, err
	}
	return dedupeAutoCommentTasks(rows, limit), nil
}

func (r *AutoCommentTaskRepository) ListQueueByUser(userID uint, limit int) ([]model.AutoCommentTask, error) {
	if limit <= 0 {
		limit = 500
	}
	var rows []model.AutoCommentTask
	err := r.DB.Where("user_id = ? AND status NOT IN ?", userID, []string{"handled", "skipped"}).Order(autoCommentQueueOrder).Limit(limit * 3).Find(&rows).Error
	if err != nil {
		return nil, err
	}
	return dedupeAutoCommentTasks(rows, limit), nil
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

func (r *AutoCommentTaskRepository) ExistsCompletedForTargetTweet(userID, xAccountID uint, tweetID string) (bool, error) {
	if tweetID == "" {
		return false, nil
	}
	var n int64
	err := r.DB.Model(&model.AutoCommentTask{}).
		Where("user_id = ? AND x_account_id = ? AND target_tweet_id = ?", userID, xAccountID, tweetID).
		Where("status IN ?", []string{"sent", "published", "handled"}).
		Count(&n).Error
	return n > 0, err
}

func (r *AutoCommentTaskRepository) GetByTargetTweet(userID, xAccountID uint, tweetID string) (*model.AutoCommentTask, error) {
	var row model.AutoCommentTask
	err := r.DB.Where("user_id = ? AND x_account_id = ? AND target_tweet_id = ?", userID, xAccountID, tweetID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoCommentTaskRepository) Create(task *model.AutoCommentTask) error {
	_, err := r.CreateIfNotExists(task)
	return err
}

func (r *AutoCommentTaskRepository) CreateIfNotExists(task *model.AutoCommentTask) (bool, error) {
	if task == nil {
		return false, fmt.Errorf("auto comment task is nil")
	}
	if task.UserID > 0 && task.XAccountID > 0 && task.TargetTweetID != "" {
		existing, err := r.GetByTargetTweet(task.UserID, task.XAccountID, task.TargetTweetID)
		if err == nil {
			*task = *existing
			return false, nil
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return false, err
		}
	}
	tx := r.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(task)
	if tx.Error != nil {
		return false, tx.Error
	}
	if tx.RowsAffected == 0 && task.UserID > 0 && task.XAccountID > 0 && task.TargetTweetID != "" {
		existing, err := r.GetByTargetTweet(task.UserID, task.XAccountID, task.TargetTweetID)
		if err != nil {
			return false, err
		}
		*task = *existing
		return false, nil
	}
	return true, nil
}

func (r *AutoCommentTaskRepository) Save(task *model.AutoCommentTask) error {
	return r.DB.Save(task).Error
}

func (r *AutoCommentTaskRepository) DeleteByUserAndID(userID, id uint) error {
	return r.DB.Where("user_id = ? AND id = ?", userID, id).Delete(&model.AutoCommentTask{}).Error
}

func (r *AutoCommentTaskRepository) CountSuccessBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.AutoCommentTask{}).
		Where("user_id = ? AND status = ?", userID, "sent").
		Where("sent_at >= ? AND sent_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

func (r *AutoCommentTaskRepository) CountCreatedBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.AutoCommentTask{}).
		Where("user_id = ?", userID).
		Where("status <> ?", "skipped").
		Where("generated_at IS NOT NULL").
		Where("created_at >= ? AND created_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

func (r *AutoCommentTaskRepository) CountStatusByUserBots(userID uint, botIDs []uint, status string) (map[uint]int, error) {
	out := map[uint]int{}
	if len(botIDs) == 0 {
		return out, nil
	}
	type row struct {
		BotID uint
		Count int
	}
	var rows []row
	err := r.DB.Model(&model.AutoCommentTask{}).
		Select("bot_id, COUNT(*) AS count").
		Where("user_id = ? AND bot_id IN ? AND status = ?", userID, botIDs, status).
		Group("bot_id").
		Scan(&rows).Error
	for _, item := range rows {
		out[item.BotID] = item.Count
	}
	return out, err
}

func dedupeAutoCommentTasks(rows []model.AutoCommentTask, limit int) []model.AutoCommentTask {
	if len(rows) == 0 {
		return rows
	}
	seen := make(map[string]struct{}, len(rows))
	out := make([]model.AutoCommentTask, 0, len(rows))
	for _, row := range rows {
		key := autoCommentTaskDedupeKey(row)
		if key != "" {
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
		}
		out = append(out, row)
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
}

func autoCommentTaskDedupeKey(row model.AutoCommentTask) string {
	if row.UserID == 0 || row.XAccountID == 0 || row.TargetTweetID == "" {
		return ""
	}
	return fmt.Sprintf("%d:%d:%s", row.UserID, row.XAccountID, row.TargetTweetID)
}
