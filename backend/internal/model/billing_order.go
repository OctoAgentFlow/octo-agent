package model

import "time"

// BillingOrder is an on-chain USDT payment order (one network per order, no cross-chain matching).
type BillingOrder struct {
	Base
	UserID               uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	PlanCode             string     `gorm:"size:64;index;not null;comment:订阅方案编码" json:"plan_code"`
	BillingCycle         string     `gorm:"size:16;not null;default:monthly;comment:计费周期（monthly/yearly）" json:"billing_cycle"`
	Amount               string     `gorm:"size:32;not null;comment:支付金额" json:"amount"`
	OriginalAmount       string     `gorm:"size:32;comment:目标套餐原价" json:"original_amount,omitempty"`
	CreditAmount         string     `gorm:"size:32;comment:当前套餐剩余抵扣金额" json:"credit_amount,omitempty"`
	PayableAmount        string     `gorm:"size:32;comment:本次实际应付金额" json:"payable_amount,omitempty"`
	OrderType            string     `gorm:"size:32;index;not null;default:new;comment:订单类型（new/renew/upgrade）" json:"order_type,omitempty"`
	FromPlanCode         string     `gorm:"size:64;comment:升级前订阅方案编码" json:"from_plan_code,omitempty"`
	FromBillingCycle     string     `gorm:"size:16;comment:升级前计费周期" json:"from_billing_cycle,omitempty"`
	ProrationSnapshot    string     `gorm:"type:text;comment:升级抵扣计算快照JSON" json:"proration_snapshot,omitempty"`
	Currency             string     `gorm:"size:16;not null;comment:币种" json:"currency"`
	Method               string     `gorm:"size:16;not null;comment:支付方式" json:"method"`
	Network              string     `gorm:"size:16;index;not null;comment:支付网络" json:"network"`
	TokenAddress         string     `gorm:"size:128;not null;comment:代币合约地址" json:"token_address"`
	ReceiverAddress      string     `gorm:"size:128;not null;comment:收款地址" json:"receiver_address"`
	Status               string     `gorm:"size:16;index;not null;comment:订单状态" json:"status"`
	ExpiredAt            time.Time  `gorm:"index;not null;comment:订单过期时间" json:"expired_at"`
	PaidAt               *time.Time `gorm:"comment:支付确认时间" json:"paid_at,omitempty"`
	TxHash               string     `gorm:"size:128;index;comment:链上交易哈希" json:"tx_hash,omitempty"`
	FailureReason        string     `gorm:"size:512;comment:最近一次确认失败原因" json:"failure_reason,omitempty"`
	LastCheckedAt        *time.Time `gorm:"comment:最近一次链上确认检查时间" json:"last_checked_at,omitempty"`
	AutoScanStatus       string     `gorm:"size:32;index;comment:自动扫链状态" json:"auto_scan_status,omitempty"`
	AutoScanSkipReason   string     `gorm:"size:512;comment:自动扫链跳过原因" json:"auto_scan_skip_reason,omitempty"`
	AutoScannedAt        *time.Time `gorm:"comment:最近一次自动扫链时间" json:"auto_scanned_at,omitempty"`
	ChainID              int64      `gorm:"not null;default:0;comment:链ID" json:"chain_id"`
	TokenDecimals        int        `gorm:"not null;default:18;comment:代币精度" json:"token_decimals"`
	ReconciliationStatus string     `gorm:"size:32;index;not null;default:unchecked;comment:对账状态" json:"reconciliation_status,omitempty"`
	ReviewStatus         string     `gorm:"size:32;index;not null;default:unreviewed;comment:人工复核状态" json:"review_status,omitempty"`
	ReviewedAt           *time.Time `gorm:"comment:人工复核时间" json:"reviewed_at,omitempty"`
	OpsNote              string     `gorm:"size:512;comment:运营备注" json:"ops_note,omitempty"`
}
