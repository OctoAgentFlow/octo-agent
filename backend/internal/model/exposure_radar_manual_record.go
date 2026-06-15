package model

import "time"

type ExposureRadarManualRecord struct {
	Base
	UserID           uint       `gorm:"index;not null;uniqueIndex:ux_exposure_radar_manual_signal;comment:所属用户ID" json:"user_id"`
	BotID            uint       `gorm:"index;not null;default:0;comment:关联OAF Bot ID" json:"bot_id"`
	XAccountID       uint       `gorm:"index;column:x_account_id;not null;default:0;comment:关联X账号ID" json:"x_account_id"`
	SignalID         string     `gorm:"size:160;not null;uniqueIndex:ux_exposure_radar_manual_signal;comment:Exposure Radar信号ID" json:"signal_id"`
	Region           string     `gorm:"size:16;index;not null;default:en;comment:雷达区域" json:"region"`
	DataSource       string     `gorm:"size:64;index;comment:数据来源" json:"data_source"`
	DataQuality      string     `gorm:"size:32;index;comment:数据质量" json:"data_quality"`
	TweetID          string     `gorm:"size:64;index;comment:X Tweet ID" json:"tweet_id"`
	URL              string     `gorm:"size:512;comment:原帖或搜索链接" json:"url"`
	Title            string     `gorm:"size:255;comment:信号标题" json:"title"`
	Content          string     `gorm:"type:text;comment:信号正文" json:"content"`
	AuthorID         string     `gorm:"size:64;index;comment:X作者ID" json:"author_id"`
	AuthorHandle     string     `gorm:"size:128;index;comment:X作者handle" json:"author_handle"`
	AuthorName       string     `gorm:"size:255;comment:X作者显示名" json:"author_name"`
	TopicName        string     `gorm:"size:255;index;comment:话题名称" json:"topic_name"`
	Score            int        `gorm:"index;not null;default:0;comment:机会评分" json:"score"`
	RiskLevel        string     `gorm:"size:32;index;comment:风险等级" json:"risk_level"`
	OpportunityType  string     `gorm:"size:64;index;comment:机会类型" json:"opportunity_type"`
	OpportunityTier  string     `gorm:"size:64;index;comment:机会层级" json:"opportunity_tier"`
	QualityStage     string     `gorm:"size:32;index;comment:质量阶段" json:"quality_stage"`
	ViewsPerMinute   float64    `gorm:"index;comment:每分钟浏览增长" json:"views_per_minute"`
	FollowersCount   int64      `gorm:"index;comment:作者粉丝数" json:"followers_count"`
	HeatCount        int64      `gorm:"index;comment:热度计数" json:"heat_count"`
	ReplyCount       int64      `gorm:"comment:回复数" json:"reply_count"`
	RetweetCount     int64      `gorm:"comment:转发数" json:"retweet_count"`
	LikeCount        int64      `gorm:"comment:点赞数" json:"like_count"`
	QuoteCount       int64      `gorm:"comment:引用数" json:"quote_count"`
	BookmarkCount    int64      `gorm:"comment:收藏数" json:"bookmark_count"`
	ImpressionCount  int64      `gorm:"comment:曝光数" json:"impression_count"`
	ReviewTaskID     uint       `gorm:"index;not null;default:0;comment:关联审核任务ID" json:"review_task_id"`
	SavedMemoryID    uint       `gorm:"index;not null;default:0;comment:关联Content Memory ID" json:"saved_memory_id"`
	GeneratedComment string     `gorm:"size:512;comment:生成回复草稿" json:"generated_comment"`
	TaskStatus       string     `gorm:"size:32;index;not null;default:todo;comment:今日处理状态" json:"task_status"`
	PublishedURL     string     `gorm:"size:512;comment:用户手动发布后的链接" json:"published_url"`
	Outcome          string     `gorm:"size:32;index;comment:用户反馈结果" json:"outcome"`
	FeedbackComment  string     `gorm:"size:512;comment:用户反馈备注" json:"feedback_comment"`
	SafetyStatus     string     `gorm:"size:32;index;comment:安全检查状态" json:"safety_status"`
	SafetySummary    string     `gorm:"size:512;comment:安全检查摘要" json:"safety_summary"`
	SafetyChecksJSON string     `gorm:"type:text;comment:安全检查明细JSON" json:"safety_checks_json"`
	ReplyAngleID     string     `gorm:"size:64;index;comment:选择的回复角度ID" json:"reply_angle_id"`
	ReplyAngleTitle  string     `gorm:"size:128;comment:选择的回复角度标题" json:"reply_angle_title"`
	CopiedAt         *time.Time `gorm:"index;comment:复制回复时间" json:"copied_at,omitempty"`
	OpenedAt         *time.Time `gorm:"index;comment:打开原帖时间" json:"opened_at,omitempty"`
	SavedAt          *time.Time `gorm:"index;comment:保存记忆时间" json:"saved_at,omitempty"`
	HandledAt        *time.Time `gorm:"index;comment:标记处理完成时间" json:"handled_at,omitempty"`
	FeedbackAt       *time.Time `gorm:"index;comment:反馈时间" json:"feedback_at,omitempty"`
}
