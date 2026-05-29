package model

import "time"

type TrendTopic struct {
	Base
	TrendName      string    `gorm:"size:255;not null;comment:趋势原始名称" json:"trend_name"`
	NormalizedName string    `gorm:"size:255;not null;uniqueIndex:idx_trend_topic_fetch;comment:归一化趋势名称" json:"normalized_name"`
	WOEID          string    `gorm:"size:32;not null;uniqueIndex:idx_trend_topic_fetch;index;comment:X趋势地区WOEID" json:"woeid"`
	RegionName     string    `gorm:"size:128;index;comment:趋势地区名称" json:"region_name"`
	TweetCount     int64     `gorm:"index;comment:X返回的趋势推文量" json:"tweet_count"`
	Category       string    `gorm:"size:32;index;not null;default:other;comment:本地规则分类" json:"category"`
	RiskLevel      string    `gorm:"size:16;index;not null;default:low;comment:本地规则风险等级" json:"risk_level"`
	LanguageHint   string    `gorm:"size:16;index;comment:趋势语言提示" json:"language_hint"`
	Source         string    `gorm:"size:32;index;not null;default:x_trends;comment:趋势来源" json:"source"`
	FetchedBucket  string    `gorm:"size:32;not null;uniqueIndex:idx_trend_topic_fetch;comment:拉取时间桶" json:"fetched_bucket"`
	FetchedAt      time.Time `gorm:"index;not null;comment:拉取时间" json:"fetched_at"`
	ExpiresAt      time.Time `gorm:"index;not null;comment:缓存过期时间" json:"expires_at"`
	RawPayload     string    `gorm:"type:text;comment:X原始趋势payload" json:"raw_payload,omitempty"`
}
