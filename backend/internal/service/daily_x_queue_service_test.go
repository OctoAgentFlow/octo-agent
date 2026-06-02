package service

import (
	"context"
	"strings"
	"testing"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newDailyXQueueTestService(t *testing.T) (*DailyXQueueService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&model.User{},
		&model.TwitterAccount{},
		&model.DailyXQueueContext{},
		&model.OAFBot{},
		&model.ContentLibraryItem{},
		&model.AutoPostPlan{},
		&model.AutoPostDraft{},
		&model.AutoReplyDraft{},
		&model.AutoCommentTask{},
		&model.PublishJob{},
		&model.OAFBotGenerationFeedback{},
		&model.ActivityLog{},
		&model.AIGenerationUsage{},
		&model.CostUsageLedger{},
		&model.ReviewQueueFeedbackIssueVerdict{},
		&model.OAFBotLearningRulePreference{},
	); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	svc := NewDailyXQueueService(
		repository.NewDailyXQueueContextRepository(db),
		repository.NewOAFBotRepository(db),
		repository.NewContentLibraryRepository(db),
		repository.NewAutoPostDraftRepository(db),
		repository.NewAIGenerationUsageRepository(db),
		repository.NewOAFBotGenerationFeedbackRepository(db),
		repository.NewActivityRepository(db),
		repository.NewReviewQueueFeedbackIssueVerdictRepository(db),
		repository.NewOAFBotLearningRulePreferenceRepository(db),
		nil,
		nil,
	)
	svc.generateText = func(_ context.Context, in GenerateAutoPostInput) (AIGeneratedText, error) {
		return AIGeneratedText{Text: "Draft for " + in.ContentDirection}, nil
	}
	svc.rewriteText = func(_ context.Context, _ GenerateAutoPostInput, _ string, mode string, _ string) (AIGeneratedText, error) {
		return AIGeneratedText{Text: "Rewritten draft with " + mode}, nil
	}
	return svc, db
}

func setupDailyXQueueFixture(t *testing.T, svc *DailyXQueueService, userID uint) {
	t.Helper()
	if _, err := svc.Setup(context.Background(), userID, dto.DailyXQueueSetupRequest{
		XHandle:         "@octo_agent_flow",
		ProductContext:  "AI social operations workflow for X accounts.",
		TargetAudience:  "Web3 founders",
		VoicePreference: "concise founder/operator",
		Guardrails:      "no guaranteed growth",
	}); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if _, err := svc.SaveSourceMaterial(userID, dto.DailyXQueueSourceMaterialRequest{
		Title:         "Daily X Queue",
		Body:          "Generate a daily review queue with persona, memory, guardrails, and human review.",
		GrowthGoal:    "Help founders operate X daily.",
		CTAPreference: "Ask for feedback.",
	}); err != nil {
		t.Fatalf("source material: %v", err)
	}
}

func TestDailyXQueueFreshUserWithoutOAuthCanSetupSourceAndGenerateExactlyThreeDrafts(t *testing.T) {
	svc, db := newDailyXQueueTestService(t)
	userID := uint(1)
	setupDailyXQueueFixture(t, svc, userID)

	var accountCount int64
	if err := db.Model(&model.TwitterAccount{}).Count(&accountCount).Error; err != nil {
		t.Fatalf("count twitter accounts: %v", err)
	}
	if accountCount != 0 {
		t.Fatalf("expected no twitter account rows, got %d", accountCount)
	}

	out, err := svc.Generate(context.Background(), userID)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if len(out.Drafts) != 3 {
		t.Fatalf("expected exactly 3 drafts, got %d", len(out.Drafts))
	}
	for _, draft := range out.Drafts {
		if draft.XAccountID != 0 || draft.PlanID != 0 {
			t.Fatalf("daily queue draft should not use account/plan, got account=%d plan=%d", draft.XAccountID, draft.PlanID)
		}
		if draft.Status != "pending_review" {
			t.Fatalf("expected pending review draft, got %s", draft.Status)
		}
	}
}

