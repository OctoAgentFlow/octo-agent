package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
)

const publishJobLimit = 20

type XPublisher interface {
	Publish(ctx context.Context, job model.PublishJob) error
}

type SimulatedXPublisher struct{}

func (SimulatedXPublisher) Publish(ctx context.Context, job model.PublishJob) error {
	if strings.TrimSpace(job.Content) == "" {
		return fmt.Errorf("publish content is empty")
	}
	return nil
}

type PublishingService struct {
	jobRepo     *repository.PublishJobRepository
	commentRepo *repository.AutoCommentTaskRepository
	replyRepo   *repository.AutoReplyDraftRepository
	accountRepo *repository.TwitterAccountRepository
	userRepo    *repository.UserRepository
	activity    *repository.ActivityRepository
	publisher   XPublisher
}

func NewPublishingService(
	jobRepo *repository.PublishJobRepository,
	commentRepo *repository.AutoCommentTaskRepository,
	replyRepo *repository.AutoReplyDraftRepository,
	accountRepo *repository.TwitterAccountRepository,
	userRepo *repository.UserRepository,
	activity *repository.ActivityRepository,
	publisher XPublisher,
) *PublishingService {
	if publisher == nil {
		publisher = SimulatedXPublisher{}
	}
	return &PublishingService{
		jobRepo:     jobRepo,
		commentRepo: commentRepo,
		replyRepo:   replyRepo,
		accountRepo: accountRepo,
		userRepo:    userRepo,
		activity:    activity,
		publisher:   publisher,
	}
}

func (s *PublishingService) ListJobs(userID uint) (*dto.PublishJobsResponse, error) {
	rows, err := s.jobRepo.ListByUser(userID, 100)
	if err != nil {
		return nil, err
	}
	items := make([]dto.PublishJobItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, publishJobToItem(row))
	}
	return &dto.PublishJobsResponse{Items: items}, nil
}

func (s *PublishingService) EnsureCommentJob(task *model.AutoCommentTask, now time.Time) (*model.PublishJob, bool, error) {
	if task == nil || task.Status != "ready_to_publish" {
		return nil, false, nil
	}
	job := &model.PublishJob{
		UserID:           task.UserID,
		TwitterAccountID: task.XAccountID,
		BotID:            task.BotID,
		SourceType:       repository.PublishSourceComment,
		SourceID:         task.ID,
		Content:          task.GeneratedComment,
		Status:           repository.PublishStatusPending,
		ExecutionMode:    ExecutionModeAutopilot,
		MaxAttempts:      3,
		NextAttemptAt:    &now,
	}
	createdJob, created, err := s.jobRepo.Ensure(job)
	if err != nil {
		return nil, false, err
	}
	if created {
		_ = s.createJobActivity(createdJob, "activity.preview.commentPublishJobCreated", "")
	}
	return createdJob, created, nil
}

func (s *PublishingService) EnsureReplyJob(draft *model.AutoReplyDraft, now time.Time) (*model.PublishJob, bool, error) {
	if draft == nil || draft.Status != "ready_to_publish" {
		return nil, false, nil
	}
	job := &model.PublishJob{
		UserID:           draft.UserID,
		TwitterAccountID: draft.XAccountID,
		BotID:            draft.BotID,
		SourceType:       repository.PublishSourceReply,
		SourceID:         draft.ID,
		Content:          draft.GeneratedReply,
		Status:           repository.PublishStatusPending,
		ExecutionMode:    ExecutionModeAutopilot,
		MaxAttempts:      3,
		NextAttemptAt:    &now,
	}
	createdJob, created, err := s.jobRepo.Ensure(job)
	if err != nil {
		return nil, false, err
	}
	if created {
		_ = s.createJobActivity(createdJob, "activity.preview.replyPublishJobCreated", "")
	}
	return createdJob, created, nil
}

func (s *PublishingService) RunOnce(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	now := time.Now().UTC()
	jobs, err := s.jobRepo.ListDuePending(publishJobLimit, now)
	if err != nil {
		zap.L().Warn("publishing: list due jobs failed", zap.Error(err))
		return
	}
	for _, job := range jobs {
		if err := s.processJob(ctx, job.ID); err != nil {
			zap.L().Warn("publishing: process job failed", zap.Uint("job_id", job.ID), zap.Error(err))
		}
	}
}

