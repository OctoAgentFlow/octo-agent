package service

import (
	"testing"

	"octo-agent/backend/internal/pkg/subscription"
)

func TestPlanLimitsToDTOAppliesSemanticAliases(t *testing.T) {
	limits := subscription.PlanLimits{
		MonthlyAutoPosts:        11,
		MonthlyAutoReplies:      22,
		MonthlyAutoComments:     33,
		MonthlyAutoDMs:          44,
		AutoCommentTargets:      55,
		MonthlyAutoCommentScans: 66,
		DailyAutoPosts:          1,
		DailyAutoReplies:        2,
		DailyAutoComments:       3,
		DailyAutoDMs:            4,
	}

	got := planLimitsToDTO(limits)

	if got.MonthlyContentDrafts != got.MonthlyAutoPosts {
		t.Fatalf("monthly content drafts alias = %d, want %d", got.MonthlyContentDrafts, got.MonthlyAutoPosts)
	}
	if got.MonthlyReplyDrafts != got.MonthlyAutoReplies {
		t.Fatalf("monthly reply drafts alias = %d, want %d", got.MonthlyReplyDrafts, got.MonthlyAutoReplies)
	}
	if got.MonthlyOpportunityDrafts != got.MonthlyAutoComments {
		t.Fatalf("monthly opportunity drafts alias = %d, want %d", got.MonthlyOpportunityDrafts, got.MonthlyAutoComments)
	}
	if got.MonthlyReviewCapacity != got.MonthlyAutoDMs {
		t.Fatalf("monthly review capacity alias = %d, want %d", got.MonthlyReviewCapacity, got.MonthlyAutoDMs)
	}
	if got.ContentMemorySources != got.AutoCommentTargets {
		t.Fatalf("content memory sources alias = %d, want %d", got.ContentMemorySources, got.AutoCommentTargets)
	}
	if got.MonthlyRadarRefreshes != got.MonthlyAutoCommentScans {
		t.Fatalf("monthly radar refreshes alias = %d, want %d", got.MonthlyRadarRefreshes, got.MonthlyAutoCommentScans)
	}
	if got.DailyContentDrafts != got.DailyAutoPosts {
		t.Fatalf("daily content drafts alias = %d, want %d", got.DailyContentDrafts, got.DailyAutoPosts)
	}
	if got.DailyReplyDrafts != got.DailyAutoReplies {
		t.Fatalf("daily reply drafts alias = %d, want %d", got.DailyReplyDrafts, got.DailyAutoReplies)
	}
	if got.DailyOpportunityDrafts != got.DailyAutoComments {
		t.Fatalf("daily opportunity drafts alias = %d, want %d", got.DailyOpportunityDrafts, got.DailyAutoComments)
	}
	if got.DailyReviewCapacity != got.DailyAutoDMs {
		t.Fatalf("daily review capacity alias = %d, want %d", got.DailyReviewCapacity, got.DailyAutoDMs)
	}
}
