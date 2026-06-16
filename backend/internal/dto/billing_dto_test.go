package dto

import (
	"encoding/json"
	"testing"
)

func TestPlanUsageDataAppliesSemanticAliases(t *testing.T) {
	usage := PlanUsageData{
		AutoPostsMonth:    11,
		AutoRepliesMonth:  22,
		AutoCommentsMonth: 33,
		AutoDMsMonth:      44,
		AutoPostsToday:    1,
		AutoRepliesToday:  2,
		AutoCommentsToday: 3,
		AutoDMsToday:      4,
	}

	usage.ApplySemanticAliases()

	if usage.ContentDraftsMonth != usage.AutoPostsMonth {
		t.Fatalf("content drafts month alias = %d, want %d", usage.ContentDraftsMonth, usage.AutoPostsMonth)
	}
	if usage.ReplyDraftsMonth != usage.AutoRepliesMonth {
		t.Fatalf("reply drafts month alias = %d, want %d", usage.ReplyDraftsMonth, usage.AutoRepliesMonth)
	}
	if usage.OpportunityDraftsMonth != usage.AutoCommentsMonth {
		t.Fatalf("opportunity drafts month alias = %d, want %d", usage.OpportunityDraftsMonth, usage.AutoCommentsMonth)
	}
	if usage.ReviewCapacityMonth != usage.AutoDMsMonth {
		t.Fatalf("review capacity month alias = %d, want %d", usage.ReviewCapacityMonth, usage.AutoDMsMonth)
	}
	if usage.ContentDraftsToday != usage.AutoPostsToday {
		t.Fatalf("content drafts today alias = %d, want %d", usage.ContentDraftsToday, usage.AutoPostsToday)
	}
	if usage.ReplyDraftsToday != usage.AutoRepliesToday {
		t.Fatalf("reply drafts today alias = %d, want %d", usage.ReplyDraftsToday, usage.AutoRepliesToday)
	}
	if usage.OpportunityDraftsToday != usage.AutoCommentsToday {
		t.Fatalf("opportunity drafts today alias = %d, want %d", usage.OpportunityDraftsToday, usage.AutoCommentsToday)
	}
	if usage.ReviewCapacityToday != usage.AutoDMsToday {
		t.Fatalf("review capacity today alias = %d, want %d", usage.ReviewCapacityToday, usage.AutoDMsToday)
	}
}

func TestPlanUsageDataPrefersSemanticAliases(t *testing.T) {
	usage := PlanUsageData{
		AutoCommentsMonth:      3,
		OpportunityDraftsMonth: 12,
		AutoDMsToday:           1,
		ReviewCapacityToday:    9,
	}

	usage.ApplySemanticAliases()

	if usage.OpportunityDraftsMonth != 12 {
		t.Fatalf("opportunity drafts month = %d, want semantic value 12", usage.OpportunityDraftsMonth)
	}
	if usage.AutoCommentsMonth != 12 {
		t.Fatalf("legacy auto comments month = %d, want semantic value 12", usage.AutoCommentsMonth)
	}
	if usage.ReviewCapacityToday != 9 {
		t.Fatalf("review capacity today = %d, want semantic value 9", usage.ReviewCapacityToday)
	}
	if usage.AutoDMsToday != 9 {
		t.Fatalf("legacy auto dms today = %d, want semantic value 9", usage.AutoDMsToday)
	}
}

func TestPlanLimitsDataBackfillsLegacyFromSemanticAliases(t *testing.T) {
	limits := PlanLimitsData{
		MonthlyOpportunityDrafts: 88,
		ContentMemorySources:     144,
		MonthlyRadarRefreshes:    233,
	}

	limits.ApplySemanticAliases()

	if limits.MonthlyAutoComments != limits.MonthlyOpportunityDrafts {
		t.Fatalf("monthly auto comments = %d, want %d", limits.MonthlyAutoComments, limits.MonthlyOpportunityDrafts)
	}
	if limits.AutoCommentTargets != limits.ContentMemorySources {
		t.Fatalf("auto comment targets = %d, want %d", limits.AutoCommentTargets, limits.ContentMemorySources)
	}
	if limits.MonthlyAutoCommentScans != limits.MonthlyRadarRefreshes {
		t.Fatalf("monthly auto comment scans = %d, want %d", limits.MonthlyAutoCommentScans, limits.MonthlyRadarRefreshes)
	}
}

func TestBillingSubscriptionJSONKeepsSemanticAndLegacyQuotaFields(t *testing.T) {
	limits := PlanLimitsData{
		MonthlyAutoPosts:        10,
		MonthlyAutoReplies:      20,
		MonthlyAutoComments:     30,
		MonthlyAutoDMs:          40,
		AutoCommentTargets:      50,
		MonthlyAutoCommentScans: 60,
	}
	limits.ApplySemanticAliases()
	usage := PlanUsageData{
		AutoPostsMonth:    1,
		AutoRepliesMonth:  2,
		AutoCommentsMonth: 3,
		AutoDMsMonth:      4,
	}
	usage.ApplySemanticAliases()

	raw, err := json.Marshal(BillingSubscriptionData{
		Plan:   "basic",
		Limits: limits,
		Usage:  usage,
	})
	if err != nil {
		t.Fatalf("marshal billing subscription: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("unmarshal billing subscription: %v", err)
	}
	assertJSONNumber(t, payload["limits"], "monthly_content_drafts", 10)
	assertJSONNumber(t, payload["limits"], "monthly_auto_posts", 10)
	assertJSONNumber(t, payload["limits"], "monthly_opportunity_drafts", 30)
	assertJSONNumber(t, payload["limits"], "monthly_auto_comments", 30)
	assertJSONNumber(t, payload["limits"], "monthly_review_capacity", 40)
	assertJSONNumber(t, payload["limits"], "monthly_auto_dms", 40)
	assertJSONNumber(t, payload["limits"], "content_memory_sources", 50)
	assertJSONNumber(t, payload["limits"], "auto_comment_targets", 50)
	assertJSONNumber(t, payload["limits"], "monthly_radar_refreshes", 60)
	assertJSONNumber(t, payload["limits"], "monthly_auto_comment_scans", 60)
	assertJSONNumber(t, payload["usage"], "content_drafts_month", 1)
	assertJSONNumber(t, payload["usage"], "auto_posts_month", 1)
	assertJSONNumber(t, payload["usage"], "opportunity_drafts_month", 3)
	assertJSONNumber(t, payload["usage"], "auto_comments_month", 3)
	assertJSONNumber(t, payload["usage"], "review_capacity_month", 4)
	assertJSONNumber(t, payload["usage"], "auto_dms_month", 4)
}

func assertJSONNumber(t *testing.T, raw any, key string, want float64) {
	t.Helper()
	obj, ok := raw.(map[string]any)
	if !ok {
		t.Fatalf("payload section for %s is %T, want object", key, raw)
	}
	got, ok := obj[key].(float64)
	if !ok {
		t.Fatalf("payload[%q] = %T, want number", key, obj[key])
	}
	if got != want {
		t.Fatalf("payload[%q] = %v, want %v", key, got, want)
	}
}
