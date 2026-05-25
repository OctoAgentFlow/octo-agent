package dto

type BillingSubscriptionData struct {
	Plan           string         `json:"plan"`
	BillingCycle   string         `json:"billing_cycle"`
	Status         string         `json:"status"`
	ExpirationDate string         `json:"expiration_date"`
	TrialDaysLeft  int            `json:"trial_days_left"`
	BillingHint    string         `json:"billing_hint"`
	Limits         PlanLimitsData `json:"limits"`
	Usage          PlanUsageData  `json:"usage"`
}

type BillingPlanData struct {
	Code         string            `json:"code"`
	Name         string            `json:"name"`
	Price        string            `json:"price"`
	Period       string            `json:"period"`
	MonthlyPrice int               `json:"monthly_price"`
	YearlyPrice  int               `json:"yearly_price"`
	Currency     string            `json:"currency"`
	Audience     string            `json:"audience"`
	Badge        string            `json:"badge,omitempty"`
	Description  string            `json:"description"`
	Features     []string          `json:"features"`
	FeatureFlags []PlanFeatureData `json:"feature_flags"`
	Limits       PlanLimitsData    `json:"limits"`
	Highlight    bool              `json:"highlight"`
}

type BillingPlansResponse struct {
	Items []BillingPlanData `json:"items"`
}

type PlanLimitsData struct {
	MaxBots              int64 `json:"max_bots"`
	MaxTwitterAccounts   int64 `json:"max_twitter_accounts"`
	AIGenerationsMonthly int64 `json:"ai_generations_monthly"`
	MonthlyXWrites       int64 `json:"monthly_x_writes"`
	MonthlyXURLPosts     int64 `json:"monthly_x_url_posts"`
	MonthlyCostCapCents  int64 `json:"monthly_cost_cap_cents"`
	DailyAutoPosts       int64 `json:"daily_auto_posts"`
	DailyAutoReplies     int64 `json:"daily_auto_replies"`
	DailyAutoComments    int64 `json:"daily_auto_comments"`
	DailyAutoDMs         int64 `json:"daily_auto_dms"`
	AnalyticsDays        int64 `json:"analytics_days"`
	TeamSeats            int64 `json:"team_seats"`
	FullPersonaFields    bool  `json:"full_persona_fields"`
	AutoDMImport         bool  `json:"auto_dm_import"`
	AdvancedBotStrategy  bool  `json:"advanced_bot_strategy"`
	BulkReview           bool  `json:"bulk_review"`
	BotPerformance       bool  `json:"bot_performance"`
	DataExport           bool  `json:"data_export"`
	MultiBotMatrix       bool  `json:"multi_bot_matrix"`
	ABTesting            bool  `json:"ab_testing"`
	AdvancedFlowBuilder  bool  `json:"advanced_flow_builder"`
	AdvancedRiskRules    bool  `json:"advanced_risk_rules"`
	PrioritySupport      bool  `json:"priority_support"`
}

type PlanFeatureData struct {
	Key       string `json:"key"`
	Label     string `json:"label"`
	Available bool   `json:"available"`
	MinPlan   string `json:"min_plan,omitempty"`
}

type PlanUsageData struct {
	OAFBots            int64 `json:"oaf_bots"`
	TwitterAccounts    int64 `json:"twitter_accounts"`
	AIGenerationsMonth int64 `json:"ai_generations_month"`
	AutoPostsToday     int64 `json:"auto_posts_today"`
	AutoRepliesToday   int64 `json:"auto_replies_today"`
	AutoCommentsToday  int64 `json:"auto_comments_today"`
	AutoDMsToday       int64 `json:"auto_dms_today"`
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
	PlanCode       string `json:"plan_code" binding:"required"`
	BillingCycle   string `json:"billing_cycle"`
	Method         string `json:"method" binding:"required"`
	Network        string `json:"network" binding:"required"`
	IdempotencyKey string `json:"idempotency_key,omitempty"`
}

type BillingQuoteRequest struct {
	PlanCode     string `json:"plan_code" binding:"required"`
	BillingCycle string `json:"billing_cycle"`
}

type BillingUpgradeQuote struct {
	CurrentPlan         string `json:"current_plan"`
	CurrentBillingCycle string `json:"current_billing_cycle"`
	TargetPlan          string `json:"target_plan"`
	TargetBillingCycle  string `json:"target_billing_cycle"`
	OriginalAmount      string `json:"original_amount"`
	CreditAmount        string `json:"credit_amount"`
	PayableAmount       string `json:"payable_amount"`
	Currency            string `json:"currency"`
	OrderType           string `json:"order_type"`
	IsUpgrade           bool   `json:"is_upgrade"`
	CurrentExpiresAt    string `json:"current_expires_at,omitempty"`
	QuoteExpiresAt      string `json:"quote_expires_at,omitempty"`
}

type BillingCreateOrderResponse struct {
	OrderID         string               `json:"order_id"`
	Amount          string               `json:"amount"`
	Currency        string               `json:"currency"`
	Network         string               `json:"network"`
	TokenAddress    string               `json:"token_address"`
	ReceiverAddress string               `json:"receiver_address"`
	ExpiredAt       string               `json:"expired_at"`
	Status          string               `json:"status"`
	Quote           *BillingUpgradeQuote `json:"quote,omitempty"`
}

