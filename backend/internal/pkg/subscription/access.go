package subscription

import (
	"errors"
	"strings"
	"time"

	"octo-agent/backend/internal/model"
)

// DefaultTrialDays matches billing free_trial length for new registrations.
const DefaultTrialDays = 7

// Sentinel errors returned by AssertUserMayProduceContent for API mapping.
var (
	ErrSubscriptionRequired = errors.New("subscription_required")
	ErrSubscriptionExpired  = errors.New("subscription_expired")
)

// AssertUserMayProduceContent enforces users.subscription_* as the only source of truth.
// Allowed: subscription_status == active AND subscription_expires_at != nil AND now < expires_at.
func AssertUserMayProduceContent(u *model.User, now time.Time) error {
	if u == nil {
		return ErrSubscriptionRequired
	}
	st := strings.TrimSpace(strings.ToLower(u.SubscriptionStatus))
	exp := u.SubscriptionExpiresAt
	if st == "active" && exp != nil && now.Before(*exp) {
		return nil
	}
	if exp != nil && !now.Before(*exp) {
		return ErrSubscriptionExpired
	}
	return ErrSubscriptionRequired
}
