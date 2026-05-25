package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"octo-agent/backend/internal/alert"
	"octo-agent/backend/internal/config"
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
	maxPostContentRunes = 5000
	minPostContentRunes = 1

	staleProcessingRecovery = 5 * time.Minute
	defaultRateLimitBackoff = 15 * time.Minute
	maxRateLimitBackoff     = 24 * time.Hour
	errMsgMaxRunes          = 1000
)

type PostService struct {
	postRepo       *repository.PostRepository
	accountRepo    *repository.TwitterAccountRepository
	automationRepo *repository.AutomationRepository
	activityRepo   *repository.ActivityRepository
	userRepo       *repository.UserRepository
	oafBotRepo     *repository.OAFBotRepository
	usageRepo      *repository.AIGenerationUsageRepository
	ai             *AIService
	xPublisher     config.XPublisherConfig
}

func NewPostService(
	postRepo *repository.PostRepository,
	accountRepo *repository.TwitterAccountRepository,
	automationRepo *repository.AutomationRepository,
	activityRepo *repository.ActivityRepository,
	userRepo *repository.UserRepository,
	oafBotRepo *repository.OAFBotRepository,
	usageRepo *repository.AIGenerationUsageRepository,
	ai *AIService,
	xPublisher config.XPublisherConfig,
) *PostService {
	return &PostService{
		postRepo:       postRepo,
		accountRepo:    accountRepo,
		automationRepo: automationRepo,
		activityRepo:   activityRepo,
		userRepo:       userRepo,
		oafBotRepo:     oafBotRepo,
		usageRepo:      usageRepo,
		ai:             ai,
		xPublisher:     xPublisher,
	}
}

// ErrExecuteUpstream is returned when X API rejects the publish after the post was marked failed.
type ErrExecuteUpstream string

func (e ErrExecuteUpstream) Error() string { return string(e) }

// ErrExecuteRateLimited is returned on manual execute when X rate-limits; post is rescheduled.
type ErrExecuteRateLimited string

func (e ErrExecuteRateLimited) Error() string { return string(e) }

// StaleProcessingMaxAge is exported for the job layer (processing → scheduled recovery).
func StaleProcessingMaxAge() time.Duration { return staleProcessingRecovery }

func (s *PostService) List(userID uint, q dto.PostListQuery) (*dto.PostListResponse, error) {
	page := q.Page
	if page <= 0 {
		page = 1
	}
	pageSize := q.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	items, total, err := s.postRepo.List(userID, page, pageSize)
	if err != nil {
		return nil, err
	}
	out := make([]dto.PostItem, 0, len(items))
	for _, p := range items {
		out = append(out, postModelToDTO(p))
	}
	return &dto.PostListResponse{
		Items: out,
		Pagination: dto.PostPagination{
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		},
	}, nil
}

func (s *PostService) Get(userID, id uint) (*dto.PostItem, error) {
	p, err := s.postRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	item := postModelToDTO(*p)
	return &item, nil
}

func (s *PostService) Create(userID uint, req dto.PostCreateRequest) (*dto.PostItem, error) {
	content := strings.TrimSpace(req.Content)
	if err := validatePostContent(content); err != nil {
		return nil, err
	}
	if _, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, req.XAccountID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("x_account_id not found or not connected")
		}
		return nil, err
	}
	status := strings.TrimSpace(strings.ToLower(req.Status))
	if status == "" {
		status = "draft"
	}
	if !isUserSettablePostStatus(status) {
		return nil, errors.New("invalid status")
	}
	if status == "scheduled" || status == "published" {
		if err := s.assertSubscriptionAllowsContentProduction(userID); err != nil {
			return nil, err
		}
	}
	sched, pub, err := parseCreateTimes(status, req.ScheduledAt, req.PublishedAt)
	if err != nil {
		return nil, err
	}
	if status == "scheduled" && sched == nil {
		return nil, errors.New("scheduled_at is required when status is scheduled")
	}
	if status == "scheduled" && !sched.After(time.Now().UTC()) {
		return nil, errors.New("scheduled_at must be in the future")
	}
	if status == "published" && pub == nil {
		now := time.Now().UTC()
		pub = &now
	}
	p := &model.Post{
		UserID:      userID,
		XAccountID:  req.XAccountID,
		Content:     content,
		Status:      status,
		ScheduledAt: sched,
		PublishedAt: pub,
	}
	if err := s.postRepo.Create(p); err != nil {
		return nil, err
	}
	item := postModelToDTO(*p)
	return &item, nil
}