func (s *PublishingService) RetryJob(userID, id uint) (*dto.PublishJobItem, error) {
	job, err := s.jobRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if job.Status != repository.PublishStatusFailed {
		return nil, fmt.Errorf("only failed publish jobs can be retried")
	}
	if job.AttemptCount >= job.MaxAttempts {
		return nil, fmt.Errorf("publish job reached max attempts")
	}
	now := time.Now().UTC()
	if err := s.resetSourceForRetry(job); err != nil {
		return nil, err
	}
	if err := s.jobRepo.ResetForRetry(job, now); err != nil {
		return nil, err
	}
	updated, err := s.jobRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	item := publishJobToItem(*updated)
	return &item, nil
}

func (s *PublishingService) CancelJob(userID, id uint) (*dto.PublishJobItem, error) {
	job, err := s.jobRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if job.Status == repository.PublishStatusPublished {
		return nil, fmt.Errorf("published job cannot be cancelled")
	}
	job.Status = repository.PublishStatusCancelled
	job.LastError = "Cancelled by user."
	if err := s.jobRepo.Save(job); err != nil {
		return nil, err
	}
	item := publishJobToItem(*job)
	return &item, nil
}

func (s *PublishingService) processJob(ctx context.Context, id uint) error {
	now := time.Now().UTC()
	claimed, err := s.jobRepo.TryMarkProcessing(id, now)
	if err != nil {
		return err
	}
	if !claimed {
		return nil
	}
	job, err := s.jobRepo.GetByID(id)
	if err != nil {
		return err
	}
	if err := s.validateJob(job, now); err != nil {
		return s.failJob(job, "validation_failed", err.Error(), false)
	}
	if err := s.publisher.Publish(ctx, *job); err != nil {
		return s.failJob(job, "simulated_publish_failed", err.Error(), true)
	}
	return s.completeJob(job, now)
}

func (s *PublishingService) validateJob(job *model.PublishJob, now time.Time) error {
	if strings.TrimSpace(job.Content) == "" {
		return fmt.Errorf("publish content is empty")
	}
	u, err := s.userRepo.GetByID(job.UserID)
	if err != nil {
		return err
	}
	if err := subscription.AssertUserMayProduceContent(u, now); err != nil {
		return err
	}
	if _, err := s.accountRepo.GetConnectedByUserAndAccountID(job.UserID, job.TwitterAccountID); err != nil {
		return fmt.Errorf("x account is not connected")
	}
	switch job.SourceType {
	case repository.PublishSourceComment:
		task, err := s.commentRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		if task.Status != "ready_to_publish" && task.Status != "failed" {
			return fmt.Errorf("comment source status is %s", task.Status)
		}
	case repository.PublishSourceReply:
		draft, err := s.replyRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		if draft.Status != "ready_to_publish" && draft.Status != "failed" {
			return fmt.Errorf("reply source status is %s", draft.Status)
		}
	default:
		return fmt.Errorf("unsupported publish source type %s", job.SourceType)
	}
	return nil
}

func (s *PublishingService) completeJob(job *model.PublishJob, now time.Time) error {
	job.Status = repository.PublishStatusPublished
	job.LastError = ""
	job.PublishedAt = &now
	if err := s.jobRepo.Save(job); err != nil {
		return err
	}
	if err := s.markSourcePublished(job, now); err != nil {
		return err
	}
	return s.createJobActivity(job, "activity.preview.simulatedPublishSuccess", "")
}

func (s *PublishingService) failJob(job *model.PublishJob, category, reason string, retryable bool) error {
	now := time.Now().UTC()
	job.Status = repository.PublishStatusFailed
	job.LastError = truncateErrMsg(reason)
	if retryable && job.AttemptCount < job.MaxAttempts {
		next := now.Add(time.Duration(job.AttemptCount) * time.Minute)
		job.NextAttemptAt = &next
	} else {
		job.NextAttemptAt = nil
	}
	if err := s.jobRepo.Save(job); err != nil {
		return err
	}
	if err := s.markSourceFailed(job, category, reason); err != nil {
		return err
	}
	_ = s.createJobActivity(job, "activity.preview.simulatedPublishFailed", reason)
	return errors.New(job.LastError)
}

