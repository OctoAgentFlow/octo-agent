package model

import "time"

// ReplyReservation prevents concurrent duplicate auto-replies to the same comment (user_id + comment_tweet_id PK).
// Rows are kept after success as a durable dedup marker; removed on failure to allow retry.
type ReplyReservation struct {
	UserID         uint      `gorm:"primaryKey;comment:所属用户ID"`
	CommentTweetID string    `gorm:"primaryKey;size:32;comment:评论Tweet ID"`
	CreatedAt      time.Time `gorm:"not null;comment:占位创建时间"`
}
