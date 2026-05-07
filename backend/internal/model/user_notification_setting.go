package model

// UserNotificationSetting stores per-user notification preferences for product alerts.
type UserNotificationSetting struct {
	Base
	UserID             uint `gorm:"uniqueIndex;not null;comment:所属用户ID" json:"user_id"`
	EmailEnabled       bool `gorm:"not null;default:true;comment:邮件通知总开关" json:"email_enabled"`
	InAppEnabled       bool `gorm:"not null;default:true;comment:站内通知总开关" json:"in_app_enabled"`
	AutomationFailure  bool `gorm:"not null;default:true;comment:自动化失败通知" json:"automation_failure"`
	BillingAlerts      bool `gorm:"not null;default:true;comment:支付和订单异常通知" json:"billing_alerts"`
	ReviewRequired     bool `gorm:"not null;default:true;comment:待审核通知" json:"review_required"`
	SubscriptionAlerts bool `gorm:"not null;default:true;comment:订阅到期通知" json:"subscription_alerts"`
	WeeklySummary      bool `gorm:"not null;default:false;comment:每周摘要通知" json:"weekly_summary"`
}