func (s *PublishingService) markSourcePublished(job *model.PublishJob, now time.Time) error {
	switch job.SourceType {
	case repository.PublishSourceComment:
		task, err := s.commentRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		task.Status = "published"
		task.CapabilityStatus = "simulated_published"
		task.SentAt = &now
		task.Retryable = false
		task.FailureCategory = ""
		task.FailureReason = ""
		return s.commentRepo.Save(task)
	case repository.PublishSourceReply:
		draft, err := s.replyRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		draft.Status = "published"
		draft.CapabilityStatus = "simulated_published"
		draft.SentAt = &now
		draft.FailureCategory = ""
		draft.FailureReason = ""
		return s.replyRepo.Save(draft)
	default:
		return nil
	}
}

func (s *PublishingService) markSourceFailed(job *model.PublishJob, category, reason string) error {
	switch job.SourceType {
	case repository.PublishSourceComment:
		task, err := s.commentRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		task.Status = "failed"
		task.CapabilityStatus = "publish_failed"
		task.FailureCategory = category
		task.FailureReason = truncateErrMsg(reason)
		task.Retryable = job.AttemptCount < job.MaxAttempts
		return s.commentRepo.Save(task)
	case repository.PublishSourceReply:
		draft, err := s.replyRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		draft.Status = "failed"
		draft.CapabilityStatus = "publish_failed"
		draft.FailureCategory = category
		draft.FailureReason = truncateErrMsg(reason)
		return s.replyRepo.Save(draft)
	default:
		return nil
	}
}

func (s *PublishingService) resetSourceForRetry(job *model.PublishJob) error {
	switch job.SourceType {
	case repository.PublishSourceComment:
		task, err := s.commentRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		task.Status = "ready_to_publish"
		task.CapabilityStatus = "autopilot_prepared"
		task.FailureCategory = ""
		task.FailureReason = ""
		task.Retryable = false
		return s.commentRepo.Save(task)
	case repository.PublishSourceReply:
		draft, err := s.replyRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		draft.Status = "ready_to_publish"
		draft.CapabilityStatus = "autopilot_prepared"
		draft.FailureCategory = ""
		draft.FailureReason = ""
		return s.replyRepo.Save(draft)
	default:
		return fmt.Errorf("unsupported publish source type %s", job.SourceType)
	}
}

func (s *PublishingService) createJobActivity(job *model.PublishJob, previewKey string, errMsg string) error {
	if s.activity == nil || job == nil {
		return nil
	}
	acc, _ := s.accountRepo.GetConnectedByUserAndAccountID(job.UserID, job.TwitterAccountID)
	handle := ""
	if acc != nil {
		handle = formatXAccountHandle(acc.Username)
	}
	status := "review"
	if strings.Contains(previewKey, "Success") {
		status = "success"
	}
	if strings.Contains(previewKey, "Failed") {
		status = "failed"
	}
	log := &model.ActivityLog{
		UserID:           job.UserID,
		XAccountID:       job.TwitterAccountID,
		Type:             job.SourceType,
		Status:           status,
		PreviewKey:       previewKey,
		AccountHandle:    handle,
		ExecutedAt:       time.Now().UTC(),
		ErrorMessage:     truncateErrMsg(errMsg),
		ReplyTextPreview: truncateReplyPreview(job.Content, autoReplyPreviewRunes),
	}
	return s.activity.DB.Create(log).Error
}

func publishJobToItem(row model.PublishJob) dto.PublishJobItem {
	item := dto.PublishJobItem{
		ID:               row.ID,
		UserID:           row.UserID,
		TwitterAccountID: row.TwitterAccountID,
		BotID:            row.BotID,
		SourceType:       row.SourceType,
		SourceID:         row.SourceID,
		Content:          row.Content,
		Status:           row.Status,
		ExecutionMode:    row.ExecutionMode,
		AttemptCount:     row.AttemptCount,
		MaxAttempts:      row.MaxAttempts,
		LastError:        row.LastError,
		CreatedAt:        row.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:        row.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if row.NextAttemptAt != nil {
		item.NextAttemptAt = row.NextAttemptAt.UTC().Format(time.RFC3339)
	}
	if row.PublishedAt != nil {
		item.PublishedAt = row.PublishedAt.UTC().Format(time.RFC3339)
	}
	return item
}
