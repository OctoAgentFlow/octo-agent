package model

import "time"

type AutomationConfig struct {
	Base
	UserID                   uint       `gorm:"index;not null;uniqueIndex:uk_user_type;comment:所属用户ID" json:"user_id"`
	Type                     string     `gorm:"size:16;not null;uniqueIndex:uk_user_type;comment:自动化类型（post/reply/dm）" json:"type"`
	Enabled                  bool       `gorm:"not null;default:true;comment:是否启用" json:"enabled"`
	State                    string     `gorm:"size:32;not null;default:Running;comment:运行状态" json:"state"`
	FrequencyIntervalMinutes int        `gorm:"not null;default:60;comment:执行间隔（分钟）" json:"frequency_interval_minutes"`
	FrequencyDailyLimit      int        `gorm:"not null;default:20;comment:每日执行上限" json:"frequency_daily_limit"`
	Tone                     string     `gorm:"size:32;not null;default:Professional;comment:内容风格" json:"tone"`
	SafetyRequireApproval    bool       `gorm:"not null;default:true;comment:是否需要人工审核" json:"safety_require_approval"`
	SafetyMaxPerHour         int        `gorm:"not null;default:5;comment:每小时执行上限" json:"safety_max_per_hour"`
	SafetyBlockedKeywords    string     `gorm:"type:text;comment:屏蔽关键词JSON" json:"safety_blocked_keywords"`
	LastRunAt                *time.Time `gorm:"comment:最近执行时间" json:"last_run_at,omitempty"`
	NextRunAt                *time.Time `gorm:"comment:下次执行时间" json:"next_run_at,omitempty"`
}
