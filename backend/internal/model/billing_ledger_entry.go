package model

// BillingLedgerEntry is an append-only billing event ledger for order, payment, and subscription changes.
type BillingLedgerEntry struct {
	Base
	UserID         uint   `gorm:"index;not null;comment:用户ID" json:"user_id"`
	OrderID        uint   `gorm:"index;not null;default:0;comment:关联订单ID" json:"order_id"`
	EventType      string `gorm:"size:64;index;not null;comment:事件类型" json:"event_type"`
	Amount         string `gorm:"size:32;comment:金额" json:"amount,omitempty"`
	Currency       string `gorm:"size:16;comment:币种" json:"currency,omitempty"`
	Status         string `gorm:"size:32;index;comment:事件状态" json:"status,omitempty"`
	TxHash         string `gorm:"size:128;index;comment:链上交易哈希" json:"tx_hash,omitempty"`
	IdempotencyKey string `gorm:"size:128;index;comment:幂等键" json:"idempotency_key,omitempty"`
	UniqueKey      string `gorm:"size:191;uniqueIndex;comment:账本事件唯一键" json:"unique_key,omitempty"`
	Details        string `gorm:"type:text;comment:事件详情JSON" json:"details,omitempty"`
}
