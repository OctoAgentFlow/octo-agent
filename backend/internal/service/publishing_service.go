package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"octo-agent/backend/internal/alert"
	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

const publishJobLimit = 20

type PublishResult struct {
	ExternalID  string
	ExternalURL string
	RawResponse string
	PublishedAt time.Time
}

type XPublisher interface {
	PublishReply(ctx context.Context, account model.TwitterAccount, targetTweetID string, content string) (PublishResult, error)
	PublishComment(ctx context.Context, account model.TwitterAccount, targetTweetID string, content string) (PublishResult, error)
	PublishPost(ctx context.Context, account model.TwitterAccount, content string) (PublishResult, error)
}

type RealXPublisher struct{}

func (RealXPublisher) PublishReply(ctx context.Context, account model.TwitterAccount, targetTweetID string, content string) (PublishResult, error) {
	return publishXReply(ctx, account, targetTweetID, content)
}

func (RealXPublisher) PublishComment(ctx context.Context, account model.TwitterAccount, targetTweetID string, content string) (PublishResult, error) {
	return publishXReply(ctx, account, targetTweetID, content)
}

func (RealXPublisher) PublishPost(ctx context.Context, account model.TwitterAccount, content string) (PublishResult, error) {
	return publishXPost(ctx, account, content)
}

func publishXPost(ctx context.Context, account model.TwitterAccount, content string) (PublishResult, error) {
	token := strings.TrimSpace(account.AccessToken)
	if token == "" {
		return PublishResult{}, fmt.Errorf("missing x access token")
	}
	tweetID, err := twitter.CreateTweet(ctx, token, strings.TrimSpace(content))
	if err != nil {
		return PublishResult{}, err
	}
	now := time.Now().UTC()
	return PublishResult{
		ExternalID:  tweetID,
		ExternalURL: fmt.Sprintf("https://x.com/%s/status/%s", strings.TrimPrefix(strings.TrimSpace(account.Username), "@"), tweetID),
		RawResponse: "x api publish succeeded",
		PublishedAt: now,
	}, nil
}

func publishXReply(ctx context.Context, account model.TwitterAccount, targetTweetID string, content string) (PublishResult, error) {
	token := strings.TrimSpace(account.AccessToken)
	if token == "" {
		return PublishResult{}, fmt.Errorf("missing x access token")
	}
	tweetID, err := twitter.CreateReplyTweet(ctx, token, strings.TrimSpace(content), strings.TrimSpace(targetTweetID))
	if err != nil {
		return PublishResult{}, err
	}
	now := time.Now().UTC()
	return PublishResult{
		ExternalID:  tweetID,
		ExternalURL: fmt.Sprintf("https://x.com/%s/status/%s", strings.TrimPrefix(strings.TrimSpace(account.Username), "@"), tweetID),
		RawResponse: "x api publish succeeded",
		PublishedAt: now,
	}, nil
}

type PublishingError struct {
	Code    string
	Message string
}