func (s *PostService) Update(userID, id uint, req dto.PostUpdateRequest) (*dto.PostItem, error) {
	p, err := s.postRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	oldStatus := strings.ToLower(strings.TrimSpace(p.Status))
	if p.Status == "processing" {
		return nil, errors.New("post is being published; try again later")
	}
	if req.Content != nil {
		c := strings.TrimSpace(*req.Content)
		if err := validatePostContent(c); err != nil {
			return nil, err
		}
		p.Content = c
	}
	if req.XAccountID != nil {
		if _, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, *req.XAccountID); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, errors.New("x_account_id not found or not connected")
			}
			return nil, err
		}
		p.XAccountID = *req.XAccountID
	}
	if req.Status != nil {
		st := strings.TrimSpace(strings.ToLower(*req.Status))
		if !isUserSettablePostStatus(st) {
			return nil, errors.New("invalid status")
		}
		p.Status = st
	}
	// Times: apply if pointer present in request (empty string clears optional fields handled below)
	if req.ScheduledAt != nil {
		if strings.TrimSpace(*req.ScheduledAt) == "" {
			p.ScheduledAt = nil
		} else {
			t, err := time.Parse(time.RFC3339, strings.TrimSpace(*req.ScheduledAt))
			if err != nil {
				return nil, errors.New("invalid scheduled_at (use RFC3339)")
			}
			utc := t.UTC()
			p.ScheduledAt = &utc
		}
	}
	if req.PublishedAt != nil {
		if strings.TrimSpace(*req.PublishedAt) == "" {
			p.PublishedAt = nil
		} else {
			t, err := time.Parse(time.RFC3339, strings.TrimSpace(*req.PublishedAt))
			if err != nil {
				return nil, errors.New("invalid published_at (use RFC3339)")
			}
			utc := t.UTC()
			p.PublishedAt = &utc
		}
	}
	if p.Status == "scheduled" && p.ScheduledAt == nil {
		return nil, errors.New("scheduled_at is required when status is scheduled")
	}
	if p.Status == "scheduled" && !p.ScheduledAt.After(time.Now().UTC()) {
		return nil, errors.New("scheduled_at must be in the future")
	}
	if p.Status != "failed" {
		p.LastErrorMessage = ""
	}
	stOut := strings.ToLower(strings.TrimSpace(p.Status))
	needsSub := false
	switch {
	case stOut == "scheduled":
		needsSub = true
	case stOut == "published" && oldStatus != "published":
		needsSub = true
	}
	if needsSub {
		if err := s.assertSubscriptionAllowsContentProduction(userID); err != nil {
			return nil, err
		}
	}
	if err := s.postRepo.Save(p); err != nil {
		return nil, err
	}
	item := postModelToDTO(*p)
	return &item, nil
}

func (s *PostService) Delete(userID, id uint) error {
	p, err := s.postRepo.GetByUserAndID(userID, id)
	if err != nil {
		return err
	}
	if p.Status == "processing" {
		return errors.New("post is being published; try again later")
	}
	return s.postRepo.DeleteByUserAndID(userID, id)
}

