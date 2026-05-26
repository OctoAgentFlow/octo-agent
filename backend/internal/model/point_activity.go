package model

import "time"

type PointActivity struct {
	Base
	Code        string     `gorm:"size:64;uniqueIndex;not null;comment:活动编码" json:"code"`
	Title       string     `gorm:"size:128;not null;comment:活动标题" json:"title"`
	Description string     `gorm:"size:512;comment:活动描述" json:"description"`
	Points      int64      `gorm:"not null;default:0;comment:奖励积分" json:"points"`
	ClaimPeriod string     `gorm:"size:16;not null;default:once;comment:领取周期（once/daily/monthly）" json:"claim_period"`
	Enabled     bool       `gorm:"not null;default:true;comment:是否启用" json:"enabled"`
	StartsAt    *time.Time `gorm:"comment:活动开始时间" json:"starts_at,omitempty"`
	EndsAt      *time.Time `gorm:"comment:活动结束时间" json:"ends_at,omitempty"`
	SortOrder   int        `gorm:"not null;default:0;comment:排序权重" json:"sort_order"`
}
