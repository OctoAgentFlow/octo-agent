package model

// BillingChainTx records a consumed on-chain tx per chain so the same transfer cannot confirm two orders.
type BillingChainTx struct {
	Base
	ChainID int64  `gorm:"not null;uniqueIndex:ux_billing_chain_tx,priority:1;comment:链ID" json:"chain_id"`
	TxHash  string `gorm:"size:66;not null;uniqueIndex:ux_billing_chain_tx,priority:2;comment:交易哈希" json:"tx_hash"`
	OrderID uint   `gorm:"not null;index;comment:关联订单ID" json:"order_id"`
}
