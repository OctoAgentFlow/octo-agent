package model

import "time"

type PointRedemptionCode struct {
	Base
	Code        string     `gorm:"size:64;uniqueIndex;not null;comment:兑换码" json:"code"`
	Title       string     `gorm:"size:128;not null;comment:活动标题" json:"title"`
	Points      int64      `gorm:"not null;comment:兑换积分" json:"points"`
	MaxUses     int64      `gorm:"not null;default:1;comment:总可兑换次数，0表示不限" json:"max_uses"`
	UsedCount   int64      `gorm:"not null;default:0;comment:已兑换次数" json:"used_count"`
	PerUserUses int64      `gorm:"not null;default:1;comment:单用户可兑换次数" json:"per_user_uses"`
	Enabled     bool       `gorm:"not null;default:true;comment:是否启用" json:"enabled"`
	StartsAt    *time.Time `gorm:"comment:开始时间" json:"starts_at,omitempty"`
	EndsAt      *time.Time `gorm:"comment:结束时间" json:"ends_at,omitempty"`
	Details     string     `gorm:"type:text;comment:详情JSON" json:"details,omitempty"`
}

type PointRedemptionClaim struct {
	Base
	UserID           uint      `gorm:"index;not null;comment:用户ID" json:"user_id"`
	RedemptionCodeID uint      `gorm:"index;not null;comment:兑换码ID" json:"redemption_code_id"`
	Code             string    `gorm:"size:64;index;not null;comment:兑换码" json:"code"`
	Points           int64     `gorm:"not null;comment:兑换积分" json:"points"`
	RedeemedAt       time.Time `gorm:"index;not null;comment:兑换时间" json:"redeemed_at"`
	UniqueKey        string    `gorm:"size:191;uniqueIndex;comment:幂等键" json:"unique_key,omitempty"`
}
