package service

import "testing"

func TestReferralPurchaseRewardPoints(t *testing.T) {
	tests := []struct {
		name   string
		amount string
		want   int64
	}{
		{name: "basic monthly", amount: "8", want: 4},
		{name: "plus monthly", amount: "29", want: 15},
		{name: "pro monthly", amount: "79", want: 40},
		{name: "pro plus monthly", amount: "199", want: 100},
		{name: "discounted amount", amount: "23.58", want: 12},
		{name: "unique dust is truncated to cents", amount: "29.001", want: 15},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := referralPurchaseRewardPoints(tt.amount)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("expected %d points, got %d", tt.want, got)
			}
		})
	}
}

func TestReferralPurchaseRewardPointsRejectsInvalidAmount(t *testing.T) {
	if _, err := referralPurchaseRewardPoints("not-an-amount"); err == nil {
		t.Fatal("expected invalid amount error")
	}
}