// BillingOrderDetailResponse is returned by GET /billing/orders/:id (polling).
type BillingOrderDetailResponse struct {
	OrderID              string                  `json:"order_id"`
	UserID               uint                    `json:"user_id"`
	Amount               string                  `json:"amount"`
	OriginalAmount       string                  `json:"original_amount,omitempty"`
	CreditAmount         string                  `json:"credit_amount,omitempty"`
	PayableAmount        string                  `json:"payable_amount,omitempty"`
	OrderType            string                  `json:"order_type,omitempty"`
	IdempotencyKey       string                  `json:"idempotency_key,omitempty"`
	Currency             string                  `json:"currency"`
	Network              string                  `json:"network"`
	TokenAddress         string                  `json:"token_address"`
	ReceiverAddress      string                  `json:"receiver_address"`
	ChainID              int64                   `json:"chain_id"`
	ExpiredAt            string                  `json:"expired_at"`
	Status               string                  `json:"status"`
	TxHash               string                  `json:"tx_hash,omitempty"`
	PaidAt               string                  `json:"paid_at,omitempty"`
	FailureReason        string                  `json:"failure_reason,omitempty"`
	LastCheckedAt        string                  `json:"last_checked_at,omitempty"`
	AutoScanStatus       string                  `json:"auto_scan_status,omitempty"`
	AutoScanSkipReason   string                  `json:"auto_scan_skip_reason,omitempty"`
	AutoScannedAt        string                  `json:"auto_scanned_at,omitempty"`
	CanRetry             bool                    `json:"can_retry"`
	NextAction           string                  `json:"next_action"`
	ReconciliationStatus string                  `json:"reconciliation_status"`
	ReviewStatus         string                  `json:"review_status"`
	ReviewedAt           string                  `json:"reviewed_at,omitempty"`
	OpsNote              string                  `json:"ops_note,omitempty"`
	AuditTrail           []BillingOrderAuditItem `json:"audit_trail,omitempty"`
}

type BillingOrderListItem struct {
	OrderID              string `json:"order_id"`
	UserID               uint   `json:"user_id"`
	PlanCode             string `json:"plan_code"`
	BillingCycle         string `json:"billing_cycle"`
	Amount               string `json:"amount"`
	OriginalAmount       string `json:"original_amount,omitempty"`
	CreditAmount         string `json:"credit_amount,omitempty"`
	PayableAmount        string `json:"payable_amount,omitempty"`
	OrderType            string `json:"order_type,omitempty"`
	IdempotencyKey       string `json:"idempotency_key,omitempty"`
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
	AutoScanStatus       string `json:"auto_scan_status,omitempty"`
	AutoScanSkipReason   string `json:"auto_scan_skip_reason,omitempty"`
	AutoScannedAt        string `json:"auto_scanned_at,omitempty"`
	CanRetry             bool   `json:"can_retry"`
	NextAction           string `json:"next_action"`
	ReconciliationStatus string `json:"reconciliation_status"`
	ReviewStatus         string `json:"review_status"`
	ReviewedAt           string `json:"reviewed_at,omitempty"`
	OpsNote              string `json:"ops_note,omitempty"`
	LastAuditAction      string `json:"last_audit_action,omitempty"`
	LastAuditAt          string `json:"last_audit_at,omitempty"`
	LastAuditOperatorID  uint   `json:"last_audit_operator_id,omitempty"`
}

type BillingOrderListQuery struct {
	Status               string `form:"status"`
	ReconciliationStatus string `form:"reconciliation_status"`
	ReviewStatus         string `form:"review_status"`
	AutoScanStatus       string `form:"auto_scan_status"`
	AutoScanSkipReason   string `form:"auto_scan_skip_reason"`
	Limit                int    `form:"limit"`
	Scope                string `form:"scope"`
}

type BillingOrderOpsSummary struct {
	Total        int64 `json:"total"`
	Pending      int64 `json:"pending"`
	Paid         int64 `json:"paid"`
	Failed       int64 `json:"failed"`
	Expired      int64 `json:"expired"`
	Unchecked    int64 `json:"unchecked"`
	Matched      int64 `json:"matched"`
	Mismatch     int64 `json:"mismatch"`
	NeedsReview  int64 `json:"needs_review"`
	ReviewNeeded int64 `json:"review_needed"`
	Reviewed     int64 `json:"reviewed"`
}

type BillingOrderListResponse struct {
	Items             []BillingOrderListItem `json:"items"`
	Total             int64                  `json:"total"`
	OpsSummary        BillingOrderOpsSummary `json:"ops_summary"`
	Scope             string                 `json:"scope"`
	CanOperateBilling bool                   `json:"can_operate_billing"`
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
	Action  string `json:"action" binding:"required"`
	OpsNote string `json:"ops_note"`
}

type BillingOrderAuditItem struct {
	ID                           string `json:"id"`
	OrderID                      string `json:"order_id"`
	UserID                       uint   `json:"user_id"`
	OperatorUserID               uint   `json:"operator_user_id"`
	Action                       string `json:"action"`
	PreviousOrderStatus          string `json:"previous_order_status,omitempty"`
	NewOrderStatus               string `json:"new_order_status,omitempty"`
	PreviousReconciliationStatus string `json:"previous_reconciliation_status,omitempty"`
	NewReconciliationStatus      string `json:"new_reconciliation_status,omitempty"`
	PreviousReviewStatus         string `json:"previous_review_status,omitempty"`
	NewReviewStatus              string `json:"new_review_status,omitempty"`
	PreviousOpsNote              string `json:"previous_ops_note,omitempty"`
	NewOpsNote                   string `json:"new_ops_note,omitempty"`
	CreatedAt                    string `json:"created_at"`
}

type BillingOrderAuditListResponse struct {
	Items []BillingOrderAuditItem `json:"items"`
}
