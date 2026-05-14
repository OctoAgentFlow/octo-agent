package model

import "time"

type PublishJob struct {
	Base
	UserID           uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	TwitterAccountID uint       `gorm:"index;column:twitter_account_id;not null;comment:发布使用的X账号ID" json:"twitter_account_id"`
	BotID            uint       `gorm:"index;not null;default:0;comment:关联OAF Bot ID，0表示未绑定" json:"bot_id"`
	SourceType       string     `gorm:"size:32;not null;uniqueIndex:ux_publish_job_source;index;comment:来源类型（post/comment/reply/dm）" json:"source_type"`
	SourceID         uint       `gorm:"not null;uniqueIndex:ux_publish_job_source;index;comment:来源记录ID" json:"source_id"`
	Content          string     `gorm:"type:text;comment:待发布内容" json:"content"`
	Status           string     `gorm:"size:32;index;not null;default:pending;comment:发布状态（pending/processing/published/failed/cancelled）" json:"status"`
	ExecutionMode    string     `gorm:"size:32;index;not null;default:autopilot;comment:执行模式" json:"execution_mode"`
	AttemptCount     int        `gorm:"not null;default:0;comment:尝试次数" json:"attempt_count"`
	MaxAttempts      int        `gorm:"not null;default:3;comment:最大尝试次数" json:"max_attempts"`
	NextAttemptAt    *time.Time `gorm:"index;comment:下次尝试时间" json:"next_attempt_at,omitempty"`
	LastError        string     `gorm:"size:1024;comment:最近失败原因" json:"last_error,omitempty"`
	PublishedAt      *time.Time `gorm:"comment:模拟或真实发布时间" json:"published_at,omitempty"`
}