func (s *PostService) Generate(ctx context.Context, userID uint, req dto.PostGenerateRequest) (*dto.PostGenerateResponse, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, req.XAccountID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("x_account_id not found or not connected")
		}
		return nil, err
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	var bot *model.OAFBot
	if s.oafBotRepo != nil {
		bot, err = s.oafBotRepo.GetByUserAndTwitterAccountID(userID, req.XAccountID)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			bot = nil
		}
	}
	generated, err := s.ai.GenerateAutoPost(ctx, autoPostInputFromBot(acc, bot, req.Topic))
	if err != nil {
		return nil, err
	}
	botID := botIDForUsage(bot)
	if err := recordAIGenerationUsage(s.usageRepo, userID, botID, repository.AIGenerationSceneAutoPost, now, generated.Usage); err != nil {
		return nil, err
	}
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	limits := subscription.LimitsForUser(user)
	return &dto.PostGenerateResponse{
		Content: generated.Text,
		BotID:   botID,
		Scene:   repository.AIGenerationSceneAutoPost,
		Usage: dto.PlanUsageData{
			AIGenerationsMonth: currentAIGenerationUsage(s.usageRepo, userID, now),
		},
		Limits: planLimitsToDTO(limits),
	}, nil
}

// Execute publishes the post via X API (manual run). Draft, scheduled, and failed posts can be sent.
func (s *PostService) Execute(ctx context.Context, userID, postID uint) (*dto.PostExecuteResponse, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	item, tweetID, err := s.executePublish(ctx, userID, postID, []string{"draft", "scheduled", "failed"}, "manual")
	if err != nil {
		return nil, err
	}
	return &dto.PostExecuteResponse{Post: *item, TweetID: tweetID}, nil
}

// ExecuteScheduled publishes a post that was claimed as processing by the scheduler.
func (s *PostService) ExecuteScheduled(ctx context.Context, userID, postID uint) error {
	if ctx == nil {
		ctx = context.Background()
	}
	_, _, err := s.executePublish(ctx, userID, postID, []string{"processing"}, "scheduler")
	return err
}

