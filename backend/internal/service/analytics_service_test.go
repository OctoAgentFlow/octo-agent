package service

import (
	"testing"
	"time"

	"octo-agent/backend/internal/repository"
)

func TestBuildAutomationBreakdownIncludesDefaultTypes(t *testing.T) {
	got := buildAutomationBreakdown([]repository.ActivityTypeStatusCount{
		{Type: "post", Status: "success", Count: 3},
		{Type: "post", Status: "failed", Count: 1},
		{Type: "reply", Status: "review", Count: 2},
	})

	if len(got) != 3 {
		t.Fatalf("expected 3 default automation types, got %d", len(got))
	}
	if got[0].Type != "post" || got[0].Total != 4 || got[0].Success != 3 || got[0].Failed != 1 {
		t.Fatalf("unexpected post metric: %#v", got[0])
	}
	if got[1].Type != "reply" || got[1].Total != 2 || got[1].Review != 2 {
		t.Fatalf("unexpected reply metric: %#v", got[1])
	}
	if got[2].Type != "dm" || got[2].Total != 0 {
		t.Fatalf("unexpected dm metric: %#v", got[2])
	}
}

func TestBuildDailyActivityFillsEmptyDays(t *testing.T) {
	start := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	got := buildDailyActivity(start, 3, []repository.ActivityDailyStatusCount{
		{Day: "2026-05-02", Status: "success", Count: 2},
		{Day: "2026-05-02", Status: "failed", Count: 1},
	})

	if len(got) != 3 {
		t.Fatalf("expected 3 buckets, got %d", len(got))
	}
	if got[0].Date != "2026-05-01" || got[0].Total != 0 {
		t.Fatalf("unexpected first bucket: %#v", got[0])
	}
	if got[1].Date != "2026-05-02" || got[1].Total != 3 || got[1].Success != 2 || got[1].Failed != 1 {
		t.Fatalf("unexpected second bucket: %#v", got[1])
	}
	if got[2].Date != "2026-05-03" || got[2].Total != 0 {
		t.Fatalf("unexpected third bucket: %#v", got[2])
	}
}
