package dto

type AnalyticsOverviewQuery struct {
	Range     string `form:"range"`
	AccountID uint   `form:"account_id"`
}

type AnalyticsOverviewResponse struct {
	RangeDays           int                         `json:"range_days"`
	GeneratedAt         string                      `json:"generated_at"`
	ActivitySummary     AnalyticsActivitySummary    `json:"activity_summary"`
	PostSummary         AnalyticsPostSummary        `json:"post_summary"`
	AutomationBreakdown []AnalyticsAutomationMetric `json:"automation_breakdown"`
	DailyActivity       []AnalyticsDailyActivity    `json:"daily_activity"`
	FailureReasons      []AnalyticsFailureReason    `json:"failure_reasons"`
	AttentionItems      []AnalyticsAttentionItem    `json:"attention_items"`
	AccountBreakdown    []AnalyticsAccountMetric    `json:"account_breakdown"`
}

type AnalyticsActivitySummary struct {
	Total          int64  `json:"total"`
	Success        int64  `json:"success"`
	Failed         int64  `json:"failed"`
	Review         int64  `json:"review"`
	Total7d        int64  `json:"total_7d"`
	Success7d      int64  `json:"success_7d"`
	Failed7d       int64  `json:"failed_7d"`
	Review7d       int64  `json:"review_7d"`
	SuccessRatePct int    `json:"success_rate_pct"`
	LastActivityAt string `json:"last_activity_at,omitempty"`
}

type AnalyticsPostSummary struct {
	Total      int64 `json:"total"`
	Draft      int64 `json:"draft"`
	Scheduled  int64 `json:"scheduled"`
	Processing int64 `json:"processing"`
	Published  int64 `json:"published"`
	Failed     int64 `json:"failed"`
}

type AnalyticsAutomationMetric struct {
	Type    string `json:"type"`
	Total   int64  `json:"total"`
	Success int64  `json:"success"`
	Failed  int64  `json:"failed"`
	Review  int64  `json:"review"`
}

type AnalyticsDailyActivity struct {
	Date    string `json:"date"`
	Total   int64  `json:"total"`
	Success int64  `json:"success"`
	Failed  int64  `json:"failed"`
	Review  int64  `json:"review"`
}

type AnalyticsFailureReason struct {
	Reason string `json:"reason"`
	Count  int64  `json:"count"`
	LastAt string `json:"last_at,omitempty"`
}

type AnalyticsAttentionItem struct {
	ID            uint   `json:"id"`
	XAccountID    uint   `json:"x_account_id,omitempty"`
	Type          string `json:"type"`
	Status        string `json:"status"`
	AccountHandle string `json:"account_handle"`
	PreviewKey    string `json:"preview_key"`
	ExecutedAt    string `json:"executed_at"`
	ErrorMessage  string `json:"error_message,omitempty"`
}

type AnalyticsAccountMetric struct {
	AccountID      uint   `json:"account_id"`
	Username       string `json:"username"`
	DisplayName    string `json:"display_name"`
	AvatarURL      string `json:"avatar_url,omitempty"`
	Followers      string `json:"followers,omitempty"`
	ActivityTotal  int64  `json:"activity_total"`
	Success        int64  `json:"success"`
	Failed         int64  `json:"failed"`
	Review         int64  `json:"review"`
	SuccessRatePct int    `json:"success_rate_pct"`
	PostTotal      int64  `json:"post_total"`
	LastActivityAt string `json:"last_activity_at,omitempty"`
}
