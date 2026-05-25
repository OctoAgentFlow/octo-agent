package model

import "time"

type ReferralInvite struct {
	Base
	UserID   uint   `gorm:"uniqueIndex;not null;comment:邀请人用户ID" json:"user_id"`
	Code     string `gorm:"size:32;uniqueIndex;not null;comment:邀请码" json:"code"`
	Enabled  bool   `gorm:"not null;default:true;comment:是否启用" json:"enabled"`
	UseCount int64  `gorm:"not null;default:0;comment:使用次数" json:"use_count"`
	Details  string `gorm:"type:text;comment:详情JSON" json:"details,omitempty"`
}

type ReferralRecord struct {
	Base
	InviterUserID           uint       `gorm:"index;not null;comment:邀请人用户ID" json:"inviter_user_id"`
	InviteeUserID           uint       `gorm:"uniqueIndex;not null;comment:被邀请人用户ID" json:"invitee_user_id"`
	InviteCode              string     `gorm:"size:32;index;not null;comment:邀请码" json:"invite_code"`
	SignupRewardedAt        *time.Time `gorm:"comment:注册奖励发放时间" json:"signup_rewarded_at,omitempty"`
	FirstPurchaseRewardedAt *time.Time `gorm:"comment:首次购买奖励发放时间" json:"first_purchase_rewarded_at,omitempty"`
	Details                 string     `gorm:"type:text;comment:详情JSON" json:"details,omitempty"`
}
