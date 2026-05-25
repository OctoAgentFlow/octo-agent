package model

import "time"

type PointGrant struct {
	Base
	UserID       uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	SourceType   string     `gorm:"size:32;index;not null;comment:来源类型（activity/admin/refund/backfill）" json:"source_type"`
	SourceID     string     `gorm:"size:128;index;comment:来源ID或幂等键" json:"source_id,omitempty"`
	ActivityCode string     `gorm:"size:64;index;comment:活动编码" json:"activity_code,omitempty"`
	TotalPoints  int64      `gorm:"not null;comment:初始积分" json:"total_points"`
	Remaining    int64      `gorm:"not null;default:0;comment:剩余可用积分" json:"remaining"`
	Frozen       int64      `gorm:"not null;default:0;comment:冻结积分" json:"frozen"`
	ExpiresAt    *time.Time `gorm:"index;comment:过期时间" json:"expires_at,omitempty"`
	ExpiredAt    *time.Time `gorm:"index;comment:实际过期结算时间" json:"expired_at,omitempty"`
	UniqueKey    string     `gorm:"size:191;uniqueIndex;comment:批次幂等键" json:"unique_key,omitempty"`
	Details      string     `gorm:"type:text;comment:详情JSON" json:"details,omitempty"`
}
