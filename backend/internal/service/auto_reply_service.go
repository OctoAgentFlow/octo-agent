package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
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

const (
	autoReplyPreviewRunes            = 160
	replyReservationStale            = 30 * time.Minute
	autoReplyDefaultIntervalMinutes  = 15
	autoReplyScanNoAccountReady      = "no_account_ready"
	autoReplyScanNoRecentPosts       = "no_recent_posts"
	autoReplyScanNoReplyCandidates   = "no_reply_candidates"
	autoReplyScanAlreadyHandled      = "already_handled"
	autoReplyScanTokenRefreshed      = "token_refreshed"
	autoReplyScanPublished           = "published"
	autoReplyScanFailed              = "failed"
	autoReplyScanSkippedSubscription = "skipped_subscription"
	autoReplyScanSkippedLimit        = "skipped_limit"
	autoReplyScanReauthRequired      = "reauth_required"
)

type autoReplyScanResult struct {
	status  string
	message string
}

type AutoReplyService struct {
	accountRepo    *repository.TwitterAccountRepository
	automationRepo *repository.AutomationRepository
	activityRepo   *repository.ActivityRepository
	replyResRepo   *repository.ReplyReservationRepository
	replyDraftRepo *repository.AutoReplyDraftRepository
	userRepo       *repository.UserRepository
	oafBotRepo     *repository.OAFBotRepository
	contentRepo    *repository.ContentLibraryRepository
	usageRepo      *repository.AIGenerationUsageRepository
	feedbackRepo   *repository.OAFBotGenerationFeedbackRepository
	verdictRepo    *repository.ReviewQueueFeedbackIssueVerdictRepository
	prefRepo       *repository.OAFBotLearningRulePreferenceRepository
	ai             *AIService
	publishing     *PublishingService
}

func NewAutoReplyService(
	accountRepo *repository.TwitterAccountRepository,
	automationRepo *repository.AutomationRepository,
	activityRepo *repository.ActivityRepository,
	replyResRepo *repository.ReplyReservationRepository,
	userRepo *repository.UserRepository,
	replyDraftRepo *repository.AutoReplyDraftRepository,
	oafBotRepo *repository.OAFBotRepository,
	contentRepo *repository.ContentLibraryRepository,
	usageRepo *repository.AIGenerationUsageRepository,
	feedbackRepo *repository.OAFBotGenerationFeedbackRepository,
	verdictRepo *repository.ReviewQueueFeedbackIssueVerdictRepository,
	prefRepo *repository.OAFBotLearningRulePreferenceRepository,
	ai *AIService,
	publishing *PublishingService,
) *AutoReplyService {
	return &AutoReplyService{
		accountRepo:    accountRepo,
		automationRepo: automationRepo,
		activityRepo:   activityRepo,
		replyResRepo:   replyResRepo,
		replyDraftRepo: replyDraftRepo,
		userRepo:       userRepo,
		oafBotRepo:     oafBotRepo,
		contentRepo:    contentRepo,
		usageRepo:      usageRepo,
		feedbackRepo:   feedbackRepo,
		verdictRepo:    verdictRepo,
		prefRepo:       prefRepo,
		ai:             ai,
		publishing:     publishing,
	}
}

func (s *AutoReplyService) ListDrafts(userID uint, limit int) (*dto.AutoReplyDraftsResponse, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := s.replyDraftRepo.ListByUser(userID, limit)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoReplyDraftItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, toAutoReplyDraftItem(row))
	}
	return &dto.AutoReplyDraftsResponse{Items: items}, nil
}

