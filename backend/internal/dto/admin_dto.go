package dto

type AdminOverviewResponse struct {
	Operator     AdminOperatorData       `json:"operator"`
	Users        AdminUserSummary        `json:"users"`
	Billing      BillingOrderOpsSummary  `json:"billing"`
	Activity     AdminActivitySummary    `json:"activity"`
	Content      AdminContentSummary     `json:"content"`
	Execution    AdminExecutionSummary   `json:"execution"`
	Config       AdminConfigSummary      `json:"config"`
	RecentUsers  []AdminUserListItem     `json:"recent_users"`
	RecentOrders []BillingOrderListItem  `json:"recent_orders"`
	RecentEvents []AdminActivityListItem `json:"recent_events"`
}

type AdminOperatorData struct {
	ID    uint   `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

type AdminUserSummary struct {
	Total                int64 `json:"total"`
	Active               int64 `json:"active"`
	Suspended            int64 `json:"suspended"`
	Owners               int64 `json:"owners"`
	Admins               int64 `json:"admins"`
	ActiveSubscriptions  int64 `json:"active_subscriptions"`
	ExpiredSubscriptions int64 `json:"expired_subscriptions"`
}

type AdminActivitySummary struct {
	Last24h int64 `json:"last_24h"`
	Success int64 `json:"success"`
	Failed  int64 `json:"failed"`
	Review  int64 `json:"review"`
}

type AdminContentSummary struct {
	ConnectedAccounts  int64 `json:"connected_accounts"`
	Posts              int64 `json:"posts"`
	ScheduledPosts     int64 `json:"scheduled_posts"`
	PublishedPosts     int64 `json:"published_posts"`
	FailedPosts        int64 `json:"failed_posts"`
	EnabledAutomations int64 `json:"enabled_automations"`
	PausedAutomations  int64 `json:"paused_automations"`
}

type AdminExecutionSummary struct {
	PublishPending       int64  `json:"publish_pending"`
	PublishProcessing    int64  `json:"publish_processing"`
	PublishFailed        int64  `json:"publish_failed"`
	PublishedThisMonth   int64  `json:"published_this_month"`
	AutoPostEnabledPlans int64  `json:"auto_post_enabled_plans"`
	AutoPostDueNow       int64  `json:"auto_post_due_now"`
	AutoPostSkipped24h   int64  `json:"auto_post_skipped_24h"`
	AutoPostFailed24h    int64  `json:"auto_post_failed_24h"`
	NeedsReauthAccounts  int64  `json:"needs_reauth_accounts"`
	MonthlyAIGenerations int64  `json:"monthly_ai_generations"`
	MonthlyXPublishes    int64  `json:"monthly_x_publishes"`
	MonthlyCostCents     int64  `json:"monthly_cost_cents"`
	MonthlyCostAmount    string `json:"monthly_cost_amount"`
}

type AdminConfigSummary struct {
	EmailProvider      string `json:"email_provider"`
	ResendConfigured   bool   `json:"resend_configured"`
	XOAuthConfigured   bool   `json:"x_oauth_configured"`
	BillingMethodCount int    `json:"billing_method_count"`
	FrontendBaseURL    string `json:"frontend_base_url"`
}

type AdminTrendFeedbackQuery struct {
	Days  int `form:"days"`
	Limit int `form:"limit"`
}

type AdminTrendFeedbackTopicItem struct {
	TrendName       string   `json:"trend_name"`
	NormalizedName  string   `json:"normalized_name"`
	Category        string   `json:"category"`
	Irrelevant      int64    `json:"irrelevant"`
	TooForced       int64    `json:"too_forced"`
	TotalNegative   int64    `json:"total_negative"`
	SuggestedAction string   `json:"suggested_action"`
	SuggestedReason string   `json:"suggested_reason"`
	ActiveRules     []string `json:"active_rules,omitempty"`
	LastFeedbackAt  string   `json:"last_feedback_at"`
}

type AdminTrendFeedbackSummaryResponse struct {
	Days          int                           `json:"days"`
	TotalNegative int64                         `json:"total_negative"`
	Irrelevant    int64                         `json:"irrelevant"`
	TooForced     int64                         `json:"too_forced"`
	UniqueTrends  int64                         `json:"unique_trends"`
	TopNegative   []AdminTrendFeedbackTopicItem `json:"top_negative"`
	TopIrrelevant []AdminTrendFeedbackTopicItem `json:"top_irrelevant"`
	TopTooForced  []AdminTrendFeedbackTopicItem `json:"top_too_forced"`
}

type AdminApplyTrendRuleRequest struct {
	TrendName      string `json:"trend_name" binding:"required"`
	NormalizedName string `json:"normalized_name" binding:"required"`
	Category       string `json:"category"`
	Action         string `json:"action" binding:"required"`
	Reason         string `json:"reason"`
}

type AdminTrendOperationRuleItem struct {
	ID             uint   `json:"id"`
	TrendName      string `json:"trend_name"`
	NormalizedName string `json:"normalized_name"`
	Category       string `json:"category"`
	RuleType       string `json:"rule_type"`
	Reason         string `json:"reason"`
	Source         string `json:"source"`
	Enabled        bool   `json:"enabled"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

type AdminTrendOperationRuleListResponse struct {
	Items []AdminTrendOperationRuleItem `json:"items"`
}

type AdminUpdateTrendOperationRuleRequest struct {
	Enabled *bool `json:"enabled"`
}

type AdminUserListQuery struct {
	Page     int    `form:"page"`
	PageSize int    `form:"page_size"`
	Query    string `form:"query"`
	Role     string `form:"role"`
	Status   string `form:"status"`
}

type AdminUserListResponse struct {
	Items      []AdminUserListItem `json:"items"`
	Pagination ActivityPagination  `json:"pagination"`
}

type AdminUserListItem struct {
	ID                    uint   `json:"id"`
	Email                 string `json:"email"`
	Name                  string `json:"name"`
	Status                string `json:"status"`
	Role                  string `json:"role"`
	SubscriptionPlanCode  string `json:"subscription_plan_code"`
	SubscriptionStatus    string `json:"subscription_status"`
	SubscriptionExpiresAt string `json:"subscription_expires_at,omitempty"`
	CreatedAt             string `json:"created_at"`
	UpdatedAt             string `json:"updated_at"`
}

type AdminUpdateUserRequest struct {
	Role   *string `json:"role"`
	Status *string `json:"status"`
}

type AdminActivityListItem struct {
	ID            uint   `json:"id"`
	UserID        uint   `json:"user_id"`
	XAccountID    uint   `json:"x_account_id,omitempty"`
	Type          string `json:"type"`
	Status        string `json:"status"`
	PreviewKey    string `json:"preview_key"`
	AccountHandle string `json:"account_handle"`
	ExecutedAt    string `json:"executed_at"`
	ErrorMessage  string `json:"error_message,omitempty"`
}

type AdminPointActivityItem struct {
	ID          uint   `json:"id"`
	Code        string `json:"code"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Points      int64  `json:"points"`
	ClaimPeriod string `json:"claim_period"`
	Enabled     bool   `json:"enabled"`
	StartsAt    string `json:"starts_at,omitempty"`
	EndsAt      string `json:"ends_at,omitempty"`
	SortOrder   int    `json:"sort_order"`
	UpdatedAt   string `json:"updated_at"`
}

type AdminUpdatePointActivityRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Points      *int64  `json:"points"`
	ClaimPeriod *string `json:"claim_period"`
	Enabled     *bool   `json:"enabled"`
	StartsAt    *string `json:"starts_at"`
	EndsAt      *string `json:"ends_at"`
	SortOrder   *int    `json:"sort_order"`
}

type AdminPointUserItem struct {
	UserID         uint   `json:"user_id"`
	Email          string `json:"email"`
	Name           string `json:"name"`
	Balance        int64  `json:"balance"`
	Frozen         int64  `json:"frozen"`
	LifetimeEarned int64  `json:"lifetime_earned"`
	LifetimeSpent  int64  `json:"lifetime_spent"`
	UpdatedAt      string `json:"updated_at"`
}

type AdminPointUsersResponse struct {
	Items      []AdminPointUserItem `json:"items"`
	Pagination ActivityPagination   `json:"pagination"`
}

type AdminPointUserQuery struct {
	Page     int    `form:"page"`
	PageSize int    `form:"page_size"`
	Query    string `form:"query"`
}

type AdminAdjustUserPointsRequest struct {
	Points int64  `json:"points" binding:"required"`
	Reason string `json:"reason" binding:"required"`
}

type AdminPointRiskConfigData struct {
	Enabled                       bool   `json:"enabled"`
	DailyEarnLimit                int64  `json:"daily_earn_limit"`
	MonthlyDiscountLimit          int64  `json:"monthly_discount_limit"`
	LargeAdjustmentAlertThreshold int64  `json:"large_adjustment_alert_threshold"`
	PointExpiryDays               int    `json:"point_expiry_days"`
	UpdatedAt                     string `json:"updated_at"`
}

type AdminUpdatePointRiskConfigRequest struct {
	Enabled                       *bool  `json:"enabled"`
	DailyEarnLimit                *int64 `json:"daily_earn_limit"`
	MonthlyDiscountLimit          *int64 `json:"monthly_discount_limit"`
	LargeAdjustmentAlertThreshold *int64 `json:"large_adjustment_alert_threshold"`
	PointExpiryDays               *int   `json:"point_expiry_days"`
}

type AdminPointRedemptionCodeItem struct {
	ID          uint   `json:"id"`
	Code        string `json:"code"`
	Title       string `json:"title"`
	Points      int64  `json:"points"`
	MaxUses     int64  `json:"max_uses"`
	UsedCount   int64  `json:"used_count"`
	PerUserUses int64  `json:"per_user_uses"`
	Enabled     bool   `json:"enabled"`
	StartsAt    string `json:"starts_at,omitempty"`
	EndsAt      string `json:"ends_at,omitempty"`
	UpdatedAt   string `json:"updated_at"`
}

type AdminCreatePointRedemptionCodeRequest struct {
	Code        string `json:"code" binding:"required"`
	Title       string `json:"title" binding:"required"`
	Points      int64  `json:"points" binding:"required"`
	MaxUses     int64  `json:"max_uses"`
	PerUserUses int64  `json:"per_user_uses"`
	Enabled     *bool  `json:"enabled"`
	StartsAt    string `json:"starts_at"`
	EndsAt      string `json:"ends_at"`
}

type AdminGrossMarginCostItem struct {
	Key       string `json:"key"`
	Amount    string `json:"amount"`
	Cents     int64  `json:"cents"`
	ShareBps  int64  `json:"share_bps"`
	Quantity  int64  `json:"quantity,omitempty"`
	UnitLabel string `json:"unit_label,omitempty"`
}

type AdminGrossMarginRevenueItem struct {
	PlanCode string `json:"plan_code"`
	Orders   int64  `json:"orders"`
	Amount   string `json:"amount"`
	Cents    int64  `json:"cents"`
}

type AdminGrossMarginSummaryResponse struct {
	PeriodStart      string                        `json:"period_start"`
	PeriodEnd        string                        `json:"period_end"`
	RevenueAmount    string                        `json:"revenue_amount"`
	RevenueCents     int64                         `json:"revenue_cents"`
	TotalCost        string                        `json:"total_cost"`
	TotalCostCents   int64                         `json:"total_cost_cents"`
	GrossProfit      string                        `json:"gross_profit"`
	GrossProfitCents int64                         `json:"gross_profit_cents"`
	GrossMarginBps   int64                         `json:"gross_margin_bps"`
	TargetBps        int64                         `json:"target_bps"`
	Status           string                        `json:"status"`
	Costs            []AdminGrossMarginCostItem    `json:"costs"`
	RevenueByPlan    []AdminGrossMarginRevenueItem `json:"revenue_by_plan"`
}

type AdminGrossMarginAlertConfigData struct {
	Enabled                     bool   `json:"enabled"`
	TargetMarginBps             int64  `json:"target_margin_bps"`
	OpenAICostShareThresholdBps int64  `json:"openai_cost_share_threshold_bps"`
	XCostShareThresholdBps      int64  `json:"x_cost_share_threshold_bps"`
	PointCostShareThresholdBps  int64  `json:"point_cost_share_threshold_bps"`
	CheckIntervalHours          int    `json:"check_interval_hours"`
	UpdatedAt                   string `json:"updated_at"`
}

type AdminUpdateGrossMarginAlertConfigRequest struct {
	Enabled                     *bool  `json:"enabled"`
	TargetMarginBps             *int64 `json:"target_margin_bps"`
	OpenAICostShareThresholdBps *int64 `json:"openai_cost_share_threshold_bps"`
	XCostShareThresholdBps      *int64 `json:"x_cost_share_threshold_bps"`
	PointCostShareThresholdBps  *int64 `json:"point_cost_share_threshold_bps"`
	CheckIntervalHours          *int   `json:"check_interval_hours"`
}

type AdminGrossMarginAlertEventItem struct {
	ID                uint     `json:"id"`
	PeriodStart       string   `json:"period_start"`
	PeriodEnd         string   `json:"period_end"`
	Level             string   `json:"level"`
	Status            string   `json:"status"`
	Reasons           []string `json:"reasons"`
	RevenueAmount     string   `json:"revenue_amount"`
	TotalCost         string   `json:"total_cost"`
	GrossProfit       string   `json:"gross_profit"`
	GrossMarginBps    int64    `json:"gross_margin_bps"`
	TargetMarginBps   int64    `json:"target_margin_bps"`
	OpenAICost        string   `json:"openai_cost"`
	XCost             string   `json:"x_cost"`
	PointDiscountCost string   `json:"point_discount_cost"`
	LarkStatus        string   `json:"lark_status"`
	LarkError         string   `json:"lark_error,omitempty"`
	ConfigSnapshot    string   `json:"config_snapshot,omitempty"`
	AcknowledgedBy    uint     `json:"acknowledged_by,omitempty"`
	AcknowledgedAt    string   `json:"acknowledged_at,omitempty"`
	AcknowledgeNote   string   `json:"acknowledge_note,omitempty"`
	CreatedAt         string   `json:"created_at"`
}

type AdminGrossMarginAlertEventQuery struct {
	Status   string `form:"status"`
	Reason   string `form:"reason"`
	DateFrom string `form:"date_from"`
	DateTo   string `form:"date_to"`
	Limit    int    `form:"limit"`
}

type AdminGrossMarginAlertEventListResponse struct {
	Items []AdminGrossMarginAlertEventItem `json:"items"`
}

type AdminAcknowledgeGrossMarginAlertRequest struct {
	Note string `json:"note"`
}

type AdminReferralSummaryResponse struct {
	InviteCodes          int64 `json:"invite_codes"`
	ReferralSignups      int64 `json:"referral_signups"`
	FirstPurchaseRewards int64 `json:"first_purchase_rewards"`
	SignupRewardPoints   int64 `json:"signup_reward_points"`
	PurchaseRewardPoints int64 `json:"purchase_reward_points"`
}

type AdminPointCostSourceItem struct {
	Source     string `json:"source"`
	Points     int64  `json:"points"`
	USDTAmount string `json:"usdt_amount"`
}

type AdminPointCostSummaryResponse struct {
	PeriodStart           string                     `json:"period_start"`
	PeriodEnd             string                     `json:"period_end"`
	PointsPerUSDT         int64                      `json:"points_per_usdt"`
	EarnedPoints          int64                      `json:"earned_points"`
	EarnedUSDT            string                     `json:"earned_usdt"`
	DiscountedPoints      int64                      `json:"discounted_points"`
	DiscountedUSDT        string                     `json:"discounted_usdt"`
	ExpiredPoints         int64                      `json:"expired_points"`
	ExpiredUSDT           string                     `json:"expired_usdt"`
	OutstandingPoints     int64                      `json:"outstanding_points"`
	OutstandingUSDT       string                     `json:"outstanding_usdt"`
	MonthlyEarnedBySource []AdminPointCostSourceItem `json:"monthly_earned_by_source"`
}
