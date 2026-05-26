package service

import (
	"strings"
	"testing"
)

func TestXPostCharacterCountUsesURLWeight(t *testing.T) {
	got := xPostCharacterCount("hello https://example.com/very/long/path")
	want := len("hello ") + xURLWeightedLength
	if got != want {
		t.Fatalf("expected URL to count as %d weighted characters, got %d", want, got)
	}
}

func TestValidateXPostContentForStandardAccount(t *testing.T) {
	if err := validateXPostContentForAccount(strings.Repeat("a", 280), xSubscriptionTierFree); err != nil {
		t.Fatalf("expected 280 latin characters to be valid: %v", err)
	}
	if err := validateXPostContentForAccount(strings.Repeat("a", 281), xSubscriptionTierUnknown); err == nil {
		t.Fatal("expected standard account content above 280 weighted characters to fail")
	}
}

func TestValidateXPostContentForPremiumAccountAllowsLongerPost(t *testing.T) {
	if err := validateXPostContentForAccount(strings.Repeat("a", 1200), xSubscriptionTierPremium); err != nil {
		t.Fatalf("expected Premium account longer post to be valid: %v", err)
	}
}

func TestFitXStandardPostRespectsWeightedCharacters(t *testing.T) {
	got := fitXStandardPost(strings.Repeat("中", 200))
	if count := xPostCharacterCount(got); count > xStandardWeightedMax {
		t.Fatalf("expected standard post to fit weighted limit, got %d", count)
	}
}

func TestNormalizeAutoPostLengthModeRequiresPremiumTier(t *testing.T) {
	if got := normalizeAutoPostLengthMode(autoPostLengthModeLong, xSubscriptionTierFree); got != autoPostLengthModeStandard {
		t.Fatalf("expected free account long mode to fall back to standard, got %q", got)
	}
	if got := normalizeAutoPostLengthMode(autoPostLengthModeLong, xSubscriptionTierPremiumPlus); got != autoPostLengthModeLong {
		t.Fatalf("expected Premium+ account long mode, got %q", got)
	}
}
