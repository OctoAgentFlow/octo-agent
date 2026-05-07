package service

import (
	"testing"
	"time"

	"octo-agent/backend/internal/model"
)

func TestAutomationToAgentResponse(t *testing.T) {
	next := time.Date(2026, 5, 7, 8, 0, 0, 0, time.UTC)
	got := automationToAgentResponse(model.AutomationConfig{
		Base:      model.Base{ID: 12},
		Type:      "reply",
		State:     "Queued",
		Enabled:   true,
		NextRunAt: &next,
	})

	if got.ID != 12 {
		t.Fatalf("unexpected id: %d", got.ID)
	}
	if got.Name != "Reply Agent" {
		t.Fatalf("unexpected name: %s", got.Name)
	}
	if got.Model != "automation:reply" || got.Type != "reply" || !got.Enabled {
		t.Fatalf("unexpected response: %#v", got)
	}
	if got.NextRunAt != "2026-05-07T08:00:00Z" {
		t.Fatalf("unexpected next_run_at: %s", got.NextRunAt)
	}
}

func TestAgentDisplayNameSpecialCases(t *testing.T) {
	if got := agentDisplayName("dm"); got != "DM Agent" {
		t.Fatalf("unexpected dm name: %s", got)
	}
	if got := agentDisplayName(""); got != "Automation Agent" {
		t.Fatalf("unexpected empty name: %s", got)
	}
}
