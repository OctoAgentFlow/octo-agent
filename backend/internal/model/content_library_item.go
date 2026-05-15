package model

import "time"

type ContentLibraryItem struct {
	Base
	UserID           uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	TwitterAccountID *uint      `gorm:"index;column:twitter_account_id;comment:关联X账号ID，空表示全局素材" json:"twitter_account_id,omitempty"`
	BotID            *uint      `gorm:"index;comment:关联OAF Bot ID，空表示全局素材" json:"bot_id,omitempty"`
	Title            string     `gorm:"size:160;not null;comment:素材标题" json:"title"`
	ItemType         string     `gorm:"size:32;index;not null;default:idea;comment:素材类型" json:"item_type"`
	Body             string     `gorm:"type:text;comment:素材正文" json:"body"`
	SourceURL        string     `gorm:"size:512;comment:来源URL" json:"source_url,omitempty"`
	Topics           string     `gorm:"size:1024;comment:话题标签JSON" json:"topics,omitempty"`
	GrowthGoal       string     `gorm:"size:512;comment:增长目标" json:"growth_goal,omitempty"`
	CTAPreference    string     `gorm:"size:256;comment:CTA偏好" json:"cta_preference,omitempty"`
	Priority         int        `gorm:"index;not null;default:50;comment:素材优先级" json:"priority"`
	Status           string     `gorm:"size:32;index;not null;default:active;comment:状态active/paused/archived" json:"status"`
	UsageCount       int        `gorm:"not null;default:0;comment:使用次数" json:"usage_count"`
	LastUsedAt       *time.Time `gorm:"index;comment:最近使用时间" json:"last_used_at,omitempty"`
}