func (s *AutoReplyService) GenerateDraft(ctx context.Context, userID uint, req dto.AutoReplyDraftRequest) (*dto.AutoReplyDraftItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if strings.TrimSpace(req.CommentAuthorHandle) == "" {
		return nil, fmt.Errorf("comment author handle is required")
	}
	if strings.TrimSpace(req.CommentText) == "" {
		return nil, fmt.Errorf("comment text is required")
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	commentTweetID := strings.TrimSpace(req.CommentTweetID)
	if commentTweetID == "" {
		commentTweetID = extractTweetID(req.CommentURL)
	}
	if commentTweetID != "" {
		if existing, err := s.replyDraftRepo.GetByCommentTweet(userID, acc.ID, commentTweetID); err == nil {
			item := toAutoReplyDraftItem(*existing)
			return &item, nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	if err := s.automationRepo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	cfg, err := s.automationRepo.GetByUserAndType(userID, repository.AutomationTypeReply)
	if err != nil {
		return nil, err
	}
	mode := s.effectiveReplyExecutionMode(userID, cfg)
	if mode == ExecutionModeAutopilot {
		if err := s.assertAutoReplyMonthlyQuota(userID, now); err != nil {
			return nil, err
		}
	}
	bot, err := s.botForAccount(userID, acc.ID)
	if err != nil {
		return nil, err
	}
	blocked := blockedWordsFromConfig(cfg)
	input := autoReplyInputFromValues(req.CommentAuthorHandle, req.RootTweetText, req.CommentText, cfg.Tone, blocked, bot)
	input.ContentContext = s.contentContextForReply(userID, acc.ID, botIDForUsage(bot), req.RootTweetText, req.CommentText, bot)
	input.FeedbackSignals = s.generationFeedbackSignals(userID, botIDForUsage(bot), "reply")
	input.FeedbackSignals = appendFeedbackLearningSignals(input.FeedbackSignals, s.verdictRepo, s.prefRepo, userID, botIDForUsage(bot), "reply")
	generated, err := s.ai.GenerateAutoReply(ctx, input)
	if err != nil {
		return nil, err
	}
	reply := generated.Text
	risk := evaluateAutoCommentRisk(reply, bot, blocked)
	status, capability, approvalRequired, approvedAt := autoCommentInitialState(mode, risk, now)
	draft := &model.AutoReplyDraft{
		UserID:              userID,
		BotID:               botIDForUsage(bot),
		XAccountID:          acc.ID,
		CommentTweetID:      commentTweetID,
		CommentURL:          strings.TrimSpace(req.CommentURL),
		CommentAuthorHandle: normalizeHandle(req.CommentAuthorHandle),
		RootTweetText:       truncateRunes(req.RootTweetText, 1000),
		CommentText:         truncateRunes(req.CommentText, 1000),
		GeneratedReply:      truncateRunes(reply, autoReplyPreviewRunes),
		Status:              status,
		RiskLevel:           risk.Level,
		CapabilityStatus:    capability,
		FailureCategory:     risk.Category,
		FailureReason:       risk.Reason,
		ApprovalRequired:    approvalRequired,
		GeneratedAt:         &now,
		ApprovedAt:          approvedAt,
	}
	if err := s.replyDraftRepo.Create(draft); err != nil {
		return nil, err
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, draft.BotID, repository.AIGenerationSceneAutoReply, now, generated.Usage); err != nil {
		return nil, err
	}
	if mode == ExecutionModeAutopilot && draft.Status == "ready_to_publish" {
		if err := s.createAutopilotPreparedActivity(draft, acc.Username, now); err != nil {
			return nil, err
		}
		if s.publishing != nil {
			if _, _, err := s.publishing.EnsureReplyJob(draft, now); err != nil {
				return nil, err
			}
		}
	}
	item := toAutoReplyDraftItem(*draft)
	item.FeedbackSignalCount = len(input.FeedbackSignals)
	return &item, nil
}

func (s *AutoReplyService) UpdateDraft(userID, id uint, content string) (*dto.AutoReplyDraftItem, error) {
	draft, err := s.replyDraftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if draft.Status != "review" && draft.Status != "pending_review" && draft.Status != "draft" && draft.Status != "approved" {
		return nil, fmt.Errorf("draft cannot be edited from status %s", draft.Status)
	}
	draft.GeneratedReply = truncateRunes(content, autoReplyPreviewRunes)
	if draft.Status == "approved" {
		draft.Status = "pending_review"
		draft.ApprovedAt = nil
	}
	if err := s.replyDraftRepo.Save(draft); err != nil {
		return nil, err
	}
	item := toAutoReplyDraftItem(*draft)
	return &item, nil
}

func (s *AutoReplyService) RewriteDraft(ctx context.Context, userID, id uint, req dto.SocialDraftRewriteRequest) (*dto.AutoReplyDraftItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	draft, err := s.replyDraftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if draft.Status != "review" && draft.Status != "pending_review" && draft.Status != "draft" && draft.Status != "approved" {
		return nil, fmt.Errorf("draft cannot be rewritten from status %s", draft.Status)
	}
	if s.ai == nil {
		return nil, fmt.Errorf("AI service is not configured")
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	bot, err := s.botForAccount(userID, draft.XAccountID)
	if err != nil {
		return nil, err
	}
	accountHandle := ""
	if acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, draft.XAccountID); err == nil && acc != nil {
		accountHandle = acc.Username
	}
	botID := draft.BotID
	if botID == 0 {
		botID = botIDForUsage(bot)
	}
	feedbackRows := s.generationFeedbackRows(userID, botID, "reply")
	feedbackSignals := feedbackSignalsFromRows(feedbackRows)
	var learningRules []dto.OAFBotAppliedLearningRule
	feedbackSignals, learningRules = appendFeedbackLearningSignalsWithRules(feedbackSignals, s.verdictRepo, s.prefRepo, userID, botID, "reply", req.DisabledLearningIssues)
	generated, err := s.ai.RewriteSocialDraft(ctx, RewriteSocialDraftInput{
		Scene:            "auto_reply",
		AccountHandle:    accountHandle,
		TargetAuthor:     draft.CommentAuthorHandle,
		TargetText:       firstNonEmpty(draft.CommentText, draft.RootTweetText),
		OriginalDraft:    draft.GeneratedReply,
		RewriteMode:      req.RewriteMode,
		Feedback:         req.Feedback,
		BotName:          botString(bot, func(b *model.OAFBot) string { return b.Name }),
		BotIdentity:      botString(bot, func(b *model.OAFBot) string { return b.IdentitySummary }),
		BotVoice:         botString(bot, func(b *model.OAFBot) string { return b.VoiceTone }),
		GrowthGoal:       botString(bot, func(b *model.OAFBot) string { return b.GrowthGoal }),
		PrimaryLanguage:  botString(bot, func(b *model.OAFBot) string { return b.PrimaryLanguage }),
		LanguageStrategy: botString(bot, func(b *model.OAFBot) string { return b.LanguageStrategy }),
		FeedbackSignals:  feedbackSignals,
	})
	if err != nil {
		return nil, err
	}
	cfg, _ := s.automationRepo.GetByUserAndType(userID, repository.AutomationTypeReply)
	risk := evaluateAutoCommentRisk(generated.Text, bot, blockedWordsFromConfig(cfg))
	draft.GeneratedReply = truncateRunes(generated.Text, autoReplyPreviewRunes)
	draft.RiskLevel = risk.Level
	draft.FailureCategory = risk.Category
	draft.FailureReason = risk.Reason
	draft.GeneratedAt = &now
	if draft.Status == "approved" {
		draft.Status = "pending_review"
		draft.ApprovedAt = nil
	}
	if err := s.replyDraftRepo.Save(draft); err != nil {
		return nil, err
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, draft.BotID, repository.AIGenerationSceneAutoReply, now, generated.Usage); err != nil {
		return nil, err
	}
	item := toAutoReplyDraftItem(*draft)
	item.FeedbackSignalCount = len(feedbackSignals)
	item.FeedbackSignalSummary = feedbackSignalSummaryFromRowsAndRules(feedbackRows, learningRules)
	return &item, nil
}

func (s *AutoReplyService) generationFeedbackSignals(userID, botID uint, scene string) []string {
	return feedbackSignalsFromRows(s.generationFeedbackRows(userID, botID, scene))
}

func (s *AutoReplyService) generationFeedbackRows(userID, botID uint, scene string) []model.OAFBotGenerationFeedback {
	if s.feedbackRepo == nil || botID == 0 {
		return nil
	}
	rows, err := s.feedbackRepo.ListRecentNegativeByUserBotScene(userID, botID, scene, 6)
	if err != nil {
		zap.L().Warn("load auto reply rewrite feedback signals failed", zap.Uint("user_id", userID), zap.Uint("bot_id", botID), zap.String("scene", scene), zap.Error(err))
		return nil
	}
	return rows
}

func (s *AutoReplyService) ApproveDraft(userID, id uint) (*dto.AutoReplyDraftItem, error) {
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypeReply, "approve reply draft"); err != nil {
		return nil, err
	}
	draft, err := s.replyDraftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if draft.Status != "review" && draft.Status != "pending_review" && draft.Status != "draft" && draft.Status != "approved" {
		return nil, fmt.Errorf("draft cannot be approved from status %s", draft.Status)
	}
	now := time.Now().UTC()
	draft.Status = "approved"
	draft.ApprovedAt = &now
	if err := s.replyDraftRepo.Save(draft); err != nil {
		return nil, err
	}
	item := toAutoReplyDraftItem(*draft)
	return &item, nil
}

func (s *AutoReplyService) RejectDraft(userID, id uint, reason string) (*dto.AutoReplyDraftItem, error) {
	draft, err := s.replyDraftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	draft.Status = "rejected"
	draft.RejectedAt = &now
	draft.FailureReason = truncateErrMsg(strings.TrimSpace(reason))
	if draft.FailureReason == "" {
		draft.FailureReason = "Rejected by user."
	}
	if err := s.replyDraftRepo.Save(draft); err != nil {
		return nil, err
	}
	item := toAutoReplyDraftItem(*draft)
	return &item, nil
}

func (s *AutoReplyService) RetryDraft(ctx context.Context, userID, id uint) (*dto.AutoReplyDraftItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypeReply, "retry reply draft"); err != nil {
		return nil, err
	}
	draft, err := s.replyDraftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	commentTweetID := strings.TrimSpace(draft.CommentTweetID)
	if commentTweetID == "" {
		return nil, fmt.Errorf("comment tweet id is required to retry auto reply")
	}
	if strings.TrimSpace(draft.CommentText) == "" {
		return nil, fmt.Errorf("comment text is required to retry auto reply")
	}
	if s.ai == nil {
		return nil, fmt.Errorf("AI service is not configured")
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	if err := s.assertAutoReplyMonthlyQuota(userID, now); err != nil {
		return nil, err
	}
	if err := s.automationRepo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	cfg, err := s.automationRepo.GetByUserAndType(userID, repository.AutomationTypeReply)
	if err != nil {
		return nil, err
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, draft.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	if s.replyResRepo != nil {
		if err := s.replyResRepo.Release(userID, commentTweetID); err != nil {
			return nil, err
		}
		acquired, err := s.replyResRepo.TryAcquire(userID, commentTweetID)
		if err != nil {
			return nil, err
		}
		if !acquired {
			return nil, fmt.Errorf("auto reply retry is already queued for this comment")
		}
	}
	if err := s.deleteSuccessfulReplyDedup(userID, commentTweetID); err != nil {
		if s.replyResRepo != nil {
			_ = s.replyResRepo.Release(userID, commentTweetID)
		}
		return nil, err
	}

	bot, err := s.botForAccount(userID, acc.ID)
	if err != nil {
		if s.replyResRepo != nil {
			_ = s.replyResRepo.Release(userID, commentTweetID)
		}
		return nil, err
	}
	blocked := blockedWordsFromConfig(cfg)
	input := autoReplyInputFromValues(draft.CommentAuthorHandle, draft.RootTweetText, draft.CommentText, cfg.Tone, blocked, bot)
	input.ContentContext = s.contentContextForReply(userID, acc.ID, botIDForUsage(bot), draft.RootTweetText, draft.CommentText, bot)
	input.FeedbackSignals = s.generationFeedbackSignals(userID, botIDForUsage(bot), "reply")
	input.FeedbackSignals = appendFeedbackLearningSignals(input.FeedbackSignals, s.verdictRepo, s.prefRepo, userID, botIDForUsage(bot), "reply")
	generated, err := s.ai.GenerateAutoReply(ctx, input)
	if err != nil {
		if s.replyResRepo != nil {
			_ = s.replyResRepo.Release(userID, commentTweetID)
		}
		return nil, err
	}
	reply := truncateRunes(generated.Text, autoReplyPreviewRunes)
	risk := evaluateAutoCommentRisk(reply, bot, blocked)
	draft.BotID = botIDForUsage(bot)
	draft.GeneratedReply = reply
	draft.RiskLevel = risk.Level
	draft.CapabilityStatus = "ready"
	draft.FailureCategory = risk.Category
	draft.FailureReason = risk.Reason
	draft.ApprovalRequired = false
	draft.GeneratedAt = &now
	draft.ApprovedAt = &now
	draft.RejectedAt = nil
	draft.SentAt = nil
	if risk.Level == "high" {
		draft.Status = "failed"
		draft.FailureReason = firstNonEmpty(risk.Reason, "AI generated reply was blocked by safety rules.")
		if err := s.replyDraftRepo.Save(draft); err != nil {
			return nil, err
		}
		if s.replyResRepo != nil {
			_ = s.replyResRepo.Release(userID, commentTweetID)
		}
		item := toAutoReplyDraftItem(*draft)
		item.FeedbackSignalCount = len(input.FeedbackSignals)
		return &item, fmt.Errorf("AI generated reply was blocked by safety rules: %s", firstNonEmpty(risk.Reason, risk.Category, "high risk"))
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, draft.BotID, repository.AIGenerationSceneAutoReply, now, generated.Usage); err != nil {
		if s.replyResRepo != nil {
			_ = s.replyResRepo.Release(userID, commentTweetID)
		}
		return nil, err
	}

	tok := strings.TrimSpace(acc.AccessToken)
	tweetID, apiErr := twitter.CreateReplyTweet(ctx, tok, reply, commentTweetID)
	handle := formatXAccountHandle(acc.Username)
	if isXUnauthorizedError(apiErr) {
		if refreshed, ok := s.refreshXAccountAfterUnauthorized(ctx, *acc,
			zap.Uint("x_account_id", acc.ID),
			zap.String("account_handle", handle),
			zap.String("comment_tweet_id", commentTweetID),
			zap.String("operation", "retry_reply_tweet")); ok {
			acc = &refreshed
			tok = strings.TrimSpace(acc.AccessToken)
			tweetID, apiErr = twitter.CreateReplyTweet(ctx, tok, reply, commentTweetID)
		}
	}
	toUser := replyAuthorDisplay(draft.CommentAuthorHandle)
	toPrev := truncateReplyPreview(draft.CommentText, autoReplyPreviewRunes)
	outPrev := truncateReplyPreview(reply, autoReplyPreviewRunes)
	at := time.Now().UTC()
	if apiErr != nil {
		if s.replyResRepo != nil {
			_ = s.replyResRepo.Release(userID, commentTweetID)
		}
		msg := truncateErrMsg(apiErr.Error())
		var pub *twitter.PublishError
		if errors.As(apiErr, &pub) {
			msg = truncateErrMsg(pub.Error())
		}
		log := &model.ActivityLog{
			UserID:              userID,
			XAccountID:          acc.ID,
			Type:                "reply",
			Status:              "failed",
			PreviewKey:          "activity.preview.replyFailed",
			AccountHandle:       handle,
			ExecutedAt:          at,
			ErrorMessage:        msg,
			ReplyCommentTweetID: commentTweetID,
			ReplyToUsername:     toUser,
			ReplyToTextPreview:  toPrev,
			ReplyTextPreview:    outPrev,
		}
		if err := s.activityRepo.DB.Create(log).Error; err != nil {
			return nil, err
		}
		draft.Status = "failed"
		draft.FailureReason = msg
		draft.ActivityLogID = log.ID
		if err := s.replyDraftRepo.Save(draft); err != nil {
			return nil, err
		}
		item := toAutoReplyDraftItem(*draft)
		item.FeedbackSignalCount = len(input.FeedbackSignals)
		return &item, nil
	}
	ref := commentTweetID
	log := &model.ActivityLog{
		UserID:              userID,
		XAccountID:          acc.ID,
		Type:                "reply",
		Status:              "success",
		PreviewKey:          "activity.preview.replySuccess",
		AccountHandle:       handle,
		ExecutedAt:          at,
		RefTweetID:          &ref,
		ReplyCommentTweetID: commentTweetID,
		ReplyToUsername:     toUser,
		ReplyToTextPreview:  toPrev,
		ReplyTextPreview:    outPrev,
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		if s.replyResRepo != nil {
			_ = s.replyResRepo.Release(userID, commentTweetID)
		}
		return nil, err
	}
	draft.Status = "sent"
	draft.SentAt = &at
	draft.ActivityLogID = log.ID
	draft.FailureReason = ""
	if err := s.replyDraftRepo.Save(draft); err != nil {
		return nil, err
	}
	zap.L().Info("auto reply: manually retried", zap.Uint("user_id", userID), zap.String("comment_tweet_id", commentTweetID), zap.String("reply_tweet_id", tweetID))
	item := toAutoReplyDraftItem(*draft)
	item.FeedbackSignalCount = len(input.FeedbackSignals)
	return &item, nil
}

func (s *AutoReplyService) deleteSuccessfulReplyDedup(userID uint, commentTweetID string) error {
	if s == nil || s.activityRepo == nil {
		return nil
	}
	return s.activityRepo.DB.
		Where("user_id = ? AND type = ? AND status = ?", userID, "reply", "success").
		Where("(reply_comment_tweet_id = ? OR ref_tweet_id = ?)", commentTweetID, commentTweetID).
		Delete(&model.ActivityLog{}).Error
}

func truncateReplyPreview(s string, maxRunes int) string {
	s = strings.TrimSpace(s)
	if maxRunes <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= maxRunes {
		return s
	}
	return string(r[:maxRunes]) + "…"
}

func replyAuthorDisplay(username string) string {
	u := strings.TrimSpace(strings.TrimPrefix(username, "@"))
	if u == "" {
		return "@user"
	}
	return "@" + u
}

// RunTick processes users with reply automation enabled (one successful reply per user max per tick).
func (s *AutoReplyService) RunTick(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if s.replyResRepo != nil {
		if n, err := s.replyResRepo.DeleteOrphansWithoutActivity(time.Now().Add(-replyReservationStale)); err != nil {
			zap.L().Warn("auto reply: cleanup orphan reservations failed", zap.Error(err))
		} else if n > 0 {
			zap.L().Info("auto reply: removed orphan reservations", zap.Int64("rows", n))
		}
	}
	now := time.Now().UTC()
	configs, err := s.automationRepo.ListDueReplyAutomationConfigs(100, now)
	if err != nil {
		zap.L().Warn("auto reply: list due configs failed", zap.Error(err))
		return
	}
	for _, cfg := range configs {
		runCtx := requestid.NewContext(ctx, "scheduler")
		result, err := s.runOnceForUser(runCtx, cfg)
		if err != nil {
			zap.L().Warn("auto reply: user tick failed", zap.Uint("user_id", cfg.UserID), zap.Error(err))
			result = autoReplyScanResult{status: autoReplyScanFailed, message: err.Error()}
		}
		if err := s.finishRun(&cfg, time.Now().UTC(), result); err != nil {
			zap.L().Warn("auto reply: finish run failed", zap.Uint("user_id", cfg.UserID), zap.Error(err))
		}
	}
}

func (s *AutoReplyService) runOnceForUser(ctx context.Context, cfg model.AutomationConfig) (autoReplyScanResult, error) {
	userID := cfg.UserID
	rid := requestid.FromContext(ctx)
	if rid == "" {
		rid = "scheduler"
	}
	base := []zap.Field{zap.String("request_id", rid), zap.Uint("user_id", userID)}
	now := time.Now().UTC()
	result := autoReplyScanResult{status: autoReplyScanNoReplyCandidates, message: "Scanned. No new reply candidates found."}
	tokenRefreshed := false
	accountsChecked := 0
	rootsChecked := 0
	repliesChecked := 0
	alreadyHandled := 0

	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return autoReplyScanResult{status: autoReplyScanFailed, message: err.Error()}, err
	}
	if err := subscription.AssertUserMayProduceContent(u, now); err != nil {
		zap.L().Debug("auto reply: skip (subscription)", append(base, zap.Error(err))...)
		return autoReplyScanResult{status: autoReplyScanSkippedSubscription, message: err.Error()}, nil
	}

	if hit, why := s.replyLimitsExceeded(userID, now); hit {
		zap.L().Debug("auto reply: skip (limits)", append(base, zap.String("reason", why))...)
		return autoReplyScanResult{status: autoReplyScanSkippedLimit, message: why}, nil
	}

	accts, err := s.accountRepo.ListByUserID(userID)
	if err != nil {
		return autoReplyScanResult{status: autoReplyScanFailed, message: err.Error()}, err
	}
	for _, acc := range accts {
		twid := strings.TrimSpace(acc.TwitterUserID)
		tok := strings.TrimSpace(acc.AccessToken)
		if twid == "" || tok == "" {
			continue
		}
		accountsChecked++
		handle := formatXAccountHandle(acc.Username)
		rootTweets, err := twitter.ListUserRootTweets(ctx, nil, tok, twid, 8)
		if isXUnauthorizedError(err) {
			if refreshed, ok := s.refreshXAccountAfterUnauthorized(ctx, acc, append(base,
				zap.Uint("x_account_id", acc.ID),
				zap.String("account_handle", handle),
				zap.String("operation", "list_user_tweets"))...); ok {
				acc = refreshed
				tok = strings.TrimSpace(acc.AccessToken)
				tokenRefreshed = true
				rootTweets, err = twitter.ListUserRootTweets(ctx, nil, tok, twid, 8)
			} else {
				result = autoReplyScanResult{status: autoReplyScanReauthRequired, message: "X authorization expired. Reauthorization is required."}
			}
		}
		if err != nil {
			zap.L().Warn("auto reply: list user tweets failed", append(base,
				zap.Uint("x_account_id", acc.ID),
				zap.String("account_handle", handle),
				zap.Error(err))...)
			if result.status != autoReplyScanReauthRequired {
				result = autoReplyScanResult{status: autoReplyScanFailed, message: err.Error()}
			}
			continue
		}
		rootsChecked += len(rootTweets)
		for _, root := range rootTweets {
			rootID := strings.TrimSpace(root.ID)
			if rootID == "" {
				continue
			}
			replies, err := twitter.ListDirectRepliesFromOthers(ctx, nil, tok, rootID, twid)
			if isXUnauthorizedError(err) {
				if refreshed, ok := s.refreshXAccountAfterUnauthorized(ctx, acc, append(base,
					zap.Uint("x_account_id", acc.ID),
					zap.String("account_handle", handle),
					zap.String("root_tweet_id", rootID),
					zap.String("operation", "list_direct_replies"))...); ok {
					acc = refreshed
					tok = strings.TrimSpace(acc.AccessToken)
					tokenRefreshed = true
					replies, err = twitter.ListDirectRepliesFromOthers(ctx, nil, tok, rootID, twid)
				} else {
					result = autoReplyScanResult{status: autoReplyScanReauthRequired, message: "X authorization expired. Reauthorization is required."}
				}
			}
			if err != nil {
				zap.L().Warn("auto reply: conversation search failed", append(base,
					zap.String("root_tweet_id", rootID),
					zap.String("account_handle", handle),
					zap.Error(err))...)
				if result.status != autoReplyScanReauthRequired {
					result = autoReplyScanResult{status: autoReplyScanFailed, message: err.Error()}
				}
				continue
			}
			repliesChecked += len(replies)
			for _, c := range replies {
				if c.TweetID == "" {
					continue
				}
				ok, err := s.activityRepo.HasSuccessfulReplyToRefTweet(userID, c.TweetID)
				if err != nil {
					return autoReplyScanResult{status: autoReplyScanFailed, message: err.Error()}, err
				}
				if ok {
					alreadyHandled++
					continue
				}
				if s.replyResRepo != nil {
					acquired, err := s.replyResRepo.TryAcquire(userID, c.TweetID)
					if err != nil {
						return autoReplyScanResult{status: autoReplyScanFailed, message: err.Error()}, err
					}
					if !acquired {
						alreadyHandled++
						continue
					}
				}
				reply, draft, genErr := s.generateAutopilotReply(ctx, userID, acc, cfg, root.Text, c, now)
				if genErr != nil {
					if s.replyResRepo != nil {
						_ = s.replyResRepo.Release(userID, c.TweetID)
					}
					msg := truncateErrMsg(genErr.Error())
					zap.L().Warn("auto reply: ai generation failed", append(base,
						zap.String("account_handle", handle),
						zap.String("comment_tweet_id", c.TweetID),
						zap.String("detail", msg))...)
					return autoReplyScanResult{status: autoReplyScanFailed, message: msg}, nil
				}
				toUser := replyAuthorDisplay(c.AuthorUsername)
				toPrev := truncateReplyPreview(c.Text, autoReplyPreviewRunes)
				outPrev := truncateReplyPreview(reply, autoReplyPreviewRunes)
				at := time.Now().UTC()
				tweetID, apiErr := twitter.CreateReplyTweet(ctx, tok, reply, c.TweetID)
				if isXUnauthorizedError(apiErr) {
					if refreshed, ok := s.refreshXAccountAfterUnauthorized(ctx, acc, append(base,
						zap.Uint("x_account_id", acc.ID),
						zap.String("account_handle", handle),
						zap.String("comment_tweet_id", c.TweetID),
						zap.String("operation", "create_reply_tweet"))...); ok {
						acc = refreshed
						tok = strings.TrimSpace(acc.AccessToken)
						tokenRefreshed = true
						tweetID, apiErr = twitter.CreateReplyTweet(ctx, tok, reply, c.TweetID)
					} else {
						result = autoReplyScanResult{status: autoReplyScanReauthRequired, message: "X authorization expired. Reauthorization is required."}
					}
				}
				if apiErr != nil {
					if s.replyResRepo != nil {
						_ = s.replyResRepo.Release(userID, c.TweetID)
					}
					msg := truncateErrMsg(apiErr.Error())
					var pub *twitter.PublishError
					if errors.As(apiErr, &pub) {
						msg = truncateErrMsg(pub.Error())
					}
					log := &model.ActivityLog{
						UserID:              userID,
						XAccountID:          acc.ID,
						Type:                "reply",
						Status:              "failed",
						PreviewKey:          "activity.preview.replyFailed",
						AccountHandle:       handle,
						ExecutedAt:          at,
						ErrorMessage:        msg,
						ReplyCommentTweetID: c.TweetID,
						ReplyToUsername:     toUser,
						ReplyToTextPreview:  toPrev,
						ReplyTextPreview:    outPrev,
					}
					if err := s.activityRepo.DB.Create(log).Error; err != nil {
						return autoReplyScanResult{status: autoReplyScanFailed, message: err.Error()}, err
					}
					if draft != nil {
						draft.Status = "failed"
						draft.FailureReason = msg
						draft.ActivityLogID = log.ID
						_ = s.replyDraftRepo.Save(draft)
					}
					zap.L().Warn("auto reply: x api rejected", append(base,
						zap.String("account_handle", handle),
						zap.String("comment_tweet_id", c.TweetID),
						zap.String("detail", msg))...)
					if result.status == autoReplyScanReauthRequired {
						return result, nil
					}
					return autoReplyScanResult{status: autoReplyScanFailed, message: msg}, nil
				}
				ref := c.TweetID
				log := &model.ActivityLog{
					UserID:              userID,
					XAccountID:          acc.ID,
					Type:                "reply",
					Status:              "success",
					PreviewKey:          "activity.preview.replySuccess",
					AccountHandle:       handle,
					ExecutedAt:          at,
					RefTweetID:          &ref,
					ReplyCommentTweetID: c.TweetID,
					ReplyToUsername:     toUser,
					ReplyToTextPreview:  toPrev,
					ReplyTextPreview:    outPrev,
				}
				if err := s.activityRepo.DB.Create(log).Error; err != nil {
					if s.replyResRepo != nil {
						_ = s.replyResRepo.Release(userID, c.TweetID)
					}
					return autoReplyScanResult{status: autoReplyScanFailed, message: err.Error()}, err
				}
				if draft != nil {
					draft.Status = "sent"
					draft.SentAt = &at
					draft.ActivityLogID = log.ID
					_ = s.replyDraftRepo.Save(draft)
				}
				zap.L().Info("auto reply: published", append(base,
					zap.String("account_handle", handle),
					zap.String("comment_tweet_id", c.TweetID),
					zap.String("reply_tweet_id", tweetID),
				)...)
				return autoReplyScanResult{status: autoReplyScanPublished, message: fmt.Sprintf("Published an auto reply to %s.", toUser)}, nil
			}
		}
	}
	if accountsChecked == 0 {
		return autoReplyScanResult{status: autoReplyScanNoAccountReady, message: "No connected X account with usable token was found."}, nil
	}
	if tokenRefreshed {
		return autoReplyScanResult{status: autoReplyScanTokenRefreshed, message: "X authorization was refreshed. Scanned successfully."}, nil
	}
	if rootsChecked == 0 && result.status == autoReplyScanNoReplyCandidates {
		return autoReplyScanResult{status: autoReplyScanNoRecentPosts, message: "Scanned. No recent original posts found."}, nil
	}
	if repliesChecked > 0 && alreadyHandled >= repliesChecked {
		return autoReplyScanResult{status: autoReplyScanAlreadyHandled, message: "Scanned. Existing replies have already been handled."}, nil
	}
	return result, nil
}

func (s *AutoReplyService) generateAutopilotReply(ctx context.Context, userID uint, acc model.TwitterAccount, cfg model.AutomationConfig, rootTweet string, reply twitter.ConversationReply, now time.Time) (string, *model.AutoReplyDraft, error) {
	if s.ai == nil {
		return "", nil, fmt.Errorf("AI service is not configured")
	}
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return "", nil, err
	}
	if err := s.assertAutoReplyMonthlyQuota(userID, now); err != nil {
		return "", nil, err
	}
	bot, err := s.botForAccount(userID, acc.ID)
	if err != nil {
		return "", nil, err
	}
	blocked := blockedWordsFromConfig(&cfg)
	input := autoReplyInputFromValues(reply.AuthorUsername, rootTweet, reply.Text, cfg.Tone, blocked, bot)
	input.ContentContext = s.contentContextForReply(userID, acc.ID, botIDForUsage(bot), rootTweet, reply.Text, bot)
	input.FeedbackSignals = s.generationFeedbackSignals(userID, botIDForUsage(bot), "reply")
	input.FeedbackSignals = appendFeedbackLearningSignals(input.FeedbackSignals, s.verdictRepo, s.prefRepo, userID, botIDForUsage(bot), "reply")
	generated, err := s.ai.GenerateAutoReply(ctx, input)
	if err != nil {
		return "", nil, err
	}
	content := truncateRunes(generated.Text, autoReplyPreviewRunes)
	if strings.TrimSpace(content) == "" {
		return "", nil, fmt.Errorf("AI generated an empty auto reply")
	}
	risk := evaluateAutoCommentRisk(content, bot, blocked)
	if risk.Level == "high" {
		return "", nil, fmt.Errorf("AI generated reply was blocked by safety rules: %s", firstNonEmpty(risk.Reason, risk.Category, "high risk"))
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, botIDForUsage(bot), repository.AIGenerationSceneAutoReply, now, generated.Usage); err != nil {
		return "", nil, err
	}
	draft := &model.AutoReplyDraft{
		UserID:              userID,
		BotID:               botIDForUsage(bot),
		XAccountID:          acc.ID,
		CommentTweetID:      strings.TrimSpace(reply.TweetID),
		CommentAuthorHandle: normalizeHandle(reply.AuthorUsername),
		RootTweetText:       truncateRunes(rootTweet, 1000),
		CommentText:         truncateRunes(reply.Text, 1000),
		GeneratedReply:      content,
		Status:              "ready_to_publish",
		RiskLevel:           risk.Level,
		CapabilityStatus:    "ready",
		FailureCategory:     risk.Category,
		FailureReason:       risk.Reason,
		ApprovalRequired:    false,
		GeneratedAt:         &now,
		ApprovedAt:          &now,
	}
	if err := s.replyDraftRepo.Create(draft); err != nil {
		return "", nil, err
	}
	return content, draft, nil
}

func (s *AutoReplyService) finishRun(cfg *model.AutomationConfig, now time.Time, result autoReplyScanResult) error {
	if cfg == nil {
		return nil
	}
	status := strings.TrimSpace(result.status)
	if status == "" {
		status = autoReplyScanNoReplyCandidates
	}
	cfg.LastRunAt = &now
	cfg.LastScanAt = &now
	cfg.LastScanStatus = status
	cfg.LastScanMessage = truncateRunes(strings.TrimSpace(result.message), 512)
	next := now.Add(time.Duration(autoReplyIntervalMinutes(cfg)) * time.Minute)
	cfg.NextRunAt = &next
	if cfg.Enabled && cfg.State != "Paused" {
		cfg.State = "Queued"
	}
	return s.automationRepo.Save(cfg)
}

func autoReplyIntervalMinutes(cfg *model.AutomationConfig) int {
	if cfg == nil || cfg.FrequencyIntervalMinutes <= 0 {
		return autoReplyDefaultIntervalMinutes
	}
	return cfg.FrequencyIntervalMinutes
}

func (s *AutoReplyService) refreshXAccountAfterUnauthorized(ctx context.Context, acc model.TwitterAccount, fields ...zap.Field) (model.TwitterAccount, bool) {
	if s == nil || s.publishing == nil {
		zap.L().Warn("auto reply: x token refresh unavailable", fields...)
		return acc, false
	}
	refreshed, err := s.publishing.RefreshXAccessTokenForAccount(ctx, &acc)
	if err != nil {
		zap.L().Warn("auto reply: x token refresh failed; account marked for reauth", append(fields, zap.Error(err))...)
		return acc, false
	}
	if refreshed == nil {
		zap.L().Warn("auto reply: x token refresh returned empty account", fields...)
		return acc, false
	}
	zap.L().Info("auto reply: x token refreshed after unauthorized", fields...)
	return *refreshed, true
}

func (s *AutoReplyService) replyLimitsExceeded(userID uint, now time.Time) (hit bool, reason string) {
	return false, ""
}

func (s *AutoReplyService) effectiveReplyExecutionMode(userID uint, cfg *model.AutomationConfig) string {
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

func (s *AutoReplyService) assertAutoReplyMonthlyQuota(userID uint, now time.Time) error {
	if s.replyDraftRepo == nil || s.userRepo == nil {
		return nil
	}
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	limit := subscription.LimitsForUser(u).MonthlyAutoReplies
	if limit <= 0 {
		return fmt.Errorf("monthly auto reply quota exceeded")
	}
	monthStart := startOfUTCMonth(now)
	used, err := s.replyDraftRepo.CountCreatedBetween(userID, monthStart, now)
	if err != nil {
		return err
	}
	if used >= limit {
		return fmt.Errorf("monthly auto reply quota exceeded")
	}
	return nil
}

func (s *AutoReplyService) botForAccount(userID, xAccountID uint) (*model.OAFBot, error) {
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

func (s *AutoReplyService) createAutopilotPreparedActivity(draft *model.AutoReplyDraft, accountUsername string, now time.Time) error {
	if s.activityRepo == nil || draft == nil {
		return nil
	}
	log := &model.ActivityLog{
		UserID:              draft.UserID,
		XAccountID:          draft.XAccountID,
		Type:                "reply",
		Status:              "review",
		PreviewKey:          "activity.preview.replyAutopilotPrepared",
		AccountHandle:       formatXAccountHandle(accountUsername),
		ExecutedAt:          now,
		ReplyCommentTweetID: draft.CommentTweetID,
		ReplyToUsername:     replyAuthorDisplay(draft.CommentAuthorHandle),
		ReplyToTextPreview:  truncateReplyPreview(draft.CommentText, autoReplyPreviewRunes),
		ReplyTextPreview:    truncateReplyPreview(draft.GeneratedReply, autoReplyPreviewRunes),
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		return err
	}
	draft.ActivityLogID = log.ID
	return s.replyDraftRepo.Save(draft)
}

func autoReplyInputFromValues(author, rootTweet, comment, tone string, blocked []string, bot *model.OAFBot) GenerateAutoReplyInput {
	in := GenerateAutoReplyInput{
		CommentAuthor: normalizeHandle(author),
		RootTweet:     rootTweet,
		CommentText:   comment,
		Tone:          tone,
		BlockedWords:  blocked,
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
	in.ProjectOneLiner = bot.ProjectOneLiner
	in.TargetAudience = bot.TargetAudience
	in.CoreValueProps = bot.CoreValueProps
	in.ProductFeatures = bot.ProductFeatures
	in.Differentiators = bot.Differentiators
	in.ContentPillars = decodeStringList(bot.ContentPillars)
	in.ContentObjectives = bot.ContentObjectives
	in.PreferredCTA = bot.PreferredCTA
	in.WebsiteURL = bot.WebsiteURL
	in.TelegramURL = bot.TelegramURL
	in.DiscordURL = bot.DiscordURL
	in.DocsURL = bot.DocsURL
	in.CTAPolicy = bot.CTAPolicy
	in.Hashtags = decodeStringList(bot.Hashtags)
	in.Keywords = decodeStringList(bot.Keywords)
	in.ComplianceNotes = bot.ComplianceNotes
	in.AvoidClaims = decodeStringList(bot.AvoidClaims)
	in.SafetyMode = bot.SafetyMode
	in.PrimaryLanguage = bot.PrimaryLanguage
	in.LanguageStrategy = bot.LanguageStrategy
	return in
}

func (s *AutoReplyService) contentContextForReply(userID, xAccountID, botID uint, rootTweet, comment string, bot *model.OAFBot) []GenerationContentContextItem {
	return contentContextForGeneration(s.contentRepo, userID, xAccountID, botID, rootTweet, comment, bot)
}

func contentContextForGeneration(repo *repository.ContentLibraryRepository, userID, xAccountID, botID uint, primary, secondary string, bot *model.OAFBot) []GenerationContentContextItem {
	if repo == nil {
		return nil
	}
	rows, err := repo.ListActiveForGenerationContext(userID, xAccountID, botID, 30)
	if err != nil || len(rows) == 0 {
		return nil
	}
	query := strings.Join([]string{primary, secondary}, " ")
	if bot != nil {
		query += " " + strings.Join(decodeStringList(bot.Keywords), " ")
		query += " " + strings.Join(decodeStringList(bot.Topics), " ")
	}
	type scoredItem struct {
		item  model.ContentLibraryItem
		score int
	}
	scored := make([]scoredItem, 0, len(rows))
	for _, row := range rows {
		score := contentContextScore(row, query)
		if score <= 0 {
			score = row.Priority / 10
		}
		scored = append(scored, scoredItem{item: row, score: score})
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		if scored[i].item.Priority != scored[j].item.Priority {
			return scored[i].item.Priority > scored[j].item.Priority
		}
		return scored[i].item.UpdatedAt.After(scored[j].item.UpdatedAt)
	})
	limit := 3
	out := make([]GenerationContentContextItem, 0, limit)
	for _, entry := range scored {
		if len(out) >= limit {
			break
		}
		item := entry.item
		out = append(out, GenerationContentContextItem{
			Title:         item.Title,
			ItemType:      item.ItemType,
			Body:          item.Body,
			SourceURL:     item.SourceURL,
			Topics:        decodeStringList(item.Topics),
			GrowthGoal:    item.GrowthGoal,
			CTAPreference: item.CTAPreference,
		})
	}
	return out
}

func contentContextScore(item model.ContentLibraryItem, query string) int {
	query = strings.ToLower(query)
	if strings.TrimSpace(query) == "" {
		return 0
	}
	score := 0
	fields := []string{item.Title, item.Body, item.ItemType, item.GrowthGoal, item.CTAPreference}
	fields = append(fields, decodeStringList(item.Topics)...)
	for _, field := range fields {
		for _, token := range contentContextTokens(field) {
			if len(token) < 3 {
				continue
			}
			if strings.Contains(query, token) {
				score += 2
			}
		}
	}
	return score
}

func contentContextTokens(value string) []string {
	value = strings.ToLower(value)
	return strings.FieldsFunc(value, func(r rune) bool {
		return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9')
	})
}

func toAutoReplyDraftItem(row model.AutoReplyDraft) dto.AutoReplyDraftItem {
	item := dto.AutoReplyDraftItem{
		ID:                  row.ID,
		BotID:               row.BotID,
		XAccountID:          row.XAccountID,
		CommentTweetID:      row.CommentTweetID,
		CommentURL:          row.CommentURL,
		CommentAuthorHandle: row.CommentAuthorHandle,
		RootTweetText:       row.RootTweetText,
		CommentText:         row.CommentText,
		GeneratedReply:      row.GeneratedReply,
		Status:              row.Status,
		RiskLevel:           row.RiskLevel,
		CapabilityStatus:    row.CapabilityStatus,
		FailureCategory:     row.FailureCategory,
		FailureReason:       row.FailureReason,
		ApprovalRequired:    row.ApprovalRequired,
		ActivityLogID:       row.ActivityLogID,
		CreatedAt:           row.CreatedAt.UTC().Format(time.RFC3339),
	}
	if row.GeneratedAt != nil {
		item.GeneratedAt = row.GeneratedAt.UTC().Format(time.RFC3339)
	}
	if row.ApprovedAt != nil {
		item.ApprovedAt = row.ApprovedAt.UTC().Format(time.RFC3339)
	}
	if row.RejectedAt != nil {
		item.RejectedAt = row.RejectedAt.UTC().Format(time.RFC3339)
	}
	if row.SentAt != nil {
		item.SentAt = row.SentAt.UTC().Format(time.RFC3339)
	}
	return item
}
