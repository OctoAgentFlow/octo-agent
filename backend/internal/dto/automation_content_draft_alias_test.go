package dto

import (
	"encoding/json"
	"testing"
)

func TestContentDraftDTOAliasesKeepLegacyJSONContract(t *testing.T) {
	legacyPlan := AutoPostPlanRequest{
		XAccountID:         12,
		ExecutionMode:      "review",
		DailyLimit:         3,
		MinIntervalMinutes: 120,
		PostingWindows:     "09:00-18:00",
	}
	var semanticPlan ContentDraftPlanRequest = legacyPlan

	raw, err := json.Marshal(semanticPlan)
	if err != nil {
		t.Fatalf("marshal content draft plan request alias: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("unmarshal content draft plan request alias: %v", err)
	}
	assertAliasJSONNumber(t, payload, "x_account_id", 12)
	assertAliasJSONNumber(t, payload, "daily_limit", 3)
	if _, ok := payload["content_draft_daily_limit"]; ok {
		t.Fatalf("unexpected renamed JSON key content_draft_daily_limit")
	}

	legacyDraft := AutoPostDraftItem{
		ID:               7,
		GeneratedContent: "Draft text",
		Status:           "pending_review",
	}
	var semanticDraft ContentDraftItem = legacyDraft
	raw, err = json.Marshal(semanticDraft)
	if err != nil {
		t.Fatalf("marshal content draft item alias: %v", err)
	}
	payload = map[string]any{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("unmarshal content draft item alias: %v", err)
	}
	assertAliasJSONString(t, payload, "generated_content", "Draft text")
	if _, ok := payload["content"]; ok {
		t.Fatalf("unexpected renamed JSON key content")
	}
}

func assertAliasJSONNumber(t *testing.T, payload map[string]any, key string, want float64) {
	t.Helper()
	got, ok := payload[key].(float64)
	if !ok {
		t.Fatalf("payload[%q] = %T, want number", key, payload[key])
	}
	if got != want {
		t.Fatalf("payload[%q] = %v, want %v", key, got, want)
	}
}

func assertAliasJSONString(t *testing.T, payload map[string]any, key string, want string) {
	t.Helper()
	got, ok := payload[key].(string)
	if !ok {
		t.Fatalf("payload[%q] = %T, want string", key, payload[key])
	}
	if got != want {
		t.Fatalf("payload[%q] = %q, want %q", key, got, want)
	}
}
