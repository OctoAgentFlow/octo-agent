package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
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

const autoCommentPreviewRunes = 220

const (
	autoCommentDeliveryAutoComment   = "auto_comment"
	autoCommentDeliveryManualComment = "manual_comment"
	autoCommentDeliveryQuotePost     = "quote_post"
	autoCommentDeliverySkip          = "skip"
	autoCommentDeliveryInbound       = "inbound_handoff"

	autoCommentLowPriorityOpportunityScore = 65
	autoCommentMinimumOpportunityScore     = 75
	autoCommentAutopilotOpportunityScore   = 85
)

var (
	ErrAutoCommentOpportunityTooLow   = errors.New("auto_comment_opportunity_too_low")
	ErrAutoCommentAlreadyCompleted    = errors.New("auto_comment_already_completed")
	ErrAutoCommentTargetLimitExceeded = errors.New("auto_comment_target_limit_exceeded")
	ErrAutoCommentScanLimitExceeded   = errors.New("auto_comment_scan_limit_exceeded")
)

type autoCommentDeliveryDecision struct {
	Mode           string
	Reason         string
	Eligible       bool
	BlockReason    string
	ManualURL      string
	QuoteCandidate string
}

type AutoCommentService struct {
	accountRepo    *repository.TwitterAccountRepository
	automationRepo *repository.AutomationRepository
	targetRepo     *repository.AutoCommentTargetRepository
	taskRepo       *repository.AutoCommentTaskRepository
	scanRepo       *repository.AutoCommentScanLedgerRepository
	activityRepo   *repository.ActivityRepository
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

func NewAutoCommentService(
	accountRepo *repository.TwitterAccountRepository,
	automationRepo *repository.AutomationRepository,
	targetRepo *repository.AutoCommentTargetRepository,
	taskRepo *repository.AutoCommentTaskRepository,
	scanRepo *repository.AutoCommentScanLedgerRepository,
	activityRepo *repository.ActivityRepository,
	userRepo *repository.UserRepository,
	oafBotRepo *repository.OAFBotRepository,
	contentRepo *repository.ContentLibraryRepository,
	usageRepo *repository.AIGenerationUsageRepository,
	feedbackRepo *repository.OAFBotGenerationFeedbackRepository,
	verdictRepo *repository.ReviewQueueFeedbackIssueVerdictRepository,
	prefRepo *repository.OAFBotLearningRulePreferenceRepository,
	ai *AIService,
	publishing *PublishingService,
) *AutoCommentService {
	return &AutoCommentService{
		accountRepo:    accountRepo,
		automationRepo: automationRepo,
		targetRepo:     targetRepo,
		taskRepo:       taskRepo,
		scanRepo:       scanRepo,
		activityRepo:   activityRepo,
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
	if err := s.assertAutoCommentTargetCapacity(userID, 1); err != nil {
		return nil, err
	}
	target := &model.AutoCommentTarget{
		UserID:             userID,
		XAccountID:         xAccountID,
		TargetUsername:     username,
		TargetAuthorHandle: username,
		TargetTweetID:      tweetID,
		TargetTweetURL:     strings.TrimSpace(req.TargetTweetURL),
		TargetText:         truncateRunes(targetText, 1000),
		TargetCategory:     normalizeAutoCommentTargetCategory(req.TargetCategory),
		Priority:           normalizeAutoCommentTargetPriority(req.Priority),
		Notes:              truncateRunes(strings.TrimSpace(req.Notes), 512),
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

func (s *AutoCommentService) BulkImportTargets(userID uint, req dto.AutoCommentTargetBulkImportRequest) (*dto.AutoCommentTargetBulkImportResponse, error) {
	xAccountID, err := s.resolveExecutorAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, err
	}
	handles := normalizeAutoCommentBulkHandles(req.Handles, req.RawHandles)
	if len(handles) == 0 {
		return nil, fmt.Errorf("at least one target handle is required")
	}
	category := normalizeAutoCommentTargetCategory(req.TargetCategory)
	priority := normalizeAutoCommentTargetPriority(req.Priority)
	notes := truncateRunes(strings.TrimSpace(req.Notes), 512)
	resp := &dto.AutoCommentTargetBulkImportResponse{Items: []dto.AutoCommentTargetItem{}, Errors: []string{}}
	remaining, err := s.autoCommentTargetRemaining(userID)
	if err != nil {
		return nil, err
	}
	for _, handle := range handles {
		existing, err := s.targetRepo.GetByUserAccountAndUsername(userID, xAccountID, handle)
		if err == nil {
			existing.TargetCategory = category
			existing.Priority = priority
			existing.Notes = notes
			if existing.Status == "" {
				existing.Status = "active"
			}
			if err := s.targetRepo.Save(existing); err != nil {
				resp.Errors = append(resp.Errors, fmt.Sprintf("@%s: %s", handle, err.Error()))
				resp.Skipped++
				continue
			}
			item := toAutoCommentTargetItem(*existing)
			resp.Items = append(resp.Items, item)
			resp.Updated++
			continue
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			resp.Errors = append(resp.Errors, fmt.Sprintf("@%s: %s", handle, err.Error()))
			resp.Skipped++
			continue
		}
		if remaining <= 0 {
			resp.Errors = append(resp.Errors, fmt.Sprintf("@%s: target limit exceeded for current plan", handle))
			resp.Skipped++
			continue
		}
		target := &model.AutoCommentTarget{
			UserID:             userID,
			XAccountID:         xAccountID,
			TargetUsername:     handle,
			TargetAuthorHandle: handle,
			TargetCategory:     category,
			Priority:           priority,
			Notes:              notes,
			Status:             "active",
		}
		if err := s.targetRepo.Create(target); err != nil {
			resp.Errors = append(resp.Errors, fmt.Sprintf("@%s: %s", handle, err.Error()))
			resp.Skipped++
			continue
		}
		item := toAutoCommentTargetItem(*target)
		resp.Items = append(resp.Items, item)
		resp.Imported++
		remaining--
	}
	return resp, nil
}

func (s *AutoCommentService) SuggestTargets(ctx context.Context, userID uint, req dto.AutoCommentTargetSuggestionRequest) (*dto.AutoCommentTargetSuggestionResponse, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	xAccountID, err := s.resolveExecutorAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, err
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, xAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	bot, err := s.botForAccount(userID, xAccountID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	targets, err := s.targetRepo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	targetLimit, suggestionLimit, err := s.autoCommentTargetSuggestionQuota(userID, int64(len(targets)))
	if err != nil {
		return nil, err
	}
	if suggestionLimit <= 0 {
		return &dto.AutoCommentTargetSuggestionResponse{
			Items:           []dto.AutoCommentTargetSuggestionItem{},
			TargetCount:     int64(len(targets)),
			TargetLimit:     targetLimit,
			SuggestionLimit: 0,
		}, nil
	}
	contentRows, _ := s.contentRepo.ListActiveForGenerationContext(userID, xAccountID, botIDForUsage(bot), 12)
	input := autoCommentTargetSuggestionInput(bot, targets, contentRows)
	generated, err := s.ai.GenerateAutoCommentTargetSuggestions(ctx, input)
	if err == nil {
		if err := recordAIGenerationUsage(s.usageRepo, userID, botIDForUsage(bot), repository.AIGenerationSceneAutoComment, now, generated.Usage); err != nil {
			return nil, err
		}
	}
	suggestions := generated.Items
	if err != nil {
		suggestions = nil
	}
	targetSuggestionCount := int(suggestionLimit)
	candidateCount := autoCommentSuggestionCandidateLimit(targetSuggestionCount)
	suggestions = fillAutoCommentTargetSuggestions(suggestions, input.ExistingTargets, candidateCount)
	suggestions = s.filterActiveAutoCommentTargetSuggestions(ctx, *acc, suggestions, input.ExistingTargets, targetSuggestionCount, candidateCount, now)
	items := make([]dto.AutoCommentTargetSuggestionItem, 0, len(suggestions))
	for _, item := range suggestions {
		items = append(items, dto.AutoCommentTargetSuggestionItem{
			Handle:      item.Handle,
			DisplayName: item.DisplayName,
			Category:    normalizeAutoCommentTargetCategory(item.Category),
			Priority:    normalizeAutoCommentTargetPriority(item.Priority),
			Reason:      item.Reason,
			SearchQuery: item.SearchQuery,
			NeedsVerify: true,
		})
	}
	return &dto.AutoCommentTargetSuggestionResponse{
		Items:           items,
		TargetCount:     int64(len(targets)),
		TargetLimit:     targetLimit,
		SuggestionLimit: suggestionLimit,
	}, nil
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

func (s *AutoCommentService) ListTasks(userID uint, limit int) (*dto.AutoCommentTasksResponse, error) {
	rows, err := s.taskRepo.ListByUser(userID, limit)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoCommentTaskItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, toAutoCommentTaskItem(row))
	}
	return &dto.AutoCommentTasksResponse{Items: items}, nil
}

func (s *AutoCommentService) Analytics(userID uint) (*dto.AutoCommentAnalyticsResponse, error) {
	tasks, err := s.taskRepo.ListQueueByUser(userID, 500)
	if err != nil {
		return nil, err
	}
	targets, err := s.targetRepo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	targetByID := map[uint]model.AutoCommentTarget{}
	for _, target := range targets {
		targetByID[target.ID] = target
	}
	now := time.Now().UTC()
	resp := &dto.AutoCommentAnalyticsResponse{
		ByCategory:      []dto.AutoCommentAnalyticsGroup{},
		ByTarget:        []dto.AutoCommentAnalyticsGroup{},
		RecentPublished: []dto.AutoCommentPublishedItem{},
		RecentFailures:  []dto.AutoCommentFailureItem{},
		Health:          []dto.AutoCommentHealthItem{},
	}
	if s.userRepo != nil {
		if user, err := s.userRepo.GetByID(userID); err == nil {
			limits := subscription.LimitsForUser(user)
			monthStart := startOfUTCMonth(now)
			resp.Summary.TargetCount = int64(len(targets))
			resp.Summary.TargetLimit = limits.AutoCommentTargets
			resp.Summary.MonthlyScanLimit = limits.MonthlyAutoCommentScans
			resp.Summary.MonthlyCommentLimit = limits.MonthlyAutoComments
			if s.scanRepo != nil {
				resp.Summary.MonthlyScansUsed, _ = s.scanRepo.CountByUserBetween(userID, monthStart, now)
			}
			resp.Summary.MonthlyCommentsUsed, _ = s.taskRepo.CountCreatedBetween(userID, monthStart, now)
		}
	}
	categoryGroups := map[string]*dto.AutoCommentAnalyticsGroup{}
	targetGroups := map[string]*dto.AutoCommentAnalyticsGroup{}
	targetStats := map[uint]*autoCommentTargetHealthStats{}
	totalOpportunity := 0
	for _, task := range tasks {
		target := targetByID[task.TargetID]
		category := firstNonEmpty(target.TargetCategory, "other")
		targetName := firstNonEmpty(task.TargetUsername, target.TargetUsername, task.TargetTweetAuthor, "unknown")
		resp.Summary.TotalTasks++
		totalOpportunity += task.OpportunityScore
		if isAutoCommentPublishedStatus(task.Status) {
			resp.Summary.Published++
		} else if task.Status == "failed" || task.Status == "blocked" {
			resp.Summary.Failed++
		} else {
			resp.Summary.Pending++
		}
		switch firstNonEmpty(task.DeliveryMode, autoCommentDeliveryManualComment) {
		case autoCommentDeliveryAutoComment:
			resp.Summary.AutoCommentable++
		case autoCommentDeliveryQuotePost:
			resp.Summary.QuotePostReady++
		default:
			resp.Summary.ManualSuggestions++
		}
		if task.Status == "failed" || task.Status == "blocked" || task.FailureCategory == "x_reply_restricted" || task.APIReplyBlockReason == "x_reply_restricted" {
			resp.Summary.Restricted++
		}
		updateAutoCommentAnalyticsGroup(categoryGroups, category, category, task)
		updateAutoCommentAnalyticsGroup(targetGroups, targetName, "@"+strings.TrimPrefix(targetName, "@"), task)
		updateAutoCommentTargetHealthStats(targetStats, task)
		if isAutoCommentPublishedStatus(task.Status) && strings.TrimSpace(task.CommentTweetID) != "" && len(resp.RecentPublished) < 8 {
			item := dto.AutoCommentPublishedItem{
				ID:               task.ID,
				TargetUsername:   targetName,
				TargetCategory:   category,
				CommentTweetID:   task.CommentTweetID,
				CommentURL:       "https://x.com/i/web/status/" + task.CommentTweetID,
				GeneratedComment: task.GeneratedComment,
			}
			if task.SentAt != nil {
				item.SentAt = task.SentAt.UTC().Format(time.RFC3339)
			}
			resp.RecentPublished = append(resp.RecentPublished, item)
		}
		if (task.Status == "failed" || task.Status == "blocked") && len(resp.RecentFailures) < 8 {
			resp.RecentFailures = append(resp.RecentFailures, dto.AutoCommentFailureItem{
				ID:              task.ID,
				TargetUsername:  targetName,
				TargetCategory:  category,
				FailureCategory: task.FailureCategory,
				FailureReason:   task.FailureReason,
				UpdatedAt:       task.UpdatedAt.UTC().Format(time.RFC3339),
			})
		}
	}
	if resp.Summary.TotalTasks > 0 {
		resp.Summary.AverageOpportunity = totalOpportunity / resp.Summary.TotalTasks
	}
	resp.ByCategory = sortedAutoCommentAnalyticsGroups(categoryGroups, 8)
	resp.ByTarget = sortedAutoCommentAnalyticsGroups(targetGroups, 10)
	resp.Health = buildAutoCommentHealthItems(targets, targetStats, time.Now().UTC())
	return resp, nil
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
	if completed, err := s.alreadyCompletedAutoCommentForTweet(userID, target.XAccountID, target.TargetTweetID); err != nil {
		return nil, err
	} else if completed {
		return nil, autoCommentAlreadyCompletedError(target.TargetTweetID)
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
	bot, err := s.botForAccount(userID, target.XAccountID)
	if err != nil {
		return nil, err
	}
	cfg := s.commentConfig(userID)
	blocked := blockedWordsFromConfig(cfg)
	contentContext := contentContextForGeneration(s.contentRepo, userID, target.XAccountID, botIDForUsage(bot), target.TargetText, target.TargetUsername, bot)
	opportunity := evaluateAutoCommentOpportunity(target.TargetText, target.TargetUsername, bot, contentContext, blocked)
	if opportunity.Score < autoCommentMinimumOpportunityScore {
		return nil, autoCommentOpportunityTooLowError(opportunity)
	}
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	mode := s.effectiveCommentExecutionMode(userID, cfg)
	if mode == ExecutionModeAutopilot {
		if err := s.assertAutoCommentMonthlyQuota(userID, now); err != nil {
			return nil, err
		}
	}
	input := autoCommentInputFromBot(target, bot, blocked)
	input.ContentContext = contentContext
	input.FeedbackSignals = s.autoCommentFeedbackSignals(userID, botIDForUsage(bot))
	input.FeedbackSignals = appendFeedbackLearningSignals(input.FeedbackSignals, s.verdictRepo, s.prefRepo, userID, botIDForUsage(bot), "comment")
	generated, err := s.ai.GenerateAutoCommentCandidates(ctx, input)
	if err != nil {
		return nil, err
	}
	comment := generated.Text
	risk := evaluateAutoCommentRisk(comment, bot, blocked)
	status, capability, approvalRequired, approvedAt := autoCommentInitialState(mode, risk, now)
	applyAutoCommentOpportunityGate(mode, opportunity, &status, &capability, &approvalRequired, &approvedAt)
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
		OpportunityScore:  opportunity.Score,
		GenerationReason:  opportunity.Reason,
		MatchedKeywords:   encodeStringList(opportunity.MatchedKeywords),
		ReferencedContent: encodeStringList(opportunity.ReferencedContent),
		CommentVariants:   encodeAutoCommentVariants(generated.Candidates),
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
	applyAutoCommentDelivery(task, decideAutoCommentDelivery(target.TargetText, displayCommentTargetHandle(*target), target.TargetTweetID, *acc, comment))
	created, err := s.taskRepo.CreateIfNotExists(task)
	if err != nil {
		return nil, err
	}
	if !created {
		item := toAutoCommentTaskItem(*task)
		return &item, nil
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, task.BotID, repository.AIGenerationSceneAutoComment, now, generated.Usage); err != nil {
		return nil, err
	}
	if mode == ExecutionModeAutopilot && task.Status == "ready_to_publish" && task.DeliveryMode == autoCommentDeliveryAutoComment {
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

func (s *AutoCommentService) CreateDraftFromExposureRadar(ctx context.Context, userID uint, req dto.ExposureRadarCommentDraftRequest) (*dto.AutoCommentTaskItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if strings.TrimSpace(req.DataQuality) != "" && strings.TrimSpace(req.DataQuality) != "tweet_level" {
		return nil, fmt.Errorf("tweet-level exposure signal is required")
	}
	tweetID := strings.TrimSpace(req.TweetID)
	if tweetID == "" {
		tweetID = extractTweetID(req.URL)
	}
	if tweetID == "" {
		return nil, fmt.Errorf("target tweet id is required")
	}
	content := strings.TrimSpace(req.Content)
	if content == "" {
		return nil, fmt.Errorf("target tweet text is required")
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	bot, err := s.oafBotRepo.GetByUserAndID(userID, req.BotID)
	if err != nil {
		return nil, fmt.Errorf("OAF Bot not found")
	}
	if completed, err := s.alreadyCompletedAutoCommentForTweet(userID, acc.ID, tweetID); err != nil {
		return nil, err
	} else if completed {
		return nil, autoCommentAlreadyCompletedError(tweetID)
	}
	existing, err := s.taskRepo.GetByTargetTweet(userID, acc.ID, tweetID)
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
	cfg := s.commentConfig(userID)
	blocked := blockedWordsFromConfig(cfg)
	handle := normalizeHandle(firstNonEmpty(req.AuthorHandle, exposureRadarHandleFromURL(req.URL), req.AuthorName))
	contentContext := contentContextForGeneration(s.contentRepo, userID, acc.ID, bot.ID, content, handle, bot)
	input := autoCommentInputFromValues(handle, content, "Friendly", blocked, bot)
	input.ContentContext = contentContext
	input.FeedbackSignals = s.autoCommentFeedbackSignals(userID, bot.ID)
	input.FeedbackSignals = appendFeedbackLearningSignals(input.FeedbackSignals, s.verdictRepo, s.prefRepo, userID, bot.ID, "comment")
	generated, err := s.ai.GenerateAutoCommentCandidates(ctx, input)
	if err != nil {
		return nil, err
	}
	comment := generated.Text
	risk := evaluateAutoCommentRisk(comment, bot, blocked)
	opportunityScore := req.Score
	if opportunityScore <= 0 {
		opportunityScore = autoCommentMinimumOpportunityScore
	}
	if opportunityScore > 100 {
		opportunityScore = 100
	}
	generationReason := exposureRadarGenerationReason(req)
	matchedKeywords := exposureRadarMatchedKeywords(req)
	task := &model.AutoCommentTask{
		UserID:            userID,
		BotID:             bot.ID,
		XAccountID:        acc.ID,
		TargetUsername:    handle,
		TargetTweetID:     tweetID,
		TargetTweetText:   truncateRunes(content, 1000),
		TargetTweetAuthor: firstNonEmpty(handle, strings.TrimSpace(req.AuthorName), "unknown"),
		GeneratedComment:  truncateRunes(comment, autoCommentPreviewRunes),
		OpportunityScore:  opportunityScore,
		GenerationReason:  generationReason,
		MatchedKeywords:   encodeStringList(matchedKeywords),
		ReferencedContent: encodeStringList(exposureRadarReferencedContent(req)),
		SourceType:        "exposure_radar",
		SourceRef:         truncateRunes(firstNonEmpty(strings.TrimSpace(req.SignalID), tweetID), 128),
		SourceRegion:      truncateRunes(strings.TrimSpace(req.Region), 16),
		CommentVariants:   encodeAutoCommentVariants(generated.Candidates),
		Status:            "pending_review",
		RiskLevel:         mergeExposureRadarRisk(risk.Level, req.RiskLevel),
		CapabilityStatus:  "exposure_radar_review_required",
		FailureCategory:   risk.Category,
		FailureReason:     risk.Reason,
		ApprovalRequired:  true,
		DetectedAt:        now,
		GeneratedAt:       &now,
	}
	applyAutoCommentDelivery(task, decideAutoCommentDelivery(content, handle, tweetID, *acc, comment))
	task.Status = "pending_review"
	task.CapabilityStatus = "exposure_radar_review_required"
	task.ApprovalRequired = true
	task.ApprovedAt = nil
	created, err := s.taskRepo.CreateIfNotExists(task)
	if err != nil {
		return nil, err
	}
	if created {
		if err := recordAIGenerationUsage(s.usageRepo, userID, task.BotID, repository.AIGenerationSceneAutoComment, now, generated.Usage); err != nil {
			return nil, err
		}
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) ApproveTask(ctx context.Context, userID, id uint) (*dto.AutoCommentTaskItem, error) {
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypeComment, "approve comment draft"); err != nil {
		return nil, err
	}
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
	s.recordExposureRadarOutcomeFeedback(task, "positive", []string{"good"}, "Exposure Radar draft was approved in review.")
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) QueueQuotePost(ctx context.Context, userID, id uint) (*dto.AutoCommentTaskItem, error) {
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypeComment, "queue quote post"); err != nil {
		return nil, err
	}
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(task.TargetTweetID) == "" {
		return nil, fmt.Errorf("target tweet id is required")
	}
	if !task.APIReplyEligible {
		return nil, fmt.Errorf("X API quote publishing is not available for this conversation unless the executor account is mentioned or part of the conversation thread; use the manual copy/open action instead")
	}
	quote := strings.TrimSpace(task.QuotePostCandidate)
	if quote == "" {
		quote = strings.TrimSpace(task.GeneratedComment)
	}
	if quote == "" {
		return nil, fmt.Errorf("quote post candidate is required")
	}
	now := time.Now().UTC()
	task.DeliveryMode = autoCommentDeliveryQuotePost
	task.DeliveryReason = "User confirmed this Auto Comment opportunity as a Quote Post and queued it for publishing."
	task.APIReplyEligible = false
	task.APIReplyBlockReason = firstNonEmpty(task.APIReplyBlockReason, "not_mentioned_or_engaged")
	task.QuotePostCandidate = truncateRunes(quote, autoCommentPreviewRunes)
	task.Status = "ready_to_publish"
	task.CapabilityStatus = "quote_post_ready"
	task.ApprovalRequired = false
	task.ApprovedAt = &now
	task.FailureCategory = ""
	task.FailureReason = ""
	task.Retryable = false
	task.RetryAfterAt = nil
	if strings.TrimSpace(task.ManualActionURL) == "" {
		task.ManualActionURL = autoCommentManualActionURL(task.TargetUsername, task.TargetTweetID)
	}
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	if s.publishing != nil {
		if _, _, err := s.publishing.EnsureCommentJob(task, now); err != nil {
			return nil, err
		}
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
	s.recordExposureRadarOutcomeFeedback(task, "negative", []string{"irrelevant"}, firstNonEmpty(task.FailureReason, "Exposure Radar draft was rejected in review."))
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) MarkTaskHandled(userID, id uint) (*dto.AutoCommentTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if task.Status == "sent" || task.Status == "published" {
		return nil, fmt.Errorf("published task is already completed")
	}
	if s.publishing != nil {
		if err := s.publishing.DeleteNonPublishedSourceJobs(userID, repository.PublishSourceComment, id); err != nil {
			return nil, err
		}
	}
	now := time.Now().UTC()
	task.Status = "handled"
	task.CapabilityStatus = "manual_handled"
	task.ApprovalRequired = false
	task.ApprovedAt = nil
	task.Retryable = false
	task.RetryAfterAt = nil
	task.BlockedAt = &now
	task.FailureCategory = ""
	task.FailureReason = ""
	task.DeliveryReason = firstNonEmpty(task.DeliveryReason, "Marked as handled by the user.")
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	s.recordExposureRadarOutcomeFeedback(task, "positive", []string{"good"}, "Exposure Radar draft was marked handled after review.")
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) DeleteTask(userID, id uint) error {
	if _, err := s.taskRepo.GetByUserAndID(userID, id); err != nil {
		return err
	}
	if s.publishing != nil {
		if err := s.publishing.DeleteNonPublishedSourceJobs(userID, repository.PublishSourceComment, id); err != nil {
			return err
		}
	}
	return s.taskRepo.DeleteByUserAndID(userID, id)
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

func (s *AutoCommentService) RewriteDraft(ctx context.Context, userID, id uint, req dto.SocialDraftRewriteRequest) (*dto.AutoCommentTaskItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if task.Status != "review" && task.Status != "pending_review" && task.Status != "draft" && task.Status != "approved" {
		return nil, fmt.Errorf("draft cannot be rewritten from status %s", task.Status)
	}
	if s.ai == nil {
		return nil, fmt.Errorf("AI service is not configured")
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	bot, err := s.botForAccount(userID, task.XAccountID)
	if err != nil {
		return nil, err
	}
	accountHandle := ""
	if acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, task.XAccountID); err == nil && acc != nil {
		accountHandle = acc.Username
	}
	feedbackRows := s.autoCommentFeedbackRows(userID, task.BotID)
	feedbackSignals := feedbackSignalsFromRows(feedbackRows)
	botID := task.BotID
	if botID == 0 {
		botID = botIDForUsage(bot)
	}
	var learningRules []dto.OAFBotAppliedLearningRule
	feedbackSignals, learningRules = appendFeedbackLearningSignalsWithRules(feedbackSignals, s.verdictRepo, s.prefRepo, userID, botID, "comment", req.DisabledLearningIssues)
	generated, err := s.ai.RewriteSocialDraft(ctx, RewriteSocialDraftInput{
		Scene:            "auto_comment",
		AccountHandle:    accountHandle,
		TargetAuthor:     firstNonEmpty(task.TargetTweetAuthor, task.TargetUsername),
		TargetText:       task.TargetTweetText,
		OriginalDraft:    firstNonEmpty(task.GeneratedComment, task.QuotePostCandidate),
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
	cfg := s.commentConfig(userID)
	risk := evaluateAutoCommentRisk(generated.Text, bot, blockedWordsFromConfig(cfg))
	task.GeneratedComment = truncateRunes(generated.Text, autoCommentPreviewRunes)
	task.RiskLevel = risk.Level
	task.FailureCategory = risk.Category
	task.FailureReason = risk.Reason
	task.GeneratedAt = &now
	if task.Status == "approved" {
		task.Status = "pending_review"
		task.ApprovedAt = nil
	}
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, task.BotID, repository.AIGenerationSceneAutoComment, now, generated.Usage); err != nil {
		return nil, err
	}
	item := toAutoCommentTaskItem(*task)
	item.FeedbackSignalCount = len(feedbackSignals)
	item.FeedbackSignalSummary = feedbackSignalSummaryFromRowsAndRules(feedbackRows, learningRules)
	return &item, nil
}

func (s *AutoCommentService) CreateFeedback(userID, id uint, req dto.AutoCommentFeedbackRequest) (*dto.OAFBotGenerationFeedbackItem, error) {
	if s.feedbackRepo == nil {
		return nil, fmt.Errorf("feedback repository is not configured")
	}
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if task.BotID == 0 {
		return nil, fmt.Errorf("feedback requires a bound OAF Bot")
	}
	rating := normalizeAutoCommentFeedbackRating(req.Rating)
	if rating == "" {
		return nil, fmt.Errorf("invalid feedback rating")
	}
	row := &model.OAFBotGenerationFeedback{
		UserID:           userID,
		BotID:            task.BotID,
		Scene:            "auto_comment",
		Rating:           rating,
		IssueTags:        encodeStringList(normalizeAutoCommentFeedbackTags(req.IssueTags)),
		Comment:          truncateRunes(strings.TrimSpace(req.Comment), 500),
		SampleContext:    truncateRunes(task.TargetTweetText, 1200),
		GeneratedContent: truncateRunes(task.GeneratedComment, 1000),
		Provider:         "auto_comment_review",
	}
	if err := s.feedbackRepo.Create(row); err != nil {
		return nil, err
	}
	item := dto.OAFBotGenerationFeedbackItem{
		ID:               row.ID,
		BotID:            row.BotID,
		Scene:            row.Scene,
		Rating:           row.Rating,
		IssueTags:        decodeStringList(row.IssueTags),
		Comment:          row.Comment,
		SampleContext:    row.SampleContext,
		GeneratedContent: row.GeneratedContent,
		Provider:         row.Provider,
		CreatedAt:        row.CreatedAt.UTC().Format(time.RFC3339),
	}
	return &item, nil
}

func (s *AutoCommentService) recordExposureRadarOutcomeFeedback(task *model.AutoCommentTask, rating string, issueTags []string, comment string) {
	if s == nil || s.feedbackRepo == nil || task == nil || task.BotID == 0 || strings.TrimSpace(task.SourceType) != "exposure_radar" {
		return
	}
	row := &model.OAFBotGenerationFeedback{
		UserID:           task.UserID,
		BotID:            task.BotID,
		Scene:            "auto_comment",
		Rating:           normalizeAutoCommentFeedbackRating(rating),
		IssueTags:        encodeStringList(normalizeAutoCommentFeedbackTags(issueTags)),
		Comment:          truncateRunes(strings.TrimSpace(comment), 500),
		SampleContext:    truncateRunes(task.TargetTweetText, 1200),
		GeneratedContent: truncateRunes(task.GeneratedComment, 1000),
		Provider:         "exposure_radar_review",
	}
	if row.Rating == "" {
		return
	}
	if err := s.feedbackRepo.Create(row); err != nil {
		zap.L().Warn("auto comment: record exposure radar feedback failed", zap.Uint("user_id", task.UserID), zap.Uint("task_id", task.ID), zap.Error(err))
	}
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
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypeComment, "retry comment task"); err != nil {
		return nil, err
	}
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
	input := autoCommentInputFromValues(task.TargetUsername, task.TargetTweetText, cfg.Tone, blocked, bot)
	contentContext := contentContextForGeneration(s.contentRepo, task.UserID, task.XAccountID, botIDForUsage(bot), task.TargetTweetText, task.TargetUsername, bot)
	input.ContentContext = contentContext
	input.FeedbackSignals = s.autoCommentFeedbackSignals(task.UserID, botIDForUsage(bot))
	input.FeedbackSignals = appendFeedbackLearningSignals(input.FeedbackSignals, s.verdictRepo, s.prefRepo, task.UserID, botIDForUsage(bot), "comment")
	opportunity := evaluateAutoCommentOpportunity(task.TargetTweetText, task.TargetUsername, bot, contentContext, blocked)
	generated, err := s.ai.GenerateAutoCommentCandidates(ctx, input)
	if err != nil {
		task.FailureCategory = "llm_error"
		task.FailureReason = truncateErrMsg(err.Error())
		task.Retryable = true
		_ = s.taskRepo.Save(task)
		return err
	}
	comment := generated.Text
	task.GeneratedComment = truncateRunes(comment, autoCommentPreviewRunes)
	task.OpportunityScore = opportunity.Score
	task.GenerationReason = opportunity.Reason
	task.MatchedKeywords = encodeStringList(opportunity.MatchedKeywords)
	task.ReferencedContent = encodeStringList(opportunity.ReferencedContent)
	task.CommentVariants = encodeAutoCommentVariants(generated.Candidates)
	task.GeneratedAt = &now
	task.BotID = botIDForUsage(bot)
	task.FailureCategory = ""
	task.FailureReason = ""
	if err := s.taskRepo.Save(task); err != nil {
		return err
	}
	return recordAIGenerationUsage(s.usageRepo, task.UserID, task.BotID, repository.AIGenerationSceneAutoComment, now, generated.Usage)
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
	if due, reason := autoCommentTargetDueForScan(target, u, now); !due {
		if reason != "" {
			zap.L().Debug("auto comment: target not due", zap.Uint("user_id", target.UserID), zap.Uint("target_id", target.ID), zap.String("reason", reason))
		}
		return nil
	}
	if hit, why := s.commentLimitsExceeded(target.UserID, cfg, now); hit {
		return s.markTargetChecked(&target, now, "skip: "+why)
	}
	if err := s.assertAutoCommentMonthlyScanQuota(target.UserID, now); err != nil {
		return s.markTargetChecked(&target, now, "skip: monthly auto comment scan quota exceeded")
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
			if isXUnauthorizedError(err) {
				if refreshed, ok := s.refreshXAccountAfterUnauthorized(ctx, *acc,
					zap.Uint("user_id", target.UserID),
					zap.Uint("target_id", target.ID),
					zap.String("operation", "lookup_comment_target")); ok {
					acc = &refreshed
					xu, err = twitter.LookupUserByUsername(ctx, nil, acc.AccessToken, target.TargetUsername)
				}
			}
			if err != nil {
				s.recordAutoCommentScan(target, now, "failed", 1, err.Error())
				return s.markTargetChecked(&target, now, truncateErrMsg(err.Error()))
			}
		}
		target.TargetUserID = xu.ID
		target.TargetUsername = normalizeHandle(xu.Username)
		target.TargetDisplayName = xu.DisplayName
		target.ResolvedAt = &now
		if err := s.targetRepo.Save(&target); err != nil {
			return s.markTargetChecked(&target, now, truncateErrMsg(err.Error()))
		}
	}
	tweets, err := twitter.ListUserRootTweets(ctx, nil, acc.AccessToken, target.TargetUserID, 5)
	if err != nil {
		if isXUnauthorizedError(err) {
			if refreshed, ok := s.refreshXAccountAfterUnauthorized(ctx, *acc,
				zap.Uint("user_id", target.UserID),
				zap.Uint("target_id", target.ID),
				zap.String("operation", "list_comment_target_tweets")); ok {
				acc = &refreshed
				tweets, err = twitter.ListUserRootTweets(ctx, nil, acc.AccessToken, target.TargetUserID, 5)
			}
		}
		if err != nil {
			s.recordAutoCommentScan(target, now, "failed", 5, err.Error())
			return s.markTargetChecked(&target, now, truncateErrMsg(err.Error()))
		}
	}
	s.recordAutoCommentScan(target, now, "scanned", len(tweets), "")
	target.LastCheckedAt = &now
	target.LastFailureReason = ""
	bot, err := s.botForAccount(target.UserID, target.XAccountID)
	if err != nil {
		return s.markTargetChecked(&target, now, truncateErrMsg(err.Error()))
	}
	blocked := blockedWordsFromConfig(cfg)
	candidate, ok, err := s.bestAutoCommentTweetCandidate(target, tweets, bot, blocked)
	if err != nil {
		return err
	}
	if !ok {
		if candidate.Tweet.ID != "" {
			target.LastSeenTweetID = candidate.Tweet.ID
			if !candidate.Tweet.CreatedAt.IsZero() {
				t := candidate.Tweet.CreatedAt
				target.LastSeenTweetAt = &t
			}
			target.LastFailureReason = truncateErrMsg(autoCommentOpportunitySkipMessage(candidate.OpportunityScore))
		}
		return s.targetRepo.Save(&target)
	}
	task, err := s.createTaskFromTweet(ctx, target, *cfg, candidate.Tweet)
	if err != nil {
		target.LastFailureReason = truncateErrMsg(err.Error())
		_ = s.targetRepo.Save(&target)
		return err
	}
	target.LastSeenTweetID = candidate.Tweet.ID
	if !candidate.Tweet.CreatedAt.IsZero() {
		t := candidate.Tweet.CreatedAt
		target.LastSeenTweetAt = &t
	}
	if task.Status == "sent" {
		sent := now
		target.LastCommentedAt = &sent
	}
	return s.targetRepo.Save(&target)
}

type autoCommentTweetCandidate struct {
	Tweet            twitter.UserTweet
	OpportunityScore int
	QueueScore       int
}

func (s *AutoCommentService) bestAutoCommentTweetCandidate(target model.AutoCommentTarget, tweets []twitter.UserTweet, bot *model.OAFBot, blocked []string) (autoCommentTweetCandidate, bool, error) {
	candidates := []autoCommentTweetCandidate{}
	var skippedLow autoCommentTweetCandidate
	for _, tw := range tweets {
		if tw.ID == "" {
			continue
		}
		if target.LastSeenTweetID == tw.ID {
			break
		}
		completed, err := s.alreadyCompletedAutoCommentForTweet(target.UserID, target.XAccountID, tw.ID)
		if err != nil {
			return autoCommentTweetCandidate{}, false, err
		}
		if completed {
			continue
		}
		exists, err := s.taskRepo.ExistsForTargetTweet(target.UserID, target.XAccountID, tw.ID)
		if err != nil {
			return autoCommentTweetCandidate{}, false, err
		}
		if exists {
			continue
		}
		contentContext := contentContextForGeneration(s.contentRepo, target.UserID, target.XAccountID, botIDForUsage(bot), tw.Text, target.TargetUsername, bot)
		opportunity := evaluateAutoCommentOpportunity(tw.Text, target.TargetUsername, bot, contentContext, blocked)
		if opportunity.Score < autoCommentMinimumOpportunityScore {
			if skippedLow.Tweet.ID == "" || tw.CreatedAt.After(skippedLow.Tweet.CreatedAt) {
				skippedLow = autoCommentTweetCandidate{
					Tweet:            tw,
					OpportunityScore: opportunity.Score,
					QueueScore:       autoCommentQueueScore(target.Priority, opportunity.Score),
				}
			}
			continue
		}
		candidates = append(candidates, autoCommentTweetCandidate{
			Tweet:            tw,
			OpportunityScore: opportunity.Score,
			QueueScore:       autoCommentQueueScore(target.Priority, opportunity.Score),
		})
	}
	if len(candidates) == 0 {
		return skippedLow, false, nil
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].QueueScore != candidates[j].QueueScore {
			return candidates[i].QueueScore > candidates[j].QueueScore
		}
		if candidates[i].OpportunityScore != candidates[j].OpportunityScore {
			return candidates[i].OpportunityScore > candidates[j].OpportunityScore
		}
		return candidates[i].Tweet.CreatedAt.After(candidates[j].Tweet.CreatedAt)
	})
	return candidates[0], true, nil
}

func autoCommentQueueScore(priority, opportunityScore int) int {
	return normalizeAutoCommentTargetPriority(priority)*20 + clampInt(opportunityScore, 0, 100)
}

func isAutoCommentPublishedStatus(status string) bool {
	return status == "sent" || status == "published"
}

func updateAutoCommentAnalyticsGroup(groups map[string]*dto.AutoCommentAnalyticsGroup, key, label string, task model.AutoCommentTask) {
	key = firstNonEmpty(strings.TrimSpace(key), "unknown")
	label = firstNonEmpty(strings.TrimSpace(label), key)
	group := groups[key]
	if group == nil {
		group = &dto.AutoCommentAnalyticsGroup{Key: key, Label: label}
		groups[key] = group
	}
	group.Total++
	group.AverageOpportunity += task.OpportunityScore
	if isAutoCommentPublishedStatus(task.Status) {
		group.Published++
	}
	if task.Status == "failed" || task.Status == "blocked" {
		group.Failed++
	}
}

func sortedAutoCommentAnalyticsGroups(groups map[string]*dto.AutoCommentAnalyticsGroup, limit int) []dto.AutoCommentAnalyticsGroup {
	out := make([]dto.AutoCommentAnalyticsGroup, 0, len(groups))
	for _, group := range groups {
		if group.Total > 0 {
			group.AverageOpportunity = group.AverageOpportunity / group.Total
		}
		out = append(out, *group)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Published != out[j].Published {
			return out[i].Published > out[j].Published
		}
		if out[i].AverageOpportunity != out[j].AverageOpportunity {
			return out[i].AverageOpportunity > out[j].AverageOpportunity
		}
		return out[i].Total > out[j].Total
	})
	if limit > 0 && len(out) > limit {
		return out[:limit]
	}
	return out
}

type autoCommentTargetHealthStats struct {
	Total            int
	Failed           int
	OpportunityTotal int
}

func updateAutoCommentTargetHealthStats(stats map[uint]*autoCommentTargetHealthStats, task model.AutoCommentTask) {
	if task.TargetID == 0 {
		return
	}
	row := stats[task.TargetID]
	if row == nil {
		row = &autoCommentTargetHealthStats{}
		stats[task.TargetID] = row
	}
	row.Total++
	row.OpportunityTotal += task.OpportunityScore
	if task.Status == "failed" || task.Status == "blocked" {
		row.Failed++
	}
}

func buildAutoCommentHealthItems(targets []model.AutoCommentTarget, stats map[uint]*autoCommentTargetHealthStats, now time.Time) []dto.AutoCommentHealthItem {
	items := []dto.AutoCommentHealthItem{}
	for _, target := range targets {
		base := autoCommentHealthBase(target, stats[target.ID])
		reasonLower := strings.ToLower(strings.TrimSpace(target.LastFailureReason))
		if strings.Contains(reasonLower, "skipped_low_priority") || strings.Contains(reasonLower, "skipped_low_value") {
			item := base
			item.IssueType = "low_opportunity"
			item.Severity = "low"
			item.Message = "Recent target tweets were skipped by the opportunity threshold before AI generation."
			item.SuggestedAction = "Keep this target only if it is strategically important, or lower its priority to protect generation and review resources."
			item.LastFailureReason = target.LastFailureReason
			items = append(items, item)
			continue
		}
		if isAutoCommentAuthFailure(reasonLower) {
			item := base
			item.IssueType = "auth_or_account"
			item.Severity = "high"
			item.Message = "Target scan is failing because the executor account or X authorization looks unhealthy."
			item.SuggestedAction = "Reconnect the X account, then retry scanning this target."
			item.LastFailureReason = target.LastFailureReason
			items = append(items, item)
			continue
		}
		if strings.TrimSpace(target.LastFailureReason) != "" && !strings.HasPrefix(reasonLower, "skip:") {
			item := base
			item.IssueType = "scan_failure"
			item.Severity = "medium"
			item.Message = "Target scanning has recent failures."
			item.SuggestedAction = "Check the failure reason and verify the target handle is still valid."
			item.LastFailureReason = target.LastFailureReason
			items = append(items, item)
		}
		if target.LastCheckedAt != nil && (target.LastSeenTweetAt == nil || target.LastSeenTweetAt.Before(now.AddDate(0, 0, -14))) {
			item := base
			item.IssueType = "stale_tweets"
			item.Severity = "medium"
			item.Message = "No recent root tweet has been detected for this target."
			item.SuggestedAction = "Lower its priority or replace it with a more active KOL."
			items = append(items, item)
		}
		stat := stats[target.ID]
		if stat != nil && stat.Total >= 3 {
			avg := stat.OpportunityTotal / stat.Total
			if avg < 35 {
				item := base
				item.IssueType = "low_opportunity"
				item.Severity = "low"
				item.Message = "Recent target tweets have low Auto Comment opportunity scores."
				item.SuggestedAction = "Move this target to a lower priority group or refine content keywords."
				item.AverageOpportunity = avg
				items = append(items, item)
			}
			if stat.Failed >= 3 && stat.Failed*2 >= stat.Total {
				item := base
				item.IssueType = "frequent_failures"
				item.Severity = "high"
				item.Message = "This target has repeated failed or blocked comment tasks."
				item.SuggestedAction = "Pause this target and inspect recent failures before enabling it again."
				items = append(items, item)
			}
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		if autoCommentHealthSeverityRank(items[i].Severity) != autoCommentHealthSeverityRank(items[j].Severity) {
			return autoCommentHealthSeverityRank(items[i].Severity) > autoCommentHealthSeverityRank(items[j].Severity)
		}
		if items[i].Priority != items[j].Priority {
			return items[i].Priority > items[j].Priority
		}
		return items[i].TargetUsername < items[j].TargetUsername
	})
	if len(items) > 12 {
		return items[:12]
	}
	return items
}

func autoCommentHealthBase(target model.AutoCommentTarget, stat *autoCommentTargetHealthStats) dto.AutoCommentHealthItem {
	item := dto.AutoCommentHealthItem{
		TargetID:       target.ID,
		TargetUsername: firstNonEmpty(target.TargetUsername, target.TargetAuthorHandle, "unknown"),
		TargetCategory: firstNonEmpty(target.TargetCategory, "other"),
		Priority:       normalizeAutoCommentTargetPriority(target.Priority),
		Status:         target.Status,
	}
	if target.LastCheckedAt != nil {
		item.LastCheckedAt = target.LastCheckedAt.UTC().Format(time.RFC3339)
	}
	if target.LastSeenTweetAt != nil {
		item.LastSeenTweetAt = target.LastSeenTweetAt.UTC().Format(time.RFC3339)
	}
	if stat != nil {
		item.TotalTasks = stat.Total
		item.FailedCount = stat.Failed
		if stat.Total > 0 {
			item.AverageOpportunity = stat.OpportunityTotal / stat.Total
		}
	}
	return item
}

func isAutoCommentAuthFailure(reason string) bool {
	if reason == "" {
		return false
	}
	for _, token := range []string{"unauthorized", "401", "403", "token", "access token", "account not found", "executor account"} {
		if strings.Contains(reason, token) {
			return true
		}
	}
	return false
}

func autoCommentHealthSeverityRank(severity string) int {
	switch severity {
	case "high":
		return 3
	case "medium":
		return 2
	default:
		return 1
	}
}

func (s *AutoCommentService) createTaskFromTweet(ctx context.Context, target model.AutoCommentTarget, cfg model.AutomationConfig, tw twitter.UserTweet) (*model.AutoCommentTask, error) {
	now := time.Now().UTC()
	if completed, err := s.alreadyCompletedAutoCommentForTweet(target.UserID, target.XAccountID, tw.ID); err != nil {
		return nil, err
	} else if completed {
		return nil, autoCommentAlreadyCompletedError(tw.ID)
	}
	if existing, err := s.taskRepo.GetByTargetTweet(target.UserID, target.XAccountID, tw.ID); err == nil {
		return existing, nil
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	bot, err := s.botForAccount(target.UserID, target.XAccountID)
	if err != nil {
		return nil, err
	}
	blocked := blockedWordsFromConfig(&cfg)
	contentContext := contentContextForGeneration(s.contentRepo, target.UserID, target.XAccountID, botIDForUsage(bot), tw.Text, target.TargetUsername, bot)
	opportunity := evaluateAutoCommentOpportunity(tw.Text, target.TargetUsername, bot, contentContext, blocked)
	if opportunity.Score < autoCommentMinimumOpportunityScore {
		return nil, autoCommentOpportunityTooLowError(opportunity)
	}
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, target.UserID, now); err != nil {
		return nil, err
	}
	mode := s.effectiveCommentExecutionMode(target.UserID, &cfg)
	if mode == ExecutionModeAutopilot {
		if err := s.assertAutoCommentMonthlyQuota(target.UserID, now); err != nil {
			return nil, err
		}
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(target.UserID, target.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	input := autoCommentInputFromValues(target.TargetUsername, tw.Text, cfg.Tone, blocked, bot)
	input.ContentContext = contentContext
	input.FeedbackSignals = s.autoCommentFeedbackSignals(target.UserID, botIDForUsage(bot))
	input.FeedbackSignals = appendFeedbackLearningSignals(input.FeedbackSignals, s.verdictRepo, s.prefRepo, target.UserID, botIDForUsage(bot), "comment")
	generated, err := s.ai.GenerateAutoCommentCandidates(ctx, input)
	comment := generated.Text
	risk := evaluateAutoCommentRisk(comment, bot, blocked)
	status, capability, approvalRequired, approvedAt := autoCommentInitialState(mode, risk, now)
	applyAutoCommentOpportunityGate(mode, opportunity, &status, &capability, &approvalRequired, &approvedAt)
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
		OpportunityScore:  opportunity.Score,
		GenerationReason:  opportunity.Reason,
		MatchedKeywords:   encodeStringList(opportunity.MatchedKeywords),
		ReferencedContent: encodeStringList(opportunity.ReferencedContent),
		CommentVariants:   encodeAutoCommentVariants(generated.Candidates),
		Status:            status,
		RiskLevel:         risk.Level,
		CapabilityStatus:  capability,
		FailureCategory:   risk.Category,
		FailureReason:     risk.Reason,
		ApprovalRequired:  approvalRequired,
		DetectedAt:        now,
		ApprovedAt:        approvedAt,
	}
	applyAutoCommentDelivery(task, decideAutoCommentDelivery(tw.Text, target.TargetUsername, tw.ID, *acc, comment))
	if err != nil {
		task.Status = "failed"
		task.CapabilityStatus = "llm_failed"
		task.FailureCategory = "llm_error"
		task.FailureReason = truncateErrMsg(err.Error())
		task.Retryable = true
		if _, createErr := s.taskRepo.CreateIfNotExists(task); createErr != nil {
			return nil, createErr
		}
		return task, err
	}
	task.GeneratedComment = truncateRunes(comment, autoCommentPreviewRunes)
	task.GeneratedAt = &now
	created, err := s.taskRepo.CreateIfNotExists(task)
	if err != nil {
		return nil, err
	}
	if !created {
		return task, nil
	}
	if err := recordAIGenerationUsage(s.usageRepo, target.UserID, task.BotID, repository.AIGenerationSceneAutoComment, now, generated.Usage); err != nil {
		return nil, err
	}
	if mode == ExecutionModeAutopilot && task.Status == "ready_to_publish" && task.DeliveryMode == autoCommentDeliveryAutoComment {
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

func (s *AutoCommentService) refreshXAccountAfterUnauthorized(ctx context.Context, acc model.TwitterAccount, fields ...zap.Field) (model.TwitterAccount, bool) {
	if s == nil || s.publishing == nil {
		zap.L().Warn("auto comment: x token refresh unavailable", fields...)
		return acc, false
	}
	refreshed, err := s.publishing.RefreshXAccessTokenForAccount(ctx, &acc)
	if err != nil {
		zap.L().Warn("auto comment: x token refresh failed; account marked for reauth", append(fields, zap.Error(err))...)
		return acc, false
	}
	if refreshed == nil {
		zap.L().Warn("auto comment: x token refresh returned empty account", fields...)
		return acc, false
	}
	zap.L().Info("auto comment: x token refreshed after unauthorized", fields...)
	return *refreshed, true
}

func (s *AutoCommentService) commentLimitsExceeded(userID uint, cfg *model.AutomationConfig, now time.Time) (bool, string) {
	return false, ""
}

func autoCommentTargetDueForScan(target model.AutoCommentTarget, user *model.User, now time.Time) (bool, string) {
	plan := subscription.PlanFreeTrial
	if user != nil {
		plan = subscription.NormalizePlanCode(user.SubscriptionPlanCode)
	}
	interval := autoCommentScanInterval(plan, normalizeAutoCommentTargetPriority(target.Priority))
	if interval <= 0 {
		return false, "priority disabled for current plan"
	}
	if target.LastCheckedAt == nil {
		return true, ""
	}
	next := target.LastCheckedAt.Add(interval)
	if now.Before(next) {
		return false, "next scan at " + next.UTC().Format(time.RFC3339)
	}
	return true, ""
}

func autoCommentScanInterval(plan string, priority int) time.Duration {
	p := normalizeAutoCommentTargetPriority(priority)
	switch subscription.NormalizePlanCode(plan) {
	case subscription.PlanProPlus:
		switch {
		case p >= 5:
			return 6 * time.Hour
		case p == 4:
			return 12 * time.Hour
		case p == 3:
			return 24 * time.Hour
		default:
			return 72 * time.Hour
		}
	case subscription.PlanPro:
		switch {
		case p >= 5:
			return 12 * time.Hour
		case p == 4:
			return 24 * time.Hour
		case p == 3:
			return 48 * time.Hour
		default:
			return 96 * time.Hour
		}
	case subscription.PlanPlus:
		switch {
		case p >= 5:
			return 24 * time.Hour
		case p == 4:
			return 48 * time.Hour
		case p == 3:
			return 72 * time.Hour
		default:
			return 168 * time.Hour
		}
	case subscription.PlanBasic:
		if p >= 5 {
			return 96 * time.Hour
		}
		if p >= 3 {
			return 168 * time.Hour
		}
		return 0
	default:
		if p >= 5 {
			return 96 * time.Hour
		}
		if p >= 3 {
			return 168 * time.Hour
		}
		return 0
	}
}

func (s *AutoCommentService) assertAutoCommentMonthlyScanQuota(userID uint, now time.Time) error {
	if s.scanRepo == nil || s.userRepo == nil {
		return nil
	}
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	limit := subscription.LimitsForUser(u).MonthlyAutoCommentScans
	if limit <= 0 {
		return ErrAutoCommentScanLimitExceeded
	}
	used, err := s.scanRepo.CountByUserBetween(userID, startOfUTCMonth(now), now)
	if err != nil {
		return err
	}
	if used >= limit {
		return ErrAutoCommentScanLimitExceeded
	}
	return nil
}

func (s *AutoCommentService) recordAutoCommentScan(target model.AutoCommentTarget, at time.Time, status string, xReadUnits int, reason string) {
	if s.scanRepo == nil {
		return
	}
	if xReadUnits <= 0 {
		xReadUnits = 1
	}
	row := &model.AutoCommentScanLedger{
		UserID:                  target.UserID,
		XAccountID:              target.XAccountID,
		TargetID:                target.ID,
		TargetUsername:          target.TargetUsername,
		Status:                  firstNonEmpty(strings.TrimSpace(status), "scanned"),
		XReadUnits:              xReadUnits,
		EstimatedCostMilliCents: int64(xReadUnits) * 500,
		SkipReason:              truncateRunes(strings.TrimSpace(reason), 512),
		ScannedAt:               at,
	}
	if err := s.scanRepo.Create(row); err != nil {
		zap.L().Warn("auto comment: record scan ledger failed", zap.Uint("user_id", target.UserID), zap.Uint("target_id", target.ID), zap.Error(err))
	}
}

func (s *AutoCommentService) assertAutoCommentTargetCapacity(userID uint, incoming int64) error {
	remaining, err := s.autoCommentTargetRemaining(userID)
	if err != nil {
		return err
	}
	if incoming > remaining {
		if remaining < 0 {
			remaining = 0
		}
		return fmt.Errorf("%w: current plan has %d target slots remaining", ErrAutoCommentTargetLimitExceeded, remaining)
	}
	return nil
}

func (s *AutoCommentService) autoCommentTargetRemaining(userID uint) (int64, error) {
	if s.targetRepo == nil || s.userRepo == nil {
		return 0, nil
	}
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return 0, err
	}
	limit := subscription.LimitsForUser(u).AutoCommentTargets
	if limit <= 0 {
		return 0, nil
	}
	used, err := s.targetRepo.CountByUser(userID)
	if err != nil {
		return 0, err
	}
	return limit - used, nil
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

func exposureRadarHandleFromURL(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) >= 1 && parts[0] != "i" && parts[0] != "search" {
		return normalizeHandle(parts[0])
	}
	return ""
}

func exposureRadarGenerationReason(req dto.ExposureRadarCommentDraftRequest) string {
	parts := []string{"Generated from Exposure Radar and routed to review before any publishing action."}
	if strings.TrimSpace(req.Region) != "" {
		parts = append(parts, "region="+strings.TrimSpace(req.Region))
	}
	if strings.TrimSpace(req.DataSource) != "" {
		parts = append(parts, "source="+strings.TrimSpace(req.DataSource))
	}
	if strings.TrimSpace(req.RecommendedUse) != "" {
		parts = append(parts, "recommended="+strings.TrimSpace(req.RecommendedUse))
	}
	if strings.TrimSpace(req.Reason) != "" {
		parts = append(parts, "reason="+strings.TrimSpace(req.Reason))
	}
	return truncateRunes(strings.Join(parts, " "), 1000)
}

func exposureRadarReferencedContent(req dto.ExposureRadarCommentDraftRequest) []string {
	out := []string{}
	for _, item := range []string{req.Title, req.SignalID, req.URL} {
		item = strings.TrimSpace(item)
		if item != "" {
			out = append(out, truncateRunes(item, 180))
		}
	}
	return out
}

func exposureRadarMatchedKeywords(req dto.ExposureRadarCommentDraftRequest) []string {
	out := []string{}
	for _, item := range []string{req.TopicName, req.OpportunityType, req.Region, "exposure_radar"} {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		seen := false
		for _, existing := range out {
			if strings.EqualFold(existing, item) {
				seen = true
				break
			}
		}
		if !seen {
			out = append(out, truncateRunes(item, 80))
		}
	}
	return out
}

func normalizeExposureRadarRisk(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "medium":
		return "medium"
	case "high":
		return "high"
	default:
		return "low"
	}
}

func mergeExposureRadarRisk(generatedRisk, signalRisk string) string {
	generated := normalizeExposureRadarRisk(generatedRisk)
	signal := normalizeExposureRadarRisk(signalRisk)
	if generated == "high" || signal == "high" {
		return "high"
	}
	if generated == "medium" || signal == "medium" {
		return "medium"
	}
	return "low"
}

func applyManualCommentTarget(target *model.AutoCommentTarget, req dto.AutoCommentTargetRequest, username, tweetID, targetText string) {
	target.TargetUsername = username
	target.TargetAuthorHandle = username
	target.TargetTweetID = tweetID
	target.TargetTweetURL = strings.TrimSpace(req.TargetTweetURL)
	target.TargetText = truncateRunes(targetText, 1000)
	target.TargetCategory = normalizeAutoCommentTargetCategory(req.TargetCategory)
	target.Priority = normalizeAutoCommentTargetPriority(req.Priority)
	target.Notes = truncateRunes(strings.TrimSpace(req.Notes), 512)
	target.Status = "paused"
}

func normalizeAutoCommentTargetCategory(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "kol", "founder", "project", "competitor", "customer", "media", "analyst", "investor", "developer", "community", "ecosystem", "partner", "other":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return "kol"
	}
}

func normalizeAutoCommentTargetPriority(v int) int {
	if v < 1 || v > 5 {
		return 3
	}
	return v
}

func normalizeAutoCommentBulkHandles(handles []string, raw string) []string {
	parts := append([]string{}, handles...)
	if strings.TrimSpace(raw) != "" {
		parts = append(parts, strings.FieldsFunc(raw, func(r rune) bool {
			return r == ',' || r == '\n' || r == '\r' || r == '\t' || r == ' ' || r == ';'
		})...)
	}
	out := []string{}
	for _, part := range parts {
		handle := normalizeHandle(strings.TrimSpace(part))
		handle = strings.TrimPrefix(handle, "https://x.com/")
		handle = strings.TrimPrefix(handle, "https://twitter.com/")
		handle = strings.Trim(handle, "/")
		if handle == "" || strings.Contains(handle, "/") {
			continue
		}
		out = appendUniqueLimited(out, handle, 200)
	}
	return out
}

func autoCommentTargetSuggestionInput(bot *model.OAFBot, targets []model.AutoCommentTarget, contentRows []model.ContentLibraryItem) GenerateAutoCommentTargetSuggestionsInput {
	input := GenerateAutoCommentTargetSuggestionsInput{}
	if bot != nil {
		input.BotName = bot.Name
		input.ProjectOneLiner = bot.ProjectOneLiner
		input.TargetAudience = bot.TargetAudience
		input.CoreValueProps = bot.CoreValueProps
		input.ProductFeatures = bot.ProductFeatures
		input.Differentiators = bot.Differentiators
		input.Topics = decodeStringList(bot.Topics)
		input.Keywords = decodeStringList(bot.Keywords)
	}
	for _, target := range targets {
		handle := strings.TrimPrefix(strings.TrimSpace(target.TargetUsername), "@")
		if handle == "" {
			continue
		}
		input.ExistingTargets = appendUniqueLimited(input.ExistingTargets, handle, 50)
	}
	for _, target := range targets {
		if target.LastFailureReason != "" {
			continue
		}
		handle := strings.TrimPrefix(strings.TrimSpace(target.TargetUsername), "@")
		if handle != "" && target.Priority >= 4 {
			input.HighScoreTargets = appendUniqueLimited(input.HighScoreTargets, handle, 10)
		}
	}
	for _, item := range contentRows {
		if strings.TrimSpace(item.Title) != "" {
			input.ContentTitles = appendUniqueLimited(input.ContentTitles, item.Title, 12)
		}
		for _, topic := range decodeStringList(item.Topics) {
			input.ContentTopics = appendUniqueLimited(input.ContentTopics, topic, 20)
		}
	}
	return input
}

func fillAutoCommentTargetSuggestions(items []AutoCommentTargetSuggestion, existing []string, minCount int) []AutoCommentTargetSuggestion {
	if minCount <= 0 {
		minCount = 8
	}
	existingSet := map[string]bool{}
	for _, item := range existing {
		if handle := normalizeSuggestionHandle(item); handle != "" {
			existingSet[handle] = true
		}
	}
	seen := map[string]bool{}
	out := make([]AutoCommentTargetSuggestion, 0, minCount+len(items))
	for _, item := range items {
		normalized := normalizeSuggestionHandle(item.Handle)
		if normalized == "" || existingSet[normalized] || seen[normalized] {
			continue
		}
		seen[normalized] = true
		item.Handle = normalized
		item.Category = normalizeSuggestionCategory(item.Category)
		item.Priority = normalizeAutoCommentTargetPriority(item.Priority)
		out = append(out, item)
	}
	for _, item := range fallbackAutoCommentTargetSuggestions() {
		if len(out) >= minCount {
			break
		}
		normalized := normalizeSuggestionHandle(item.Handle)
		if normalized == "" || existingSet[normalized] || seen[normalized] {
			continue
		}
		seen[normalized] = true
		item.Handle = normalized
		item.Category = normalizeSuggestionCategory(item.Category)
		item.Priority = normalizeAutoCommentTargetPriority(item.Priority)
		out = append(out, item)
	}
	return out
}

func (s *AutoCommentService) filterActiveAutoCommentTargetSuggestions(ctx context.Context, account model.TwitterAccount, items []AutoCommentTargetSuggestion, existing []string, minCount int, maxChecks int, now time.Time) []AutoCommentTargetSuggestion {
	if minCount <= 0 {
		minCount = 8
	}
	if maxChecks <= 0 || maxChecks < minCount {
		maxChecks = autoCommentSuggestionCandidateLimit(minCount)
	}
	token := strings.TrimSpace(account.AccessToken)
	if token == "" {
		return firstAutoCommentSuggestions(items, minCount)
	}
	existingSet := map[string]bool{}
	for _, item := range existing {
		if handle := normalizeSuggestionHandle(item); handle != "" {
			existingSet[handle] = true
		}
	}
	out := make([]AutoCommentTargetSuggestion, 0, minCount)
	seen := map[string]bool{}
	checked := 0
	for _, item := range items {
		if len(out) >= minCount || checked >= maxChecks {
			break
		}
		handle := normalizeSuggestionHandle(item.Handle)
		if handle == "" || existingSet[handle] || seen[handle] {
			continue
		}
		seen[handle] = true
		checked++
		xu, err := twitter.LookupUserByUsername(ctx, nil, token, handle)
		if err != nil {
			zap.L().Debug("auto comment: skip suggested target lookup failed", zap.String("handle", handle), zap.Error(err))
			continue
		}
		tweets, err := twitter.ListUserRootTweets(ctx, nil, token, xu.ID, 5)
		if err != nil {
			zap.L().Debug("auto comment: skip suggested target tweets failed", zap.String("handle", handle), zap.Error(err))
			continue
		}
		if !hasRecentAutoCommentCandidateTweet(tweets, now, 45*24*time.Hour) {
			zap.L().Debug("auto comment: skip stale suggested target", zap.String("handle", handle))
			continue
		}
		item.Handle = normalizeSuggestionHandle(firstNonEmpty(xu.Username, handle))
		item.DisplayName = firstNonEmpty(strings.TrimSpace(xu.DisplayName), item.DisplayName)
		item.Category = normalizeSuggestionCategory(item.Category)
		item.Priority = normalizeAutoCommentTargetPriority(item.Priority)
		if strings.TrimSpace(item.Reason) == "" {
			item.Reason = "Recently active X account relevant to the current Auto Comment target profile."
		}
		out = append(out, item)
	}
	return out
}

func hasRecentAutoCommentCandidateTweet(tweets []twitter.UserTweet, now time.Time, maxAge time.Duration) bool {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	for _, tw := range tweets {
		if tw.ID == "" {
			continue
		}
		if tw.CreatedAt.IsZero() {
			return true
		}
		if !tw.CreatedAt.Before(now.Add(-maxAge)) {
			return true
		}
	}
	return false
}

func firstAutoCommentSuggestions(items []AutoCommentTargetSuggestion, limit int) []AutoCommentTargetSuggestion {
	if limit <= 0 || len(items) <= limit {
		return items
	}
	return items[:limit]
}

func (s *AutoCommentService) autoCommentTargetSuggestionQuota(userID uint, currentTargets int64) (int64, int64, error) {
	limit := int64(8)
	if s.userRepo != nil {
		u, err := s.userRepo.GetByID(userID)
		if err != nil {
			return 0, 0, err
		}
		if planLimit := subscription.LimitsForUser(u).AutoCommentTargets; planLimit > 0 {
			limit = planLimit
		}
	}
	remaining := limit - currentTargets
	if remaining < 0 {
		remaining = 0
	}
	return limit, remaining, nil
}

func autoCommentSuggestionCandidateLimit(suggestionLimit int) int {
	if suggestionLimit <= 0 {
		return 0
	}
	limit := suggestionLimit * 4
	if min := suggestionLimit + 24; limit < min {
		limit = min
	}
	if limit < 32 {
		limit = 32
	}
	if limit > 240 {
		limit = 240
	}
	return limit
}

func fallbackAutoCommentTargetSuggestions() []AutoCommentTargetSuggestion {
	return []AutoCommentTargetSuggestion{
		{Handle: "BanklessHQ", DisplayName: "Bankless", Category: "media", Priority: 5, Reason: "Large Web3 media audience; suitable for adoption, community, and operations discussions.", SearchQuery: "site:x.com/BanklessHQ Web3 community"},
		{Handle: "MessariCrypto", DisplayName: "Messari", Category: "media", Priority: 5, Reason: "Research/media account with industry audience and frequent Web3 project discussions.", SearchQuery: "site:x.com/MessariCrypto Web3 research"},
		{Handle: "a16zcrypto", DisplayName: "a16z crypto", Category: "ecosystem", Priority: 5, Reason: "Builder and founder-heavy Web3 audience with overlap for AI agent and growth tooling.", SearchQuery: "site:x.com/a16zcrypto builders AI agents"},
		{Handle: "base", DisplayName: "Base", Category: "ecosystem", Priority: 5, Reason: "Active onchain ecosystem account with builder, consumer crypto, and community-growth discussions.", SearchQuery: "site:x.com/base onchain builders"},
		{Handle: "Optimism", DisplayName: "Optimism", Category: "ecosystem", Priority: 4, Reason: "Active L2 ecosystem with builder and governance conversations relevant to Web3 operators.", SearchQuery: "site:x.com/Optimism builders governance"},
		{Handle: "arbitrum", DisplayName: "Arbitrum", Category: "ecosystem", Priority: 4, Reason: "Large L2 ecosystem account with frequent project and developer conversation opportunities.", SearchQuery: "site:x.com/arbitrum ecosystem developers"},
		{Handle: "solana", DisplayName: "Solana", Category: "ecosystem", Priority: 5, Reason: "High-velocity ecosystem account with strong founder, consumer crypto, and community overlap.", SearchQuery: "site:x.com/solana consumer crypto"},
		{Handle: "farcaster_xyz", DisplayName: "Farcaster", Category: "project", Priority: 5, Reason: "Social protocol audience overlaps strongly with SocialFi, creator tooling, and autonomous social agents.", SearchQuery: "site:x.com/farcaster_xyz social protocol"},
		{Handle: "LensProtocol", DisplayName: "Lens", Category: "project", Priority: 5, Reason: "SocialFi protocol with audience interested in social graphs, creators, and agent-powered engagement.", SearchQuery: "site:x.com/LensProtocol SocialFi creators"},
		{Handle: "DefiLlama", DisplayName: "DefiLlama", Category: "media", Priority: 4, Reason: "Data-focused DeFi audience where practical tooling and analytics comments can fit naturally.", SearchQuery: "site:x.com/DefiLlama DeFi data"},
		{Handle: "DefiIgnas", DisplayName: "Ignas", Category: "analyst", Priority: 5, Reason: "DeFi analyst with educational threads and an audience likely to care about operational tooling.", SearchQuery: "site:x.com/DefiIgnas DeFi tools growth"},
		{Handle: "thedefiedge", DisplayName: "The DeFi Edge", Category: "analyst", Priority: 5, Reason: "DeFi/Web3 growth and project-analysis audience with high overlap for practical social operations.", SearchQuery: "site:x.com/thedefiedge DeFi growth"},
		{Handle: "Foresight_News", DisplayName: "Foresight News", Category: "media", Priority: 4, Reason: "Chinese Web3 media account; useful for Chinese-language exposure and market discussion.", SearchQuery: "site:x.com/Foresight_News Web3 中文"},
		{Handle: "BlockBeatsAsia", DisplayName: "BlockBeats", Category: "media", Priority: 4, Reason: "Chinese crypto media audience with frequent project and market updates.", SearchQuery: "site:x.com/BlockBeatsAsia crypto 中文"},
		{Handle: "TechFlowPost", DisplayName: "TechFlow", Category: "media", Priority: 4, Reason: "Chinese Web3 media and research audience with frequent ecosystem and project conversations.", SearchQuery: "site:x.com/TechFlowPost Web3 中文"},
		{Handle: "ethereum", DisplayName: "Ethereum", Category: "ecosystem", Priority: 5, Reason: "Core Ethereum ecosystem account with broad developer and founder audience overlap.", SearchQuery: "site:x.com/ethereum builders web3"},
		{Handle: "VitalikButerin", DisplayName: "Vitalik Buterin", Category: "founder", Priority: 5, Reason: "High-signal Ethereum founder audience with strong crypto builder overlap.", SearchQuery: "site:x.com/VitalikButerin Ethereum social"},
		{Handle: "jessepollak", DisplayName: "Jesse Pollak", Category: "founder", Priority: 5, Reason: "Base founder with active onchain builder and consumer crypto discussions.", SearchQuery: "site:x.com/jessepollak onchain builders"},
		{Handle: "santiagoroel", DisplayName: "Santiago Roel Santos", Category: "kol", Priority: 5, Reason: "Crypto, AI, and macro commentary with a founder-heavy audience.", SearchQuery: "site:x.com/santiagoroel crypto AI"},
		{Handle: "cdixon", DisplayName: "Chris Dixon", Category: "investor", Priority: 5, Reason: "Web3 investor audience with strong founder and builder overlap.", SearchQuery: "site:x.com/cdixon web3 builders"},
		{Handle: "pmarca", DisplayName: "Marc Andreessen", Category: "investor", Priority: 4, Reason: "Large tech and AI audience where agent and automation topics can fit.", SearchQuery: "site:x.com/pmarca AI agents"},
		{Handle: "naval", DisplayName: "Naval", Category: "kol", Priority: 4, Reason: "Large founder and technology audience for thoughtful automation and community comments.", SearchQuery: "site:x.com/naval startups crypto"},
		{Handle: "balajis", DisplayName: "Balaji", Category: "kol", Priority: 5, Reason: "Crypto and network-state audience with high visibility for infrastructure and community ideas.", SearchQuery: "site:x.com/balajis crypto network"},
		{Handle: "punk6529", DisplayName: "6529", Category: "kol", Priority: 5, Reason: "NFT, open metaverse, and community operations audience with strong Web3 overlap.", SearchQuery: "site:x.com/punk6529 NFT community"},
		{Handle: "dwr", DisplayName: "Dan Romero", Category: "founder", Priority: 5, Reason: "Farcaster founder with social protocol and community-growth audience.", SearchQuery: "site:x.com/dwr farcaster social"},
		{Handle: "vitalikbuterin", DisplayName: "Vitalik Buterin", Category: "founder", Priority: 5, Reason: "Ethereum founder account with high-quality technical and ecosystem discussion.", SearchQuery: "site:x.com/vitalikbuterin Ethereum"},
		{Handle: "zksync", DisplayName: "ZKsync", Category: "ecosystem", Priority: 4, Reason: "Active L2 ecosystem account with developer and project announcements.", SearchQuery: "site:x.com/zksync builders"},
		{Handle: "Starknet", DisplayName: "Starknet", Category: "ecosystem", Priority: 4, Reason: "ZK and L2 ecosystem audience suitable for developer tooling comments.", SearchQuery: "site:x.com/Starknet ecosystem"},
		{Handle: "0xPolygon", DisplayName: "Polygon", Category: "ecosystem", Priority: 4, Reason: "Large Web3 ecosystem account with project, developer, and consumer crypto updates.", SearchQuery: "site:x.com/0xPolygon ecosystem"},
		{Handle: "avax", DisplayName: "Avalanche", Category: "ecosystem", Priority: 4, Reason: "L1 ecosystem audience with project and institutional adoption discussions.", SearchQuery: "site:x.com/avax ecosystem"},
		{Handle: "SuiNetwork", DisplayName: "Sui", Category: "ecosystem", Priority: 4, Reason: "Active L1 ecosystem with consumer app and developer conversation opportunities.", SearchQuery: "site:x.com/SuiNetwork builders"},
		{Handle: "Aptos", DisplayName: "Aptos", Category: "ecosystem", Priority: 4, Reason: "L1 ecosystem account with developer and project-growth audience.", SearchQuery: "site:x.com/Aptos ecosystem"},
		{Handle: "cosmos", DisplayName: "Cosmos", Category: "ecosystem", Priority: 4, Reason: "Interchain ecosystem account with developer and governance discussion opportunities.", SearchQuery: "site:x.com/cosmos interchain"},
		{Handle: "CelestiaOrg", DisplayName: "Celestia", Category: "ecosystem", Priority: 4, Reason: "Modular blockchain audience with infrastructure and developer overlap.", SearchQuery: "site:x.com/CelestiaOrg modular blockchain"},
		{Handle: "eigenlayer", DisplayName: "EigenLayer", Category: "project", Priority: 4, Reason: "Restaking and infrastructure project with active operator and builder discussions.", SearchQuery: "site:x.com/eigenlayer operators"},
		{Handle: "chainlink", DisplayName: "Chainlink", Category: "project", Priority: 4, Reason: "Oracle and Web3 infrastructure audience with broad enterprise and developer overlap.", SearchQuery: "site:x.com/chainlink web3 infrastructure"},
		{Handle: "Uniswap", DisplayName: "Uniswap Labs", Category: "project", Priority: 4, Reason: "DeFi project account with a large trader, builder, and protocol audience.", SearchQuery: "site:x.com/Uniswap DeFi"},
		{Handle: "aave", DisplayName: "Aave", Category: "project", Priority: 4, Reason: "Major DeFi protocol with governance, liquidity, and community-growth discussions.", SearchQuery: "site:x.com/aave DeFi"},
		{Handle: "MakerDAO", DisplayName: "MakerDAO", Category: "project", Priority: 4, Reason: "DeFi and stablecoin community with governance and ecosystem updates.", SearchQuery: "site:x.com/MakerDAO DeFi"},
		{Handle: "pendle_fi", DisplayName: "Pendle", Category: "project", Priority: 4, Reason: "Active DeFi project audience with high-signal market and protocol discussions.", SearchQuery: "site:x.com/pendle_fi DeFi"},
		{Handle: "ethena_labs", DisplayName: "Ethena Labs", Category: "project", Priority: 4, Reason: "Active DeFi and stablecoin project with strong market conversation overlap.", SearchQuery: "site:x.com/ethena_labs DeFi"},
		{Handle: "LidoFinance", DisplayName: "Lido", Category: "project", Priority: 4, Reason: "Staking protocol audience with governance, validator, and DeFi overlap.", SearchQuery: "site:x.com/LidoFinance staking"},
		{Handle: "wormhole", DisplayName: "Wormhole", Category: "project", Priority: 4, Reason: "Interoperability project with ecosystem and cross-chain conversation opportunities.", SearchQuery: "site:x.com/wormhole cross-chain"},
		{Handle: "LayerZero_Core", DisplayName: "LayerZero", Category: "project", Priority: 4, Reason: "Cross-chain infrastructure account with developer and ecosystem audience.", SearchQuery: "site:x.com/LayerZero_Core developers"},
		{Handle: "safe", DisplayName: "Safe", Category: "project", Priority: 4, Reason: "Smart account and wallet infrastructure audience relevant to Web3 operations.", SearchQuery: "site:x.com/safe smart accounts"},
		{Handle: "rainbowdotme", DisplayName: "Rainbow", Category: "project", Priority: 4, Reason: "Consumer wallet audience with social, onboarding, and crypto UX overlap.", SearchQuery: "site:x.com/rainbowdotme crypto wallet"},
		{Handle: "phantom", DisplayName: "Phantom", Category: "project", Priority: 4, Reason: "Large wallet audience across Solana and multi-chain consumer crypto.", SearchQuery: "site:x.com/phantom wallet"},
		{Handle: "metamask", DisplayName: "MetaMask", Category: "project", Priority: 4, Reason: "Wallet and onboarding audience with Web3 user-growth relevance.", SearchQuery: "site:x.com/metamask wallet onboarding"},
		{Handle: "zapper_fi", DisplayName: "Zapper", Category: "project", Priority: 4, Reason: "Onchain portfolio and discovery audience with community and social graph overlap.", SearchQuery: "site:x.com/zapper_fi onchain"},
		{Handle: "zerion", DisplayName: "Zerion", Category: "project", Priority: 4, Reason: "Wallet and portfolio audience interested in social and user engagement flows.", SearchQuery: "site:x.com/zerion wallet"},
		{Handle: "Dune", DisplayName: "Dune", Category: "project", Priority: 4, Reason: "Crypto analytics audience with strong data, growth, and dashboard overlap.", SearchQuery: "site:x.com/Dune analytics"},
		{Handle: "nansen_ai", DisplayName: "Nansen", Category: "project", Priority: 4, Reason: "Onchain analytics audience relevant to growth measurement and social operations.", SearchQuery: "site:x.com/nansen_ai analytics"},
		{Handle: "tokenterminal", DisplayName: "Token Terminal", Category: "media", Priority: 4, Reason: "Crypto data audience with project, metrics, and market conversation opportunities.", SearchQuery: "site:x.com/tokenterminal crypto data"},
		{Handle: "TheBlock__", DisplayName: "The Block", Category: "media", Priority: 4, Reason: "Crypto media account with broad news and industry audience.", SearchQuery: "site:x.com/TheBlock__ crypto news"},
		{Handle: "CoinDesk", DisplayName: "CoinDesk", Category: "media", Priority: 4, Reason: "Large crypto media account with institutional and project discussion opportunities.", SearchQuery: "site:x.com/CoinDesk crypto"},
		{Handle: "Cointelegraph", DisplayName: "Cointelegraph", Category: "media", Priority: 4, Reason: "Large crypto media audience useful for broad awareness comments.", SearchQuery: "site:x.com/Cointelegraph crypto"},
		{Handle: "decryptmedia", DisplayName: "Decrypt", Category: "media", Priority: 4, Reason: "Crypto media account with consumer, culture, and Web3 adoption coverage.", SearchQuery: "site:x.com/decryptmedia web3"},
		{Handle: "WuBlockchain", DisplayName: "Wu Blockchain", Category: "media", Priority: 4, Reason: "Chinese and global crypto news audience with high discussion velocity.", SearchQuery: "site:x.com/WuBlockchain crypto"},
		{Handle: "PANewsCN", DisplayName: "PANews", Category: "media", Priority: 4, Reason: "Chinese Web3 media with frequent project and market news.", SearchQuery: "site:x.com/PANewsCN Web3 中文"},
		{Handle: "OdailyChina", DisplayName: "Odaily", Category: "media", Priority: 4, Reason: "Chinese crypto media account with active project and market updates.", SearchQuery: "site:x.com/OdailyChina crypto 中文"},
		{Handle: "ChainFeeds", DisplayName: "ChainFeeds", Category: "media", Priority: 4, Reason: "Chinese Web3 research and news audience with builder overlap.", SearchQuery: "site:x.com/ChainFeeds Web3 中文"},
		{Handle: "SevenXVentures", DisplayName: "SevenX Ventures", Category: "investor", Priority: 4, Reason: "Asia-focused crypto investor account with founder and project audience overlap.", SearchQuery: "site:x.com/SevenXVentures Web3"},
		{Handle: "HashKey_Capital", DisplayName: "HashKey Capital", Category: "investor", Priority: 4, Reason: "Asia Web3 investment audience with project and institutional overlap.", SearchQuery: "site:x.com/HashKey_Capital Web3"},
		{Handle: "multicoincap", DisplayName: "Multicoin Capital", Category: "investor", Priority: 4, Reason: "Crypto investment audience with infrastructure and market discussion opportunities.", SearchQuery: "site:x.com/multicoincap crypto"},
		{Handle: "dragonfly_xyz", DisplayName: "Dragonfly", Category: "investor", Priority: 4, Reason: "Crypto venture audience with founder, protocol, and ecosystem overlap.", SearchQuery: "site:x.com/dragonfly_xyz crypto"},
		{Handle: "ElectricCapital", DisplayName: "Electric Capital", Category: "investor", Priority: 4, Reason: "Web3 developer and venture audience relevant to builder-focused comments.", SearchQuery: "site:x.com/ElectricCapital developers"},
		{Handle: "cbventures", DisplayName: "Coinbase Ventures", Category: "investor", Priority: 4, Reason: "Venture account with broad Web3 founder and ecosystem audience.", SearchQuery: "site:x.com/cbventures web3"},
		{Handle: "BinanceLabs", DisplayName: "Binance Labs", Category: "investor", Priority: 4, Reason: "Large crypto venture and incubation audience with project-growth overlap.", SearchQuery: "site:x.com/BinanceLabs web3"},
		{Handle: "delphi_digital", DisplayName: "Delphi Digital", Category: "analyst", Priority: 4, Reason: "Research audience with protocol, market, and Web3 strategy discussion.", SearchQuery: "site:x.com/delphi_digital crypto research"},
		{Handle: "tokenterminal", DisplayName: "Token Terminal", Category: "analyst", Priority: 4, Reason: "Data-heavy crypto audience suitable for thoughtful analytics comments.", SearchQuery: "site:x.com/tokenterminal data"},
		{Handle: "ASvanevik", DisplayName: "Alex Svanevik", Category: "founder", Priority: 4, Reason: "Nansen founder with onchain analytics and crypto data audience overlap.", SearchQuery: "site:x.com/ASvanevik onchain analytics"},
		{Handle: "hmalviya9", DisplayName: "Hitesh Malviya", Category: "analyst", Priority: 4, Reason: "Crypto analyst audience with market and project discovery conversations.", SearchQuery: "site:x.com/hmalviya9 crypto"},
		{Handle: "0xResearch", DisplayName: "0xResearch", Category: "media", Priority: 4, Reason: "Crypto research media account with analyst and builder audience.", SearchQuery: "site:x.com/0xResearch crypto research"},
		{Handle: "MilkRoadDaily", DisplayName: "Milk Road", Category: "media", Priority: 4, Reason: "Crypto newsletter audience with accessible adoption and market conversations.", SearchQuery: "site:x.com/MilkRoadDaily crypto"},
		{Handle: "blocmatesdotcom", DisplayName: "blocmates", Category: "media", Priority: 4, Reason: "Crypto education and DeFi audience with practical tooling overlap.", SearchQuery: "site:x.com/blocmatesdotcom DeFi"},
		{Handle: "TheTieIO", DisplayName: "The Tie", Category: "analyst", Priority: 4, Reason: "Crypto data and institutional analytics audience.", SearchQuery: "site:x.com/TheTieIO crypto data"},
		{Handle: "MessariRyan", DisplayName: "Ryan Selkis", Category: "founder", Priority: 4, Reason: "Crypto media founder audience with broad industry conversation reach.", SearchQuery: "site:x.com/MessariRyan crypto"},
		{Handle: "ljxie", DisplayName: "Linda Xie", Category: "investor", Priority: 4, Reason: "Crypto investor and builder audience with thoughtful protocol discussion.", SearchQuery: "site:x.com/ljxie crypto"},
		{Handle: "rleshner", DisplayName: "Robert Leshner", Category: "founder", Priority: 4, Reason: "DeFi founder audience with governance and protocol operator overlap.", SearchQuery: "site:x.com/rleshner DeFi"},
		{Handle: "haydenzadams", DisplayName: "Hayden Adams", Category: "founder", Priority: 4, Reason: "Uniswap founder with large DeFi builder and protocol audience.", SearchQuery: "site:x.com/haydenzadams DeFi"},
		{Handle: "StaniKulechov", DisplayName: "Stani Kulechov", Category: "founder", Priority: 4, Reason: "Aave and Lens founder with DeFi and SocialFi audience overlap.", SearchQuery: "site:x.com/StaniKulechov SocialFi"},
		{Handle: "cdixon", DisplayName: "Chris Dixon", Category: "investor", Priority: 5, Reason: "A16Z crypto leader with founder and AI/Web3 builder audience.", SearchQuery: "site:x.com/cdixon crypto AI"},
		{Handle: "shawmakesmagic", DisplayName: "Shaw", Category: "developer", Priority: 5, Reason: "AI agent builder audience with direct relevance to autonomous social agents.", SearchQuery: "site:x.com/shawmakesmagic AI agents"},
		{Handle: "sama", DisplayName: "Sam Altman", Category: "founder", Priority: 4, Reason: "AI founder audience where AI agents and automation topics can resonate.", SearchQuery: "site:x.com/sama AI agents"},
		{Handle: "gdb", DisplayName: "Greg Brockman", Category: "founder", Priority: 4, Reason: "AI builder audience relevant to agent and automation conversations.", SearchQuery: "site:x.com/gdb AI agents"},
		{Handle: "karpathy", DisplayName: "Andrej Karpathy", Category: "developer", Priority: 4, Reason: "AI developer audience with interest in agents, workflows, and automation.", SearchQuery: "site:x.com/karpathy AI agents"},
		{Handle: "swyx", DisplayName: "swyx", Category: "developer", Priority: 4, Reason: "AI engineer and agent builder audience with practical tooling overlap.", SearchQuery: "site:x.com/swyx AI agents"},
		{Handle: "nearcyan", DisplayName: "Near Cyan", Category: "developer", Priority: 4, Reason: "AI agent and developer-tooling audience relevant to autonomous workflows.", SearchQuery: "site:x.com/nearcyan agents"},
		{Handle: "levelsio", DisplayName: "Pieter Levels", Category: "founder", Priority: 4, Reason: "Indie founder and AI tool audience with launch and growth discussion overlap.", SearchQuery: "site:x.com/levelsio AI tools"},
		{Handle: "packyM", DisplayName: "Packy McCormick", Category: "kol", Priority: 4, Reason: "Tech, crypto, and startup audience with long-form narrative discussions.", SearchQuery: "site:x.com/packyM crypto AI"},
		{Handle: "JasonYanowitz", DisplayName: "Jason Yanowitz", Category: "kol", Priority: 4, Reason: "Crypto media and founder audience with frequent market and project discussion.", SearchQuery: "site:x.com/JasonYanowitz crypto"},
		{Handle: "jason_chen998", DisplayName: "Jason Chen", Category: "kol", Priority: 4, Reason: "Chinese Web3 audience with project, community, and founder discussions.", SearchQuery: "site:x.com/jason_chen998 Web3 中文"},
		{Handle: "BMANLead", DisplayName: "BMAN", Category: "kol", Priority: 4, Reason: "Chinese crypto and Web3 audience relevant to growth and project discovery.", SearchQuery: "site:x.com/BMANLead Web3 中文"},
		{Handle: "Phyrex_Ni", DisplayName: "Phyrex", Category: "kol", Priority: 4, Reason: "Chinese crypto market audience with active discussion and education overlap.", SearchQuery: "site:x.com/Phyrex_Ni crypto 中文"},
		{Handle: "Oxtodd", DisplayName: "Oxtodd", Category: "kol", Priority: 4, Reason: "Chinese Web3 audience with market and project discussion overlap.", SearchQuery: "site:x.com/Oxtodd Web3 中文"},
		{Handle: "tmel0211", DisplayName: "tmel", Category: "kol", Priority: 4, Reason: "Chinese crypto community audience with frequent market and ecosystem discussion.", SearchQuery: "site:x.com/tmel0211 crypto 中文"},
	}
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

func (s *AutoCommentService) assertAutoCommentMonthlyQuota(userID uint, now time.Time) error {
	if s.taskRepo == nil || s.userRepo == nil {
		return nil
	}
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	limit := subscription.LimitsForUser(u).MonthlyAutoComments
	if limit <= 0 {
		return fmt.Errorf("monthly auto comment quota exceeded")
	}
	monthStart := startOfUTCMonth(now)
	used, err := s.taskRepo.CountCreatedBetween(userID, monthStart, now)
	if err != nil {
		return err
	}
	if used >= limit {
		return fmt.Errorf("monthly auto comment quota exceeded")
	}
	return nil
}

type autoCommentRisk struct {
	Level    string
	Category string
	Reason   string
}

type autoCommentOpportunity struct {
	Score             int
	Reason            string
	MatchedKeywords   []string
	ReferencedContent []string
}

func autoCommentOpportunitySkipCategory(score int) string {
	if score >= autoCommentMinimumOpportunityScore {
		return ""
	}
	if score >= autoCommentLowPriorityOpportunityScore {
		return "skipped_low_priority"
	}
	return "skipped_low_value"
}

func autoCommentOpportunitySkipMessage(score int) string {
	switch autoCommentOpportunitySkipCategory(score) {
	case "skipped_low_priority":
		return fmt.Sprintf("skip: skipped_low_priority opportunity score %d is below the recommended %d threshold; no AI comment was generated to protect review and publishing resources.", score, autoCommentMinimumOpportunityScore)
	case "skipped_low_value":
		return fmt.Sprintf("skip: skipped_low_value opportunity score %d is below the resource floor %d; no AI comment was generated.", score, autoCommentLowPriorityOpportunityScore)
	default:
		return ""
	}
}

func autoCommentOpportunityTooLowError(opportunity autoCommentOpportunity) error {
	msg := strings.TrimPrefix(autoCommentOpportunitySkipMessage(opportunity.Score), "skip: ")
	if msg == "" {
		msg = fmt.Sprintf("opportunity score %d is below minimum %d; skipped to avoid low-quality comments", opportunity.Score, autoCommentMinimumOpportunityScore)
	}
	return fmt.Errorf("%w: %s", ErrAutoCommentOpportunityTooLow, msg)
}

func autoCommentAlreadyCompletedError(tweetID string) error {
	tweetID = strings.TrimSpace(tweetID)
	if tweetID == "" {
		return fmt.Errorf("%w: target tweet already has a completed Auto Comment record", ErrAutoCommentAlreadyCompleted)
	}
	return fmt.Errorf("%w: target tweet %s already has a completed Auto Comment record", ErrAutoCommentAlreadyCompleted, tweetID)
}

func (s *AutoCommentService) alreadyCompletedAutoCommentForTweet(userID, xAccountID uint, tweetID string) (bool, error) {
	tweetID = strings.TrimSpace(tweetID)
	if tweetID == "" {
		return false, nil
	}
	if s != nil && s.taskRepo != nil {
		exists, err := s.taskRepo.ExistsCompletedForTargetTweet(userID, xAccountID, tweetID)
		if err != nil {
			return false, err
		}
		if exists {
			return true, nil
		}
	}
	if s != nil && s.activityRepo != nil {
		exists, err := s.activityRepo.HasSuccessfulCommentToRefTweet(userID, xAccountID, tweetID)
		if err != nil {
			return false, err
		}
		if exists {
			return true, nil
		}
	}
	return false, nil
}

func evaluateAutoCommentOpportunity(tweet, targetUsername string, bot *model.OAFBot, contentContext []GenerationContentContextItem, blockedWords []string) autoCommentOpportunity {
	text := strings.ToLower(strings.TrimSpace(tweet))
	score := 45
	reasons := []string{}
	matched := []string{}
	referenced := []string{}

	if text == "" {
		return autoCommentOpportunity{Score: 0, Reason: "No target tweet text is available, so the comment opportunity cannot be evaluated."}
	}
	if len([]rune(text)) < 40 {
		score -= 12
		reasons = append(reasons, "Target tweet is short, so there is less context to comment on.")
	}
	if strings.Contains(text, "?") || strings.Contains(text, "how ") || strings.Contains(text, "why ") || strings.Contains(text, "what ") {
		score += 10
		reasons = append(reasons, "Target tweet includes a question or discussion hook.")
	}

	for _, term := range autoCommentOpportunityTerms(bot, contentContext) {
		if autoCommentTextContainsTerm(text, term) {
			matched = appendUniqueLimited(matched, strings.TrimSpace(term), 8)
		}
	}
	if len(matched) > 0 {
		score += minInt(24, len(matched)*6)
		reasons = append(reasons, "Target tweet matches persona, product, or content-library keywords.")
	}

	for _, item := range contentContext {
		title := strings.TrimSpace(item.Title)
		if title == "" {
			continue
		}
		referenced = appendUniqueLimited(referenced, title, 3)
	}
	if len(referenced) > 0 {
		score += 12
		reasons = append(reasons, "Relevant content-library material is available for a more specific comment.")
	}

	for _, term := range blockedWords {
		if autoCommentTextContainsTerm(text, term) {
			score -= 35
			reasons = append(reasons, "Target tweet contains a blocked keyword or topic.")
			matched = appendUniqueLimited(matched, strings.TrimSpace(term), 8)
		}
	}
	if bot != nil {
		for _, term := range append(decodeStringList(bot.ForbiddenTopics), decodeStringList(bot.AvoidClaims)...) {
			if autoCommentTextContainsTerm(text, term) {
				score -= 30
				reasons = append(reasons, "Target tweet overlaps with the Bot safety boundaries.")
				matched = appendUniqueLimited(matched, strings.TrimSpace(term), 8)
			}
		}
	}

	if strings.TrimSpace(targetUsername) != "" {
		reasons = append(reasons, "Comment will be contextualized for @"+strings.TrimPrefix(strings.TrimSpace(targetUsername), "@")+".")
	}
	if len(reasons) == 0 {
		reasons = append(reasons, "General opportunity: the target tweet has enough context for a natural, non-promotional comment.")
	}

	return autoCommentOpportunity{
		Score:             clampInt(score, 0, 100),
		Reason:            truncateRunes(strings.Join(reasons, " "), 1000),
		MatchedKeywords:   matched,
		ReferencedContent: referenced,
	}
}

func autoCommentOpportunityTerms(bot *model.OAFBot, contentContext []GenerationContentContextItem) []string {
	terms := []string{}
	if bot != nil {
		terms = append(terms, decodeStringList(bot.Keywords)...)
		terms = append(terms, decodeStringList(bot.Topics)...)
		terms = append(terms, decodeStringList(bot.ContentPillars)...)
		for _, field := range []string{bot.ProjectOneLiner, bot.TargetAudience, bot.CoreValueProps, bot.ProductFeatures, bot.Differentiators, bot.ContentObjectives} {
			terms = append(terms, contentContextTokens(field)...)
		}
	}
	for _, item := range contentContext {
		terms = append(terms, item.Topics...)
		terms = append(terms, contentContextTokens(item.Title)...)
		terms = append(terms, contentContextTokens(item.GrowthGoal)...)
	}
	out := []string{}
	for _, term := range terms {
		term = strings.TrimSpace(term)
		if len([]rune(term)) < 3 {
			continue
		}
		out = appendUniqueLimited(out, term, 60)
	}
	return out
}

func autoCommentTextContainsTerm(text, term string) bool {
	term = strings.ToLower(strings.TrimSpace(term))
	if term == "" {
		return false
	}
	return strings.Contains(text, term)
}

func appendUniqueLimited(items []string, value string, limit int) []string {
	value = strings.TrimSpace(value)
	if value == "" || (limit > 0 && len(items) >= limit) {
		return items
	}
	lower := strings.ToLower(value)
	for _, item := range items {
		if strings.ToLower(strings.TrimSpace(item)) == lower {
			return items
		}
	}
	return append(items, value)
}

func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func encodeAutoCommentVariants(items []AutoCommentCandidate) string {
	clean := make([]AutoCommentCandidate, 0, len(items))
	for _, item := range items {
		comment := strings.TrimSpace(item.Comment)
		if comment == "" {
			continue
		}
		typ := normalizeAutoCommentCandidateType(item.Type)
		clean = append(clean, AutoCommentCandidate{
			Type:    typ,
			Label:   firstNonEmpty(strings.TrimSpace(item.Label), defaultAutoCommentCandidateLabel(typ)),
			Comment: truncateRunes(comment, autoCommentPreviewRunes),
		})
		if len(clean) >= 3 {
			break
		}
	}
	if len(clean) == 0 {
		return ""
	}
	raw, _ := json.Marshal(clean)
	return string(raw)
}

func decodeAutoCommentVariants(raw string) []dto.AutoCommentVariantItem {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var rows []AutoCommentCandidate
	if err := json.Unmarshal([]byte(raw), &rows); err != nil {
		return nil
	}
	out := make([]dto.AutoCommentVariantItem, 0, len(rows))
	for _, row := range rows {
		comment := strings.TrimSpace(row.Comment)
		if comment == "" {
			continue
		}
		typ := normalizeAutoCommentCandidateType(row.Type)
		out = append(out, dto.AutoCommentVariantItem{
			Type:    typ,
			Label:   firstNonEmpty(strings.TrimSpace(row.Label), defaultAutoCommentCandidateLabel(typ)),
			Comment: truncateRunes(comment, autoCommentPreviewRunes),
		})
	}
	return out
}

func (s *AutoCommentService) autoCommentFeedbackSignals(userID, botID uint) []string {
	return feedbackSignalsFromRows(s.autoCommentFeedbackRows(userID, botID))
}

func (s *AutoCommentService) autoCommentFeedbackRows(userID, botID uint) []model.OAFBotGenerationFeedback {
	if s == nil || s.feedbackRepo == nil || botID == 0 {
		return nil
	}
	rows, err := s.feedbackRepo.ListRecentNegativeByUserBotScene(userID, botID, "auto_comment", 6)
	if err != nil || len(rows) == 0 {
		return nil
	}
	return rows
}

func normalizeAutoCommentFeedbackRating(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "positive", "negative":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func normalizeAutoCommentFeedbackTags(items []string) []string {
	allowed := map[string]bool{
		"too_generic": true,
		"too_salesy":  true,
		"irrelevant":  true,
		"wrong_tone":  true,
		"good":        true,
	}
	out := []string{}
	for _, item := range items {
		v := strings.ToLower(strings.TrimSpace(item))
		if allowed[v] {
			out = appendUniqueLimited(out, v, 8)
		}
	}
	return out
}

func evaluateAutoCommentRisk(content string, bot *model.OAFBot, blockedWords []string) autoCommentRisk {
	text := strings.ToLower(strings.TrimSpace(content))
	if text == "" {
		return autoCommentRisk{Level: "high", Category: "empty_content", Reason: "Generated comment is empty."}
	}
	topics := append([]string{}, blockedWords...)
	if bot != nil {
		topics = append(topics, decodeStringList(bot.ForbiddenTopics)...)
		topics = append(topics, decodeStringList(bot.AvoidClaims)...)
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

func applyAutoCommentOpportunityGate(mode string, opportunity autoCommentOpportunity, status, capability *string, approvalRequired *bool, approvedAt **time.Time) {
	if mode != ExecutionModeAutopilot || opportunity.Score >= autoCommentAutopilotOpportunityScore {
		return
	}
	if status == nil || capability == nil || approvalRequired == nil || approvedAt == nil {
		return
	}
	*status = "pending_review"
	*capability = "opportunity_review_required"
	*approvalRequired = true
	*approvedAt = nil
}

func decideAutoCommentDelivery(tweetText, targetUsername, targetTweetID string, account model.TwitterAccount, generatedComment string) autoCommentDeliveryDecision {
	username := strings.TrimSpace(strings.TrimPrefix(account.Username, "@"))
	manualURL := autoCommentManualActionURL(targetUsername, targetTweetID)
	if username == "" {
		return autoCommentDeliveryDecision{
			Mode:        autoCommentDeliveryManualComment,
			Reason:      "No executor X username is available, so this opportunity is kept as a manual comment suggestion.",
			Eligible:    false,
			BlockReason: "missing_executor_username",
			ManualURL:   manualURL,
		}
	}
	if tweetMentionsHandle(tweetText, username) {
		return autoCommentDeliveryDecision{
			Mode:           autoCommentDeliveryAutoComment,
			Reason:         "The monitored post mentions the executor X account, so it is eligible for API reply publishing.",
			Eligible:       true,
			ManualURL:      manualURL,
			QuoteCandidate: buildAutoCommentQuoteCandidate(generatedComment),
		}
	}
	return autoCommentDeliveryDecision{
		Mode:           autoCommentDeliveryManualComment,
		Reason:         "X API may reject replies to target-author posts unless the executor account is mentioned or otherwise invited into the conversation. This opportunity is kept as a manual comment suggestion.",
		Eligible:       false,
		BlockReason:    "not_mentioned_or_engaged",
		ManualURL:      manualURL,
		QuoteCandidate: buildAutoCommentQuoteCandidate(generatedComment),
	}
}

func tweetMentionsHandle(tweetText, username string) bool {
	username = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(username, "@")))
	if username == "" {
		return false
	}
	re := regexp.MustCompile(`(?i)(^|[^A-Za-z0-9_])@` + regexp.QuoteMeta(username) + `([^A-Za-z0-9_]|$)`)
	return re.MatchString(tweetText)
}

func autoCommentManualActionURL(username, tweetID string) string {
	username = strings.TrimSpace(strings.TrimPrefix(username, "@"))
	tweetID = strings.TrimSpace(tweetID)
	if username != "" && tweetID != "" {
		return fmt.Sprintf("https://x.com/%s/status/%s", username, tweetID)
	}
	if tweetID != "" {
		return fmt.Sprintf("https://x.com/i/web/status/%s", tweetID)
	}
	if username != "" {
		return fmt.Sprintf("https://x.com/%s", username)
	}
	return "https://x.com"
}

func buildAutoCommentQuoteCandidate(comment string) string {
	comment = strings.TrimSpace(comment)
	if comment == "" {
		return ""
	}
	return truncateRunes(comment, autoCommentPreviewRunes)
}

func applyAutoCommentDelivery(task *model.AutoCommentTask, decision autoCommentDeliveryDecision) {
	if task == nil {
		return
	}
	task.DeliveryMode = firstNonEmpty(decision.Mode, autoCommentDeliveryManualComment)
	task.DeliveryReason = truncateRunes(decision.Reason, 1000)
	task.APIReplyEligible = decision.Eligible
	task.APIReplyBlockReason = truncateRunes(decision.BlockReason, 500)
	task.ManualActionURL = truncateRunes(decision.ManualURL, 500)
	task.QuotePostCandidate = truncateRunes(decision.QuoteCandidate, autoCommentPreviewRunes)
	if task.DeliveryMode == autoCommentDeliveryManualComment && task.Status == "ready_to_publish" {
		task.Status = "pending_review"
		task.CapabilityStatus = "manual_comment_suggested"
		task.ApprovalRequired = true
		task.ApprovedAt = nil
	}
}

func convertRestrictedAutoCommentToManualSuggestion(task *model.AutoCommentTask, reason string) {
	if task == nil {
		return
	}
	task.Status = "pending_review"
	task.CapabilityStatus = "manual_comment_suggested"
	task.FailureCategory = "x_reply_restricted"
	task.FailureReason = truncateErrMsg(reason)
	task.Retryable = false
	task.RetryAfterAt = nil
	task.DeliveryMode = autoCommentDeliveryManualComment
	task.DeliveryReason = "X rejected API reply publishing for this conversation. The generated comment is still available as a manual comment suggestion."
	task.APIReplyEligible = false
	task.APIReplyBlockReason = "x_reply_restricted"
	if strings.TrimSpace(task.ManualActionURL) == "" {
		task.ManualActionURL = autoCommentManualActionURL(task.TargetUsername, task.TargetTweetID)
	}
	if strings.TrimSpace(task.QuotePostCandidate) == "" {
		task.QuotePostCandidate = buildAutoCommentQuoteCandidate(task.GeneratedComment)
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
		TargetLanguage: detectTargetTweetLanguage(tweet),
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
		TargetCategory:     firstNonEmpty(row.TargetCategory, "kol"),
		Priority:           normalizeAutoCommentTargetPriority(row.Priority),
		Notes:              row.Notes,
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
		ID:                  row.ID,
		BotID:               row.BotID,
		XAccountID:          row.XAccountID,
		TargetID:            row.TargetID,
		TargetUserID:        row.TargetUserID,
		TargetUsername:      row.TargetUsername,
		TargetTweetID:       row.TargetTweetID,
		TargetTweetText:     row.TargetTweetText,
		TargetTweetAuthor:   row.TargetTweetAuthor,
		GeneratedComment:    row.GeneratedComment,
		OpportunityScore:    row.OpportunityScore,
		GenerationReason:    row.GenerationReason,
		MatchedKeywords:     decodeStringList(row.MatchedKeywords),
		ReferencedContent:   decodeStringList(row.ReferencedContent),
		SourceType:          row.SourceType,
		SourceRef:           row.SourceRef,
		SourceRegion:        row.SourceRegion,
		CommentVariants:     decodeAutoCommentVariants(row.CommentVariants),
		DeliveryMode:        firstNonEmpty(row.DeliveryMode, autoCommentDeliveryManualComment),
		DeliveryReason:      row.DeliveryReason,
		APIReplyEligible:    row.APIReplyEligible,
		APIReplyBlockReason: row.APIReplyBlockReason,
		ManualActionURL:     firstNonEmpty(row.ManualActionURL, autoCommentManualActionURL(row.TargetUsername, row.TargetTweetID)),
		QuotePostCandidate:  row.QuotePostCandidate,
		Status:              row.Status,
		RiskLevel:           row.RiskLevel,
		CapabilityStatus:    row.CapabilityStatus,
		FailureCategory:     row.FailureCategory,
		FailureReason:       row.FailureReason,
		Retryable:           row.Retryable,
		AttemptCount:        row.AttemptCount,
		ApprovalRequired:    row.ApprovalRequired,
		ActivityLogID:       row.ActivityLogID,
		CommentTweetID:      row.CommentTweetID,
		DetectedAt:          row.DetectedAt.UTC().Format(time.RFC3339),
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
