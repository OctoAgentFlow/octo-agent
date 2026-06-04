package service

import (
	"context"
	"fmt"
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
		repository.NewTwitterAccountRepository(db),
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

func TestDailyXQueueSetupCanUseExistingOAFBotWithoutCreatingDuplicate(t *testing.T) {
	svc, db := newDailyXQueueTestService(t)
	userID := uint(34)
	bot := &model.OAFBot{
		UserID:          userID,
		Name:            "Founder Operator Bot",
		ProjectOneLiner: "OctoAgentFlow runs AI social operations through OAF Bot memory and review queues.",
		TargetAudience:  "SaaS founders",
		VoiceTone:       "concise founder/operator",
		ComplianceNotes: "no guaranteed growth",
		SafetyMode:      "balanced",
	}
	if err := db.Create(bot).Error; err != nil {
		t.Fatalf("create bot: %v", err)
	}

	setup, err := svc.Setup(context.Background(), userID, dto.DailyXQueueSetupRequest{
		BotID:   bot.ID,
		XHandle: "octo_agent_flow",
	})
	if err != nil {
		t.Fatalf("setup with existing bot: %v", err)
	}
	if setup.Context.BotID != bot.ID {
		t.Fatalf("expected context to use existing bot %d, got %d", bot.ID, setup.Context.BotID)
	}
	if setup.Context.ProductContext != bot.ProjectOneLiner {
		t.Fatalf("expected product context from selected bot, got %q", setup.Context.ProductContext)
	}
	var botCount int64
	if err := db.Model(&model.OAFBot{}).Where("user_id = ?", userID).Count(&botCount).Error; err != nil {
		t.Fatalf("count bots: %v", err)
	}
	if botCount != 1 {
		t.Fatalf("expected no duplicate OAF Bot, got %d bots", botCount)
	}

	if _, err := svc.SaveSourceMaterial(userID, dto.DailyXQueueSourceMaterialRequest{
		Title: "Daily source",
		Body:  "A trusted source for today's queue.",
	}); err != nil {
		t.Fatalf("source material: %v", err)
	}
	var captured GenerateAutoPostInput
	svc.generateText = func(_ context.Context, in GenerateAutoPostInput) (AIGeneratedText, error) {
		if captured.Name == "" {
			captured = in
		}
		return AIGeneratedText{Text: "Selected bot generated this daily draft."}, nil
	}
	generated, err := svc.Generate(context.Background(), userID)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if len(generated.Drafts) != 3 {
		t.Fatalf("expected exactly 3 drafts, got %d", len(generated.Drafts))
	}
	if generated.Drafts[0].BotID != bot.ID {
		t.Fatalf("expected generated draft to use selected bot %d, got %d", bot.ID, generated.Drafts[0].BotID)
	}
	if captured.Name != bot.Name || captured.ProjectOneLiner != bot.ProjectOneLiner {
		t.Fatalf("expected generation input from selected bot, got name=%q one_liner=%q", captured.Name, captured.ProjectOneLiner)
	}
}

func TestDailyXQueueCanSelectExistingContentLibraryItemForOAFBot(t *testing.T) {
	svc, db := newDailyXQueueTestService(t)
	userID := uint(35)
	bot := &model.OAFBot{
		UserID:          userID,
		Name:            "Content Pool Bot",
		ProjectOneLiner: "OctoAgentFlow uses OAF Bot content memory for daily drafts.",
		VoiceTone:       "concise operator",
	}
	if err := db.Create(bot).Error; err != nil {
		t.Fatalf("create bot: %v", err)
	}
	contentBotID := bot.ID
	item := &model.ContentLibraryItem{
		UserID:   userID,
		BotID:    &contentBotID,
		Title:    "Configured content pool source",
		ItemType: "idea",
		Body:     "A configured content pool item should feed today's OAF Bot drafts.",
		Status:   "active",
		Priority: 80,
	}
	if err := db.Create(item).Error; err != nil {
		t.Fatalf("create content item: %v", err)
	}
	if _, err := svc.Setup(context.Background(), userID, dto.DailyXQueueSetupRequest{
		BotID:   bot.ID,
		XHandle: "octo_agent_flow",
	}); err != nil {
		t.Fatalf("setup: %v", err)
	}

	selected, err := svc.SelectSourceMaterial(userID, dto.DailyXQueueSelectSourceMaterialRequest{ContentLibraryID: item.ID})
	if err != nil {
		t.Fatalf("select source material: %v", err)
	}
	if selected.Context.ContentLibraryID != item.ID {
		t.Fatalf("expected context source %d, got %d", item.ID, selected.Context.ContentLibraryID)
	}
	if selected.SourceMaterial.Title != item.Title {
		t.Fatalf("expected selected source title %q, got %q", item.Title, selected.SourceMaterial.Title)
	}
	var captured GenerateAutoPostInput
	svc.generateText = func(_ context.Context, in GenerateAutoPostInput) (AIGeneratedText, error) {
		if captured.ContentItemTitle == "" {
			captured = in
		}
		return AIGeneratedText{Text: "Draft grounded in selected content pool source."}, nil
	}
	generated, err := svc.Generate(context.Background(), userID)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if len(generated.Drafts) != 3 {
		t.Fatalf("expected exactly 3 drafts, got %d", len(generated.Drafts))
	}
	if captured.ContentItemTitle != item.Title || captured.ContentItemBody != item.Body {
		t.Fatalf("expected selected content item in generation input, got title=%q body=%q", captured.ContentItemTitle, captured.ContentItemBody)
	}
}

func TestDailyXQueueRejectsSourceMaterialFromAnotherOAFBot(t *testing.T) {
	svc, db := newDailyXQueueTestService(t)
	userID := uint(36)
	bot := &model.OAFBot{UserID: userID, Name: "Selected Bot", ProjectOneLiner: "Selected bot context"}
	otherBot := &model.OAFBot{UserID: userID, Name: "Other Bot", ProjectOneLiner: "Other bot context"}
	if err := db.Create(bot).Error; err != nil {
		t.Fatalf("create bot: %v", err)
	}
	if err := db.Create(otherBot).Error; err != nil {
		t.Fatalf("create other bot: %v", err)
	}
	otherBotID := otherBot.ID
	item := &model.ContentLibraryItem{
		UserID:   userID,
		BotID:    &otherBotID,
		Title:    "Other bot source",
		ItemType: "idea",
		Body:     "This source belongs to another OAF Bot.",
		Status:   "active",
	}
	if err := db.Create(item).Error; err != nil {
		t.Fatalf("create content item: %v", err)
	}
	if _, err := svc.Setup(context.Background(), userID, dto.DailyXQueueSetupRequest{
		BotID:   bot.ID,
		XHandle: "octo_agent_flow",
	}); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if _, err := svc.SelectSourceMaterial(userID, dto.DailyXQueueSelectSourceMaterialRequest{ContentLibraryID: item.ID}); err == nil {
		t.Fatal("expected source material from another OAF Bot to be rejected")
	}
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

func TestDailyXQueueDirectionsUseDistinctBatchAngles(t *testing.T) {
	directions := dailyXQueueDirections("Daily X Queue as OAF Bot workflow")
	if len(directions) != dailyXQueueDraftCount {
		t.Fatalf("expected %d directions, got %d", dailyXQueueDraftCount, len(directions))
	}
	expectedPrefixes := []string{"Operator pain:", "Workflow proof:", "OAF Bot memory boundary:"}
	for i, prefix := range expectedPrefixes {
		if !strings.HasPrefix(directions[i], prefix) {
			t.Fatalf("direction %d should start with %q, got %q", i, prefix, directions[i])
		}
	}
	if !strings.Contains(directions[1], "only batch draft allowed") {
		t.Fatalf("workflow direction should be the only review-first centered draft, got %q", directions[1])
	}
	if !strings.Contains(directions[0], "first sentence must not mention Daily X Queue") {
		t.Fatalf("operator pain direction should keep product language out of the first sentence, got %q", directions[0])
	}
	if !strings.Contains(directions[2], "trusted source material remains the factual base") {
		t.Fatalf("memory direction should distinguish memory from facts, got %q", directions[2])
	}
	if !strings.Contains(directions[2], "not product documentation") {
		t.Fatalf("memory direction should ask for operator language, got %q", directions[2])
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

func TestDailyXQueueStoresCompleteDraftsWhenGeneratorReturnsLongText(t *testing.T) {
	svc, _ := newDailyXQueueTestService(t)
	userID := uint(31)
	setupDailyXQueueFixture(t, svc, userID)
	svc.generateText = func(_ context.Context, _ GenerateAutoPostInput) (AIGeneratedText, error) {
		return AIGeneratedText{Text: strings.Repeat("Daily X Queue keeps review first. ", 12) + "Trailing unfinished fragment"}, nil
	}

	generated, err := svc.Generate(context.Background(), userID)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	for _, draft := range generated.Drafts {
		if !endsLikeCompleteSentence(draft.GeneratedContent) {
			t.Fatalf("expected complete sentence, got %q", draft.GeneratedContent)
		}
		if xPostCharacterCount(draft.GeneratedContent) > 220 {
			t.Fatalf("expected Daily X Queue draft <= 220 weighted chars, got %d: %q", xPostCharacterCount(draft.GeneratedContent), draft.GeneratedContent)
		}
		if strings.Contains(draft.GeneratedContent, "Trailing unfinished fragment") {
			t.Fatalf("expected trailing unfinished fragment to be removed, got %q", draft.GeneratedContent)
		}
	}
}

func TestDailyXQueueNextGenerationUsesRejectedDraftsAndFeedbackToAvoidRepeating(t *testing.T) {
	svc, _ := newDailyXQueueTestService(t)
	userID := uint(32)
	setupDailyXQueueFixture(t, svc, userID)
	calls := 0
	svc.generateText = func(_ context.Context, in GenerateAutoPostInput) (AIGeneratedText, error) {
		calls++
		return AIGeneratedText{Text: fmt.Sprintf("Rejected template draft %d for %s.", calls, in.ContentDirection)}, nil
	}
	first, err := svc.Generate(context.Background(), userID)
	if err != nil {
		t.Fatalf("first generate: %v", err)
	}
	for _, draft := range first.Drafts {
		if _, err := svc.RejectDraft(userID, draft.ID, "duplicate"); err != nil {
			t.Fatalf("reject: %v", err)
		}
	}

	var captured GenerateAutoPostInput
	svc.generateText = func(_ context.Context, in GenerateAutoPostInput) (AIGeneratedText, error) {
		if captured.ContentDirection == "" {
			captured = in
		}
		return AIGeneratedText{Text: "A better Daily X Queue post starts with the operator problem, then shows the review loop."}, nil
	}
	if _, err := svc.Generate(context.Background(), userID); err != nil {
		t.Fatalf("second generate: %v", err)
	}
	if len(captured.RecentPosts) == 0 {
		t.Fatal("expected rejected/recent drafts to be passed into next generation")
	}
	if !strings.Contains(strings.Join(captured.RecentPosts, "\n"), "Rejected template draft") {
		t.Fatalf("expected previous rejected draft text in recent posts, got %#v", captured.RecentPosts)
	}
	signals := strings.Join(captured.FeedbackSignals, "\n")
	if !strings.Contains(signals, "duplicate") {
		t.Fatalf("expected duplicate feedback signal, got %q", signals)
	}
	if !strings.Contains(signals, "different opening") {
		t.Fatalf("expected actionable duplicate learning instruction, got %q", signals)
	}
}

func TestDailyXQueueApproveAndCopyCreateOAFBotMemoryForNextGeneration(t *testing.T) {
	svc, db := newDailyXQueueTestService(t)
	userID := uint(33)
	setupDailyXQueueFixture(t, svc, userID)
	generated, err := svc.Generate(context.Background(), userID)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if _, err := svc.ApproveDraft(userID, generated.Drafts[0].ID); err != nil {
		t.Fatalf("approve: %v", err)
	}
	if _, err := svc.CopyDraft(userID, generated.Drafts[1].ID); err != nil {
		t.Fatalf("copy: %v", err)
	}
	var feedbackRows []model.OAFBotGenerationFeedback
	if err := db.Where("user_id = ? AND rating = ?", userID, "positive").Order("id ASC").Find(&feedbackRows).Error; err != nil {
		t.Fatalf("load positive feedback: %v", err)
	}
	joinedTags := ""
	for _, row := range feedbackRows {
		joinedTags += row.IssueTags + "\n"
	}
	if !strings.Contains(joinedTags, "approved_example") {
		t.Fatalf("expected approved_example memory, got %s", joinedTags)
	}
	if !strings.Contains(joinedTags, "useful_output") {
		t.Fatalf("expected useful_output memory, got %s", joinedTags)
	}

	var captured GenerateAutoPostInput
	svc.generateText = func(_ context.Context, in GenerateAutoPostInput) (AIGeneratedText, error) {
		if captured.ContentDirection == "" {
			captured = in
		}
		return AIGeneratedText{Text: "A queue that learns from approved and copied examples keeps the account voice sharper."}, nil
	}
	if _, err := svc.Generate(context.Background(), userID); err != nil {
		t.Fatalf("second generate: %v", err)
	}
	signals := strings.Join(captured.FeedbackSignals, "\n")
	if !strings.Contains(signals, "approved_example") || !strings.Contains(signals, "useful_output") {
		t.Fatalf("expected approved/copied memory signals, got %q", signals)
	}
	if !strings.Contains(signals, "voice_style_reference_only") || !strings.Contains(signals, "do_not_treat_as_fact_source=true") {
		t.Fatalf("expected style-only memory guardrails, got %q", signals)
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
