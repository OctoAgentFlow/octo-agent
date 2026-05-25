package model

import "time"

// SubscriptionChangeEvent records every paid subscription state transition.
type SubscriptionChangeEvent struct {
	Base
	UserID           uint       `gorm:"index;not null;comment:用户ID" json:"user_id"`
	OrderID          uint       `gorm:"index;not null;default:0;comment:关联订单ID" json:"order_id"`
	ChangeType       string     `gorm:"size:32;index;not null;comment:变更类型" json:"change_type"`
	FromPlanCode     string     `gorm:"size:64;comment:原套餐" json:"from_plan_code,omitempty"`
	FromBillingCycle string     `gorm:"size:16;comment:原计费周期" json:"from_billing_cycle,omitempty"`
	FromExpiresAt    *time.Time `gorm:"comment:原到期时间" json:"from_expires_at,omitempty"`
	ToPlanCode       string     `gorm:"size:64;not null;comment:新套餐" json:"to_plan_code"`
	ToBillingCycle   string     `gorm:"size:16;not null;comment:新计费周期" json:"to_billing_cycle"`
	StartedAt        time.Time  `gorm:"index;not null;comment:周期开始时间" json:"started_at"`
	ExpiresAt        time.Time  `gorm:"index;not null;comment:周期到期时间" json:"expires_at"`
	Details          string     `gorm:"type:text;comment:变更详情JSON" json:"details,omitempty"`
}
