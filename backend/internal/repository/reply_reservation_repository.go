package repository

import (
	"errors"
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type ReplyReservationRepository struct {
	DB *gorm.DB
}

func NewReplyReservationRepository(db *gorm.DB) *ReplyReservationRepository {
	return &ReplyReservationRepository{DB: db}
}

// TryAcquire inserts a lock row; returns false if another worker already holds this (user, comment).
func (r *ReplyReservationRepository) TryAcquire(userID uint, commentTweetID string) (bool, error) {
	commentTweetID = trimID(commentTweetID)
	if commentTweetID == "" {
		return false, nil
	}
	row := &model.ReplyReservation{
		UserID:         userID,
		CommentTweetID: commentTweetID,
		CreatedAt:      time.Now().UTC(),
	}
	err := r.DB.Create(row).Error
	if err == nil {
		return true, nil
	}
	if isMySQLDuplicateKey(err) || errors.Is(err, gorm.ErrDuplicatedKey) {
		return false, nil
	}
	return false, err
}

// Release removes the lock after a failed X API attempt so the same comment can be retried later.
func (r *ReplyReservationRepository) Release(userID uint, commentTweetID string) error {
	commentTweetID = trimID(commentTweetID)
	if commentTweetID == "" {
		return nil
	}
	return r.DB.Where("user_id = ? AND comment_tweet_id = ?", userID, commentTweetID).
		Delete(&model.ReplyReservation{}).Error
}

// DeleteStale removes rows older than `olderThan` (e.g. stuck after a crash before activity insert).
func (r *ReplyReservationRepository) DeleteStale(olderThan time.Time) (int64, error) {
	res := r.DB.Where("created_at < ?", olderThan.UTC()).Delete(&model.ReplyReservation{})
	return res.RowsAffected, res.Error
}

// DeleteOrphansWithoutActivity removes reservations with no matching reply activity row (crash path).
func (r *ReplyReservationRepository) DeleteOrphansWithoutActivity(olderThan time.Time) (int64, error) {
	res := r.DB.Exec(`
DELETE r FROM reply_reservations r
WHERE r.created_at < ?
AND NOT EXISTS (
  SELECT 1 FROM activity_logs a
  WHERE a.user_id = r.user_id AND a.type = 'reply'
  AND a.reply_comment_tweet_id = r.comment_tweet_id
)`, olderThan.UTC())
	return res.RowsAffected, res.Error
}

func trimID(s string) string { return strings.TrimSpace(s) }

func isMySQLDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "Duplicate") && strings.Contains(s, "1062")
}
