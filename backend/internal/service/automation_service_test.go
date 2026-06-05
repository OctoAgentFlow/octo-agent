package service

import (
	"testing"
	"time"

	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newAutomationRuntimeStatusTestService(t *testing.T) (*AutomationService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&model.AutomationConfig{},
		&model.ActivityLog{},
		&model.AutoCommentTask{},
		&model.AutoReplyDraft{},
		&model.AutoPostDraft{},
	); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	return NewAutomationService(
		repository.NewAutomationRepository(db),
		nil,
		repository.NewActivityRepository(db),
		nil,
		nil,
		repository.NewAutoCommentTaskRepository(db),
		repository.NewAutoReplyDraftRepository(db),
		repository.NewAutoPostDraftRepository(db),
	), db
}

func TestAutomationRuntimeStatusCountsCurrentExecutionQueueNeedsReview(t *testing.T) {
	svc, db := newAutomationRuntimeStatusTestService(t)
	userID := uint(42)
	now := time.Now().UTC()

	for i := 0; i < 164; i++ {
		if err := db.Create(&model.ActivityLog{
			UserID:        userID,
			Type:          "system",
			Status:        "review",
			PreviewKey:    "activity.preview.historicalReview",
			AccountHandle: "Octo-Agent",
			ExecutedAt:    now.Add(-time.Duration(i) * time.Minute),
		}).Error; err != nil {
			t.Fatalf("create historical activity: %v", err)
		}
	}

	commentStatuses := []string{"pending_review", "review", "draft", "approved", "handled", "skipped"}
	for i, status := range commentStatuses {
		if err := db.Create(&model.AutoCommentTask{
			UserID:           userID,
			BotID:            1,
			XAccountID:       10,
			TargetID:         1,
			TargetUsername:   "target",
			TargetTweetID:    "comment_tweet_" + string(rune('a'+i)),
			Status:           status,
			RiskLevel:        "low",
			CapabilityStatus: "review_required",
			DetectedAt:       now,
		}).Error; err != nil {
			t.Fatalf("create comment task: %v", err)
		}
	}

	replyStatuses := []string{"pending_review", "draft", "approved"}
	for i, status := range replyStatuses {
		if err := db.Create(&model.AutoReplyDraft{
			UserID:              userID,
			BotID:               1,
			XAccountID:          10,
			CommentTweetID:      "reply_tweet_" + string(rune('a'+i)),
			CommentAuthorHandle: "alice",
			CommentText:         "hello",
			Status:              status,
			RiskLevel:           "low",
			CapabilityStatus:    "review_required",
		}).Error; err != nil {
			t.Fatalf("create reply draft: %v", err)
		}
	}

	postDrafts := []model.AutoPostDraft{
		{UserID: userID, PlanID: 1, BotID: 1, XAccountID: 10, GeneratedContent: "pending", Status: "pending_review", RiskLevel: "low", CapabilityStatus: "review_required"},
		{UserID: userID, PlanID: 1, BotID: 1, XAccountID: 10, GeneratedContent: "draft", Status: "draft", RiskLevel: "low", CapabilityStatus: "review_required"},
		{UserID: userID, PlanID: 0, BotID: 1, XAccountID: 0, GeneratedContent: "daily x queue", Status: "pending_review", RiskLevel: "low", CapabilityStatus: "daily_x_queue_review"},
		{UserID: userID, PlanID: 1, BotID: 1, XAccountID: 10, GeneratedContent: "approved", Status: "approved", RiskLevel: "low", CapabilityStatus: "review_required"},
	}
	for i := range postDrafts {
		if err := db.Create(&postDrafts[i]).Error; err != nil {
			t.Fatalf("create post draft: %v", err)
		}
	}

	status, err := svc.RuntimeStatus(userID)
	if err != nil {
		t.Fatalf("runtime status: %v", err)
	}
	if status.NeedsReview != 7 {
		t.Fatalf("expected 7 current execution queue items needing review, got %d", status.NeedsReview)
	}
	if status.QueueDepth != 7 {
		t.Fatalf("expected queue depth to use current queue count, got %d", status.QueueDepth)
	}
}
