package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
)

const autoCommentPreviewRunes = 220

type AutoCommentService struct {
	accountRepo    *repository.TwitterAccountRepository
	automationRepo *repository.AutomationRepository
	targetRepo     *repository.AutoCommentTargetRepository
	taskRepo       *repository.AutoCommentTaskRepository
	activityRepo   *repository.ActivityRepository
	userRepo       *repository.UserRepository
	ai             *AIService
}

func NewAutoCommentService(
	accountRepo *repository.TwitterAccountRepository,
	automationRepo *repository.AutomationRepository,
	targetRepo *repository.AutoCommentTargetRepository,
	taskRepo *repository.AutoCommentTaskRepository,
	activityRepo *repository.ActivityRepository,
	userRepo *repository.UserRepository,
	ai *AIService,
) *AutoCommentService {
	return &AutoCommentService{
		accountRepo:    accountRepo,
		automationRepo: automationRepo,
		targetRepo:     targetRepo,
		taskRepo:       taskRepo,
		activityRepo:   activityRepo,
		userRepo:       userRepo,
		ai:             ai,
	}
}

func (s *AutoCommentService) ListTargets(userID uint) (*dto.AutoCommentTargetsResponse, error) {
	rows, err := s.targetRepo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoCommentTargetItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, toAutoCommentTargetItem(row))
	}
	return &dto.AutoCommentTargetsResponse{Items: items}, nil
}

func (s *AutoCommentService) CreateTarget(userID uint, req dto.AutoCommentTargetRequest) (*dto.AutoCommentTargetItem, error) {
	username := normalizeHandle(req.TargetUsername)
	if username == "" {
		return nil, fmt.Errorf("target username is required")
	}
	xAccountID, err := s.resolveExecutorAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, err
	}
	target := &model.AutoCommentTarget{
		UserID:         userID,
		XAccountID:     xAccountID,
		TargetUsername: username,
		Status:         "active",
	}
	if err := s.targetRepo.Create(target); err != nil {
		return nil, err
	}
	item := toAutoCommentTargetItem(*target)
	return &item, nil
}

func (s *AutoCommentService) UpdateTargetStatus(userID, id uint, status string) (*dto.AutoCommentTargetItem, error) {
	status = strings.ToLower(strings.TrimSpace(status))
	if status != "active" && status != "paused" {
		return nil, fmt.Errorf("invalid target status")
	}
	target, err := s.targetRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	target.Status = status
	if err := s.targetRepo.Save(target); err != nil {
		return nil, err
	}
	item := toAutoCommentTargetItem(*target)
	return &item, nil
}

func (s *AutoCommentService) DeleteTarget(userID, id uint) error {
	return s.targetRepo.DeleteByUserAndID(userID, id)
}

func (s *AutoCommentService) ListTasks(userID uint) (*dto.AutoCommentTasksResponse, error) {
	rows, err := s.taskRepo.ListByUser(userID, 50)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoCommentTaskItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, toAutoCommentTaskItem(row))
	}
	return &dto.AutoCommentTasksResponse{Items: items}, nil
}

