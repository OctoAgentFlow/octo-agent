package openai

import "testing"

func TestValidatePromptGuardAllowsEnglishSystemPrompt(t *testing.T) {
	err := ValidatePromptGuard([]ChatMessage{
		{Role: "system", Content: "You are a careful social media assistant. Return JSON only."},
		{Role: "user", Content: "Target tweet: 这是一条中文推文。"},
	})
	if err != nil {
		t.Fatalf("expected English system prompt to pass, got %v", err)
	}
}

func TestValidatePromptGuardRejectsCJKSystemPrompt(t *testing.T) {
	err := ValidatePromptGuard([]ChatMessage{
		{Role: "system", Content: "你是一个社媒助手。Return JSON only."},
	})
	if err == nil {
		t.Fatal("expected CJK system prompt to fail")
	}
}
