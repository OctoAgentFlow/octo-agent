package subscription

import (
	"errors"
	"strings"
	"time"

	"octo-agent/backend/internal/model"
)

// FreeTrialTwitterAccountLimit is the maximum non-disconnected X accounts for a free-tier user.
const FreeTrialTwitterAccountLimit int64 = 1

// Sentinel errors returned by AssertUserMayProduceContent for API mapping.
var (
	ErrSubscriptionRequired = errors.New("subscription_required")
	ErrSubscriptionExpired  = errors.New("subscription_expired")
)

// AssertUserMayProduceContent enforces users.subscription_* as the only source of truth.
// free_trial stays active without an expiry window; paid plans require now < subscription_expires_at.
func AssertUserMayProduceContent(u *model.User, now time.Time) error {
	if u == nil {
		return ErrSubscriptionRequired
	}
	st := strings.TrimSpace(strings.ToLower(u.SubscriptionStatus))
	if st != "active" {
		return ErrSubscriptionRequired
	}
	if IsFreeTrial(u) {
		return nil
	}
	exp := u.SubscriptionExpiresAt
	if exp != nil && now.Before(*exp) {
		return nil
	}
	if exp != nil && !now.Before(*exp) {
		return ErrSubscriptionExpired
	}
	return ErrSubscriptionRequired
}
