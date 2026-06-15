package service

import "testing"

func TestReferralPurchaseRewardPoints(t *testing.T) {
	tests := []struct {
		name   string
		amount string
		want   int64
	}{
		{name: "starter monthly", amount: "12", want: 6},
		{name: "growth monthly", amount: "39", want: 20},
		{name: "operator monthly", amount: "99", want: 50},
		{name: "agency monthly", amount: "249", want: 125},
		{name: "discounted amount", amount: "30.87", want: 16},
		{name: "unique dust is truncated to cents", amount: "39.001", want: 20},
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