func (s *PostService) executePublish(ctx context.Context, userID, postID uint, allowedStatuses []string, source string) (*dto.PostItem, string, error) {
	rid := requestid.FromContext(ctx)
	if rid == "" {
		rid = source
	}
	now := time.Now().UTC()
	base := []zap.Field{
		zap.String("request_id", rid),
		zap.String("source", source),
		zap.Uint("user_id", userID),
		zap.Uint("post_id", postID),
	}

	p, err := s.postRepo.GetByUserAndID(userID, postID)
	if err != nil {
		zap.L().Warn("post execute: load post failed", append(base, zap.Error(err))...)
		return nil, "", err
	}
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		zap.L().Warn("post execute: load user failed", append(base, zap.Error(err))...)
		return nil, "", err
	}
	if err := subscription.AssertUserMayProduceContent(u, now); err != nil {
		if source == "scheduler" {
			_ = s.postRepo.RevertProcessingToScheduled(userID, postID, now.Add(time.Hour))
			zap.L().Info("post execute: deferred (subscription)", append(base, zap.Error(err))...)
			return nil, "", nil
		}
		return nil, "", err
	}
	st := strings.ToLower(strings.TrimSpace(p.Status))
	base = append(base, zap.Uint("x_account_id", p.XAccountID), zap.String("post_status", st))
	if !statusInList(st, allowedStatuses) {
		zap.L().Warn("post execute: rejected (invalid status)", base...)
		return nil, "", errors.New("post cannot be executed in current status")
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, p.XAccountID)
	if err != nil {
		zap.L().Warn("post execute: load x account failed", append(base, zap.Error(err))...)
		return nil, "", err
	}
	if strings.TrimSpace(acc.AccessToken) == "" {
		zap.L().Warn("post execute: rejected (missing access token)", append(base,
			zap.String("account_handle", formatXAccountHandle(acc.Username)))...)
		return nil, "", errors.New("x account has no access token; reconnect the account")
	}

	if source == "scheduler" {
		if hit, why := s.schedulerLimitsExceeded(userID, now); hit {
			_ = s.postRepo.RevertProcessingToScheduled(userID, postID, now.Add(time.Minute))
			zap.L().Info("post execute: deferred by automation limits", append(base, zap.String("reason", why))...)
			return nil, "", nil
		}
	}
	if !s.xPublisher.DryRun {
		if err := s.enforceMonthlyRealPostQuota(userID, u, now); err != nil {
			return nil, "", err
		}
	}

	handle := formatXAccountHandle(acc.Username)

	if s.xPublisher.DryRun {
		tweetID := fmt.Sprintf("dry-run-post-%d", postID)
		at := time.Now().UTC()
		if err := s.persistExecuteSuccess(postID, userID, p.XAccountID, handle, at); err != nil {
			zap.L().Error("post execute: persist dry-run success failed", append(base,
				zap.String("tweet_id", tweetID),
				zap.String("account_handle", handle),
				zap.Error(err))...)
			return nil, "", err
		}
		out, err := s.postRepo.GetByUserAndID(userID, postID)
		if err != nil {
			zap.L().Error("post execute: reload post after dry-run failed", append(base,
				zap.String("tweet_id", tweetID),
				zap.Error(err))...)
			return nil, "", err
		}
		item := postModelToDTO(*out)
		zap.L().Info("post execute: dry-run published", append(base,
			zap.String("tweet_id", tweetID),
			zap.String("account_handle", handle),
			zap.String("content_preview", previewForExecuteLog(p.Content, 160)),
		)...)
		return &item, tweetID, nil
	}

	zap.L().Info("post execute: calling x api",
		append(base,
			zap.String("account_handle", handle),
			zap.String("content_preview", previewForExecuteLog(p.Content, 160)),
		)...)

	tweetID, apiErr := twitter.CreateTweet(ctx, acc.AccessToken, p.Content)
	at := time.Now().UTC()

	if apiErr != nil {
		var pub *twitter.PublishError
		if errors.As(apiErr, &pub) && pub.RateLimited {
			delay := effectiveRateLimitDelay(pub)
			next := at.Add(delay)
			msg := truncateErrMsg(pub.Error())
			if err := s.persistRateLimitReschedule(postID, userID, p.XAccountID, handle, at, next, msg); err != nil {
				zap.L().Error("post execute: persist rate-limit reschedule failed", append(base, zap.Error(err))...)
				return nil, "", err
			}
			zap.L().Warn("post execute: rate limited, rescheduled", append(base,
				zap.Time("next_scheduled_at", next),
				zap.Duration("delay", delay),
			)...)
			if source == "scheduler" {
				return nil, "", nil
			}
			return nil, "", ErrExecuteRateLimited(
				fmt.Sprintf("Rate limited by X. Next attempt at %s. %s", next.UTC().Format(time.RFC3339), msg))
		}

		failMsg := truncateErrMsg(apiErr.Error())
		var p2 *twitter.PublishError
		if errors.As(apiErr, &p2) {
			failMsg = truncateErrMsg(p2.Error())
			if p2.StatusCode == 401 {
				if markErr := s.accountRepo.MarkNeedsReauth(userID, p.XAccountID); markErr != nil {
					zap.L().Warn("post execute: mark x account needs reauth failed", append(base,
						zap.String("account_handle", handle),
						zap.Error(markErr))...)
				}
			}
			alert.Notify(ctx, alert.Event{
				Level:      alert.LevelError,
				Category:   alert.CategoryPublishing,
				Title:      "Direct X publish rejected",
				Message:    "X API rejected a direct post publish request.",
				UserID:     userID,
				AccountID:  p.XAccountID,
				ResourceID: postID,
				Error:      p2,
				Fields: map[string]any{
					"source":        source,
					"account":       handle,
					"x_status_code": p2.StatusCode,
				},
			})
		}
		if err := s.persistExecuteFailure(postID, userID, p.XAccountID, handle, at, failMsg); err != nil {
			zap.L().Error("post execute: persist failure after x api error", append(base,
				zap.String("account_handle", handle),
				zap.String("x_api_detail", failMsg),
				zap.Error(err))...)
			return nil, "", err
		}
		zap.L().Warn("post execute: x api rejected (post marked failed)", append(base,
			zap.String("account_handle", handle),
			zap.String("x_api_detail", failMsg),
		)...)
		return nil, "", ErrExecuteUpstream(failMsg)
	}

	if err := s.persistExecuteSuccess(postID, userID, p.XAccountID, handle, at); err != nil {
		zap.L().Error("post execute: persist success state failed", append(base,
			zap.String("tweet_id", tweetID),
			zap.String("account_handle", handle),
			zap.Error(err))...)
		return nil, "", err
	}
	out, err := s.postRepo.GetByUserAndID(userID, postID)
	if err != nil {
		zap.L().Error("post execute: reload post after publish failed", append(base,
			zap.String("tweet_id", tweetID),
			zap.Error(err))...)
		return nil, "", err
	}
	item := postModelToDTO(*out)
	zap.L().Info("post execute: published", append(base,
		zap.String("tweet_id", tweetID),
		zap.String("account_handle", handle),
	)...)
	return &item, tweetID, nil
}

