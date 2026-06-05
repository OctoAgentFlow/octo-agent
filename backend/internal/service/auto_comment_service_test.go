package service

import (
	"testing"
	"time"

	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
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

	applyAutoCommentOpportunityGate(ExecutionModeAutopilot, autoCommentOpportunity{Score: 80}, &status, &capability, &approvalRequired, &approvedAt)
	if status != "pending_review" {
		t.Fatalf("expected low opportunity autopilot task to require review, got %s", status)
	}
	if capability != "opportunity_review_required" || !approvalRequired {
		t.Fatalf("unexpected gate result: capability=%s approval=%v", capability, approvalRequired)
	}
}

func TestApplyAutoCommentOpportunityGateAllowsStrongAutopilot(t *testing.T) {
	now := time.Now().UTC()
	status := "ready_to_publish"
	capability := "autopilot_prepared"
	approvalRequired := false
	approvedAt := &now

	applyAutoCommentOpportunityGate(ExecutionModeAutopilot, autoCommentOpportunity{Score: 90}, &status, &capability, &approvalRequired, &approvedAt)
	if status != "ready_to_publish" || capability != "autopilot_prepared" || approvalRequired || approvedAt == nil {
		t.Fatalf("expected strong opportunity to remain autopilot-ready, got status=%s capability=%s approval=%v approved=%v", status, capability, approvalRequired, approvedAt)
	}
}

func TestAutoCommentOpportunitySkipCategory(t *testing.T) {
	if got := autoCommentOpportunitySkipCategory(74); got != "skipped_low_priority" {
		t.Fatalf("expected 65-74 to be low-priority skipped, got %s", got)
	}
	if got := autoCommentOpportunitySkipCategory(64); got != "skipped_low_value" {
		t.Fatalf("expected below 65 to be low-value skipped, got %s", got)
	}
	if got := autoCommentOpportunitySkipCategory(75); got != "" {
		t.Fatalf("expected 75+ to pass generation gate, got %s", got)
	}
}

func newAutoCommentCompletionGuardTestService(t *testing.T) (*AutoCommentService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.AutoCommentTask{}, &model.ActivityLog{}); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	return &AutoCommentService{
		taskRepo:     repository.NewAutoCommentTaskRepository(db),
		activityRepo: repository.NewActivityRepository(db),
	}, db
}

func TestAlreadyCompletedAutoCommentForTweetChecksTasksAndActivity(t *testing.T) {
	svc, db := newAutoCommentCompletionGuardTestService(t)
	userID := uint(7)
	xAccountID := uint(11)
	now := time.Now().UTC()

	if err := db.Create(&model.AutoCommentTask{
		UserID:           userID,
		XAccountID:       xAccountID,
		TargetTweetID:    "handled_tweet",
		Status:           "handled",
		RiskLevel:        "low",
		CapabilityStatus: "manual_handled",
		DetectedAt:       now,
	}).Error; err != nil {
		t.Fatalf("create handled task: %v", err)
	}
	done, err := svc.alreadyCompletedAutoCommentForTweet(userID, xAccountID, "handled_tweet")
	if err != nil {
		t.Fatalf("check handled task: %v", err)
	}
	if !done {
		t.Fatal("expected handled task to count as completed")
	}

	if err := db.Create(&model.AutoCommentTask{
		UserID:           userID,
		XAccountID:       xAccountID,
		TargetTweetID:    "rejected_tweet",
		Status:           "rejected",
		RiskLevel:        "low",
		CapabilityStatus: "review_required",
		DetectedAt:       now,
	}).Error; err != nil {
		t.Fatalf("create rejected task: %v", err)
	}
	done, err = svc.alreadyCompletedAutoCommentForTweet(userID, xAccountID, "rejected_tweet")
	if err != nil {
		t.Fatalf("check rejected task: %v", err)
	}
	if done {
		t.Fatal("expected rejected task not to count as completed")
	}

	ref := "activity_tweet"
	if err := db.Create(&model.ActivityLog{
		UserID:              userID,
		XAccountID:          xAccountID,
		Type:                "comment",
		Status:              "success",
		PreviewKey:          "activity.preview.commentSuccess",
		AccountHandle:       "@octo_agent_flow",
		ExecutedAt:          now,
		RefTweetID:          &ref,
		ReplyCommentTweetID: ref,
	}).Error; err != nil {
		t.Fatalf("create comment activity: %v", err)
	}
	done, err = svc.alreadyCompletedAutoCommentForTweet(userID, xAccountID, ref)
	if err != nil {
		t.Fatalf("check comment activity: %v", err)
	}
	if !done {
		t.Fatal("expected successful comment activity to count as completed")
	}
}

