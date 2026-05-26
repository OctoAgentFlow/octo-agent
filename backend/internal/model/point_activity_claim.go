package model

import "time"

type PointActivityClaim struct {
	Base
	UserID       uint      `gorm:"index;not null;uniqueIndex:ux_point_claim_user_activity_key;comment:所属用户ID" json:"user_id"`
	ActivityCode string    `gorm:"size:64;index;not null;uniqueIndex:ux_point_claim_user_activity_key;comment:活动编码" json:"activity_code"`
	ClaimKey     string    `gorm:"size:128;not null;uniqueIndex:ux_point_claim_user_activity_key;comment:领取周期或幂等键" json:"claim_key"`
	Points       int64     `gorm:"not null;comment:领取积分" json:"points"`
	Status       string    `gorm:"size:32;not null;default:claimed;comment:领取状态" json:"status"`
	ClaimedAt    time.Time `gorm:"index;not null;comment:领取时间" json:"claimed_at"`
}
