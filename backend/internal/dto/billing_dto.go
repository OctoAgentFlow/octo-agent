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
	OrderID         string `json:"order_id"`
	Amount          string `json:"amount"`
	Currency        string `json:"currency"`
	Network         string `json:"network"`
	TokenAddress    string `json:"token_address"`
	ReceiverAddress string `json:"receiver_address"`
	ChainID         int64  `json:"chain_id"`
	ExpiredAt       string `json:"expired_at"`
	Status          string `json:"status"`
	TxHash          string `json:"tx_hash,omitempty"`
	PaidAt          string `json:"paid_at,omitempty"`
	FailureReason   string `json:"failure_reason,omitempty"`
	LastCheckedAt   string `json:"last_checked_at,omitempty"`
	CanRetry        bool   `json:"can_retry"`
	NextAction      string `json:"next_action"`
}

type BillingOrderListItem struct {
	OrderID       string `json:"order_id"`
	PlanCode      string `json:"plan_code"`
	Amount        string `json:"amount"`
	Currency      string `json:"currency"`
	Method        string `json:"method"`
	Network       string `json:"network"`
	Status        string `json:"status"`
	TxHash        string `json:"tx_hash,omitempty"`
	CreatedAt     string `json:"created_at"`
	ExpiredAt     string `json:"expired_at"`
	PaidAt        string `json:"paid_at,omitempty"`
	FailureReason string `json:"failure_reason,omitempty"`
	LastCheckedAt string `json:"last_checked_at,omitempty"`
	CanRetry      bool   `json:"can_retry"`
	NextAction    string `json:"next_action"`
}

type BillingOrderListResponse struct {
	Items []BillingOrderListItem `json:"items"`
}

type BillingWebhookOnchainRequest struct {
	OrderID string `json:"order_id" binding:"required"`
	Network string `json:"network" binding:"required"`
	TxHash  string `json:"tx_hash" binding:"required"`
}

type BillingConfirmOrderRequest struct {
	TxHash string `json:"tx_hash" binding:"required"`
}
