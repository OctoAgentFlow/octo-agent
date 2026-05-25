package alert

import (
	"errors"
	"testing"
	"time"
)

func TestBuildLarkPayloadUsesInteractiveCard(t *testing.T) {
	event := Event{
		Level:       LevelError,
		Category:    CategoryPublishing,
		Title:       "X publish failed",
		Message:     "twitter api rejected publish request",
		Environment: "test",
		Service:     "backend-api",
		RequestID:   "req-1",
		UserID:      10,
		AccountID:   20,
		ResourceID:  30,
		Error:       errors.New("401 unauthorized"),
		Fields:      map[string]any{"source": "manual"},
		OccurredAt:  time.Date(2026, 5, 25, 5, 0, 0, 0, time.UTC),
	}
	payload, err := buildLarkPayload(event, "")
	if err != nil {
		t.Fatalf("build payload failed: %v", err)
	}
	if payload["msg_type"] != "interactive" {
		t.Fatalf("msg_type = %v, want interactive", payload["msg_type"])
	}
	card, ok := payload["card"].(map[string]any)
	if !ok {
		t.Fatal("expected card payload")
	}
	header, ok := card["header"].(map[string]any)
	if !ok {
		t.Fatal("expected card header")
	}
	if header["template"] != "red" {
		t.Fatalf("template = %v, want red", header["template"])
	}
	if _, ok := payload["sign"]; ok {
		t.Fatal("did not expect sign without secret")
	}
}

func TestBuildLarkPayloadSignsWhenSecretConfigured(t *testing.T) {
	payload, err := buildLarkPayload(Event{Level: LevelWarning, Title: "warn"}, "secret")
	if err != nil {
		t.Fatalf("build payload failed: %v", err)
	}
	if payload["timestamp"] == "" {
		t.Fatal("expected timestamp")
	}
	if payload["sign"] == "" {
		t.Fatal("expected sign")
	}
}
