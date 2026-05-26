package model

import "time"

type GrossMarginAlertEvent struct {
	Base
	PeriodStart        time.Time  `gorm:"index;not null;comment:统计周期开始" json:"period_start"`
	PeriodEnd          time.Time  `gorm:"index;not null;comment:统计周期结束" json:"period_end"`
	Level              string     `gorm:"size:32;index;not null;comment:告警级别" json:"level"`
	Status             string     `gorm:"size:32;index;not null;default:open;comment:处理状态" json:"status"`
	Reasons            string     `gorm:"type:text;comment:触发原因JSON" json:"reasons,omitempty"`
	RevenueCents       int64      `gorm:"not null;default:0;comment:收入美分" json:"revenue_cents"`
	TotalCostCents     int64      `gorm:"not null;default:0;comment:总成本美分" json:"total_cost_cents"`
	GrossProfitCents   int64      `gorm:"not null;default:0;comment:毛利美分" json:"gross_profit_cents"`
	GrossMarginBps     int64      `gorm:"not null;default:0;comment:毛利率bps" json:"gross_margin_bps"`
	TargetMarginBps    int64      `gorm:"not null;default:0;comment:目标毛利率bps" json:"target_margin_bps"`
	OpenAICostCents    int64      `gorm:"not null;default:0;comment:OpenAI成本美分" json:"openai_cost_cents"`
	XCostCents         int64      `gorm:"not null;default:0;comment:X成本美分" json:"x_cost_cents"`
	PointDiscountCents int64      `gorm:"not null;default:0;comment:积分抵扣成本美分" json:"point_discount_cents"`
	LarkStatus         string     `gorm:"size:32;index;not null;default:pending;comment:Lark发送状态" json:"lark_status"`
	LarkError          string     `gorm:"size:1024;comment:Lark发送错误" json:"lark_error,omitempty"`
	ConfigSnapshot     string     `gorm:"type:text;comment:告警配置快照JSON" json:"config_snapshot,omitempty"`
	AcknowledgedBy     uint       `gorm:"index;comment:确认处理人ID" json:"acknowledged_by,omitempty"`
	AcknowledgedAt     *time.Time `gorm:"comment:确认处理时间" json:"acknowledged_at,omitempty"`
	AcknowledgeNote    string     `gorm:"size:1024;comment:处理备注" json:"acknowledge_note,omitempty"`
}
