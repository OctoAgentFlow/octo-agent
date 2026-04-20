package repository

import (
	"errors"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type ActivityRepository struct {
	DB *gorm.DB
}

func NewActivityRepository(db *gorm.DB) *ActivityRepository {
	return &ActivityRepository{DB: db}
}

// CountPostPublishSuccessBetween counts successful post activities with executed_at in [from, to] (inclusive bounds, UTC).
func (r *ActivityRepository) CountPostPublishSuccessBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND type = ? AND status = ?", userID, "post", "success").
		Where("executed_at >= ? AND executed_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

// CountReplySuccessBetween counts successful reply activities with executed_at in [from, to] (inclusive bounds, UTC).
func (r *ActivityRepository) CountReplySuccessBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND type = ? AND status = ?", userID, "reply", "success").
		Where("executed_at >= ? AND executed_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

// HasSuccessfulReplyToRefTweet returns true if we already logged a successful reply to this comment tweet id.
func (r *ActivityRepository) HasSuccessfulReplyToRefTweet(userID uint, refTweetID string) (bool, error) {
	if refTweetID == "" {
		return false, nil
	}
	var n int64
	err := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND type = ? AND status = ?", userID, "reply", "success").
		Where("(reply_comment_tweet_id = ? OR ref_tweet_id = ?)", refTweetID, refTweetID).
		Count(&n).Error
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// LatestReplyExecutedAt returns the latest executed_at among reply activities (success or failed), or nil.
func (r *ActivityRepository) LatestReplyExecutedAt(userID uint) (*time.Time, error) {
	var row model.ActivityLog
	err := r.DB.Where("user_id = ? AND type = ?", userID, "reply").
		Order("executed_at DESC").Limit(1).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t := row.ExecutedAt
	return &t, nil
}

func (r *ActivityRepository) List(userID uint, page int, pageSize int, typ string, status string) ([]model.ActivityLog, int64, error) {
	q := r.DB.Model(&model.ActivityLog{}).Where("user_id = ?", userID)
	if typ != "" {
		q = q.Where("type = ?", typ)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var items []model.ActivityLog
	offset := (page - 1) * pageSize
	err := q.Order("executed_at DESC").Limit(pageSize).Offset(offset).Find(&items).Error
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// CountExecutedBetween counts rows with executed_at in [from, to). Pass zero to from or to to leave that bound open.
func (r *ActivityRepository) CountExecutedBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	q := r.DB.Model(&model.ActivityLog{}).Where("user_id = ?", userID)
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	if err := q.Count(&n).Error; err != nil {
		return 0, err
	}
	return n, nil
}

// SuccessVsFailedSince counts success and failed statuses since `since` (inclusive).
func (r *ActivityRepository) SuccessVsFailedSince(userID uint, since time.Time) (success int64, failed int64, err error) {
	err = r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND executed_at >= ? AND status = ?", userID, since, "success").
		Count(&success).Error
	if err != nil {
		return 0, 0, err
	}
	err = r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND executed_at >= ? AND status = ?", userID, since, "failed").
		Count(&failed).Error
	if err != nil {
		return 0, 0, err
	}
	return success, failed, nil
}

// LatestExecutedAt returns the most recent executed_at for the user, or nil if none.
func (r *ActivityRepository) LatestExecutedAt(userID uint) (*time.Time, error) {
	var row model.ActivityLog
	err := r.DB.Where("user_id = ?", userID).Order("executed_at DESC").Limit(1).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t := row.ExecutedAt
	return &t, nil
}

// CountSuccessByTypeBetween counts successful activities of a type in [from, to] (inclusive bounds, UTC).
func (r *ActivityRepository) CountSuccessByTypeBetween(userID uint, typ string, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND type = ? AND status = ?", userID, typ, "success").
		Where("executed_at >= ? AND executed_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

// CountByStatusSince counts activity rows by status since `since` (inclusive).
func (r *ActivityRepository) CountByStatusSince(userID uint, status string, since time.Time) (int64, error) {
	var n int64
	q := r.DB.Model(&model.ActivityLog{}).Where("user_id = ? AND status = ?", userID, status)
	if !since.IsZero() {
		q = q.Where("executed_at >= ?", since)
	}
	if err := q.Count(&n).Error; err != nil {
		return 0, err
	}
	return n, nil
}

// LatestSuccessExecutedAt returns the latest successful execution time, or nil.
func (r *ActivityRepository) LatestSuccessExecutedAt(userID uint) (*time.Time, error) {
	var row model.ActivityLog
	err := r.DB.Where("user_id = ? AND status = ?", userID, "success").
		Order("executed_at DESC").Limit(1).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t := row.ExecutedAt
	return &t, nil
}