func autoPostInputFromBot(acc *model.TwitterAccount, bot *model.OAFBot, topic string) GenerateAutoPostInput {
	in := GenerateAutoPostInput{
		AccountHandle: formatXAccountHandle(acc.Username),
		Topic:         topic,
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

func (s *PostService) schedulerLimitsExceeded(userID uint, now time.Time) (hit bool, reason string) {
	cfg, err := s.automationRepo.GetByUserAndType(userID, repository.AutomationTypePost)
	if err != nil {
		return false, ""
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	nDay, err := s.activityRepo.CountPostPublishSuccessBetween(userID, dayStart, now)
	if err != nil {
		zap.L().Warn("post scheduler: count daily successes failed", zap.Uint("user_id", userID), zap.Error(err))
		return false, ""
	}
	if cfg.FrequencyDailyLimit > 0 && int(nDay) >= cfg.FrequencyDailyLimit {
		return true, "daily_limit"
	}
	hourAgo := now.Add(-time.Hour)
	nHour, err := s.activityRepo.CountPostPublishSuccessBetween(userID, hourAgo, now)
	if err != nil {
		zap.L().Warn("post scheduler: count hourly successes failed", zap.Uint("user_id", userID), zap.Error(err))
		return false, ""
	}
	if cfg.SafetyMaxPerHour > 0 && int(nHour) >= cfg.SafetyMaxPerHour {
		return true, "hourly_limit"
	}
	return false, ""
}

func (s *PostService) enforceMonthlyRealPostQuota(userID uint, user *model.User, now time.Time) error {
	limits := subscription.LimitsForUser(user)
	if limits.MonthlyXWrites <= 0 {
		return errors.New("monthly real X publish quota is not available for this plan")
	}
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	monthEnd := monthStart.AddDate(0, 1, 0)
	used, err := s.activityRepo.CountPostPublishSuccessBetween(userID, monthStart, monthEnd)
	if err != nil {
		return err
	}
	if used >= limits.MonthlyXWrites {
		return errors.New("monthly real X publish quota exceeded for this plan")
	}
	return nil
}

func effectiveRateLimitDelay(pub *twitter.PublishError) time.Duration {
	d := time.Duration(0)
	if pub != nil {
		d = pub.RetryAfter
	}
	if d < time.Minute {
		d = defaultRateLimitBackoff
	}
	if d > maxRateLimitBackoff {
		d = maxRateLimitBackoff
	}
	return d
}

func truncateErrMsg(s string) string {
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) <= errMsgMaxRunes {
		return s
	}
	return string(r[:errMsgMaxRunes]) + "…"
}

func (s *PostService) persistRateLimitReschedule(postID, userID, xAccountID uint, handle string, at, nextRun time.Time, errDetail string) error {
	return s.postRepo.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&model.Post{}).Where("id = ? AND user_id = ?", postID, userID).Updates(map[string]any{
			"status":             "scheduled",
			"scheduled_at":       nextRun.UTC(),
			"last_attempt_at":    at,
			"last_error_message": errDetail,
			"updated_at":         at,
		})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		log := &model.ActivityLog{
			UserID:        userID,
			XAccountID:    xAccountID,
			Type:          "post",
			Status:        "failed",
			PreviewKey:    "activity.preview.postRateLimited",
			AccountHandle: handle,
			ExecutedAt:    at,
			ErrorMessage:  errDetail,
		}
		return tx.Create(log).Error
	})
}

func statusInList(st string, allowed []string) bool {
	for _, a := range allowed {
		if st == a {
			return true
		}
	}
	return false
}