func TestDailyXQueueApproveDoesNotPublishOrSchedule(t *testing.T) {
	svc, db := newDailyXQueueTestService(t)
	userID := uint(2)
	setupDailyXQueueFixture(t, svc, userID)
	generated, err := svc.Generate(context.Background(), userID)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	res, err := svc.ApproveDraft(userID, generated.Drafts[0].ID)
	if err != nil {
		t.Fatalf("approve: %v", err)
	}
	if res.Draft.Status != "approved" {
		t.Fatalf("expected approved status, got %s", res.Draft.Status)
	}
	var publishJobs int64
	if err := db.Table("publish_jobs").Count(&publishJobs).Error; err == nil && publishJobs != 0 {
		t.Fatalf("approve should not create publish jobs, got %d", publishJobs)
	}
	var plans int64
	if err := db.Table("auto_post_plans").Count(&plans).Error; err == nil && plans != 0 {
		t.Fatalf("approve should not create schedules/plans, got %d", plans)
	}
}

func TestDailyXQueueDraftsCannotEnterLegacyAutoPostReviewQueueOrPublishingPaths(t *testing.T) {
	svc, db := newDailyXQueueTestService(t)
	userID := uint(22)
	setupDailyXQueueFixture(t, svc, userID)
	generated, err := svc.Generate(context.Background(), userID)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	draftID := generated.Drafts[0].ID

	autoPost := NewAutoPostService(
		nil,
		nil,
		repository.NewAutoPostPlanRepository(db),
		repository.NewAutoPostDraftRepository(db),
		repository.NewAutoPostGenerationRunRepository(db),
		repository.NewContentLibraryRepository(db),
		repository.NewActivityRepository(db),
		nil,
		repository.NewOAFBotRepository(db),
		repository.NewAIGenerationUsageRepository(db),
		repository.NewOAFBotGenerationFeedbackRepository(db),
		repository.NewReviewQueueFeedbackIssueVerdictRepository(db),
		repository.NewOAFBotLearningRulePreferenceRepository(db),
		nil,
		nil,
		nil,
	)
	if _, err := autoPost.ApproveDraft(userID, draftID); err == nil {
		t.Fatal("legacy Auto Post approve should reject Daily X Queue drafts")
	}
	if _, err := autoPost.PreparePublish(userID, draftID); err == nil {
		t.Fatal("legacy Auto Post prepare publish should reject Daily X Queue drafts")
	}
	list, err := autoPost.ListDrafts(userID)
	if err != nil {
		t.Fatalf("list drafts: %v", err)
	}
	if len(list.Items) != 0 {
		t.Fatalf("daily queue drafts should not appear in Auto Post list, got %d", len(list.Items))
	}

	reviewQueue := NewReviewQueueService(
		repository.NewAutoCommentTaskRepository(db),
		repository.NewAutoReplyDraftRepository(db),
		repository.NewAutoPostDraftRepository(db),
		repository.NewPublishJobRepository(db),
		repository.NewOAFBotRepository(db),
		repository.NewTwitterAccountRepository(db),
		repository.NewContentLibraryRepository(db),
		repository.NewReviewQueueFeedbackIssueVerdictRepository(db),
		repository.NewActivityRepository(db),
		nil,
		nil,
		autoPost,
		nil,
	)
	queue, err := reviewQueue.List(userID, dto.ReviewQueueQuery{})
	if err != nil {
		t.Fatalf("review queue list: %v", err)
	}
	for _, item := range queue.Items {
		if item.Type == "post" && item.SourceID == draftID {
			t.Fatalf("daily queue draft leaked into review queue: %#v", item)
		}
	}

	publishing := NewPublishingService(
		repository.NewPublishJobRepository(db),
		repository.NewAutoCommentTaskRepository(db),
		repository.NewAutoReplyDraftRepository(db),
		repository.NewAutoPostDraftRepository(db),
		repository.NewTwitterAccountRepository(db),
		nil,
		nil,
		repository.NewActivityRepository(db),
		config.XPublisherConfig{},
		config.XOAuthConfig{},
		nil,
	)
	if _, err := svc.ApproveDraft(userID, draftID); err != nil {
		t.Fatalf("daily queue approve before publishing guard check: %v", err)
	}
	draft, err := repository.NewAutoPostDraftRepository(db).GetByUserAndID(userID, draftID)
	if err != nil {
		t.Fatalf("load draft: %v", err)
	}
	if _, _, err := publishing.EnsurePostJob(draft, draft.CreatedAt); err == nil {
		t.Fatal("publishing pipeline should reject Daily X Queue drafts")
	}
	var jobs int64
	db.Model(&model.PublishJob{}).Where("user_id = ?", userID).Count(&jobs)
	if jobs != 0 {
		t.Fatalf("expected no publish jobs for daily queue draft, got %d", jobs)
	}
}