func (s *AutoCommentService) ApproveTask(ctx context.Context, userID, id uint) (*dto.AutoCommentTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if task.Status != "review" && task.Status != "approved" {
		return nil, fmt.Errorf("task cannot be approved from status %s", task.Status)
	}
	now := time.Now().UTC()
	task.Status = "approved"
	task.ApprovedAt = &now
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	if err := s.sendTask(ctx, task); err != nil {
		return nil, err
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) BlockTask(userID, id uint, reason string) (*dto.AutoCommentTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	task.Status = "blocked"
	task.BlockedAt = &now
	task.FailureReason = truncateErrMsg(strings.TrimSpace(reason))
	task.Retryable = false
	if task.FailureReason == "" {
		task.FailureReason = "Blocked by user."
	}
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) RetryTask(ctx context.Context, userID, id uint) (*dto.AutoCommentTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if task.Status != "failed" || !task.Retryable {
		return nil, fmt.Errorf("task is not retryable")
	}
	if strings.TrimSpace(task.GeneratedComment) == "" {
		if err := s.regenerateTaskComment(ctx, task); err != nil {
			return nil, err
		}
	}
	if err := s.sendTask(ctx, task); err != nil {
		return nil, err
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) regenerateTaskComment(ctx context.Context, task *model.AutoCommentTask) error {
	cfg, err := s.automationRepo.GetByUserAndType(task.UserID, repository.AutomationTypeComment)
	if err != nil {
		return err
	}
	var blocked []string
	_ = json.Unmarshal([]byte(cfg.SafetyBlockedKeywords), &blocked)
	comment, err := s.ai.GenerateAutoComment(ctx, GenerateAutoCommentInput{
		TargetUsername: task.TargetUsername,
		TargetTweet:    task.TargetTweetText,
		Tone:           cfg.Tone,
		BlockedWords:   blocked,
	})
	if err != nil {
		task.FailureCategory = "llm_error"
		task.FailureReason = truncateErrMsg(err.Error())
		task.Retryable = true
		_ = s.taskRepo.Save(task)
		return err
	}
	now := time.Now().UTC()
	task.GeneratedComment = truncateRunes(comment, autoCommentPreviewRunes)
	task.GeneratedAt = &now
	task.FailureCategory = ""
	task.FailureReason = ""
	return s.taskRepo.Save(task)
}

func (s *AutoCommentService) RunTick(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	now := time.Now().UTC()
	targets, err := s.targetRepo.ListDueActiveTargets(100, now)
	if err != nil {
		zap.L().Warn("auto comment: list due targets failed", zap.Error(err))
		return
	}
	for _, target := range targets {
		runCtx := requestid.NewContext(ctx, "scheduler")
		if err := s.runOnceForTarget(runCtx, target); err != nil {
			zap.L().Warn("auto comment: target tick failed", zap.Uint("user_id", target.UserID), zap.Uint("target_id", target.ID), zap.Error(err))
		}
	}
}

func (s *AutoCommentService) runOnceForTarget(ctx context.Context, target model.AutoCommentTarget) error {
	now := time.Now().UTC()
	cfg, err := s.automationRepo.GetByUserAndType(target.UserID, repository.AutomationTypeComment)
	if err != nil {
		return err
	}
	if !cfg.Enabled {
		return nil
	}
	u, err := s.userRepo.GetByID(target.UserID)
	if err != nil {
		return err
	}
	if err := subscription.AssertUserMayProduceContent(u, now); err != nil {
		return nil
	}
	if hit, why := s.commentLimitsExceeded(target.UserID, cfg, now); hit {
		return s.markTargetChecked(&target, now, "skip: "+why)
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(target.UserID, target.XAccountID)
	if err != nil {
		return s.markTargetChecked(&target, now, "executor account not found")
	}
	if strings.TrimSpace(acc.AccessToken) == "" {
		return s.markTargetChecked(&target, now, "executor account missing access token")
	}
	if strings.TrimSpace(target.TargetUserID) == "" {
		xu, err := twitter.LookupUserByUsername(ctx, nil, acc.AccessToken, target.TargetUsername)
		if err != nil {
			return s.markTargetChecked(&target, now, truncateErrMsg(err.Error()))
		}
		target.TargetUserID = xu.ID
		target.TargetUsername = normalizeHandle(xu.Username)
		target.TargetDisplayName = xu.DisplayName
		target.ResolvedAt = &now
		if err := s.targetRepo.Save(&target); err != nil {
			return err
		}
	}
	tweets, err := twitter.ListUserRootTweets(ctx, nil, acc.AccessToken, target.TargetUserID, 5)
	if err != nil {
		return s.markTargetChecked(&target, now, truncateErrMsg(err.Error()))
	}
	target.LastCheckedAt = &now
	target.LastFailureReason = ""
	for _, tw := range tweets {
		if tw.ID == "" {
			continue
		}
		if target.LastSeenTweetID == tw.ID {
			break
		}
		exists, err := s.taskRepo.ExistsForTargetTweet(target.UserID, target.XAccountID, tw.ID)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		task, err := s.createTaskFromTweet(ctx, target, *cfg, tw)
		if err != nil {
			target.LastFailureReason = truncateErrMsg(err.Error())
			_ = s.targetRepo.Save(&target)
			return err
		}
		target.LastSeenTweetID = tw.ID
		if !tw.CreatedAt.IsZero() {
			t := tw.CreatedAt
			target.LastSeenTweetAt = &t
		}
		if task.Status == "sent" {
			sent := now
			target.LastCommentedAt = &sent
		}
		return s.targetRepo.Save(&target)
	}
	return s.targetRepo.Save(&target)
}

func (s *AutoCommentService) createTaskFromTweet(ctx context.Context, target model.AutoCommentTarget, cfg model.AutomationConfig, tw twitter.UserTweet) (*model.AutoCommentTask, error) {
	var blocked []string
	_ = json.Unmarshal([]byte(cfg.SafetyBlockedKeywords), &blocked)
	comment, err := s.ai.GenerateAutoComment(ctx, GenerateAutoCommentInput{
		TargetUsername: target.TargetUsername,
		TargetTweet:    tw.Text,
		Tone:           cfg.Tone,
		BlockedWords:   blocked,
	})
	now := time.Now().UTC()
	task := &model.AutoCommentTask{
		UserID:            target.UserID,
		XAccountID:        target.XAccountID,
		TargetID:          target.ID,
		TargetUserID:      target.TargetUserID,
		TargetUsername:    target.TargetUsername,
		TargetTweetID:     tw.ID,
		TargetTweetText:   truncateRunes(tw.Text, 500),
		TargetTweetAuthor: target.TargetUsername,
		Status:            "review",
		CapabilityStatus:  "llm_generated",
		ApprovalRequired:  cfg.SafetyRequireApproval,
		DetectedAt:        now,
	}
	if err != nil {
		task.Status = "failed"
		task.CapabilityStatus = "llm_failed"
		task.FailureCategory = "llm_error"
		task.FailureReason = truncateErrMsg(err.Error())
		task.Retryable = true
		if createErr := s.taskRepo.Create(task); createErr != nil {
			return nil, createErr
		}
		return task, err
	}
	task.GeneratedComment = truncateRunes(comment, autoCommentPreviewRunes)
	task.GeneratedAt = &now
	if err := s.taskRepo.Create(task); err != nil {
		return nil, err
	}
	if cfg.SafetyRequireApproval {
		return task, nil
	}
	if err := s.sendTask(ctx, task); err != nil {
		return task, err
	}
	return task, nil
}

func (s *AutoCommentService) sendTask(ctx context.Context, task *model.AutoCommentTask) error {
	now := time.Now().UTC()
	task.Status = "sending"
	task.AttemptCount++
	task.LastAttemptAt = &now
	task.Retryable = false
	task.RetryAfterAt = nil
	if err := s.taskRepo.Save(task); err != nil {
		return err
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(task.UserID, task.XAccountID)
	if err != nil {
		return s.failTask(task, "account_error", "executor account not found", false, 0)
	}
	commentID, err := twitter.CreateReplyTweet(ctx, acc.AccessToken, task.GeneratedComment, task.TargetTweetID)
	if err != nil {
		var pub *twitter.PublishError
		retryable := false
		retryAfter := time.Duration(0)
		category := "x_api_error"
		if errors.As(err, &pub) {
			retryable = pub.RateLimited || pub.StatusCode >= 500
			retryAfter = pub.RetryAfter
			if pub.RateLimited {
				category = "rate_limited"
			}
		}
		return s.failTask(task, category, err.Error(), retryable, retryAfter)
	}
	ref := task.TargetTweetID
	log := &model.ActivityLog{
		UserID:              task.UserID,
		XAccountID:          task.XAccountID,
		Type:                "comment",
		Status:              "success",
		PreviewKey:          "activity.preview.commentSuccess",
		AccountHandle:       formatXAccountHandle(acc.Username),
		ExecutedAt:          now,
		RefTweetID:          &ref,
		ReplyCommentTweetID: task.TargetTweetID,
		ReplyToUsername:     replyAuthorDisplay(task.TargetUsername),
		ReplyToTextPreview:  truncateReplyPreview(task.TargetTweetText, autoReplyPreviewRunes),
		ReplyTextPreview:    truncateReplyPreview(task.GeneratedComment, autoReplyPreviewRunes),
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		return err
	}
	task.Status = "sent"
	task.CapabilityStatus = "sent"
	task.ActivityLogID = log.ID
	task.CommentTweetID = commentID
	task.SentAt = &now
	task.FailureCategory = ""
	task.FailureReason = ""
	task.Retryable = false
	return s.taskRepo.Save(task)
}

func (s *AutoCommentService) failTask(task *model.AutoCommentTask, category, reason string, retryable bool, retryAfter time.Duration) error {
	now := time.Now().UTC()
	task.Status = "failed"
	task.CapabilityStatus = "send_failed"
	task.FailureCategory = category
	task.FailureReason = truncateErrMsg(reason)
	task.Retryable = retryable
	if retryAfter > 0 {
		t := now.Add(retryAfter)
		task.RetryAfterAt = &t
	}
	if err := s.taskRepo.Save(task); err != nil {
		return err
	}
	return errors.New(task.FailureReason)
}

func (s *AutoCommentService) commentLimitsExceeded(userID uint, cfg *model.AutomationConfig, now time.Time) (bool, string) {
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	dayCount, err := s.taskRepo.CountSuccessBetween(userID, dayStart, now)
	if err != nil {
		zap.L().Warn("auto comment: count daily successes failed", zap.Uint("user_id", userID), zap.Error(err))
		return false, ""
	}
	if cfg.FrequencyDailyLimit > 0 && int(dayCount) >= cfg.FrequencyDailyLimit {
		return true, "daily_limit"
	}
	hourAgo := now.Add(-time.Hour)
	hourCount, err := s.taskRepo.CountSuccessBetween(userID, hourAgo, now)
	if err != nil {
		zap.L().Warn("auto comment: count hourly successes failed", zap.Uint("user_id", userID), zap.Error(err))
		return false, ""
	}
	if cfg.SafetyMaxPerHour > 0 && int(hourCount) >= cfg.SafetyMaxPerHour {
		return true, "hourly_limit"
	}
	return false, ""
}

func (s *AutoCommentService) resolveExecutorAccountID(userID, preferred uint) (uint, error) {
	if preferred > 0 {
		if _, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, preferred); err != nil {
			return 0, fmt.Errorf("x account not found")
		}
		return preferred, nil
	}
	accounts, err := s.accountRepo.ListByUserID(userID)
	if err != nil {
		return 0, err
	}
	for _, acc := range accounts {
		if acc.Status == "connected" {
			return acc.ID, nil
		}
	}
	return 0, fmt.Errorf("connect an X account before adding auto comment targets")
}

func (s *AutoCommentService) markTargetChecked(target *model.AutoCommentTarget, at time.Time, reason string) error {
	target.LastCheckedAt = &at
	target.LastFailureReason = truncateErrMsg(reason)
	return s.targetRepo.Save(target)
}

func normalizeHandle(v string) string {
	return strings.ToLower(strings.TrimSpace(strings.TrimPrefix(v, "@")))
}

func toAutoCommentTargetItem(row model.AutoCommentTarget) dto.AutoCommentTargetItem {
	item := dto.AutoCommentTargetItem{
		ID:                row.ID,
		XAccountID:        row.XAccountID,
		TargetUserID:      row.TargetUserID,
		TargetUsername:    row.TargetUsername,
		TargetDisplayName: row.TargetDisplayName,
		Status:            row.Status,
		LastSeenTweetID:   row.LastSeenTweetID,
		LastFailureReason: row.LastFailureReason,
	}
	if row.LastSeenTweetAt != nil {
		item.LastSeenTweetAt = row.LastSeenTweetAt.UTC().Format(time.RFC3339)
	}
	if row.LastCheckedAt != nil {
		item.LastCheckedAt = row.LastCheckedAt.UTC().Format(time.RFC3339)
	}
	if row.LastCommentedAt != nil {
		item.LastCommentedAt = row.LastCommentedAt.UTC().Format(time.RFC3339)
	}
	if row.ResolvedAt != nil {
		item.ResolvedAt = row.ResolvedAt.UTC().Format(time.RFC3339)
	}
	return item
}

func toAutoCommentTaskItem(row model.AutoCommentTask) dto.AutoCommentTaskItem {
	item := dto.AutoCommentTaskItem{
		ID:                row.ID,
		XAccountID:        row.XAccountID,
		TargetID:          row.TargetID,
		TargetUserID:      row.TargetUserID,
		TargetUsername:    row.TargetUsername,
		TargetTweetID:     row.TargetTweetID,
		TargetTweetText:   row.TargetTweetText,
		TargetTweetAuthor: row.TargetTweetAuthor,
		GeneratedComment:  row.GeneratedComment,
		Status:            row.Status,
		CapabilityStatus:  row.CapabilityStatus,
		FailureCategory:   row.FailureCategory,
		FailureReason:     row.FailureReason,
		Retryable:         row.Retryable,
		AttemptCount:      row.AttemptCount,
		ApprovalRequired:  row.ApprovalRequired,
		ActivityLogID:     row.ActivityLogID,
		CommentTweetID:    row.CommentTweetID,
		DetectedAt:        row.DetectedAt.UTC().Format(time.RFC3339),
	}
	if row.RetryAfterAt != nil {
		item.RetryAfterAt = row.RetryAfterAt.UTC().Format(time.RFC3339)
	}
	if row.LastAttemptAt != nil {
		item.LastAttemptAt = row.LastAttemptAt.UTC().Format(time.RFC3339)
	}
	if row.GeneratedAt != nil {
		item.GeneratedAt = row.GeneratedAt.UTC().Format(time.RFC3339)
	}
	if row.ApprovedAt != nil {
		item.ApprovedAt = row.ApprovedAt.UTC().Format(time.RFC3339)
	}
	if row.BlockedAt != nil {
		item.BlockedAt = row.BlockedAt.UTC().Format(time.RFC3339)
	}
	if row.SentAt != nil {
		item.SentAt = row.SentAt.UTC().Format(time.RFC3339)
	}
	return item
}
