package service

import (
	"testing"
	"time"

	"octo-agent/backend/internal/model"
)

func TestEvaluateAutoCommentOpportunityScoresRelevantTweet(t *testing.T) {
	bot := &model.OAFBot{
		Keywords: encodeStringList([]string{"AI Agent", "SocialFi", "X Growth"}),
		Topics:   encodeStringList([]string{"automation"}),
	}
	context := []GenerationContentContextItem{
		{Title: "OAF Bot growth workflow", Topics: []string{"AI Agent", "automation"}},
	}

	got := evaluateAutoCommentOpportunity(
		"How are teams using AI Agent automation to improve X Growth without sounding spammy?",
		"target_kol",
		bot,
		context,
		nil,
	)

	if got.Score < 80 {
		t.Fatalf("expected strong opportunity score, got %d", got.Score)
	}
	if len(got.MatchedKeywords) == 0 {
		t.Fatalf("expected matched keywords")
	}
	if len(got.ReferencedContent) != 1 || got.ReferencedContent[0] != "OAF Bot growth workflow" {
		t.Fatalf("expected referenced content title, got %#v", got.ReferencedContent)
	}
}

func TestEvaluateAutoCommentOpportunityPenalizesBlockedTopic(t *testing.T) {
	got := evaluateAutoCommentOpportunity(
		"Guaranteed profit if you connect wallet and join this airdrop now.",
		"target_kol",
		nil,
		nil,
		[]string{"airdrop"},
	)

	if got.Score >= 30 {
		t.Fatalf("expected blocked topic to produce low opportunity score, got %d", got.Score)
	}
}

func TestApplyAutoCommentOpportunityGateDowngradesAutopilot(t *testing.T) {
	status := "ready_to_publish"
	capability := "autopilot_prepared"
	approvalRequired := false
	var approvedAt *time.Time

	applyAutoCommentOpportunityGate(ExecutionModeAutopilot, autoCommentOpportunity{Score: 20}, &status, &capability, &approvalRequired, &approvedAt)
	if status != "pending_review" {
		t.Fatalf("expected low opportunity autopilot task to require review, got %s", status)
	}
	if capability != "low_opportunity_review" || !approvalRequired {
		t.Fatalf("unexpected gate result: capability=%s approval=%v", capability, approvalRequired)
	}
}

func TestParseAutoCommentCandidates(t *testing.T) {
	raw := `{"candidates":[{"type":"professional_view","label":"Professional view","comment":"This is a useful operational lens."},{"type":"engagement_question","label":"Question","comment":"How are you measuring comment quality?"},{"type":"soft_cta","label":"Soft CTA","comment":"This is where a shared persona layer can help."}]}`

	got := parseAutoCommentCandidates(raw)
	if len(got) != 3 {
		t.Fatalf("expected three candidates, got %#v", got)
	}
	if got[1].Type != "engagement_question" {
		t.Fatalf("expected normalized candidate type, got %s", got[1].Type)
	}
}

func TestAutoCommentQueueScorePrioritizesTargetPriorityAndOpportunity(t *testing.T) {
	highPriority := autoCommentQueueScore(5, 40)
	highOpportunity := autoCommentQueueScore(2, 90)
	if highPriority <= highOpportunity {
		t.Fatalf("expected high priority target to win when opportunity is still reasonable: highPriority=%d highOpportunity=%d", highPriority, highOpportunity)
	}

	bestOpportunity := autoCommentQueueScore(3, 95)
	averageOpportunity := autoCommentQueueScore(3, 50)
	if bestOpportunity <= averageOpportunity {
		t.Fatalf("expected higher opportunity score to win within same priority")
	}
}