func previewForExecuteLog(s string, maxRunes int) string {
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) <= maxRunes {
		return string(r)
	}
	return string(r[:maxRunes]) + "…"
}

func formatXAccountHandle(username string) string {
	u := strings.TrimSpace(strings.TrimPrefix(username, "@"))
	if u == "" {
		return "@unknown"
	}
	return "@" + u
}

func (s *PostService) persistExecuteFailure(postID, userID, xAccountID uint, handle string, at time.Time, errMsg string) error {
	return s.postRepo.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&model.Post{}).Where("id = ? AND user_id = ?", postID, userID).Updates(map[string]any{
			"status":             "failed",
			"last_attempt_at":    at,
			"last_error_message": errMsg,
			"updated_at":         at,
		})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		log := &model.ActivityLog{
			UserID:        userID,
			XAccountID:    xAccountID,
			Type:          "post",
			Status:        "failed",
			PreviewKey:    "activity.preview.postExecuteFailed",
			AccountHandle: handle,
			ExecutedAt:    at,
			ErrorMessage:  errMsg,
		}
		return tx.Create(log).Error
	})
}

func (s *PostService) persistExecuteSuccess(postID, userID, xAccountID uint, handle string, at time.Time) error {
	return s.postRepo.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&model.Post{}).Where("id = ? AND user_id = ?", postID, userID).Updates(map[string]any{
			"status":             "published",
			"published_at":       at,
			"last_attempt_at":    at,
			"last_error_message": "",
			"updated_at":         at,
		})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		log := &model.ActivityLog{
			UserID:        userID,
			XAccountID:    xAccountID,
			Type:          "post",
			Status:        "success",
			PreviewKey:    "activity.preview.postExecuteSuccess",
			AccountHandle: handle,
			ExecutedAt:    at,
		}
		return tx.Create(log).Error
	})
}

func (s *PostService) assertSubscriptionAllowsContentProduction(userID uint) error {
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	return subscription.AssertUserMayProduceContent(u, time.Now())
}

func postModelToDTO(p model.Post) dto.PostItem {
	item := dto.PostItem{
		ID:         p.ID,
		UserID:     p.UserID,
		XAccountID: p.XAccountID,
		Content:    p.Content,
		Status:     p.Status,
		CreatedAt:  p.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:  p.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if p.ScheduledAt != nil {
		s := p.ScheduledAt.UTC().Format(time.RFC3339)
		item.ScheduledAt = &s
	}
	if p.PublishedAt != nil {
		s := p.PublishedAt.UTC().Format(time.RFC3339)
		item.PublishedAt = &s
	}
	if p.LastAttemptAt != nil {
		s := p.LastAttemptAt.UTC().Format(time.RFC3339)
		item.LastAttemptAt = &s
	}
	item.LastErrorMessage = p.LastErrorMessage
	return item
}

func validatePostContent(content string) error {
	n := utf8.RuneCountInString(content)
	if n < minPostContentRunes {
		return errors.New("content is required")
	}
	if n > maxPostContentRunes {
		return errors.New("content exceeds maximum length")
	}
	return nil
}

// isUserSettablePostStatus is for API create/update (not processing; scheduler uses processing internally).
func isUserSettablePostStatus(s string) bool {
	switch s {
	case "draft", "scheduled", "published", "failed":
		return true
	default:
		return false
	}
}

func parseCreateTimes(status string, scheduledRaw, publishedRaw *string) (sched, pub *time.Time, err error) {
	if scheduledRaw != nil && strings.TrimSpace(*scheduledRaw) != "" {
		t, e := time.Parse(time.RFC3339, strings.TrimSpace(*scheduledRaw))
		if e != nil {
			return nil, nil, errors.New("invalid scheduled_at (use RFC3339)")
		}
		u := t.UTC()
		sched = &u
	}
	if publishedRaw != nil && strings.TrimSpace(*publishedRaw) != "" {
		t, e := time.Parse(time.RFC3339, strings.TrimSpace(*publishedRaw))
		if e != nil {
			return nil, nil, errors.New("invalid published_at (use RFC3339)")
		}
		u := t.UTC()
		pub = &u
	}
	return sched, pub, nil
}
