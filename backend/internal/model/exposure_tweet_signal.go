package model

import "time"

type ExposureTweetSignal struct {
	Base
	TweetID         string    `gorm:"size:64;uniqueIndex;not null;comment:X Tweet ID" json:"tweet_id"`
	Region          string    `gorm:"size:16;index;not null;default:en;comment:雷达区域" json:"region"`
	Language        string    `gorm:"size:16;index;comment:语言提示" json:"language"`
	Source          string    `gorm:"size:32;index;not null;default:x_recent_search;comment:采集来源" json:"source"`
	SourceQuery     string    `gorm:"size:255;index;comment:触发采集的查询" json:"source_query"`
	TopicName       string    `gorm:"size:255;index;comment:来源趋势或话题" json:"topic_name"`
	AuthorID        string    `gorm:"size:64;index;comment:X 作者 ID" json:"author_id"`
	AuthorHandle    string    `gorm:"size:128;index;comment:X 作者 handle" json:"author_handle"`
	AuthorName      string    `gorm:"size:255;comment:X 作者显示名" json:"author_name"`
	FollowersCount  int64     `gorm:"index;comment:作者粉丝数" json:"followers_count"`
	Content         string    `gorm:"type:text;comment:推文内容" json:"content"`
	PublishedAt     time.Time `gorm:"index;comment:推文发布时间" json:"published_at"`
	FirstSeenAt     time.Time `gorm:"index;comment:首次采集时间" json:"first_seen_at"`
	LastSeenAt      time.Time `gorm:"index;comment:最近采集时间" json:"last_seen_at"`
	PreviousCount   int64     `gorm:"comment:上次热度计数" json:"previous_count"`
	CurrentCount    int64     `gorm:"index;comment:当前热度计数" json:"current_count"`
	ViewsPerMinute  float64   `gorm:"index;comment:每分钟热度增长" json:"views_per_minute"`
	LikeCount       int64     `gorm:"comment:点赞数" json:"like_count"`
	ReplyCount      int64     `gorm:"comment:回复数" json:"reply_count"`
	RetweetCount    int64     `gorm:"comment:转发数" json:"retweet_count"`
	QuoteCount      int64     `gorm:"comment:引用数" json:"quote_count"`
	BookmarkCount   int64     `gorm:"comment:收藏数，如 API 返回" json:"bookmark_count"`
	ImpressionCount int64     `gorm:"comment:曝光数，如 API 返回" json:"impression_count"`
	RiskLevel       string    `gorm:"size:16;index;not null;default:low;comment:风险等级" json:"risk_level"`
	RawPayload      string    `gorm:"type:text;comment:X 原始 payload" json:"raw_payload,omitempty"`
}
