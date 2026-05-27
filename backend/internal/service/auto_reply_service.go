package service

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
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

var autoReplyTemplates = []string{
	"Thanks for your comment!",
	"Appreciate you stopping by!",
	"Thanks for chiming in!",
	"Great to hear from you—thank you!",
	"Thanks for the reply!",
}

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
	usageRepo      *repository.AIGenerationUsageRepository
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
	usageRepo *repository.AIGenerationUsageRepository,
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
		usageRepo:      usageRepo,
		ai:             ai,
		publishing:     publishing,
	}
}

func (s *AutoReplyService) ListDrafts(userID uint) (*dto.AutoReplyDraftsResponse, error) {
	rows, err := s.replyDraftRepo.ListByUser(userID, 50)
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
	generated, err := s.ai.GenerateAutoReply(ctx, autoReplyInputFromValues(req.CommentAuthorHandle, req.RootTweetText, req.CommentText, cfg.Tone, blocked, bot))
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

func pickAutoReplyTemplate() string {
	return autoReplyTemplates[rand.IntN(len(autoReplyTemplates))]
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
		result, err := s.runOnceForUser(runCtx, cfg.UserID)
		if err != nil {
			zap.L().Warn("auto reply: user tick failed", zap.Uint("user_id", cfg.UserID), zap.Error(err))
			result = autoReplyScanResult{status: autoReplyScanFailed, message: err.Error()}
		}
		if err := s.finishRun(&cfg, time.Now().UTC(), result); err != nil {
			zap.L().Warn("auto reply: finish run failed", zap.Uint("user_id", cfg.UserID), zap.Error(err))
		}
	}
}

func (s *AutoReplyService) runOnceForUser(ctx context.Context, userID uint) (autoReplyScanResult, error) {
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
		rootIDs, err := twitter.ListUserRootTweetIDs(ctx, nil, tok, twid, 8)
		if isXUnauthorizedError(err) {
			if refreshed, ok := s.refreshXAccountAfterUnauthorized(ctx, acc, append(base,
				zap.Uint("x_account_id", acc.ID),
				zap.String("account_handle", handle),
				zap.String("operation", "list_user_tweets"))...); ok {
				acc = refreshed
				tok = strings.TrimSpace(acc.AccessToken)
				tokenRefreshed = true
				rootIDs, err = twitter.ListUserRootTweetIDs(ctx, nil, tok, twid, 8)
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
		rootsChecked += len(rootIDs)
		for _, rootID := range rootIDs {
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
				template := pickAutoReplyTemplate()
				toUser := replyAuthorDisplay(c.AuthorUsername)
				toPrev := truncateReplyPreview(c.Text, autoReplyPreviewRunes)
				outPrev := truncateReplyPreview(template, autoReplyPreviewRunes)
				at := time.Now().UTC()
				tweetID, apiErr := twitter.CreateReplyTweet(ctx, tok, template, c.TweetID)
				if isXUnauthorizedError(apiErr) {
					if refreshed, ok := s.refreshXAccountAfterUnauthorized(ctx, acc, append(base,
						zap.Uint("x_account_id", acc.ID),
						zap.String("account_handle", handle),
						zap.String("comment_tweet_id", c.TweetID),
						zap.String("operation", "create_reply_tweet"))...); ok {
						acc = refreshed
						tok = strings.TrimSpace(acc.AccessToken)
						tokenRefreshed = true
						tweetID, apiErr = twitter.CreateReplyTweet(ctx, tok, template, c.TweetID)
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
	in.Hashtags = decodeStringList(bot.Hashtags)
	in.Keywords = decodeStringList(bot.Keywords)
	in.ComplianceNotes = bot.ComplianceNotes
	in.AvoidClaims = decodeStringList(bot.AvoidClaims)
	in.SafetyMode = bot.SafetyMode
	in.PrimaryLanguage = bot.PrimaryLanguage
	in.LanguageStrategy = bot.LanguageStrategy
	return in
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
