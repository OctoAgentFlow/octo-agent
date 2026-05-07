package dto

type BillingSubscriptionData struct {
	Plan           string `json:"plan"`
	Status         string `json:"status"`
	ExpirationDate string `json:"expiration_date"`
	TrialDaysLeft  int    `json:"trial_days_left"`
	BillingHint    string `json:"billing_hint"`
}

type BillingPlanData struct {
	Code        string   `json:"code"`
	Name        string   `json:"name"`
	Price       string   `json:"price"`
	Period      string   `json:"period"`
	Description string   `json:"description"`
	Features    []string `json:"features"`
	Highlight   bool     `json:"highlight"`
}

type BillingPlansResponse struct {
	Items []BillingPlanData `json:"items"`
}

// BillingPaymentMethodItem is one USDT route (multi-chain).
type BillingPaymentMethodItem struct {
	Method          string `json:"method"`
	Network         string `json:"network"`
	TokenAddress    string `json:"token_address"`
	ReceiverAddress string `json:"receiver_address"`
	Decimals        int    `json:"decimals"`
	ChainID         int64  `json:"chain_id"`
	IsDefault       bool   `json:"is_default"`
	Note            string `json:"note"`
}

type BillingPaymentMethodsResponse struct {
	Items []BillingPaymentMethodItem `json:"items"`
}

type BillingCreateOrderRequest struct {
	PlanCode string `json:"plan_code" binding:"required"`
	Method   string `json:"method" binding:"required"`
	Network  string `json:"network" binding:"required"`
}

type BillingCreateOrderResponse struct {
	OrderID         string `json:"order_id"`
	Amount          string `json:"amount"`
	Currency        string `json:"currency"`
	Network         string `json:"network"`
	TokenAddress    string `json:"token_address"`
	ReceiverAddress string `json:"receiver_address"`
	ExpiredAt       string `json:"expired_at"`
	Status          string `json:"status"`
}

// BillingOrderDetailResponse is returned by GET /billing/orders/:id (polling).
type BillingOrderDetailResponse struct {
	OrderID              string `json:"order_id"`
	Amount               string `json:"amount"`
	Currency             string `json:"currency"`
	Network              string `json:"network"`
	TokenAddress         string `json:"token_address"`
	ReceiverAddress      string `json:"receiver_address"`
	ChainID              int64  `json:"chain_id"`
	ExpiredAt            string `json:"expired_at"`
	Status               string `json:"status"`
	TxHash               string `json:"tx_hash,omitempty"`
	PaidAt               string `json:"paid_at,omitempty"`
	FailureReason        string `json:"failure_reason,omitempty"`
	LastCheckedAt        string `json:"last_checked_at,omitempty"`
	CanRetry             bool   `json:"can_retry"`
	NextAction           string `json:"next_action"`
	ReconciliationStatus string `json:"reconciliation_status"`
	ReviewStatus         string `json:"review_status"`
	RefundStatus         string `json:"refund_status"`
	RefundReason         string `json:"refund_reason,omitempty"`
	ReviewedAt           string `json:"reviewed_at,omitempty"`
	RefundMarkedAt       string `json:"refund_marked_at,omitempty"`
	OpsNote              string `json:"ops_note,omitempty"`
}

type BillingOrderListItem struct {
	OrderID              string `json:"order_id"`
	PlanCode             string `json:"plan_code"`
	Amount               string `json:"amount"`
	Currency             string `json:"currency"`
	Method               string `json:"method"`
	Network              string `json:"network"`
	Status               string `json:"status"`
	TxHash               string `json:"tx_hash,omitempty"`
	CreatedAt            string `json:"created_at"`
	ExpiredAt            string `json:"expired_at"`
	PaidAt               string `json:"paid_at,omitempty"`
	FailureReason        string `json:"failure_reason,omitempty"`
	LastCheckedAt        string `json:"last_checked_at,omitempty"`
	CanRetry             bool   `json:"can_retry"`
	NextAction           string `json:"next_action"`
	ReconciliationStatus string `json:"reconciliation_status"`
	ReviewStatus         string `json:"review_status"`
	RefundStatus         string `json:"refund_status"`
	RefundReason         string `json:"refund_reason,omitempty"`
	ReviewedAt           string `json:"reviewed_at,omitempty"`
	RefundMarkedAt       string `json:"refund_marked_at,omitempty"`
	OpsNote              string `json:"ops_note,omitempty"`
}

type BillingOrderListQuery struct {
	Status               string `form:"status"`
	ReconciliationStatus string `form:"reconciliation_status"`
	ReviewStatus         string `form:"review_status"`
	RefundStatus         string `form:"refund_status"`
	Limit                int    `form:"limit"`
}

type BillingOrderOpsSummary struct {
	Total           int64 `json:"total"`
	Pending         int64 `json:"pending"`
	Paid            int64 `json:"paid"`
	Failed          int64 `json:"failed"`
	Expired         int64 `json:"expired"`
	Unchecked       int64 `json:"unchecked"`
	Matched         int64 `json:"matched"`
	Mismatch        int64 `json:"mismatch"`
	NeedsReview     int64 `json:"needs_review"`
	ReviewNeeded    int64 `json:"review_needed"`
	Reviewed        int64 `json:"reviewed"`
	RefundNone      int64 `json:"refund_none"`
	RefundRequested int64 `json:"refund_requested"`
	Refunded        int64 `json:"refunded"`
	RefundRejected  int64 `json:"refund_rejected"`
}

type BillingOrderListResponse struct {
	Items      []BillingOrderListItem `json:"items"`
	Total      int64                  `json:"total"`
	OpsSummary BillingOrderOpsSummary `json:"ops_summary"`
}

type BillingWebhookOnchainRequest struct {
	OrderID string `json:"order_id" binding:"required"`
	Network string `json:"network" binding:"required"`
	TxHash  string `json:"tx_hash" binding:"required"`
}

type BillingConfirmOrderRequest struct {
	TxHash string `json:"tx_hash" binding:"required"`
}

type BillingOrderOpsActionRequest struct {
	Action       string `json:"action" binding:"required"`
	RefundReason string `json:"refund_reason"`
	OpsNote      string `json:"ops_note"`
}
