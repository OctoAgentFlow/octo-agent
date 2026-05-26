package model

type PointRiskConfig struct {
	Base
	Code                          string `gorm:"size:64;uniqueIndex;not null;default:default;comment:配置编码" json:"code"`
	DailyEarnLimit                int64  `gorm:"not null;default:100;comment:用户每日最多可获得积分" json:"daily_earn_limit"`
	MonthlyDiscountLimit          int64  `gorm:"not null;default:1000;comment:用户每月最多可抵扣积分" json:"monthly_discount_limit"`
	LargeAdjustmentAlertThreshold int64  `gorm:"not null;default:200;comment:人工调分告警阈值" json:"large_adjustment_alert_threshold"`
	PointExpiryDays               int    `gorm:"not null;default:365;comment:积分有效期天数，0表示不过期" json:"point_expiry_days"`
	Enabled                       bool   `gorm:"not null;default:true;comment:是否启用积分风控" json:"enabled"`
}
