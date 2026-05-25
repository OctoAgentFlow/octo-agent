package dto

type AdminOverviewResponse struct {
	Operator     AdminOperatorData       `json:"operator"`
	Users        AdminUserSummary        `json:"users"`
	Billing      BillingOrderOpsSummary  `json:"billing"`
	Activity     AdminActivitySummary    `json:"activity"`
	Content      AdminContentSummary     `json:"content"`
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

type AdminConfigSummary struct {
	EmailProvider      string `json:"email_provider"`
	ResendConfigured   bool   `json:"resend_configured"`
	XOAuthConfigured   bool   `json:"x_oauth_configured"`
	BillingMethodCount int    `json:"billing_method_count"`
	FrontendBaseURL    string `json:"frontend_base_url"`
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