func TestBestAutoCommentTweetCandidateSkipsCompletedTweets(t *testing.T) {
	svc, db := newAutoCommentCompletionGuardTestService(t)
	userID := uint(8)
	xAccountID := uint(12)
	now := time.Now().UTC()
	ref := "already_commented"
	if err := db.Create(&model.ActivityLog{
		UserID:              userID,
		XAccountID:          xAccountID,
		Type:                "comment",
		Status:              "success",
		PreviewKey:          "activity.preview.commentSuccess",
		AccountHandle:       "@octo_agent_flow",
		ExecutedAt:          now,
		RefTweetID:          &ref,
		ReplyCommentTweetID: ref,
	}).Error; err != nil {
		t.Fatalf("create comment activity: %v", err)
	}

	target := model.AutoCommentTarget{UserID: userID, XAccountID: xAccountID, TargetUsername: "target_kol", Priority: 5}
	bot := &model.OAFBot{
		Keywords: encodeStringList([]string{"AI Agent", "SocialFi", "X Growth"}),
		Topics:   encodeStringList([]string{"automation"}),
	}
	candidate, ok, err := svc.bestAutoCommentTweetCandidate(target, []twitter.UserTweet{
		{ID: ref, Text: "How are teams using AI Agent automation to improve X Growth without sounding spammy?", CreatedAt: now},
		{ID: "fresh_candidate", Text: "How are SocialFi teams using AI Agent automation to improve X Growth without sounding spammy?", CreatedAt: now.Add(-time.Minute)},
	}, bot, nil)
	if err != nil {
		t.Fatalf("select candidate: %v", err)
	}
	if !ok {
		t.Fatal("expected fresh candidate after skipping completed tweet")
	}
	if candidate.Tweet.ID != "fresh_candidate" {
		t.Fatalf("expected completed tweet to be skipped, got %s", candidate.Tweet.ID)
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

func TestDetectTargetTweetLanguage(t *testing.T) {
	if got := detectTargetTweetLanguage("或许这是真正的 $ETH Bottom Signal，以太坊基金会要退居 2 线。"); got != "Chinese" {
		t.Fatalf("expected Chinese target language, got %q", got)
	}
	if got := detectTargetTweetLanguage("How are teams using AI agents for X growth?"); got != "English" {
		t.Fatalf("expected English target language, got %q", got)
	}
}

func TestAutoCommentInputCarriesTargetLanguage(t *testing.T) {
	got := autoCommentInputFromValues("0xtodd", "中文推文应该生成中文评论。", "Friendly", nil, nil)
	if got.TargetLanguage != "Chinese" {
		t.Fatalf("expected target language to be detected, got %q", got.TargetLanguage)
	}
}

func TestFillAutoCommentTargetSuggestionsFallsBack(t *testing.T) {
	got := fillAutoCommentTargetSuggestions(nil, []string{"hosseeb", "KyleSamani"}, 4)
	if len(got) != 4 {
		t.Fatalf("expected fallback to fill four suggestions, got %#v", got)
	}
	for _, item := range got {
		if item.Handle == "hosseeb" || item.Handle == "kylesamani" {
			t.Fatalf("fallback should skip existing targets, got %#v", got)
		}
		if item.Priority < 1 || item.Priority > 5 {
			t.Fatalf("expected normalized priority, got %#v", item)
		}
	}
}

func TestHasRecentAutoCommentCandidateTweet(t *testing.T) {
	now := time.Date(2026, 5, 29, 12, 0, 0, 0, time.UTC)
	if !hasRecentAutoCommentCandidateTweet([]twitter.UserTweet{{ID: "1", CreatedAt: now.Add(-24 * time.Hour)}}, now, 45*24*time.Hour) {
		t.Fatal("expected recent tweet to pass")
	}
	if hasRecentAutoCommentCandidateTweet([]twitter.UserTweet{{ID: "1", CreatedAt: now.Add(-90 * 24 * time.Hour)}}, now, 45*24*time.Hour) {
		t.Fatal("expected stale tweet to fail")
	}
	if hasRecentAutoCommentCandidateTweet(nil, now, 45*24*time.Hour) {
		t.Fatal("expected empty tweets to fail")
	}
}

func TestAutoCommentSuggestionCandidateLimitScalesWithRemainingSlots(t *testing.T) {
	if got := autoCommentSuggestionCandidateLimit(2); got != 32 {
		t.Fatalf("small plans should still validate a useful candidate pool, got %d", got)
	}
	if got := autoCommentSuggestionCandidateLimit(30); got != 120 {
		t.Fatalf("pro plans should scale candidate checks with remaining slots, got %d", got)
	}
	if got := autoCommentSuggestionCandidateLimit(80); got != 240 {
		t.Fatalf("pro+ candidate checks should be capped, got %d", got)
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

func TestAutoCommentScanIntervalUsesPlanAndPriority(t *testing.T) {
	if got := autoCommentScanInterval(subscription.PlanFreeTrial, 5); got != 96*time.Hour {
		t.Fatalf("free trial priority 5 interval = %s", got)
	}
	if got := autoCommentScanInterval(subscription.PlanBasic, 2); got != 0 {
		t.Fatalf("basic priority 2 should be disabled, got %s", got)
	}
	if got := autoCommentScanInterval(subscription.PlanProPlus, 5); got != 6*time.Hour {
		t.Fatalf("pro+ priority 5 interval = %s", got)
	}
}

func TestAutoCommentPlanLimitsExposeTargetsAndScans(t *testing.T) {
	trial := subscription.FreeTrialLimits()
	if trial.AutoCommentTargets != 2 || trial.MonthlyAutoCommentScans != 20 {
		t.Fatalf("unexpected free trial auto comment limits: targets=%d scans=%d", trial.AutoCommentTargets, trial.MonthlyAutoCommentScans)
	}
	basic := subscription.LimitsForPlan(subscription.PlanBasic)
	if basic.AutoCommentTargets != 3 || basic.MonthlyAutoCommentScans != 30 {
		t.Fatalf("unexpected basic auto comment limits: targets=%d scans=%d", basic.AutoCommentTargets, basic.MonthlyAutoCommentScans)
	}
	proPlus := subscription.LimitsForPlan(subscription.PlanProPlus)
	if proPlus.AutoCommentTargets != 80 || proPlus.MonthlyAutoCommentScans != 2400 {
		t.Fatalf("unexpected pro+ auto comment limits: targets=%d scans=%d", proPlus.AutoCommentTargets, proPlus.MonthlyAutoCommentScans)
	}
}

func TestAutoCommentTargetDueForScan(t *testing.T) {
	now := time.Date(2026, 5, 29, 12, 0, 0, 0, time.UTC)
	user := &model.User{SubscriptionPlanCode: subscription.PlanPlus}
	checked := now.Add(-23 * time.Hour)
	target := model.AutoCommentTarget{Priority: 5, LastCheckedAt: &checked}
	if due, _ := autoCommentTargetDueForScan(target, user, now); due {
		t.Fatalf("plus priority 5 should wait 24h between scans")
	}
	checked = now.Add(-25 * time.Hour)
	target.LastCheckedAt = &checked
	if due, _ := autoCommentTargetDueForScan(target, user, now); !due {
		t.Fatalf("plus priority 5 should be due after 24h")
	}
}

func TestDecideAutoCommentDeliveryRequiresMentionForAPIReply(t *testing.T) {
	account := model.TwitterAccount{Username: "octo_agent_flow"}

	manual := decideAutoCommentDelivery("Great thread about SocialFi operations.", "target_kol", "123", account, "Useful lens.")
	if manual.Mode != autoCommentDeliveryManualComment || manual.Eligible {
		t.Fatalf("expected non-mentioned target tweet to become manual suggestion, got %#v", manual)
	}
	if manual.BlockReason != "not_mentioned_or_engaged" {
		t.Fatalf("expected reply block reason, got %s", manual.BlockReason)
	}
	if manual.ManualURL != "https://x.com/target_kol/status/123" {
		t.Fatalf("unexpected manual url: %s", manual.ManualURL)
	}

	auto := decideAutoCommentDelivery("Curious how @octo_agent_flow would handle this workflow.", "target_kol", "456", account, "We would start from queue quality.")
	if auto.Mode != autoCommentDeliveryAutoComment || !auto.Eligible {
		t.Fatalf("expected mentioned tweet to be API reply eligible, got %#v", auto)
	}
}

func TestApplyAutoCommentDeliveryDowngradesAutopilotManualSuggestion(t *testing.T) {
	now := time.Now().UTC()
	task := &model.AutoCommentTask{
		Status:           "ready_to_publish",
		CapabilityStatus: "autopilot_prepared",
		ApprovalRequired: false,
		ApprovedAt:       &now,
	}

	applyAutoCommentDelivery(task, autoCommentDeliveryDecision{
		Mode:        autoCommentDeliveryManualComment,
		Reason:      "manual",
		Eligible:    false,
		BlockReason: "not_mentioned_or_engaged",
		ManualURL:   "https://x.com/target/status/1",
	})

	if task.Status != "pending_review" || task.CapabilityStatus != "manual_comment_suggested" || !task.ApprovalRequired || task.ApprovedAt != nil {
		t.Fatalf("expected manual delivery to downgrade autopilot task, got status=%s capability=%s approval=%v approved=%v", task.Status, task.CapabilityStatus, task.ApprovalRequired, task.ApprovedAt)
	}
}
