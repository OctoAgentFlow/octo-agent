package model

type UserPointAccount struct {
	Base
	UserID         uint  `gorm:"uniqueIndex;not null;comment:所属用户ID" json:"user_id"`
	Balance        int64 `gorm:"not null;default:0;comment:可用积分余额" json:"balance"`
	Frozen         int64 `gorm:"not null;default:0;comment:冻结积分余额" json:"frozen"`
	LifetimeEarned int64 `gorm:"not null;default:0;comment:累计获得积分" json:"lifetime_earned"`
	LifetimeSpent  int64 `gorm:"not null;default:0;comment:累计消耗积分" json:"lifetime_spent"`
}
