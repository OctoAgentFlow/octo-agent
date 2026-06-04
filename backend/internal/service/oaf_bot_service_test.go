package service

import (
	"testing"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newOAFBotDeleteTestService(t *testing.T) (*OAFBotService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&model.User{},
		&model.OAFBot{},
		&model.AutoPostPlan{},
		&model.AutoPostDraft{},
		&model.AutoReplyDraft{},
		&model.AutoCommentTask{},
		&model.AutoPostGenerationRun{},
		&model.PublishJob{},
		&model.ContentLibraryItem{},
		&model.OAFBotGenerationFeedback{},
		&model.OAFBotLearningRulePreference{},
		&model.AIGenerationUsage{},
		&model.CostUsageLedger{},
		&model.TrendFeedback{},
		&model.ReviewQueueFeedbackIssueVerdict{},
		&model.DailyXQueueContext{},
	); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	return NewOAFBotService(
		repository.NewOAFBotRepository(db),
		repository.NewTwitterAccountRepository(db),
		repository.NewUserRepository(db),
		repository.NewAIGenerationUsageRepository(db),
		repository.NewOAFBotGenerationFeedbackRepository(db),
		repository.NewAutoPostPlanRepository(db),
		repository.NewContentLibraryRepository(db),
		repository.NewAutoPostDraftRepository(db),
		repository.NewAutoReplyDraftRepository(db),
		repository.NewAutoCommentTaskRepository(db),
		repository.NewReviewQueueFeedbackIssueVerdictRepository(db),
		repository.NewOAFBotLearningRulePreferenceRepository(db),
		nil,
	), db
}

