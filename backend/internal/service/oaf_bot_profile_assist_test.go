package service

import (
	"testing"

	"octo-agent/backend/internal/dto"
)

func TestMergeCompletedOAFBotProfileFillMissingOnlyPreservesDraft(t *testing.T) {
	draft := dto.OAFBotUpsertRequest{
		Name:             "Original Bot",
		TwitterAccountID: 7,
		IdentitySummary:  "Original summary",
		VoiceTone:        "Original voice",
		Topics:           []string{"Original topic"},
		PrimaryLanguage:  "en",
		LanguageStrategy: "always_primary",
		ProjectOneLiner:  "",
		TargetAudience:   "",
		ForbiddenTopics:  []string{},
	}
	generated := dto.OAFBotUpsertRequest{
		Name:             "Generated Bot",
		TwitterAccountID: 99,
		IdentitySummary:  "Generated summary",
		VoiceTone:        "Generated voice",
		Topics:           []string{"Generated topic"},
		PrimaryLanguage:  "zh-CN",
		LanguageStrategy: "follow_context",
		ProjectOneLiner:  "Generated one-liner",
		TargetAudience:   "Generated audience",
		ForbiddenTopics:  []string{"Generated forbidden"},
	}

	got := mergeCompletedOAFBotProfile(draft, generated, oafBotProfileAssistModeFillMissing)

	if got.Name != draft.Name {
		t.Fatalf("name = %q, want draft value %q", got.Name, draft.Name)
	}
	if got.TwitterAccountID != draft.TwitterAccountID {
		t.Fatalf("twitter_account_id = %d, want %d", got.TwitterAccountID, draft.TwitterAccountID)
	}
	if got.IdentitySummary != draft.IdentitySummary {
		t.Fatalf("identity summary = %q, want draft value", got.IdentitySummary)
	}
	if got.VoiceTone != draft.VoiceTone {
		t.Fatalf("voice tone = %q, want draft value", got.VoiceTone)
	}
	if len(got.Topics) != 1 || got.Topics[0] != draft.Topics[0] {
		t.Fatalf("topics = %#v, want draft topics", got.Topics)
	}
	if got.PrimaryLanguage != draft.PrimaryLanguage || got.LanguageStrategy != draft.LanguageStrategy {
		t.Fatalf("language config = %q/%q, want draft language config", got.PrimaryLanguage, got.LanguageStrategy)
	}
	if got.ProjectOneLiner != generated.ProjectOneLiner {
		t.Fatalf("project one-liner = %q, want generated missing value", got.ProjectOneLiner)
	}
	if got.TargetAudience != generated.TargetAudience {
		t.Fatalf("target audience = %q, want generated missing value", got.TargetAudience)
	}
	if len(got.ForbiddenTopics) != 1 || got.ForbiddenTopics[0] != generated.ForbiddenTopics[0] {
		t.Fatalf("forbidden topics = %#v, want generated missing list", got.ForbiddenTopics)
	}
}

func TestMergeCompletedOAFBotProfileImproveAllUsesGeneratedFields(t *testing.T) {
	draft := dto.OAFBotUpsertRequest{
		Name:             "Original Bot",
		TwitterAccountID: 7,
		IdentitySummary:  "Original summary",
		Topics:           []string{"Original topic"},
	}
	generated := dto.OAFBotUpsertRequest{
		Name:             "Generated Bot",
		TwitterAccountID: 99,
		IdentitySummary:  "Generated summary",
		Topics:           []string{"Generated topic"},
	}

	got := mergeCompletedOAFBotProfile(draft, generated, oafBotProfileAssistModeImproveAll)

	if got.Name != draft.Name {
		t.Fatalf("name = %q, want draft name for identity stability", got.Name)
	}
	if got.TwitterAccountID != draft.TwitterAccountID {
		t.Fatalf("twitter_account_id = %d, want draft account", got.TwitterAccountID)
	}
	if got.IdentitySummary != generated.IdentitySummary {
		t.Fatalf("identity summary = %q, want generated value", got.IdentitySummary)
	}
	if len(got.Topics) != 1 || got.Topics[0] != generated.Topics[0] {
		t.Fatalf("topics = %#v, want generated topics", got.Topics)
	}
}

func TestNormalizeOAFBotProfileAssistModeDefaultsToFillMissing(t *testing.T) {
	if got := normalizeOAFBotProfileAssistMode(""); got != oafBotProfileAssistModeFillMissing {
		t.Fatalf("empty mode = %q, want fill missing", got)
	}
	if got := normalizeOAFBotProfileAssistMode("unknown"); got != oafBotProfileAssistModeFillMissing {
		t.Fatalf("unknown mode = %q, want fill missing", got)
	}
	if got := normalizeOAFBotProfileAssistMode(oafBotProfileAssistModeImproveAll); got != oafBotProfileAssistModeImproveAll {
		t.Fatalf("improve mode = %q, want improve all", got)
	}
}
