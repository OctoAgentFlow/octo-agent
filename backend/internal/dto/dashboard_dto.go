package dto

import "time"

type DashboardOverviewResponse struct {
	Plan                  string `json:"plan"`
	TrialDaysLeft         int    `json:"trial_days_left"`
	SubscriptionStatus    string `json:"subscription_status"` // active | expired — same source as billing
	SubscriptionExpiresAt string `json:"subscription_expires_at,omitempty"`
	WalletBound           bool   `json:"wallet_bound"`
	ConnectedXCount       int64  `json:"connected_x_count"`

	ActivityCount24h       int64      `json:"activity_count_24h"`
	ActivityCountPrev24h   int64      `json:"activity_count_prev_24h"`
	ActivitySuccessRatePct int        `json:"activity_success_rate_pct"`
	LastActivityAt         *time.Time `json:"last_activity_at,omitempty"`
}

type DashboardWorkbenchResponse struct {
	Opportunities []DashboardWorkbenchItem `json:"opportunities"`
	Reviews       []DashboardWorkbenchItem `json:"reviews"`
	Stats         ReviewQueueStats         `json:"stats"`
}

type DashboardWorkbenchItem struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	SourceID    uint   `json:"source_id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Status      string `json:"status,omitempty"`
	Href        string `json:"href"`
	Tone        string `json:"tone"`
	Score       int    `json:"score,omitempty"`
}
