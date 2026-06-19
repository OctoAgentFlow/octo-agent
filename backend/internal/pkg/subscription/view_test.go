package subscription

import (
	"testing"
	"time"

	"octo-agent/backend/internal/model"
)

func TestTrialDaysLeftAlwaysZeroForFreeTier(t *testing.T) {
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	expiresAt := now.Add(14 * 24 * time.Hour)
	user := &model.User{
		SubscriptionPlanCode:  "free_trial",
		SubscriptionStatus:    "active",
		SubscriptionExpiresAt: &expiresAt,
	}

	if got := TrialDaysLeft(user, now); got != 0 {
		t.Fatalf("TrialDaysLeft() = %d, want 0", got)
	}
}

func TestTrialDaysLeftNonFreeTier(t *testing.T) {
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	paidExpiresAt := now.Add(14 * 24 * time.Hour)
	user := &model.User{
		SubscriptionPlanCode:  "basic_monthly",
		SubscriptionStatus:    "active",
		SubscriptionExpiresAt: &paidExpiresAt,
	}

	if got := TrialDaysLeft(user, now); got != 0 {
		t.Fatalf("TrialDaysLeft() = %d, want 0", got)
	}
}

func TestEffectiveStatusFreeTierIgnoresExpiry(t *testing.T) {
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	expiredAt := now.Add(-time.Second)
	user := &model.User{
		SubscriptionPlanCode:  "free_trial",
		SubscriptionStatus:    "active",
		SubscriptionExpiresAt: &expiredAt,
	}

	if got := EffectiveStatus(user, now); got != "active" {
		t.Fatalf("EffectiveStatus() = %q, want active", got)
	}
}

func TestAssertUserMayProduceContentFreeTierWithoutExpiry(t *testing.T) {
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	user := &model.User{
		SubscriptionPlanCode:  "free_trial",
		SubscriptionStatus:    "active",
		SubscriptionExpiresAt: nil,
	}

	if err := AssertUserMayProduceContent(user, now); err != nil {
		t.Fatalf("AssertUserMayProduceContent() = %v, want nil", err)
	}
}

func TestAssertUserMayProduceContentPaidPlanRequiresExpiry(t *testing.T) {
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	user := &model.User{
		SubscriptionPlanCode:  "basic_monthly",
		SubscriptionStatus:    "active",
		SubscriptionExpiresAt: nil,
	}

	if err := AssertUserMayProduceContent(user, now); err != ErrSubscriptionRequired {
		t.Fatalf("AssertUserMayProduceContent() = %v, want %v", err, ErrSubscriptionRequired)
	}
}
