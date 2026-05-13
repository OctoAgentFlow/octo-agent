package subscription

import (
	"math"
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
	exp := u.SubscriptionExpiresAt
	if st == "active" && exp != nil && now.Before(*exp) {
		return "active"
	}
	return "expired"
}

// TrialDaysLeft returns remaining calendar-style days for free_trial while active; otherwise 0.
func TrialDaysLeft(u *model.User, now time.Time) int {
	if u == nil || !IsFreeTrial(u) {
		return 0
	}
	if EffectiveStatus(u, now) != "active" || u.SubscriptionExpiresAt == nil {
		return 0
	}
	left := u.SubscriptionExpiresAt.Sub(now)
	if left <= 0 {
		return 0
	}
	return int(math.Ceil(left.Hours() / 24))
}

func IsFreeTrial(u *model.User) bool {
	return u != nil && strings.EqualFold(strings.TrimSpace(u.SubscriptionPlanCode), "free_trial")
}
