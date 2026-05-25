package service

import (
	"reflect"
	"testing"
)

func TestGrossMarginAlertReasons(t *testing.T) {
	health := GrossMarginHealth{
		RevenueCents:       10000,
		TotalCostCents:     6200,
		GrossProfitCents:   3800,
		GrossMarginBps:     3800,
		TargetBps:          5000,
		OpenAICostCents:    2100,
		XCostCents:         500,
		PointDiscountCents: 2600,
	}
	got := grossMarginAlertReasons(health)
	want := []string{
		"gross_margin_below_50_percent",
		"openai_cost_share_at_or_above_20_percent",
		"point_discount_share_at_or_above_20_percent",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("reasons = %#v, want %#v", got, want)
	}
}

func TestGrossMarginAlertReasonsHealthy(t *testing.T) {
	got := grossMarginAlertReasons(GrossMarginHealth{
		RevenueCents:       10000,
		TotalCostCents:     2500,
		GrossProfitCents:   7500,
		GrossMarginBps:     7500,
		TargetBps:          5000,
		OpenAICostCents:    900,
		XCostCents:         800,
		PointDiscountCents: 800,
	})
	if len(got) != 0 {
		t.Fatalf("expected no reasons, got %#v", got)
	}
}