func TestOAFBotCreateUpdatePreservesCustomOccupation(t *testing.T) {
	svc, db := newOAFBotDeleteTestService(t)
	user := model.User{Email: "custom-occupation@example.com", Name: "Custom Occupation", Status: "active", Role: "user"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	customOccupation := "AI social operations product operator"
	created, err := svc.Create(user.ID, dto.OAFBotUpsertRequest{
		Name:       "OctoAgentFlow Bot",
		Occupation: customOccupation,
		Topics:     []string{"AI social operations"},
	})
	if err != nil {
		t.Fatalf("create bot: %v", err)
	}
	if created.Occupation != customOccupation {
		t.Fatalf("expected custom occupation %q, got %q", customOccupation, created.Occupation)
	}

	loaded, err := svc.Get(user.ID, created.ID)
	if err != nil {
		t.Fatalf("load bot: %v", err)
	}
	if loaded.Occupation != customOccupation {
		t.Fatalf("expected loaded custom occupation %q, got %q", customOccupation, loaded.Occupation)
	}

	updatedOccupation := "Founder/operator building AI social operations workflows"
	updated, err := svc.Update(user.ID, created.ID, dto.OAFBotUpsertRequest{
		Name:       created.Name,
		Occupation: updatedOccupation,
		Topics:     []string{"AI social operations"},
	})
	if err != nil {
		t.Fatalf("update bot: %v", err)
	}
	if updated.Occupation != updatedOccupation {
		t.Fatalf("expected updated custom occupation %q, got %q", updatedOccupation, updated.Occupation)
	}
}

func TestOAFBotDeleteCleansReferencesAndCancelsPendingPublishJobs(t *testing.T) {
	svc, db := newOAFBotDeleteTestService(t)
	userID := uint(1)
	otherUserID := uint(2)
	bot := model.OAFBot{UserID: userID, Name: "Delete Me"}
	otherBot := model.OAFBot{UserID: otherUserID, Name: "Other User Bot"}
	if err := db.Create(&bot).Error; err != nil {
		t.Fatalf("create bot: %v", err)
	}
	if err := db.Create(&otherBot).Error; err != nil {
		t.Fatalf("create other bot: %v", err)
	}
	botID := bot.ID
	nextRun := time.Now().UTC().Add(time.Hour)
	if err := db.Create(&model.AutoPostPlan{UserID: userID, XAccountID: 10, BotID: botID, Enabled: true, NextRunAt: &nextRun}).Error; err != nil {
		t.Fatalf("create plan: %v", err)
	}
	if err := db.Create(&model.AutoPostDraft{UserID: userID, PlanID: 1, BotID: botID, XAccountID: 10, GeneratedContent: "draft", Status: "pending_review", RiskLevel: "low"}).Error; err != nil {
		t.Fatalf("create post draft: %v", err)
	}
	if err := db.Create(&model.AutoReplyDraft{UserID: userID, BotID: botID, XAccountID: 10, CommentAuthorHandle: "alice", CommentText: "hello", Status: "pending_review", RiskLevel: "low"}).Error; err != nil {
		t.Fatalf("create reply draft: %v", err)
	}
	if err := db.Create(&model.AutoCommentTask{UserID: userID, BotID: botID, XAccountID: 10, TargetID: 1, TargetUsername: "bob", TargetTweetID: "tweet_1", Status: "pending_review", RiskLevel: "low", DetectedAt: time.Now().UTC()}).Error; err != nil {
		t.Fatalf("create comment task: %v", err)
	}
	if err := db.Create(&model.PublishJob{UserID: userID, TwitterAccountID: 10, BotID: botID, SourceType: repository.PublishSourcePost, SourceID: 1, Content: "ready", Status: repository.PublishStatusPending}).Error; err != nil {
		t.Fatalf("create publish job: %v", err)
	}
	contentBotID := botID
	if err := db.Create(&model.ContentLibraryItem{UserID: userID, BotID: &contentBotID, Title: "Bot source", ItemType: "idea", Body: "source", Status: "active"}).Error; err != nil {
		t.Fatalf("create content: %v", err)
	}
	if err := db.Create(&model.OAFBotGenerationFeedback{UserID: userID, BotID: botID, Scene: "tweet", Rating: "negative"}).Error; err != nil {
		t.Fatalf("create feedback: %v", err)
	}
	if err := db.Create(&model.OAFBotLearningRulePreference{UserID: userID, BotID: botID, FeedbackIssue: "too_generic", Status: "enabled"}).Error; err != nil {
		t.Fatalf("create preference: %v", err)
	}
	if err := db.Create(&model.AIGenerationUsage{UserID: userID, BotID: botID, Scene: repository.AIGenerationSceneOAFBotTestGenerate, Month: "2026-06", Count: 2}).Error; err != nil {
		t.Fatalf("create usage: %v", err)
	}
	if err := db.Create(&model.DailyXQueueContext{UserID: userID, XHandle: "octo_agent_flow", BotID: botID}).Error; err != nil {
		t.Fatalf("create daily context: %v", err)
	}

	if err := svc.Delete(userID, botID); err != nil {
		t.Fatalf("delete bot: %v", err)
	}

	var botCount int64
	db.Model(&model.OAFBot{}).Where("user_id = ? AND id = ?", userID, botID).Count(&botCount)
	if botCount != 0 {
		t.Fatalf("expected bot deleted, got %d", botCount)
	}
	var otherBotCount int64
	db.Model(&model.OAFBot{}).Where("user_id = ? AND id = ?", otherUserID, otherBot.ID).Count(&otherBotCount)
	if otherBotCount != 1 {
		t.Fatalf("expected other user bot to remain, got %d", otherBotCount)
	}
	var plan model.AutoPostPlan
	if err := db.Where("user_id = ? AND x_account_id = ?", userID, 10).First(&plan).Error; err != nil {
		t.Fatalf("load plan: %v", err)
	}
	if plan.BotID != 0 || plan.Enabled || plan.NextRunAt != nil {
		t.Fatalf("expected plan disabled and unbound, got bot=%d enabled=%v next=%v", plan.BotID, plan.Enabled, plan.NextRunAt)
	}
	var job model.PublishJob
	if err := db.Where("user_id = ? AND source_type = ?", userID, repository.PublishSourcePost).First(&job).Error; err != nil {
		t.Fatalf("load publish job: %v", err)
	}
	if job.BotID != 0 || job.Status != repository.PublishStatusCancelled {
		t.Fatalf("expected publish job cancelled and unbound, got bot=%d status=%s", job.BotID, job.Status)
	}
	var content model.ContentLibraryItem
	if err := db.Where("user_id = ? AND title = ?", userID, "Bot source").First(&content).Error; err != nil {
		t.Fatalf("load content: %v", err)
	}
	if content.BotID != nil {
		t.Fatalf("expected content bot binding cleared, got %v", *content.BotID)
	}
	for name, m := range map[string]any{
		"post_drafts":          &model.AutoPostDraft{},
		"reply_drafts":         &model.AutoReplyDraft{},
		"comment_tasks":        &model.AutoCommentTask{},
		"daily_queue_contexts": &model.DailyXQueueContext{},
		"generation_feedback":  &model.OAFBotGenerationFeedback{},
		"learning_preferences": &model.OAFBotLearningRulePreference{},
		"ai_generation_usages": &model.AIGenerationUsage{},
	} {
		var n int64
		db.Model(m).Where("user_id = ? AND bot_id = ?", userID, botID).Count(&n)
		if n != 0 {
			t.Fatalf("expected %s to have no rows for deleted bot, got %d", name, n)
		}
	}
}
