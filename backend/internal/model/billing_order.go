package model

import "time"

// BillingOrder is an on-chain USDT payment order (one network per order, no cross-chain matching).
type BillingOrder struct {
	Base
	UserID          uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	PlanCode        string     `gorm:"size:64;index;not null;comment:订阅方案编码" json:"plan_code"`
	Amount          string     `gorm:"size:32;not null;comment:支付金额" json:"amount"`
	Currency        string     `gorm:"size:16;not null;comment:币种" json:"currency"`
	Method          string     `gorm:"size:16;not null;comment:支付方式" json:"method"`
	Network         string     `gorm:"size:16;index;not null;comment:支付网络" json:"network"`
	TokenAddress    string     `gorm:"size:128;not null;comment:代币合约地址" json:"token_address"`
	ReceiverAddress string     `gorm:"size:128;not null;comment:收款地址" json:"receiver_address"`
	Status          string     `gorm:"size:16;index;not null;comment:订单状态" json:"status"`
	ExpiredAt       time.Time  `gorm:"index;not null;comment:订单过期时间" json:"expired_at"`
	PaidAt          *time.Time `gorm:"comment:支付确认时间" json:"paid_at,omitempty"`
	TxHash          string     `gorm:"size:128;index;comment:链上交易哈希" json:"tx_hash,omitempty"`
	ChainID         int64      `gorm:"not null;default:0;comment:链ID" json:"chain_id"`
	TokenDecimals   int        `gorm:"not null;default:18;comment:代币精度" json:"token_decimals"`
}
