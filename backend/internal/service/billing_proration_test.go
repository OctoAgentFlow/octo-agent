package service

import (
	"math/big"
	"strings"
	"testing"
	"time"

	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
)

func TestCalculateBillingQuoteAppliesUnusedSubscriptionCredit(t *testing.T) {
	startedAt := time.Date(2026, 5, 10, 0, 0, 0, 0, time.UTC)
	expiresAt := time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC)
	now := time.Date(2026, 5, 20, 0, 0, 0, 0, time.UTC)
	user := &model.User{
		SubscriptionPlanCode:     subscription.PlanBasic,
		SubscriptionStatus:       "active",
		SubscriptionBillingCycle: subscription.BillingCycleMonthly,
		SubscriptionStartedAt:    &startedAt,
		SubscriptionExpiresAt:    &expiresAt,
	}

	quote, err := calculateBillingQuote(user, subscription.PlanPlus, subscription.BillingCycleMonthly, now)
	if err != nil {
		t.Fatalf("calculateBillingQuote returned error: %v", err)
	}
	if !quote.dto.IsUpgrade || quote.dto.OrderType != "upgrade" {
		t.Fatalf("expected upgrade quote, got %#v", quote.dto)
	}
	if quote.dto.OriginalAmount != "39" {
		t.Fatalf("expected original amount 39, got %s", quote.dto.OriginalAmount)
	}
	if quote.dto.CreditAmount == "0" || quote.creditCents <= 0 {
		t.Fatalf("expected unused credit, got %#v", quote.dto)
	}
	if quote.dto.PayableAmount == "39" || quote.payableCents >= quote.originalCents {
		t.Fatalf("expected payable below full price, got %#v", quote.dto)
	}
	if quote.dto.PayableAmount != "30.87" {
		t.Fatalf("expected prorated payable 30.87, got %s", quote.dto.PayableAmount)
	}
}

func TestAmountStringFromMinUnitsTrimsAndKeepsUniquePrecision(t *testing.T) {
	cases := []struct {
		name     string
		units    string
		decimals int
		want     string
	}{
		{name: "bsc six decimal display", units: "8000001000000000000", decimals: 18, want: "8.000001"},
		{name: "erc20 six decimals", units: "8000001", decimals: 6, want: "8.000001"},
		{name: "whole amount", units: "8000000000000000000", decimals: 18, want: "8"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			units, ok := new(big.Int).SetString(tc.units, 10)
			if !ok {
				t.Fatalf("invalid test units")
			}
			if got := amountStringFromMinUnits(units, tc.decimals); got != tc.want {
				t.Fatalf("expected %s, got %s", tc.want, got)
			}
		})
	}
}

func TestCalculateBillingQuoteDoesNotCreditFreeTrial(t *testing.T) {
	now := time.Date(2026, 5, 20, 0, 0, 0, 0, time.UTC)
	expiresAt := now.AddDate(0, 0, 7)
	user := &model.User{
		SubscriptionPlanCode:  subscription.PlanFreeTrial,
		SubscriptionStatus:    "active",
		SubscriptionExpiresAt: &expiresAt,
	}

	quote, err := calculateBillingQuote(user, subscription.PlanBasic, subscription.BillingCycleMonthly, now)
	if err != nil {
		t.Fatalf("calculateBillingQuote returned error: %v", err)
	}
	if quote.dto.OrderType != "new" || quote.dto.CreditAmount != "0" || quote.dto.PayableAmount != "12" {
		t.Fatalf("free trial should not produce cash credit: %#v", quote.dto)
	}
}

func TestCalculateBillingQuoteRejectsDowngradeAndYearlyToMonthlyUpgrade(t *testing.T) {
	now := time.Date(2026, 5, 20, 0, 0, 0, 0, time.UTC)
	startedAt := time.Date(2026, 5, 10, 0, 0, 0, 0, time.UTC)
	expiresAt := time.Date(2027, 5, 10, 0, 0, 0, 0, time.UTC)
	user := &model.User{
		SubscriptionPlanCode:     subscription.PlanPro,
		SubscriptionStatus:       "active",
		SubscriptionBillingCycle: subscription.BillingCycleYearly,
		SubscriptionStartedAt:    &startedAt,
		SubscriptionExpiresAt:    &expiresAt,
	}

	_, err := calculateBillingQuote(user, subscription.PlanBasic, subscription.BillingCycleYearly, now)
	if err == nil || !strings.Contains(err.Error(), "downgrade_not_supported") {
		t.Fatalf("expected downgrade_not_supported, got %v", err)
	}

	_, err = calculateBillingQuote(user, subscription.PlanProPlus, subscription.BillingCycleMonthly, now)
	if err == nil || !strings.Contains(err.Error(), "yearly_subscription_can_only_upgrade_to_yearly") {
		t.Fatalf("expected yearly-to-monthly upgrade rejection, got %v", err)
	}
}
