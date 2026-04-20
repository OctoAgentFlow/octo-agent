package dto

import "time"

type DashboardOverviewResponse struct {
	Plan                 string `json:"plan"`
	TrialDaysLeft        int    `json:"trial_days_left"`
	SubscriptionStatus   string `json:"subscription_status"` // active | expired — same source as billing
	WalletBound          bool   `json:"wallet_bound"`
	ConnectedXCount      int64  `json:"connected_x_count"`

	ActivityCount24h       int64      `json:"activity_count_24h"`
	ActivityCountPrev24h   int64      `json:"activity_count_prev_24h"`
	ActivitySuccessRatePct int        `json:"activity_success_rate_pct"`
	LastActivityAt         *time.Time `json:"last_activity_at,omitempty"`
}
