package service

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	xSubscriptionTierUnknown     = "unknown"
	xSubscriptionTierFree        = "free"
	xSubscriptionTierPremium     = "premium"
	xSubscriptionTierPremiumPlus = "premium_plus"

	xSubscriptionSourceManual = "manual"
	xSubscriptionSourceXAPI   = "x_api"

	contentDraftLengthModeStandard = "standard"
	contentDraftLengthModeLong     = "long"

	xStandardWeightedMax = 280
	xPremiumLongMax      = 25000
	xStandardDraftMax    = 240
	xLongDraftMax        = 1500
	xURLWeightedLength   = 23
)

var xURLPattern = regexp.MustCompile(`(?i)\bhttps?://[^\s]+`)

func normalizeXSubscriptionTier(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case xSubscriptionTierFree, "basic", "standard":
		return xSubscriptionTierFree
	case xSubscriptionTierPremium, "blue", "verified":
		return xSubscriptionTierPremium
	case xSubscriptionTierPremiumPlus, "premium+", "premium-plus", "premium plus":
		return xSubscriptionTierPremiumPlus
	default:
		return xSubscriptionTierUnknown
	}
}

func normalizeXSubscriptionTypeFromAPI(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "none":
		return xSubscriptionTierFree
	case "basic":
		return xSubscriptionTierFree
	case "premium":
		return xSubscriptionTierPremium
	case "premiumplus", "premium_plus", "premium+", "premium plus":
		return xSubscriptionTierPremiumPlus
	default:
		return xSubscriptionTierUnknown
	}
}

func normalizeXSubscriptionSource(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), xSubscriptionSourceXAPI) {
		return xSubscriptionSourceXAPI
	}
	return xSubscriptionSourceManual
}

func isPremiumXTier(value string) bool {
	tier := normalizeXSubscriptionTier(value)
	return tier == xSubscriptionTierPremium || tier == xSubscriptionTierPremiumPlus
}

func normalizeContentDraftLengthMode(mode string, xTier string) string {
	if strings.EqualFold(strings.TrimSpace(mode), contentDraftLengthModeLong) && isPremiumXTier(xTier) {
		return contentDraftLengthModeLong
	}
	return contentDraftLengthModeStandard
}

func contentDraftMaxFor(xTier, mode string) int {
	if normalizeContentDraftLengthMode(mode, xTier) == contentDraftLengthModeLong {
		return xLongDraftMax
	}
	return xStandardDraftMax
}

func xPostMaxForAccount(xTier string) int {
	if isPremiumXTier(xTier) {
		return xPremiumLongMax
	}
	return xStandardWeightedMax
}

func xPostCharacterCount(content string) int {
	text := strings.TrimSpace(content)
	if text == "" {
		return 0
	}
	total := 0
	last := 0
	for _, loc := range xURLPattern.FindAllStringIndex(text, -1) {
		total += xWeightedCount(text[last:loc[0]])
		total += xURLWeightedLength
		last = loc[1]
	}
	total += xWeightedCount(text[last:])
	return total
}

func xWeightedCount(text string) int {
	total := 0
	for _, r := range text {
		switch {
		case r == '\n' || r == '\r' || r == '\t':
			total++
		case r <= 0x10FF || unicode.In(r, unicode.Latin, unicode.Greek, unicode.Cyrillic):
			total++
		default:
			total += 2
		}
	}
	return total
}

func validateXPostContentForAccount(content string, accountTier string) error {
	text := strings.TrimSpace(content)
	if text == "" {
		return fmt.Errorf("publish content is empty")
	}
	if isPremiumXTier(accountTier) {
		if utf8.RuneCountInString(text) > xPremiumLongMax {
			return fmt.Errorf("content exceeds X Premium longer post limit (%d characters)", xPremiumLongMax)
		}
		return nil
	}
	count := xPostCharacterCount(text)
	if count > xStandardWeightedMax {
		return fmt.Errorf("content exceeds X standard post limit (%d weighted characters, got %d)", xStandardWeightedMax, count)
	}
	return nil
}

func fitXPostForAccount(content string, accountTier string) string {
	if isPremiumXTier(accountTier) {
		return fitGeneratedTweet(content, xPremiumLongMax)
	}
	return fitXStandardPost(content)
}

func fitXPostForContentDraft(content string, accountTier string, mode string) string {
	if normalizeContentDraftLengthMode(mode, accountTier) == contentDraftLengthModeLong {
		return fitGeneratedTweet(content, xLongDraftMax)
	}
	return fitXStandardPost(content)
}

func fitXStandardPost(content string) string {
	text := fitGeneratedTweet(content, xStandardDraftMax)
	for xPostCharacterCount(text) > xStandardWeightedMax {
		runes := []rune(text)
		if len(runes) == 0 {
			return ""
		}
		text = strings.TrimSpace(string(runes[:len(runes)-1]))
	}
	parts := strings.Fields(text)
	if len(parts) > 0 && strings.HasPrefix(parts[len(parts)-1], "#") {
		parts = parts[:len(parts)-1]
		text = strings.Join(parts, " ")
	}
	return strings.TrimRight(text, "#,;:，；：.!?。！？-— ")
}
