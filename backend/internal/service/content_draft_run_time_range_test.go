package service

import (
	"testing"
	"time"

	"octo-agent/backend/internal/dto"
)

func TestContentDraftRunTimeRangeUsesRelativeRanges(t *testing.T) {
	cases := []struct {
		name       string
		rangeValue string
		wantAge    time.Duration
	}{
		{name: "24h", rangeValue: "24h", wantAge: 24 * time.Hour},
		{name: "7d", rangeValue: "7d", wantAge: 7 * 24 * time.Hour},
		{name: "30d", rangeValue: "30d", wantAge: 30 * 24 * time.Hour},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			before := time.Now().UTC()
			from, to := contentDraftRunTimeRange(dto.ContentDraftGenerationRunQuery{Range: tc.rangeValue})
			after := time.Now().UTC()

			if from.Before(before.Add(-tc.wantAge-time.Second)) || from.After(after.Add(-tc.wantAge+time.Second)) {
				t.Fatalf("from = %s, want around now - %s", from, tc.wantAge)
			}
			if !to.IsZero() {
				t.Fatalf("to = %s, want zero", to)
			}
		})
	}
}

func TestContentDraftRunTimeRangeDateFromOverridesRange(t *testing.T) {
	fromInput := "2026-05-25T10:11:12Z"
	toInput := "2026-05-26T10:11:12Z"

	from, to := contentDraftRunTimeRange(dto.ContentDraftGenerationRunQuery{
		Range:    "24h",
		DateFrom: fromInput,
		DateTo:   toInput,
	})

	wantFrom, _ := time.Parse(time.RFC3339, fromInput)
	wantTo, _ := time.Parse(time.RFC3339, toInput)
	if !from.Equal(wantFrom) {
		t.Fatalf("from = %s, want %s", from, wantFrom)
	}
	if !to.Equal(wantTo) {
		t.Fatalf("to = %s, want %s", to, wantTo)
	}
}

func TestContentDraftRunTimeRangeAllowsDateToOnly(t *testing.T) {
	from, to := contentDraftRunTimeRange(dto.ContentDraftGenerationRunQuery{DateTo: "2026-05-26"})

	wantTo, _ := time.Parse("2006-01-02", "2026-05-26")
	if !from.IsZero() {
		t.Fatalf("from = %s, want zero", from)
	}
	if !to.Equal(wantTo) {
		t.Fatalf("to = %s, want %s", to, wantTo)
	}
}

func TestContentDraftRunTimeRangeIgnoresInvalidValues(t *testing.T) {
	from, to := contentDraftRunTimeRange(dto.ContentDraftGenerationRunQuery{
		Range:    "all",
		DateFrom: "not-a-time",
		DateTo:   "also-not-a-time",
	})

	if !from.IsZero() || !to.IsZero() {
		t.Fatalf("from = %s, to = %s, want both zero", from, to)
	}
}
