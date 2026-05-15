package model

import "time"

type AutoPostPlan struct {
	Base
	UserID             uint       `gorm:"index;not null;uniqueIndex:ux_auto_post_plan_account;comment:所属用户ID" json:"user_id"`
	XAccountID         uint       `gorm:"index;column:x_account_id;not null;uniqueIndex:ux_auto_post_plan_account;comment:自动发推使用的X账号ID" json:"x_account_id"`
	BotID              uint       `gorm:"index;not null;default:0;comment:当前绑定OAF Bot ID，0表示未绑定" json:"bot_id"`
	Enabled            bool       `gorm:"not null;default:false;comment:是否启用Planner" json:"enabled"`
	ExecutionMode      string     `gorm:"size:32;index;not null;default:review;comment:执行模式" json:"execution_mode"`
	DailyLimit         int        `gorm:"not null;default:3;comment:每日生成上限" json:"daily_limit"`
	MinIntervalMinutes int        `gorm:"not null;default:120;comment:最小生成间隔分钟" json:"min_interval_minutes"`
	PostingWindows     string     `gorm:"size:512;comment:发布时间窗描述" json:"posting_windows"`
	Timezone           string     `gorm:"size:64;not null;default:UTC;comment:时区" json:"timezone"`
	LastRunAt          *time.Time `gorm:"comment:最近生成时间" json:"last_run_at,omitempty"`
	NextRunAt          *time.Time `gorm:"index;comment:下一次生成时间" json:"next_run_at,omitempty"`
}