func (e *PublishingError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type PublishingService struct {
	jobRepo        *repository.PublishJobRepository
	commentRepo    *repository.AutoCommentTaskRepository
	replyRepo      *repository.AutoReplyDraftRepository
	postRepo       *repository.AutoPostDraftRepository
	accountRepo    *repository.TwitterAccountRepository
	automationRepo *repository.AutomationRepository
	userRepo       *repository.UserRepository
	activity       *repository.ActivityRepository
	cfg            config.XPublisherConfig
	oauth          config.XOAuthConfig
	httpClient     *http.Client
	publisher      XPublisher
}

func NewPublishingService(
	jobRepo *repository.PublishJobRepository,
	commentRepo *repository.AutoCommentTaskRepository,
	replyRepo *repository.AutoReplyDraftRepository,
	postRepo *repository.AutoPostDraftRepository,
	accountRepo *repository.TwitterAccountRepository,
	automationRepo *repository.AutomationRepository,
	userRepo *repository.UserRepository,
	activity *repository.ActivityRepository,
	cfg config.XPublisherConfig,
	oauth config.XOAuthConfig,
	publisher XPublisher,
) *PublishingService {
	if publisher == nil {
		publisher = RealXPublisher{}
	}
	return &PublishingService{
		jobRepo:        jobRepo,
		commentRepo:    commentRepo,
		replyRepo:      replyRepo,
		postRepo:       postRepo,
		accountRepo:    accountRepo,
		automationRepo: automationRepo,
		userRepo:       userRepo,
		activity:       activity,
		cfg:            normalizeXPublisherConfig(cfg),
		oauth:          oauth,
		httpClient:     &http.Client{Timeout: 20 * time.Second},
		publisher:      publisher,
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
	return &dto.PublishJobsResponse{Items: items, Settings: xPublisherSettingsToDTO(s.cfg)}, nil
}

func (s *PublishingService) Status(userID uint) (*dto.PublishingStatusResponse, error) {
	accounts, err := s.accountRepo.ListByUserID(userID)
	if err != nil {
		return nil, err
	}
	connected := 0
	missingTweetWrite := 0
	for _, account := range accounts {
		if strings.EqualFold(strings.TrimSpace(account.Status), "disconnected") {
			continue
		}
		connected++
		if !hasOAuthScope(account.OAuthScopes, "tweet.write") {
			missingTweetWrite++
		}
	}
	return &dto.PublishingStatusResponse{
		RealPublishEnabled:             s.cfg.RealPublishEnabled,
		ManualPublishEnabled:           s.cfg.ManualPublishEnabled,
		DryRun:                         s.cfg.DryRun,
		PerAccountDailyLimit:           s.cfg.PerAccountDailyLimit,
		PerAccountMinIntervalSeconds:   s.cfg.PerAccountMinIntervalSecs,
		CurrentUserConnectedAccounts:   connected,
		AccountsMissingTweetWriteCount: missingTweetWrite,
	}, nil
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
		PublishMode:      repository.PublishModeSimulated,
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
		PublishMode:      repository.PublishModeSimulated,
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

func (s *PublishingService) EnsurePostJob(draft *model.AutoPostDraft, now time.Time) (*model.PublishJob, bool, error) {
	if draft == nil || (draft.Status != "ready_to_publish" && draft.Status != "approved") {
		return nil, false, nil
	}
	content := strings.TrimSpace(draft.GeneratedContent)
	if s.accountRepo != nil {
		if acc, err := s.accountRepo.GetConnectedByUserAndAccountID(draft.UserID, draft.XAccountID); err == nil {
			content = fitXPostForAccount(content, acc.XSubscriptionTier)
		}
	}
	job := &model.PublishJob{
		UserID:           draft.UserID,
		TwitterAccountID: draft.XAccountID,
		BotID:            draft.BotID,
		SourceType:       repository.PublishSourcePost,
		SourceID:         draft.ID,
		Content:          content,
		Status:           repository.PublishStatusPending,
		ExecutionMode:    inferReviewQueueExecutionMode(draft.CapabilityStatus),
		PublishMode:      repository.PublishModeSimulated,
		MaxAttempts:      3,
		NextAttemptAt:    &now,
	}
	createdJob, created, err := s.jobRepo.Ensure(job)
	if err != nil {
		return nil, false, err
	}
	if created {
		_ = s.createJobActivity(createdJob, "activity.preview.autoPostPublishJobCreated", "")
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
		alert.Notify(ctx, alert.Event{
			Level:    alert.LevelError,
			Category: alert.CategoryPublishing,
			Title:    "Publishing jobs list due failed",
			Message:  "Publishing scheduler could not list due publish jobs.",
			Error:    err,
		})
		return
	}
	for _, job := range jobs {
		if err := s.processJob(ctx, job.ID); err != nil {
			zap.L().Warn("publishing: process job failed", zap.Uint("job_id", job.ID), zap.Error(err))
			alert.Notify(ctx, alert.Event{
				Level:      alert.LevelError,
				Category:   alert.CategoryPublishing,
				Title:      "Publishing job process failed",
				Message:    "Publishing scheduler failed to process a publish job.",
				UserID:     job.UserID,
				AccountID:  job.TwitterAccountID,
				ResourceID: job.ID,
				Error:      err,
				Fields: map[string]any{
					"source_type": job.SourceType,
					"source_id":   job.SourceID,
				},
			})
		}
	}
}

func (s *PublishingService) RetryJob(userID, id uint) (*dto.PublishJobItem, error) {
	job, err := s.jobRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if err := s.assertPublishSourceAutomationEnabled(job); err != nil {
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

func (s *PublishingService) PublishNow(ctx context.Context, userID, id uint) (*dto.PublishJobItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	job, err := s.jobRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if !s.cfg.ManualPublishEnabled {
		return nil, &PublishingError{Code: "publisher_manual_publish_disabled", Message: "manual x publishing is disabled"}
	}
	if !isManuallyPublishableJob(job) {
		return nil, fmt.Errorf("only pending, failed, or simulated published jobs can be manually published")
	}
	if !s.cfg.DryRun && !s.cfg.RealPublishEnabled {
		return nil, &PublishingError{Code: "publisher_real_publish_disabled", Message: "real x publishing is disabled in this environment"}
	}
	now := time.Now().UTC()
	account, err := s.validateManualPublishJob(job, now)
	if err != nil {
		if pe := (&PublishingError{}); errors.As(err, &pe) {
			if shouldMarkJobFailedForPublishingError(pe.Code) {
				_ = s.failJobWithPreview(job, pe.Code, pe.Message, false, "activity.preview.realPublishFailed")
			}
			return nil, err
		}
		_ = s.failJobWithPreview(job, "manual_publish_validation_failed", err.Error(), false, "activity.preview.realPublishFailed")
		return nil, err
	}
	if err := s.enforceManualPublishLimits(userID, job.TwitterAccountID, now); err != nil {
		return nil, err
	}
	_ = s.createJobActivity(job, "activity.preview.manualPublishTriggered", "")

	targetTweetID, err := s.sourceTargetTweetID(job)
	if err != nil {
		_ = s.failJobWithPreview(job, "manual_publish_target_missing", err.Error(), false, "activity.preview.realPublishFailed")
		return nil, err
	}
	if err := s.markManualProcessing(job, now); err != nil {
		return nil, err
	}
	result, mode, previewKey, err := s.publishWithAdapterRetryingUnauthorized(ctx, job, account, targetTweetID)
	if err != nil {
		publishErr := &PublishingError{Code: "x_api_publish_failed", Message: "x_api_publish_failed: " + err.Error()}
		_ = s.failJobWithPreview(job, publishErr.Code, publishErr.Message, false, "activity.preview.realPublishFailed")
		alert.Notify(ctx, alert.Event{
			Level:      alert.LevelError,
			Category:   alert.CategoryPublishing,
			Title:      "Manual X publish failed",
			Message:    "Manual real publishing to X failed.",
			UserID:     userID,
			AccountID:  job.TwitterAccountID,
			ResourceID: job.ID,
			Error:      err,
			Fields: map[string]any{
				"source_type": job.SourceType,
				"source_id":   job.SourceID,
			},
		})
		return nil, publishErr
	}
	if err := s.completeJob(job, result, mode, previewKey); err != nil {
		return nil, err
	}
	updated, err := s.jobRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	item := publishJobToItem(*updated)
	item.DryRun = s.cfg.DryRun
	item.RealPublishEnabled = s.cfg.RealPublishEnabled
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
	if strings.TrimSpace(job.Content) == "" {
		return s.failJob(job, "simulated_publish_failed", "publish content is empty", true)
	}
	if shouldAutoPublishRealJob(job, s.cfg) {
		return s.processAutoPostPublishJob(ctx, job, now)
	}
	return s.completeJob(job, PublishResult{
		RawResponse: "simulated publish succeeded",
		PublishedAt: now,
	}, repository.PublishModeSimulated, "activity.preview.simulatedPublishSuccess")
}

func (s *PublishingService) processAutoPostPublishJob(ctx context.Context, job *model.PublishJob, now time.Time) error {
	account, err := s.validateManualPublishJob(job, now)
	if err != nil {
		category := "auto_publish_validation_failed"
		retryable := false
		if pe := (&PublishingError{}); errors.As(err, &pe) {
			category = pe.Code
			retryable = !shouldMarkJobFailedForPublishingError(pe.Code)
		}
		return s.failJobWithPreview(job, category, err.Error(), retryable, "activity.preview.realPublishFailed")
	}
	if err := s.enforceManualPublishLimits(job.UserID, job.TwitterAccountID, now); err != nil {
		category := "auto_publish_limit_blocked"
		retryable := false
		if pe := (&PublishingError{}); errors.As(err, &pe) {
			category = pe.Code
			retryable = pe.Code == "publisher_cooldown_active"
		}
		return s.failJobWithPreview(job, category, err.Error(), retryable, "activity.preview.realPublishFailed")
	}
	targetTweetID, err := s.sourceTargetTweetID(job)
	if err != nil {
		return s.failJobWithPreview(job, "auto_publish_target_missing", err.Error(), false, "activity.preview.realPublishFailed")
	}
	result, mode, previewKey, err := s.publishWithAdapterRetryingUnauthorized(ctx, job, account, targetTweetID)
	if err != nil {
		publishErr := &PublishingError{Code: "x_api_publish_failed", Message: "x_api_publish_failed: " + err.Error()}
		_ = s.failJobWithPreview(job, publishErr.Code, publishErr.Message, true, "activity.preview.realPublishFailed")
		alert.Notify(ctx, alert.Event{
			Level:      alert.LevelError,
			Category:   alert.CategoryPublishing,
			Title:      "Auto Post X publish failed",
			Message:    "Auto Post scheduler failed to publish to X.",
			UserID:     job.UserID,
			AccountID:  job.TwitterAccountID,
			ResourceID: job.ID,
			Error:      err,
			Fields: map[string]any{
				"source_type": job.SourceType,
				"source_id":   job.SourceID,
			},
		})
		return publishErr
	}
	return s.completeJob(job, result, mode, previewKey)
}

func shouldAutoPublishRealJob(job *model.PublishJob, cfg config.XPublisherConfig) bool {
	if job == nil {
		return false
	}
	switch job.SourceType {
	case repository.PublishSourcePost, repository.PublishSourceComment:
	default:
		return false
	}
	return cfg.DryRun || cfg.RealPublishEnabled
}

func automationTypeForPublishSource(sourceType string) string {
	switch sourceType {
	case repository.PublishSourcePost:
		return repository.AutomationTypePost
	case repository.PublishSourceComment:
		return repository.AutomationTypeComment
	case repository.PublishSourceReply:
		return repository.AutomationTypeReply
	case repository.PublishSourceDM:
		return repository.AutomationTypeDM
	default:
		return ""
	}
}

func (s *PublishingService) assertPublishSourceAutomationEnabled(job *model.PublishJob) error {
	if job == nil {
		return nil
	}
	typ := automationTypeForPublishSource(job.SourceType)
	if typ == "" {
		return nil
	}
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activity, job.UserID, typ, "publish pipeline action"); err != nil {
		if errors.Is(err, ErrAutomationModulePaused) {
			return &PublishingError{Code: "automation_module_paused", Message: err.Error()}
		}
		return err
	}
	return nil
}

func (s *PublishingService) validateJob(job *model.PublishJob, now time.Time) error {
	if strings.TrimSpace(job.Content) == "" {
		return fmt.Errorf("publish content is empty")
	}
	if err := s.assertPublishSourceAutomationEnabled(job); err != nil {
		return err
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
	case repository.PublishSourcePost:
		draft, err := s.postRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		if draft.Status != "ready_to_publish" && draft.Status != "approved" && draft.Status != "failed" {
			return fmt.Errorf("post source status is %s", draft.Status)
		}
	default:
		return fmt.Errorf("unsupported publish source type %s", job.SourceType)
	}
	return nil
}

func (s *PublishingService) validateManualPublishJob(job *model.PublishJob, now time.Time) (*model.TwitterAccount, error) {
	if strings.TrimSpace(job.Content) == "" {
		return nil, fmt.Errorf("publish content is empty")
	}
	if err := s.assertPublishSourceAutomationEnabled(job); err != nil {
		return nil, err
	}
	u, err := s.userRepo.GetByID(job.UserID)
	if err != nil {
		return nil, err
	}
	if err := subscription.AssertUserMayProduceContent(u, now); err != nil {
		return nil, err
	}
	account, err := s.accountRepo.GetConnectedByUserAndAccountID(job.UserID, job.TwitterAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account is not connected")
	}
	if strings.TrimSpace(account.AccessToken) == "" {
		return nil, &PublishingError{Code: "x_access_token_missing", Message: "x_access_token_missing"}
	}
	if !hasOAuthScope(account.OAuthScopes, "tweet.write") {
		return nil, &PublishingError{Code: "missing_tweet_write_scope", Message: "missing_tweet_write_scope"}
	}
	if err := validateXPostContentForAccount(job.Content, account.XSubscriptionTier); err != nil {
		return nil, &PublishingError{Code: "x_content_length_exceeded", Message: err.Error()}
	}
	switch job.SourceType {
	case repository.PublishSourceComment, repository.PublishSourceReply, repository.PublishSourcePost:
		return account, s.ensureSourceReadyForManualPublish(job)
	default:
		return nil, fmt.Errorf("unsupported publish source type %s", job.SourceType)
	}
}

func isManuallyPublishableJob(job *model.PublishJob) bool {
	if job == nil {
		return false
	}
	if job.Status == repository.PublishStatusPending || job.Status == repository.PublishStatusFailed {
		return true
	}
	return job.Status == repository.PublishStatusPublished && isNonRealPublishMode(job.PublishMode)
}

func isNonRealPublishMode(mode string) bool {
	mode = strings.TrimSpace(mode)
	return mode == "" || mode == repository.PublishModeSimulated || mode == repository.PublishModeDryRun
}

func isNonRealCapabilityStatus(status string) bool {
	status = strings.TrimSpace(status)
	return status == "simulated_published" || status == "dry_run_published"
}

func (s *PublishingService) ensureSourceReadyForManualPublish(job *model.PublishJob) error {
	switch job.SourceType {
	case repository.PublishSourceComment:
		task, err := s.commentRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		if task.Status == "published" && isNonRealCapabilityStatus(task.CapabilityStatus) {
			return nil
		}
		if task.Status != "ready_to_publish" && task.Status != "failed" {
			return fmt.Errorf("comment source status is %s", task.Status)
		}
	case repository.PublishSourceReply:
		draft, err := s.replyRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		if draft.Status == "published" && isNonRealCapabilityStatus(draft.CapabilityStatus) {
			return nil
		}
		if draft.Status != "ready_to_publish" && draft.Status != "failed" {
			return fmt.Errorf("reply source status is %s", draft.Status)
		}
	case repository.PublishSourcePost:
		draft, err := s.postRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		if draft.Status == "published" && isNonRealCapabilityStatus(draft.CapabilityStatus) {
			return nil
		}
		if draft.Status != "ready_to_publish" && draft.Status != "approved" && draft.Status != "failed" {
			return fmt.Errorf("post source status is %s", draft.Status)
		}
	default:
		return fmt.Errorf("unsupported publish source type %s", job.SourceType)
	}
	return nil
}

func (s *PublishingService) enforceManualPublishLimits(userID uint, accountID uint, now time.Time) error {
	if !s.cfg.DryRun {
		user, err := s.userRepo.GetByID(userID)
		if err != nil {
			return err
		}
		account, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, accountID)
		if err != nil {
			return fmt.Errorf("x account is not connected")
		}
		if isUnlimitedXPublisherAccount(s.cfg, user, account) {
			return nil
		}
		limits := subscription.LimitsForUser(user)
		if limits.MonthlyXWrites <= 0 {
			return &PublishingError{Code: "publisher_monthly_x_quota_exceeded", Message: "monthly real X publish quota is not available for this plan"}
		}
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		monthEnd := monthStart.AddDate(0, 1, 0)
		used, err := s.jobRepo.CountRealPublishedByUser(userID, monthStart, monthEnd)
		if err != nil {
			return err
		}
		if used >= limits.MonthlyXWrites {
			return &PublishingError{Code: "publisher_monthly_x_quota_exceeded", Message: "monthly real X publish quota exceeded for this plan"}
		}
	}
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	count, err := s.jobRepo.CountManualPublishedByAccount(accountID, start, start.Add(24*time.Hour))
	if err != nil {
		return err
	}
	if count >= int64(s.cfg.PerAccountDailyLimit) {
		return &PublishingError{Code: "publisher_account_24h_guardrail_exceeded", Message: "X account publish guardrail exceeded for the last 24 hours"}
	}
	last, err := s.jobRepo.LastManualPublishedByAccount(accountID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if last != nil && last.PublishedAt != nil {
		wait := time.Duration(s.cfg.PerAccountMinIntervalSecs) * time.Second
		if now.Sub(*last.PublishedAt) < wait {
			remaining := wait - now.Sub(*last.PublishedAt)
			seconds := int(remaining.Seconds())
			if seconds < 1 {
				seconds = 1
			}
			return &PublishingError{Code: "publisher_cooldown_active", Message: fmt.Sprintf("x publish cooldown is active, please wait %d seconds", seconds)}
		}
	}
	return nil
}

func (s *PublishingService) sourceTargetTweetID(job *model.PublishJob) (string, error) {
	switch job.SourceType {
	case repository.PublishSourceComment:
		task, err := s.commentRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(task.TargetTweetID) == "" {
			return "", fmt.Errorf("missing target tweet id")
		}
		return task.TargetTweetID, nil
	case repository.PublishSourceReply:
		draft, err := s.replyRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(draft.CommentTweetID) == "" {
			return "", fmt.Errorf("missing comment tweet id")
		}
		return draft.CommentTweetID, nil
	case repository.PublishSourcePost:
		return "", nil
	default:
		return "", fmt.Errorf("unsupported publish source type %s", job.SourceType)
	}
}

func (s *PublishingService) markManualProcessing(job *model.PublishJob, now time.Time) error {
	job.Status = repository.PublishStatusProcessing
	job.AttemptCount++
	job.NextAttemptAt = nil
	job.LastError = ""
	return s.jobRepo.Save(job)
}

func (s *PublishingService) publishWithAdapter(ctx context.Context, job *model.PublishJob, account model.TwitterAccount, targetTweetID string) (PublishResult, string, string, error) {
	if s.cfg.DryRun {
		now := time.Now().UTC()
		return PublishResult{
			ExternalID:  fmt.Sprintf("dry-run-%d", job.ID),
			ExternalURL: "",
			RawResponse: "dry-run publish completed; no request was sent to X",
			PublishedAt: now,
		}, repository.PublishModeDryRun, "activity.preview.manualPublishDryRunSuccess", nil
	}
	switch job.SourceType {
	case repository.PublishSourceComment:
		result, err := s.publisher.PublishComment(ctx, account, targetTweetID, job.Content)
		return result, repository.PublishModeReal, "activity.preview.realPublishSuccess", err
	case repository.PublishSourceReply:
		result, err := s.publisher.PublishReply(ctx, account, targetTweetID, job.Content)
		return result, repository.PublishModeReal, "activity.preview.realPublishSuccess", err
	case repository.PublishSourcePost:
		result, err := s.publisher.PublishPost(ctx, account, job.Content)
		return result, repository.PublishModeReal, "activity.preview.realPublishSuccess", err
	default:
		return PublishResult{}, "", "", fmt.Errorf("unsupported publish source type %s", job.SourceType)
	}
}

func (s *PublishingService) publishWithAdapterRetryingUnauthorized(ctx context.Context, job *model.PublishJob, account *model.TwitterAccount, targetTweetID string) (PublishResult, string, string, error) {
	if account == nil {
		return PublishResult{}, "", "", fmt.Errorf("x account is not connected")
	}
	result, mode, previewKey, err := s.publishWithAdapter(ctx, job, *account, targetTweetID)
	if err == nil || !isXUnauthorizedError(err) || s.cfg.DryRun {
		return result, mode, previewKey, err
	}
	refreshed, refreshErr := s.refreshXAccessToken(ctx, account)
	if refreshErr != nil {
		_ = s.accountRepo.MarkNeedsReauth(job.UserID, job.TwitterAccountID)
		return PublishResult{}, "", "", fmt.Errorf("%w; token_refresh_failed: %v", err, refreshErr)
	}
	return s.publishWithAdapter(ctx, job, *refreshed, targetTweetID)
}

func (s *PublishingService) RefreshXAccessTokenForAccount(ctx context.Context, account *model.TwitterAccount) (*model.TwitterAccount, error) {
	if s == nil {
		return nil, fmt.Errorf("publishing service is not configured")
	}
	refreshed, err := s.refreshXAccessToken(ctx, account)
	if err != nil {
		if s != nil && s.accountRepo != nil && account != nil {
			_ = s.accountRepo.MarkNeedsReauth(account.UserID, account.ID)
		}
		return nil, err
	}
	return refreshed, nil
}

func isXUnauthorizedError(err error) bool {
	var pub *twitter.PublishError
	return errors.As(err, &pub) && pub.StatusCode == http.StatusUnauthorized
}

func (s *PublishingService) refreshXAccessToken(ctx context.Context, account *model.TwitterAccount) (*model.TwitterAccount, error) {
	if account == nil {
		return nil, fmt.Errorf("x account is not connected")
	}
	refreshToken := strings.TrimSpace(account.RefreshToken)
	if refreshToken == "" {
		return nil, fmt.Errorf("missing x refresh token")
	}
	clientID := strings.TrimSpace(s.oauth.ClientID)
	clientSecret := strings.TrimSpace(s.oauth.ClientSecret)
	if clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf("x oauth refresh is not configured")
	}
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.x.com/2/oauth2/token", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(clientID, clientSecret)
	client := s.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("x oauth refresh failed: %s", truncateErrMsg(string(body)))
	}
	var tokenResp xTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, err
	}
	if strings.TrimSpace(tokenResp.AccessToken) == "" {
		return nil, fmt.Errorf("x oauth refresh returned empty access_token")
	}
	now := time.Now().UTC()
	account.AccessToken = strings.TrimSpace(tokenResp.AccessToken)
	if strings.TrimSpace(tokenResp.RefreshToken) != "" {
		account.RefreshToken = strings.TrimSpace(tokenResp.RefreshToken)
	}
	if strings.TrimSpace(tokenResp.Scope) != "" {
		account.OAuthScopes = normalizedOAuthScopes(tokenResp.Scope)
	}
	account.Status = "connected"
	account.LastSyncedAt = &now
	if err := s.accountRepo.UpdateOAuthTokens(account); err != nil {
		return nil, err
	}
	return account, nil
}

func (s *PublishingService) completeJob(job *model.PublishJob, result PublishResult, mode string, previewKey string) error {
	now := result.PublishedAt
	if now.IsZero() {
		now = time.Now().UTC()
	}
	job.Status = repository.PublishStatusPublished
	job.PublishMode = mode
	job.LastError = ""
	job.ExternalID = strings.TrimSpace(result.ExternalID)
	job.ExternalURL = strings.TrimSpace(result.ExternalURL)
	job.RawResponse = truncateErrMsg(result.RawResponse)
	job.PublishedAt = &now
	if err := s.jobRepo.Save(job); err != nil {
		return err
	}
	if mode == repository.PublishModeReal {
		_ = s.jobRepo.RecordXPublishCost(job, now)
	}
	if err := s.markSourcePublished(job, now, mode); err != nil {
		return err
	}
	return s.createJobActivity(job, s.previewKeyForPublishResult(job.SourceType, previewKey, false), "")
}

func (s *PublishingService) failJob(job *model.PublishJob, category, reason string, retryable bool) error {
	return s.failJobWithPreview(job, category, reason, retryable, s.previewKeyForPublishResult(job.SourceType, "activity.preview.simulatedPublishFailed", true))
}

func (s *PublishingService) failJobWithPreview(job *model.PublishJob, category, reason string, retryable bool, previewKey string) error {
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
	_ = s.createJobActivity(job, previewKey, reason)
	return errors.New(job.LastError)
}

func (s *PublishingService) markSourcePublished(job *model.PublishJob, now time.Time, mode string) error {
	capabilityStatus := "simulated_published"
	if mode == repository.PublishModeDryRun {
		capabilityStatus = "dry_run_published"
	}
	if mode == repository.PublishModeReal {
		capabilityStatus = "real_published"
	}
	switch job.SourceType {
	case repository.PublishSourceComment:
		task, err := s.commentRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		task.Status = "published"
		task.CapabilityStatus = capabilityStatus
		task.SentAt = &now
		if mode == repository.PublishModeReal {
			task.CommentTweetID = strings.TrimSpace(job.ExternalID)
		}
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
		draft.CapabilityStatus = capabilityStatus
		draft.SentAt = &now
		draft.FailureCategory = ""
		draft.FailureReason = ""
		return s.replyRepo.Save(draft)
	case repository.PublishSourcePost:
		draft, err := s.postRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		draft.Status = "published"
		draft.CapabilityStatus = capabilityStatus
		draft.PublishedAt = &now
		draft.FailureCategory = ""
		draft.FailureReason = ""
		return s.postRepo.Save(draft)
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
	case repository.PublishSourcePost:
		draft, err := s.postRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		draft.Status = "failed"
		draft.CapabilityStatus = "publish_failed"
		draft.FailureCategory = category
		draft.FailureReason = truncateErrMsg(reason)
		return s.postRepo.Save(draft)
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
	case repository.PublishSourcePost:
		draft, err := s.postRepo.GetByUserAndID(job.UserID, job.SourceID)
		if err != nil {
			return err
		}
		draft.Status = "ready_to_publish"
		draft.CapabilityStatus = "autopilot_prepared"
		draft.FailureCategory = ""
		draft.FailureReason = ""
		return s.postRepo.Save(draft)
	default:
		return fmt.Errorf("unsupported publish source type %s", job.SourceType)
	}
}

func (s *PublishingService) previewKeyForPublishResult(sourceType string, fallback string, failed bool) string {
	if sourceType != repository.PublishSourcePost {
		return fallback
	}
	if fallback == "activity.preview.simulatedPublishSuccess" {
		return "activity.preview.autoPostSimulatedPublishSuccess"
	}
	if fallback == "activity.preview.simulatedPublishFailed" || failed {
		return "activity.preview.autoPostSimulatedPublishFailed"
	}
	return fallback
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
		PublishMode:      row.PublishMode,
		AttemptCount:     row.AttemptCount,
		MaxAttempts:      row.MaxAttempts,
		LastError:        row.LastError,
		ExternalID:       row.ExternalID,
		ExternalURL:      row.ExternalURL,
		RawResponse:      row.RawResponse,
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

func normalizeXPublisherConfig(cfg config.XPublisherConfig) config.XPublisherConfig {
	if cfg.PerAccountDailyLimit <= 0 {
		cfg.PerAccountDailyLimit = 20
	}
	if cfg.PerAccountMinIntervalSecs <= 0 {
		cfg.PerAccountMinIntervalSecs = 300
	}
	if !cfg.ManualPublishEnabled && !cfg.RealPublishEnabled && !cfg.DryRun {
		cfg.ManualPublishEnabled = true
		cfg.DryRun = true
	}
	return cfg
}

func isUnlimitedXPublisherAccount(cfg config.XPublisherConfig, user *model.User, account *model.TwitterAccount) bool {
	if user != nil {
		email := strings.ToLower(strings.TrimSpace(user.Email))
		for _, candidate := range cfg.UnlimitedUserEmails {
			if email != "" && email == strings.ToLower(strings.TrimSpace(candidate)) {
				return true
			}
		}
	}
	if account != nil {
		username := normalizePublisherUsername(account.Username)
		for _, candidate := range cfg.UnlimitedAccountUsernames {
			if username != "" && username == normalizePublisherUsername(candidate) {
				return true
			}
		}
	}
	return false
}

func normalizePublisherUsername(value string) string {
	return strings.ToLower(strings.TrimPrefix(strings.TrimSpace(value), "@"))
}

func hasOAuthScope(scopes string, expected string) bool {
	expected = strings.ToLower(strings.TrimSpace(expected))
	for _, scope := range strings.Fields(strings.ToLower(scopes)) {
		if scope == expected {
			return true
		}
	}
	return false
}

func shouldMarkJobFailedForPublishingError(code string) bool {
	switch code {
	case "x_access_token_missing", "missing_tweet_write_scope":
		return true
	default:
		return false
	}
}

func xPublisherSettingsToDTO(cfg config.XPublisherConfig) dto.XPublisherSettings {
	return dto.XPublisherSettings{
		RealPublishEnabled:           cfg.RealPublishEnabled,
		ManualPublishEnabled:         cfg.ManualPublishEnabled,
		PerAccountDailyLimit:         cfg.PerAccountDailyLimit,
		PerAccountMinIntervalSeconds: cfg.PerAccountMinIntervalSecs,
		DryRun:                       cfg.DryRun,
	}
}
