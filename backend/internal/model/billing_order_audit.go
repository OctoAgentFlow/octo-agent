package model

// BillingOrderAudit records operator actions for reconciliation, review and refund workflows.
type BillingOrderAudit struct {
	Base
	OrderID                      uint   `gorm:"index;not null;comment:支付订单ID" json:"order_id"`
	UserID                       uint   `gorm:"index;not null;comment:订单所属用户ID" json:"user_id"`
	OperatorUserID               uint   `gorm:"index;not null;comment:操作人用户ID" json:"operator_user_id"`
	Action                       string `gorm:"size:64;index;not null;comment:操作动作" json:"action"`
	PreviousOrderStatus          string `gorm:"size:32;comment:操作前订单状态" json:"previous_order_status,omitempty"`
	NewOrderStatus               string `gorm:"size:32;comment:操作后订单状态" json:"new_order_status,omitempty"`
	PreviousReconciliationStatus string `gorm:"size:32;comment:操作前对账状态" json:"previous_reconciliation_status,omitempty"`
	NewReconciliationStatus      string `gorm:"size:32;comment:操作后对账状态" json:"new_reconciliation_status,omitempty"`
	PreviousReviewStatus         string `gorm:"size:32;comment:操作前复核状态" json:"previous_review_status,omitempty"`
	NewReviewStatus              string `gorm:"size:32;comment:操作后复核状态" json:"new_review_status,omitempty"`
	PreviousRefundStatus         string `gorm:"size:32;comment:操作前退款状态" json:"previous_refund_status,omitempty"`
	NewRefundStatus              string `gorm:"size:32;comment:操作后退款状态" json:"new_refund_status,omitempty"`
	PreviousRefundReason         string `gorm:"size:512;comment:操作前退款原因" json:"previous_refund_reason,omitempty"`
	NewRefundReason              string `gorm:"size:512;comment:操作后退款原因" json:"new_refund_reason,omitempty"`
	PreviousOpsNote              string `gorm:"size:512;comment:操作前运营备注" json:"previous_ops_note,omitempty"`
	NewOpsNote                   string `gorm:"size:512;comment:操作后运营备注" json:"new_ops_note,omitempty"`
}
