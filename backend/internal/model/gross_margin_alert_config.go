package model

type GrossMarginAlertConfig struct {
	Base
	Code                        string `gorm:"size:64;uniqueIndex;not null;default:default;comment:配置编码" json:"code"`
	Enabled                     bool   `gorm:"not null;default:true;comment:是否启用毛利告警" json:"enabled"`
	TargetMarginBps             int64  `gorm:"not null;default:5000;comment:目标毛利率bps" json:"target_margin_bps"`
	OpenAICostShareThresholdBps int64  `gorm:"not null;default:2000;comment:OpenAI成本占收入告警阈值bps" json:"openai_cost_share_threshold_bps"`
	XCostShareThresholdBps      int64  `gorm:"not null;default:2000;comment:X成本占收入告警阈值bps" json:"x_cost_share_threshold_bps"`
	PointCostShareThresholdBps  int64  `gorm:"not null;default:2000;comment:积分抵扣成本占收入告警阈值bps" json:"point_cost_share_threshold_bps"`
	CheckIntervalHours          int    `gorm:"not null;default:24;comment:检查间隔小时" json:"check_interval_hours"`
}
