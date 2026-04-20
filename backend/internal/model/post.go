package model

import "time"

type Post struct {
	Base
	UserID      uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	XAccountID  uint       `gorm:"index;not null;column:x_account_id;comment:X账号ID" json:"x_account_id"`
	Content     string     `gorm:"type:text;not null;comment:帖子内容" json:"content"`
	Status      string     `gorm:"size:32;index;default:draft;comment:帖子状态" json:"status"`
	ScheduledAt *time.Time `gorm:"index;comment:定时发布时间" json:"scheduled_at,omitempty"`
	PublishedAt *time.Time `gorm:"comment:实际发布时间" json:"published_at,omitempty"`
}
