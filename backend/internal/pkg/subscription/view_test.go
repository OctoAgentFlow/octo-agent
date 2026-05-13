package subscription

import (
	"testing"
	"time"

	"octo-agent/backend/internal/model"
)

func TestTrialDaysLeftRoundsPartialDaysUp(t *testing.T) {
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	expiresAt := now.Add((13 * 24 * time.Hour) + time.Hour)
	user := &model.User{
		SubscriptionPlanCode:  "free_trial",
		SubscriptionStatus:    "active",
		SubscriptionExpiresAt: &expiresAt,
	}

	if got := TrialDaysLeft(user, now); got != 14 {
		t.Fatalf("TrialDaysLeft() = %d, want 14", got)
	}
}

func TestTrialDaysLeftExpiredOrPaid(t *testing.T) {
	now := time.Date(2026, 5, 13, 12, 0, 0, 0, time.UTC)
	expiredAt := now.Add(-time.Second)
	paidExpiresAt := now.Add(14 * 24 * time.Hour)

	cases := []struct {
		name string
		user *model.User
	}{
		{
			name: "expired free trial",
			user: &model.User{
				SubscriptionPlanCode:  "free_trial",
				SubscriptionStatus:    "active",
				SubscriptionExpiresAt: &expiredAt,
			},
		},
		{
			name: "paid plan",
			user: &model.User{
				SubscriptionPlanCode:  "basic_monthly",
				SubscriptionStatus:    "active",
				SubscriptionExpiresAt: &paidExpiresAt,
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := TrialDaysLeft(tc.user, now); got != 0 {
				t.Fatalf("TrialDaysLeft() = %d, want 0", got)
			}
		})
	}
}
