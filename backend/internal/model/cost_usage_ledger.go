package model

import "time"

// CostUsageLedger records estimated or provider-reported cost-driving usage events.
type CostUsageLedger struct {
	Base
	UserID              uint      `gorm:"index;not null;comment:用户ID" json:"user_id"`
	BotID               uint      `gorm:"index;not null;default:0;comment:OAF Bot ID" json:"bot_id"`
	SourceType          string    `gorm:"size:64;index;not null;comment:来源类型" json:"source_type"`
	SourceID            uint      `gorm:"index;not null;default:0;comment:来源ID" json:"source_id"`
	Provider            string    `gorm:"size:64;index;not null;comment:服务商" json:"provider"`
	Metric              string    `gorm:"size:64;index;not null;comment:成本指标" json:"metric"`
	Quantity            int64     `gorm:"not null;default:0;comment:数量" json:"quantity"`
	InputTokens         int64     `gorm:"not null;default:0;comment:输入Token数" json:"input_tokens"`
	OutputTokens        int64     `gorm:"not null;default:0;comment:输出Token数" json:"output_tokens"`
	EstimatedCostCents  int64     `gorm:"not null;default:0;comment:预估成本（美分）" json:"estimated_cost_cents"`
	ActualCostCents     int64     `gorm:"not null;default:0;comment:实际成本（美分）" json:"actual_cost_cents"`
	Currency            string    `gorm:"size:16;not null;default:USD;comment:成本币种" json:"currency"`
	OccurredAt          time.Time `gorm:"index;not null;comment:发生时间" json:"occurred_at"`
	ExternalReferenceID string    `gorm:"size:191;index;comment:外部引用ID" json:"external_reference_id,omitempty"`
	Details             string    `gorm:"type:text;comment:详情JSON" json:"details,omitempty"`
}
