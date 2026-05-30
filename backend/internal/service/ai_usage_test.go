package service

import (
	"testing"

	openaiint "octo-agent/backend/internal/integration/openai"
)

func TestPromptGuardUsageDetails(t *testing.T) {
	details := promptGuardUsageDetails(openaiint.TextUsage{
		PromptGuardEnabled:     true,
		SystemLanguage:         "English",
		ContextLanguage:        "Chinese",
		ExpectedOutputLanguage: "Chinese",
		ActualOutputLanguage:   "Chinese",
		RetryCount:             1,
	})

	if details["prompt_guard_enabled"] != true {
		t.Fatalf("expected prompt guard enabled, got %#v", details["prompt_guard_enabled"])
	}
	if details["system_language"] != "English" || details["context_language"] != "Chinese" {
		t.Fatalf("unexpected language details: %#v", details)
	}
	if details["retry_count"] != int64(1) {
		t.Fatalf("expected retry_count 1, got %#v", details["retry_count"])
	}
}

func TestPromptGuardLanguageMismatchAfterRetry(t *testing.T) {
	usage := openaiint.TextUsage{
		PromptGuardEnabled:     true,
		ExpectedOutputLanguage: "Chinese",
		ActualOutputLanguage:   "English",
		RetryCount:             1,
	}
	if !promptGuardLanguageMismatchAfterRetry(usage) {
		t.Fatal("expected language mismatch after retry to alert")
	}

	usage.ActualOutputLanguage = "Chinese"
	if promptGuardLanguageMismatchAfterRetry(usage) {
		t.Fatal("did not expect matching languages to alert")
	}
}

func TestPromptGuardSystemLanguageViolation(t *testing.T) {
	if !promptGuardSystemLanguageViolation(openaiint.TextUsage{PromptGuardEnabled: true, SystemLanguage: "Chinese"}) {
		t.Fatal("expected non-English system language to alert")
	}
	if promptGuardSystemLanguageViolation(openaiint.TextUsage{PromptGuardEnabled: true, SystemLanguage: "English"}) {
		t.Fatal("did not expect English system language to alert")
	}
}
