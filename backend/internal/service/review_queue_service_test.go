package service

import (
	"context"
	"strings"
	"testing"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newReviewQueueDeleteTestService(t *testing.T) (*ReviewQueueService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&model.AutoCommentTask{},
		&model.AutoReplyDraft{},
		&model.AutoPostDraft{},
		&model.PublishJob{},
		&model.ActivityLog{},
	); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	svc := NewReviewQueueService(
		repository.NewAutoCommentTaskRepository(db),
		repository.NewAutoReplyDraftRepository(db),
		repository.NewAutoPostDraftRepository(db),
		repository.NewPublishJobRepository(db),
		nil,
		nil,
		nil,
		nil,
		repository.NewActivityRepository(db),
		nil,
		nil,
		nil,
		nil,
	)
	return svc, db
}

func TestReviewQueueBulkDeletePostRemovesDraftAndPendingPublishJob(t *testing.T) {
	svc, db := newReviewQueueDeleteTestService(t)
	userID := uint(7)
	draft := model.AutoPostDraft{
		UserID:           userID,
		PlanID:           11,
		BotID:            22,
		XAccountID:       33,
		GeneratedContent: "Draft to remove",
		Status:           "approved",
		RiskLevel:        "low",
		CapabilityStatus: "review_required",
	}
	if err := db.Create(&draft).Error; err != nil {
		t.Fatalf("create draft: %v", err)
	}
	job := model.PublishJob{
		UserID:           userID,
		TwitterAccountID: draft.XAccountID,
		BotID:            draft.BotID,
		SourceType:       repository.PublishSourcePost,
		SourceID:         draft.ID,
		Content:          draft.GeneratedContent,
		Status:           repository.PublishStatusPending,
		ExecutionMode:    "manual",
		PublishMode:      repository.PublishModeSimulated,
		MaxAttempts:      3,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}

	resp, err := svc.BulkAction(context.Background(), userID, dto.ReviewQueueBulkActionRequest{
		Action: "delete",
		Items: []dto.ReviewQueueBulkActionItemRequest{{
			QueueType:    "post",
			SourceID:     draft.ID,
			PublishJobID: job.ID,
		}},
	})
	if err != nil {
		t.Fatalf("delete bulk action: %v", err)
	}
	if resp.Succeeded != 1 || resp.Failed != 0 {
		t.Fatalf("unexpected delete result: succeeded=%d failed=%d", resp.Succeeded, resp.Failed)
	}
	var draftCount int64
	if err := db.Model(&model.AutoPostDraft{}).Where("id = ?", draft.ID).Count(&draftCount).Error; err != nil {
		t.Fatalf("count draft: %v", err)
	}
	if draftCount != 0 {
		t.Fatalf("expected draft deleted, got %d rows", draftCount)
	}
	var jobCount int64
	if err := db.Model(&model.PublishJob{}).Where("id = ?", job.ID).Count(&jobCount).Error; err != nil {
		t.Fatalf("count job: %v", err)
	}
	if jobCount != 0 {
		t.Fatalf("expected pending publish job deleted, got %d rows", jobCount)
	}
}

func TestReviewQueueBulkDeleteBlocksPublishedOrProcessingItems(t *testing.T) {
	if err := assertReviewQueueDeleteAllowed("post", "published"); err == nil {
		t.Fatal("expected published source status to block delete")
	}
	if err := assertReviewQueueDeleteAllowed("comment", "sending"); err == nil {
		t.Fatal("expected sending source status to block delete")
	}

	svc, db := newReviewQueueDeleteTestService(t)
	userID := uint(8)
	draft := model.AutoPostDraft{
		UserID:           userID,
		PlanID:           11,
		BotID:            22,
		XAccountID:       33,
		GeneratedContent: "Draft with running job",
		Status:           "approved",
		RiskLevel:        "low",
		CapabilityStatus: "review_required",
	}
	if err := db.Create(&draft).Error; err != nil {
		t.Fatalf("create draft: %v", err)
	}
	job := model.PublishJob{
		UserID:           userID,
		TwitterAccountID: draft.XAccountID,
		BotID:            draft.BotID,
		SourceType:       repository.PublishSourcePost,
		SourceID:         draft.ID,
		Content:          draft.GeneratedContent,
		Status:           repository.PublishStatusProcessing,
		ExecutionMode:    "manual",
		PublishMode:      repository.PublishModeSimulated,
		MaxAttempts:      3,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}

	resp, err := svc.BulkAction(context.Background(), userID, dto.ReviewQueueBulkActionRequest{
		Action: "delete",
		Items: []dto.ReviewQueueBulkActionItemRequest{{
			QueueType:    "post",
			SourceID:     draft.ID,
			PublishJobID: job.ID,
		}},
	})
	if err != nil {
		t.Fatalf("delete bulk action should return per-item failure, got service error: %v", err)
	}
	if resp.Succeeded != 0 || resp.Failed != 1 {
		t.Fatalf("expected delete blocked, succeeded=%d failed=%d", resp.Succeeded, resp.Failed)
	}
	if !strings.Contains(resp.Results[0].Error, "processing publish job") {
		t.Fatalf("expected processing job error, got %q", resp.Results[0].Error)
	}
	var draftCount int64
	if err := db.Model(&model.AutoPostDraft{}).Where("id = ?", draft.ID).Count(&draftCount).Error; err != nil {
		t.Fatalf("count draft: %v", err)
	}
	if draftCount != 1 {
		t.Fatalf("expected blocked draft to remain, got %d rows", draftCount)
	}
}
