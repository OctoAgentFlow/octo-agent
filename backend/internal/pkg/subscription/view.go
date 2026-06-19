package subscription

import (
	"strings"
	"time"

	"octo-agent/backend/internal/model"
)

// EffectiveStatus returns "active" if the user currently has a valid entitlement window, else "expired".
func EffectiveStatus(u *model.User, now time.Time) string {
	if u == nil {
		return "expired"
	}
	st := strings.TrimSpace(strings.ToLower(u.SubscriptionStatus))
	if st != "active" {
		return "expired"
	}
	if IsFreeTrial(u) {
		return "active"
	}
	exp := u.SubscriptionExpiresAt
	if exp != nil && now.Before(*exp) {
		return "active"
	}
	return "expired"
}

// TrialDaysLeft is retained for API compatibility; free_trial is permanently free so this is always 0.
func TrialDaysLeft(u *model.User, now time.Time) int {
	_ = now
	if u == nil || !IsFreeTrial(u) {
		return 0
	}
	if EffectiveStatus(u, now) != "active" {
		return 0
	}
	return 0
}

func IsFreeTrial(u *model.User) bool {
	return u != nil && strings.EqualFold(strings.TrimSpace(u.SubscriptionPlanCode), "free_trial")
}
