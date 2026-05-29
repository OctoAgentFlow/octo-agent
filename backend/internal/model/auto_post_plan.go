package model

import "time"

type AutoPostPlan struct {
	Base
	UserID               uint       `gorm:"index;not null;uniqueIndex:ux_auto_post_plan_account;comment:所属用户ID" json:"user_id"`
	XAccountID           uint       `gorm:"index;column:x_account_id;not null;uniqueIndex:ux_auto_post_plan_account;comment:自动发推使用的X账号ID" json:"x_account_id"`
	BotID                uint       `gorm:"index;not null;default:0;comment:当前绑定OAF Bot ID，0表示未绑定" json:"bot_id"`
	Enabled              bool       `gorm:"not null;default:false;comment:是否启用Planner" json:"enabled"`
	ExecutionMode        string     `gorm:"size:32;index;not null;default:review;comment:执行模式" json:"execution_mode"`
	DailyLimit           int        `gorm:"not null;default:0;comment:兼容旧字段：不再作为每日上限，实际按套餐月额度控制" json:"daily_limit"`
	MinIntervalMinutes   int        `gorm:"not null;default:120;comment:最小生成间隔分钟" json:"min_interval_minutes"`
	PostingWindows       string     `gorm:"size:512;comment:发布时间窗描述" json:"posting_windows"`
	Timezone             string     `gorm:"size:64;not null;default:UTC;comment:时区" json:"timezone"`
	ContentLengthMode    string     `gorm:"size:32;not null;default:standard;comment:内容长度模式（standard/long）" json:"content_length_mode"`
	TrendRegions         string     `gorm:"type:text;comment:关注趋势地区WOEID JSON" json:"trend_regions,omitempty"`
	TrendCategories      string     `gorm:"type:text;comment:关注趋势分类JSON" json:"trend_categories,omitempty"`
	ExcludedTrendNames   string     `gorm:"type:text;comment:排除趋势名称JSON" json:"excluded_trend_names,omitempty"`
	AllowGeneralTrends   bool       `gorm:"not null;default:false;comment:是否允许泛热点" json:"allow_general_trends"`
	SensitiveTrendPolicy string     `gorm:"size:32;default:avoid;comment:敏感趋势策略（avoid/review_only/allow）" json:"sensitive_trend_policy,omitempty"`
	LastRunAt            *time.Time `gorm:"comment:最近生成时间" json:"last_run_at,omitempty"`
	NextRunAt            *time.Time `gorm:"index;comment:下一次生成时间" json:"next_run_at,omitempty"`
	ProcessingAt         *time.Time `gorm:"index;comment:Scheduler处理中时间，用于并发保护" json:"processing_at,omitempty"`
}