func TestDailyXQueueRejectRequiresReasonAndCreatesNegativeFeedback(t *testing.T) {
	svc, db := newDailyXQueueTestService(t)
	userID := uint(3)
	setupDailyXQueueFixture(t, svc, userID)
	generated, err := svc.Generate(context.Background(), userID)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	if _, err := svc.RejectDraft(userID, generated.Drafts[0].ID, ""); err == nil {
		t.Fatal("expected empty reject reason to fail")
	}
	if _, err := svc.RejectDraft(userID, generated.Drafts[0].ID, "too_salesy"); err != nil {
		t.Fatalf("reject: %v", err)
	}
	var feedback model.OAFBotGenerationFeedback
	if err := db.Where("user_id = ? AND rating = ?", userID, "negative").First(&feedback).Error; err != nil {
		t.Fatalf("negative feedback not created: %v", err)
	}
	if !strings.Contains(feedback.IssueTags, "too_salesy") {
		t.Fatalf("expected too_salesy feedback, got %s", feedback.IssueTags)
	}
}

func TestDailyXQueueEditCopyAndActivationEvent(t *testing.T) {
	svc, db := newDailyXQueueTestService(t)
	userID := uint(4)
	setupDailyXQueueFixture(t, svc, userID)
	generated, err := svc.Generate(context.Background(), userID)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	if _, err := svc.UpdateDraft(userID, generated.Drafts[0].ID, "Edited draft with more specific product context."); err != nil {
		t.Fatalf("edit: %v", err)
	}
	if _, err := svc.CopyDraft(userID, generated.Drafts[0].ID); err != nil {
		t.Fatalf("copy: %v", err)
	}
	var activationBefore int64
	db.Model(&model.ActivityLog{}).Where("user_id = ? AND preview_key = ?", userID, dailyXQueuePreviewActivated).Count(&activationBefore)
	if activationBefore != 0 {
		t.Fatalf("activation should not happen before 3 review actions, got %d", activationBefore)
	}
	if _, err := svc.ApproveDraft(userID, generated.Drafts[1].ID); err != nil {
		t.Fatalf("approve: %v", err)
	}

	var activationAfter int64
	db.Model(&model.ActivityLog{}).Where("user_id = ? AND preview_key = ?", userID, dailyXQueuePreviewActivated).Count(&activationAfter)
	if activationAfter != 1 {
		t.Fatalf("expected activation event after 3 review actions and approved/copied output, got %d", activationAfter)
	}
	var editEvents int64
	db.Model(&model.ActivityLog{}).Where("user_id = ? AND preview_key = ?", userID, dailyXQueuePreviewEdited).Count(&editEvents)
	if editEvents != 1 {
		t.Fatalf("expected edit activity event, got %d", editEvents)
	}
	var copyEvents int64
	db.Model(&model.ActivityLog{}).Where("user_id = ? AND preview_key = ?", userID, dailyXQueuePreviewCopied).Count(&copyEvents)
	if copyEvents != 1 {
		t.Fatalf("expected copy activity event, got %d", copyEvents)
	}
}
