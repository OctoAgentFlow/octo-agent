package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

const autoCommentPreviewRunes = 220

type AutoCommentService struct {
	accountRepo    *repository.TwitterAccountRepository
	automationRepo *repository.AutomationRepository
	targetRepo     *repository.AutoCommentTargetRepository
	taskRepo       *repository.AutoCommentTaskRepository
	activityRepo   *repository.ActivityRepository
	userRepo       *repository.UserRepository
	oafBotRepo     *repository.OAFBotRepository
	usageRepo      *repository.AIGenerationUsageRepository
	ai             *AIService
	publishing     *PublishingService
}

func NewAutoCommentService(
	accountRepo *repository.TwitterAccountRepository,
	automationRepo *repository.AutomationRepository,
	targetRepo *repository.AutoCommentTargetRepository,
	taskRepo *repository.AutoCommentTaskRepository,
	activityRepo *repository.ActivityRepository,
	userRepo *repository.UserRepository,
	oafBotRepo *repository.OAFBotRepository,
	usageRepo *repository.AIGenerationUsageRepository,
	ai *AIService,
	publishing *PublishingService,
) *AutoCommentService {
	return &AutoCommentService{
		accountRepo:    accountRepo,
		automationRepo: automationRepo,
		targetRepo:     targetRepo,
		taskRepo:       taskRepo,
		activityRepo:   activityRepo,
		userRepo:       userRepo,
		oafBotRepo:     oafBotRepo,
		usageRepo:      usageRepo,
		ai:             ai,
		publishing:     publishing,
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
	username := normalizeHandle(firstNonEmpty(req.TargetUsername, req.TargetAuthorHandle))
	if username == "" {
		return nil, fmt.Errorf("target author handle is required")
	}
	xAccountID, err := s.resolveExecutorAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, err
	}
	tweetID := strings.TrimSpace(req.TargetTweetID)
	if tweetID == "" {
		tweetID = extractTweetID(req.TargetTweetURL)
	}
	targetText := strings.TrimSpace(req.TargetText)
	if targetText != "" && tweetID == "" {
		return nil, fmt.Errorf("target tweet URL or tweet ID is required")
	}
	if tweetID != "" {
		if existing, err := s.targetRepo.GetByUserAccountAndTweet(userID, xAccountID, tweetID); err == nil {
			applyManualCommentTarget(existing, req, username, tweetID, targetText)
			if err := s.targetRepo.Save(existing); err != nil {
				return nil, err
			}
			item := toAutoCommentTargetItem(*existing)
			return &item, nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		if existing, err := s.targetRepo.GetByUserAccountAndUsername(userID, xAccountID, username); err == nil && strings.TrimSpace(existing.TargetTweetID) == "" {
			applyManualCommentTarget(existing, req, username, tweetID, targetText)
			if err := s.targetRepo.Save(existing); err != nil {
				return nil, err
			}
			item := toAutoCommentTargetItem(*existing)
			return &item, nil
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	target := &model.AutoCommentTarget{
		UserID:             userID,
		XAccountID:         xAccountID,
		TargetUsername:     username,
		TargetAuthorHandle: username,
		TargetTweetID:      tweetID,
		TargetTweetURL:     strings.TrimSpace(req.TargetTweetURL),
		TargetText:         truncateRunes(targetText, 1000),
		Status:             "active",
	}
	if tweetID != "" || targetText != "" {
		target.Status = "paused"
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

func (s *AutoCommentService) GenerateDraft(ctx context.Context, userID, targetID uint) (*dto.AutoCommentTaskItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	target, err := s.targetRepo.GetByUserAndID(userID, targetID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(target.TargetTweetID) == "" {
		return nil, fmt.Errorf("target tweet id is required")
	}
	if strings.TrimSpace(target.TargetText) == "" {
		return nil, fmt.Errorf("target tweet text is required")
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, target.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	existing, err := s.taskRepo.GetByTargetTweet(userID, target.XAccountID, target.TargetTweetID)
	if err == nil {
		item := toAutoCommentTaskItem(*existing)
		return &item, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	bot, err := s.botForAccount(userID, target.XAccountID)
	if err != nil {
		return nil, err
	}
	cfg := s.commentConfig(userID)
	mode := s.effectiveCommentExecutionMode(userID, cfg)
	if mode == ExecutionModeAutopilot {
		if err := s.assertAutoCommentDailyQuota(userID, now); err != nil {
			return nil, err
		}
	}
	blocked := blockedWordsFromConfig(cfg)
	comment, err := s.ai.GenerateAutoComment(ctx, autoCommentInputFromBot(target, bot, blocked))
	if err != nil {
		return nil, err
	}
	risk := evaluateAutoCommentRisk(comment, bot, blocked)
	status, capability, approvalRequired, approvedAt := autoCommentInitialState(mode, risk, now)
	task := &model.AutoCommentTask{
		UserID:            userID,
		BotID:             botIDForUsage(bot),
		XAccountID:        acc.ID,
		TargetID:          target.ID,
		TargetUserID:      target.TargetUserID,
		TargetUsername:    displayCommentTargetHandle(*target),
		TargetTweetID:     target.TargetTweetID,
		TargetTweetText:   truncateRunes(target.TargetText, 1000),
		TargetTweetAuthor: displayCommentTargetHandle(*target),
		GeneratedComment:  truncateRunes(comment, autoCommentPreviewRunes),
		Status:            status,
		RiskLevel:         risk.Level,
		CapabilityStatus:  capability,
		FailureCategory:   risk.Category,
		FailureReason:     risk.Reason,
		ApprovalRequired:  approvalRequired,
		DetectedAt:        now,
		GeneratedAt:       &now,
		ApprovedAt:        approvedAt,
	}
	if err := s.taskRepo.Create(task); err != nil {
		return nil, err
	}
	if err := s.usageRepo.Increment(userID, task.BotID, repository.AIGenerationSceneAutoComment, now, 1); err != nil {
		return nil, err
	}
	if mode == ExecutionModeAutopilot && task.Status == "ready_to_publish" {
		if err := s.createAutopilotPreparedActivity(task, acc.Username, now); err != nil {
			return nil, err
		}
		if s.publishing != nil {
			if _, _, err := s.publishing.EnsureCommentJob(task, now); err != nil {
				return nil, err
			}
		}
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) ApproveTask(ctx context.Context, userID, id uint) (*dto.AutoCommentTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if task.Status != "review" && task.Status != "pending_review" && task.Status != "draft" && task.Status != "approved" {
		return nil, fmt.Errorf("task cannot be approved from status %s", task.Status)
	}
	now := time.Now().UTC()
	task.Status = "approved"
	task.ApprovedAt = &now
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) RejectTask(userID, id uint, reason string) (*dto.AutoCommentTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	task.Status = "rejected"
	task.BlockedAt = &now
	task.FailureReason = truncateErrMsg(strings.TrimSpace(reason))
	task.Retryable = false
	if task.FailureReason == "" {
		task.FailureReason = "Rejected by user."
	}
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) UpdateDraft(userID, id uint, content string) (*dto.AutoCommentTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if task.Status != "review" && task.Status != "pending_review" && task.Status != "draft" && task.Status != "approved" {
		return nil, fmt.Errorf("draft cannot be edited from status %s", task.Status)
	}
	task.GeneratedComment = truncateRunes(content, autoCommentPreviewRunes)
	if task.Status == "approved" {
		task.Status = "pending_review"
		task.ApprovedAt = nil
	}
	if err := s.taskRepo.Save(task); err != nil {
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
	if err := s.regenerateTaskComment(ctx, task); err != nil {
		return nil, err
	}
	task.Status = "pending_review"
	task.CapabilityStatus = "draft_generated"
	task.Retryable = false
	if err := s.taskRepo.Save(task); err != nil {
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
	bot, err := s.botForAccount(task.UserID, task.XAccountID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, task.UserID, now); err != nil {
		return err
	}
	comment, err := s.ai.GenerateAutoComment(ctx, autoCommentInputFromValues(task.TargetUsername, task.TargetTweetText, cfg.Tone, blocked, bot))
	if err != nil {
		task.FailureCategory = "llm_error"
		task.FailureReason = truncateErrMsg(err.Error())
		task.Retryable = true
		_ = s.taskRepo.Save(task)
		return err
	}
	task.GeneratedComment = truncateRunes(comment, autoCommentPreviewRunes)
	task.GeneratedAt = &now
	task.BotID = botIDForUsage(bot)
	task.FailureCategory = ""
	task.FailureReason = ""
	if err := s.taskRepo.Save(task); err != nil {
		return err
	}
	return s.usageRepo.Increment(task.UserID, task.BotID, repository.AIGenerationSceneAutoComment, now, 1)
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
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, target.UserID, now); err != nil {
		return nil, err
	}
	bot, err := s.botForAccount(target.UserID, target.XAccountID)
	if err != nil {
		return nil, err
	}
	blocked := blockedWordsFromConfig(&cfg)
	mode := s.effectiveCommentExecutionMode(target.UserID, &cfg)
	if mode == ExecutionModeAutopilot {
		if err := s.assertAutoCommentDailyQuota(target.UserID, now); err != nil {
			return nil, err
		}
	}
	comment, err := s.ai.GenerateAutoComment(ctx, autoCommentInputFromValues(target.TargetUsername, tw.Text, cfg.Tone, blocked, bot))
	risk := evaluateAutoCommentRisk(comment, bot, blocked)
	status, capability, approvalRequired, approvedAt := autoCommentInitialState(mode, risk, now)
	task := &model.AutoCommentTask{
		UserID:            target.UserID,
		BotID:             botIDForUsage(bot),
		XAccountID:        target.XAccountID,
		TargetID:          target.ID,
		TargetUserID:      target.TargetUserID,
		TargetUsername:    target.TargetUsername,
		TargetTweetID:     tw.ID,
		TargetTweetText:   truncateRunes(tw.Text, 500),
		TargetTweetAuthor: target.TargetUsername,
		Status:            status,
		RiskLevel:         risk.Level,
		CapabilityStatus:  capability,
		FailureCategory:   risk.Category,
		FailureReason:     risk.Reason,
		ApprovalRequired:  approvalRequired,
		DetectedAt:        now,
		ApprovedAt:        approvedAt,
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
	if err := s.usageRepo.Increment(target.UserID, task.BotID, repository.AIGenerationSceneAutoComment, now, 1); err != nil {
		return nil, err
	}
	if mode == ExecutionModeAutopilot && task.Status == "ready_to_publish" {
		if err := s.createAutopilotPreparedActivity(task, target.TargetUsername, now); err != nil {
			return nil, err
		}
		if s.publishing != nil {
			if _, _, err := s.publishing.EnsureCommentJob(task, now); err != nil {
				return nil, err
			}
		}
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

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

var tweetIDPattern = regexp.MustCompile(`/status(?:es)?/([0-9]+)`)

func extractTweetID(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if match := tweetIDPattern.FindStringSubmatch(raw); len(match) == 2 {
		return match[1]
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	for i, part := range parts {
		if (part == "status" || part == "statuses") && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

func applyManualCommentTarget(target *model.AutoCommentTarget, req dto.AutoCommentTargetRequest, username, tweetID, targetText string) {
	target.TargetUsername = username
	target.TargetAuthorHandle = username
	target.TargetTweetID = tweetID
	target.TargetTweetURL = strings.TrimSpace(req.TargetTweetURL)
	target.TargetText = truncateRunes(targetText, 1000)
	target.Status = "paused"
}

func displayCommentTargetHandle(target model.AutoCommentTarget) string {
	handle := normalizeHandle(firstNonEmpty(target.TargetAuthorHandle, target.TargetUsername))
	if handle == "" {
		return "target"
	}
	return handle
}

func (s *AutoCommentService) botForAccount(userID, xAccountID uint) (*model.OAFBot, error) {
	if s.oafBotRepo == nil {
		return nil, nil
	}
	bot, err := s.oafBotRepo.GetByUserAndTwitterAccountID(userID, xAccountID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return bot, nil
}

func (s *AutoCommentService) commentConfig(userID uint) *model.AutomationConfig {
	if s.automationRepo == nil {
		return nil
	}
	_ = s.automationRepo.EnsureDefaults(userID)
	cfg, err := s.automationRepo.GetByUserAndType(userID, repository.AutomationTypeComment)
	if err != nil {
		return nil
	}
	return cfg
}

func blockedWordsFromConfig(cfg *model.AutomationConfig) []string {
	if cfg == nil {
		return nil
	}
	var blocked []string
	_ = json.Unmarshal([]byte(cfg.SafetyBlockedKeywords), &blocked)
	return blocked
}

func (s *AutoCommentService) effectiveCommentExecutionMode(userID uint, cfg *model.AutomationConfig) string {
	mode := ExecutionModeReview
	if cfg != nil {
		mode = effectiveExecutionMode(cfg.ExecutionMode)
	}
	if mode != ExecutionModeAutopilot {
		return mode
	}
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return ExecutionModeReview
	}
	plan := subscription.NormalizePlanCode(u.SubscriptionPlanCode)
	if plan == subscription.PlanPlus || plan == subscription.PlanPro || plan == subscription.PlanProPlus {
		return ExecutionModeAutopilot
	}
	return ExecutionModeReview
}

func (s *AutoCommentService) assertAutoCommentDailyQuota(userID uint, now time.Time) error {
	if s.taskRepo == nil || s.userRepo == nil {
		return nil
	}
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	limit := subscription.LimitsForUser(u).DailyAutoComments
	if limit <= 0 {
		return fmt.Errorf("daily auto comment quota exceeded")
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	used, err := s.taskRepo.CountCreatedBetween(userID, dayStart, now)
	if err != nil {
		return err
	}
	if used >= limit {
		return fmt.Errorf("daily auto comment quota exceeded")
	}
	return nil
}

type autoCommentRisk struct {
	Level    string
	Category string
	Reason   string
}

func evaluateAutoCommentRisk(content string, bot *model.OAFBot, blockedWords []string) autoCommentRisk {
	text := strings.ToLower(strings.TrimSpace(content))
	if text == "" {
		return autoCommentRisk{Level: "high", Category: "empty_content", Reason: "Generated comment is empty."}
	}
	topics := append([]string{}, blockedWords...)
	if bot != nil {
		topics = append(topics, decodeStringList(bot.ForbiddenTopics)...)
	}
	for _, word := range topics {
		w := strings.ToLower(strings.TrimSpace(word))
		if w != "" && strings.Contains(text, w) {
			return autoCommentRisk{Level: "high", Category: "risk_blocked_keyword", Reason: "Generated comment matched a forbidden topic or blocked keyword."}
		}
	}
	highRisk := []string{
		"guaranteed return", "guaranteed profit", "risk-free", "100x", "pump", "airdrop",
		"seed phrase", "private key", "connect wallet", "official support",
		"稳赚", "保本", "收益保证", "私钥", "助记词", "连接钱包", "官方客服",
	}
	for _, word := range highRisk {
		if strings.Contains(text, word) {
			return autoCommentRisk{Level: "high", Category: "risk_policy", Reason: "Generated comment matched a high-risk safety rule."}
		}
	}
	return autoCommentRisk{Level: "low"}
}

func autoCommentInitialState(mode string, risk autoCommentRisk, now time.Time) (status string, capability string, approvalRequired bool, approvedAt *time.Time) {
	if risk.Level == "high" {
		return "pending_review", "risk_review_required", true, nil
	}
	switch mode {
	case ExecutionModeManual:
		return "draft", "manual_suggestion", false, nil
	case ExecutionModeAutopilot:
		t := now
		return "ready_to_publish", "autopilot_prepared", false, &t
	default:
		return "pending_review", "review_required", true, nil
	}
}

func (s *AutoCommentService) createAutopilotPreparedActivity(task *model.AutoCommentTask, accountUsername string, now time.Time) error {
	if s.activityRepo == nil || task == nil {
		return nil
	}
	log := &model.ActivityLog{
		UserID:              task.UserID,
		XAccountID:          task.XAccountID,
		Type:                "comment",
		Status:              "review",
		PreviewKey:          "activity.preview.commentAutopilotPrepared",
		AccountHandle:       formatXAccountHandle(accountUsername),
		ExecutedAt:          now,
		ReplyCommentTweetID: task.TargetTweetID,
		ReplyToUsername:     replyAuthorDisplay(task.TargetUsername),
		ReplyToTextPreview:  truncateReplyPreview(task.TargetTweetText, autoReplyPreviewRunes),
		ReplyTextPreview:    truncateReplyPreview(task.GeneratedComment, autoReplyPreviewRunes),
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		return err
	}
	task.ActivityLogID = log.ID
	return s.taskRepo.Save(task)
}

func autoCommentInputFromBot(target *model.AutoCommentTarget, bot *model.OAFBot, blocked []string) GenerateAutoCommentInput {
	if target == nil {
		return GenerateAutoCommentInput{Tone: "Friendly", BlockedWords: blocked}
	}
	return autoCommentInputFromValues(displayCommentTargetHandle(*target), target.TargetText, "Friendly", blocked, bot)
}

func autoCommentInputFromValues(username, tweet, tone string, blocked []string, bot *model.OAFBot) GenerateAutoCommentInput {
	in := GenerateAutoCommentInput{
		TargetUsername: normalizeHandle(username),
		TargetTweet:    tweet,
		Tone:           tone,
		BlockedWords:   blocked,
	}
	if bot == nil {
		return in
	}
	in.HasBot = true
	in.Name = bot.Name
	in.Occupation = bot.Occupation
	in.Industry = bot.Industry
	in.AgeRange = bot.AgeRange
	in.Gender = bot.Gender
	in.Education = bot.Education
	in.MBTI = bot.MBTI
	in.PersonalityTags = decodeStringList(bot.PersonalityTags)
	in.IdentitySummary = bot.IdentitySummary
	in.VoiceTone = bot.VoiceTone
	in.Topics = decodeStringList(bot.Topics)
	in.ForbiddenTopics = decodeStringList(bot.ForbiddenTopics)
	in.GrowthGoal = bot.GrowthGoal
	in.SafetyMode = bot.SafetyMode
	return in
}

func toAutoCommentTargetItem(row model.AutoCommentTarget) dto.AutoCommentTargetItem {
	item := dto.AutoCommentTargetItem{
		ID:                 row.ID,
		XAccountID:         row.XAccountID,
		TargetUserID:       row.TargetUserID,
		TargetUsername:     row.TargetUsername,
		TargetDisplayName:  row.TargetDisplayName,
		TargetTweetID:      row.TargetTweetID,
		TargetTweetURL:     row.TargetTweetURL,
		TargetAuthorHandle: row.TargetAuthorHandle,
		TargetText:         row.TargetText,
		Status:             row.Status,
		LastSeenTweetID:    row.LastSeenTweetID,
		LastFailureReason:  row.LastFailureReason,
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
		BotID:             row.BotID,
		XAccountID:        row.XAccountID,
		TargetID:          row.TargetID,
		TargetUserID:      row.TargetUserID,
		TargetUsername:    row.TargetUsername,
		TargetTweetID:     row.TargetTweetID,
		TargetTweetText:   row.TargetTweetText,
		TargetTweetAuthor: row.TargetTweetAuthor,
		GeneratedComment:  row.GeneratedComment,
		Status:            row.Status,
		RiskLevel:         row.RiskLevel,
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
