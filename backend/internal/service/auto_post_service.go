package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

var ErrAutoPostMonthlyLimitExceeded = errors.New("monthly auto post quota exceeded")
var ErrAutoPostDuplicateContent = errors.New("auto_post_duplicate_content")

const contentDraftPreviewRunes = 280

type contentDraftPlannerRunOptions struct {
	RespectSchedule bool
}

type AutoPostService struct {
	accountRepo    *repository.TwitterAccountRepository
	automationRepo *repository.AutomationRepository
	planRepo       *repository.ContentDraftPlanRepository
	draftRepo      *repository.ContentDraftRepository
	runRepo        *repository.ContentDraftGenerationRunRepository
	contentRepo    *repository.ContentLibraryRepository
	activityRepo   *repository.ActivityRepository
	userRepo       *repository.UserRepository
	oafBotRepo     *repository.OAFBotRepository
	usageRepo      *repository.AIGenerationUsageRepository
	feedbackRepo   *repository.OAFBotGenerationFeedbackRepository
	verdictRepo    *repository.ReviewQueueFeedbackIssueVerdictRepository
	prefRepo       *repository.OAFBotLearningRulePreferenceRepository
	ai             *AIService
	publishing     *PublishingService
	trends         *TrendService
}

// ContentDraftService is the new runtime name for the former AutoPost service.
// It intentionally aliases AutoPostService while database models and response
// fields remain on their legacy names for compatibility.
type ContentDraftService = AutoPostService

func NewContentDraftService(accountRepo *repository.TwitterAccountRepository, automationRepo *repository.AutomationRepository, planRepo *repository.ContentDraftPlanRepository, draftRepo *repository.ContentDraftRepository, runRepo *repository.ContentDraftGenerationRunRepository, contentRepo *repository.ContentLibraryRepository, activityRepo *repository.ActivityRepository, userRepo *repository.UserRepository, oafBotRepo *repository.OAFBotRepository, usageRepo *repository.AIGenerationUsageRepository, feedbackRepo *repository.OAFBotGenerationFeedbackRepository, verdictRepo *repository.ReviewQueueFeedbackIssueVerdictRepository, prefRepo *repository.OAFBotLearningRulePreferenceRepository, ai *AIService, publishing *PublishingService, trends *TrendService) *ContentDraftService {
	return NewAutoPostService(accountRepo, automationRepo, planRepo, draftRepo, runRepo, contentRepo, activityRepo, userRepo, oafBotRepo, usageRepo, feedbackRepo, verdictRepo, prefRepo, ai, publishing, trends)
}

func NewAutoPostService(accountRepo *repository.TwitterAccountRepository, automationRepo *repository.AutomationRepository, planRepo *repository.AutoPostPlanRepository, draftRepo *repository.AutoPostDraftRepository, runRepo *repository.AutoPostGenerationRunRepository, contentRepo *repository.ContentLibraryRepository, activityRepo *repository.ActivityRepository, userRepo *repository.UserRepository, oafBotRepo *repository.OAFBotRepository, usageRepo *repository.AIGenerationUsageRepository, feedbackRepo *repository.OAFBotGenerationFeedbackRepository, verdictRepo *repository.ReviewQueueFeedbackIssueVerdictRepository, prefRepo *repository.OAFBotLearningRulePreferenceRepository, ai *AIService, publishing *PublishingService, trends *TrendService) *AutoPostService {
	return &AutoPostService{
		accountRepo:    accountRepo,
		automationRepo: automationRepo,
		planRepo:       planRepo,
		draftRepo:      draftRepo,
		runRepo:        runRepo,
		contentRepo:    contentRepo,
		activityRepo:   activityRepo,
		userRepo:       userRepo,
		oafBotRepo:     oafBotRepo,
		usageRepo:      usageRepo,
		feedbackRepo:   feedbackRepo,
		verdictRepo:    verdictRepo,
		prefRepo:       prefRepo,
		ai:             ai,
		publishing:     publishing,
		trends:         trends,
	}
}

func (s *AutoPostService) ListPlans(userID uint) (*dto.AutoPostPlansResponse, error) {
	rows, err := s.planRepo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoPostPlanItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, s.toPlanItem(row))
	}
	return &dto.AutoPostPlansResponse{Items: items}, nil
}

func (s *AutoPostService) GetPlan(userID, id uint) (*dto.AutoPostPlanItem, error) {
	plan, err := s.planRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	item := s.toPlanItem(*plan)
	return &item, nil
}

func (s *AutoPostService) CreatePlan(userID uint, req dto.ContentDraftPlanRequest) (*dto.AutoPostPlanItem, error) {
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	bot, err := s.botForAccount(userID, acc.ID)
	if err != nil {
		return nil, err
	}
	plan, err := s.planRepo.GetByUserAndAccount(userID, acc.ID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if plan == nil || plan.ID == 0 {
		plan = &model.AutoPostPlan{UserID: userID, XAccountID: acc.ID}
		applyContentDraftPlanRequest(plan, req, botIDForUsage(bot), acc.XSubscriptionTier)
		if err := s.planRepo.Create(plan); err != nil {
			return nil, err
		}
		item := s.toPlanItem(*plan)
		return &item, nil
	}
	applyContentDraftPlanRequest(plan, req, botIDForUsage(bot), acc.XSubscriptionTier)
	if err := s.planRepo.Save(plan); err != nil {
		return nil, err
	}
	item := s.toPlanItem(*plan)
	return &item, nil
}

func (s *AutoPostService) UpdatePlan(userID, id uint, req dto.ContentDraftPlanRequest) (*dto.AutoPostPlanItem, error) {
	plan, err := s.planRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	bot, err := s.botForAccount(userID, acc.ID)
	if err != nil {
		return nil, err
	}
	plan.XAccountID = acc.ID
	applyContentDraftPlanRequest(plan, req, botIDForUsage(bot), acc.XSubscriptionTier)
	if err := s.planRepo.Save(plan); err != nil {
		return nil, err
	}
	item := s.toPlanItem(*plan)
	return &item, nil
}

func (s *AutoPostService) ListDrafts(userID uint) (*dto.AutoPostDraftsResponse, error) {
	rows, err := s.draftRepo.ListByUser(userID, 50)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoPostDraftItem, 0, len(rows))
	for _, row := range rows {
		if isDailyXQueueDraft(row) {
			continue
		}
		items = append(items, s.toDraftItem(row))
	}
	return &dto.AutoPostDraftsResponse{Items: items}, nil
}

func (s *AutoPostService) ListRuns(userID uint, query dto.ContentDraftGenerationRunQuery) (*dto.AutoPostGenerationRunsResponse, error) {
	page := query.Page
	if page <= 0 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	if s.runRepo == nil {
		return &dto.AutoPostGenerationRunsResponse{
			Items: []dto.AutoPostGenerationRunItem{},
			Pagination: dto.ActivityPagination{
				Page:     page,
				PageSize: pageSize,
				Total:    0,
			},
		}, nil
	}

	status := normalizeContentDraftRunStatusForQuery(query.Status)
	createdFrom, createdTo := contentDraftRunTimeRange(query)
	rows, total, err := s.runRepo.List(repository.ContentDraftGenerationRunListQuery{
		UserID:      userID,
		Status:      status,
		XAccountID:  query.XAccountID,
		CreatedFrom: createdFrom,
		CreatedTo:   createdTo,
		Page:        page,
		PageSize:    pageSize,
	})
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoPostGenerationRunItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, s.toRunItem(row))
	}
	return &dto.AutoPostGenerationRunsResponse{
		Items: items,
		Pagination: dto.ActivityPagination{
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		},
	}, nil
}

func (s *AutoPostService) RunPlanNow(ctx context.Context, userID, planID uint) (*dto.AutoPostGenerationRunItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypePost, "run auto post planner now"); err != nil {
		return nil, err
	}
	if _, err := s.planRepo.GetByUserAndID(userID, planID); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	claimed, err := s.planRepo.TryClaimManual(userID, planID, now, now.Add(-10*time.Minute))
	if err != nil {
		return nil, err
	}
	if !claimed {
		return nil, fmt.Errorf("auto post planner is already running")
	}
	run, err := s.runPlannerOnce(ctx, planID, contentDraftPlannerRunOptions{RespectSchedule: false})
	if err != nil {
		return nil, err
	}
	item := s.toRunItem(*run)
	return &item, nil
}

func (s *AutoPostService) GenerateDraft(ctx context.Context, userID, planID uint, req dto.ContentDraftGenerateRequest) (*dto.AutoPostDraftItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	plan, err := s.planRepo.GetByUserAndID(userID, planID)
	if err != nil {
		return nil, err
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, plan.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	bot, err := s.botForAccount(userID, acc.ID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	if err := s.assertMonthlyQuota(userID, now); err != nil {
		return nil, err
	}
	recentDrafts, err := s.draftRepo.RecentByAccount(userID, acc.ID, 8)
	if err != nil {
		return nil, err
	}
	recent := make([]string, 0, len(recentDrafts))
	for _, draft := range recentDrafts {
		if strings.TrimSpace(draft.GeneratedContent) != "" {
			recent = append(recent, draft.GeneratedContent)
		}
	}
	var contentItem *model.ContentLibraryItem
	if req.ContentLibraryItemID > 0 {
		if s.contentRepo == nil {
			return nil, fmt.Errorf("content library is not available")
		}
		contentItem, err = s.contentRepo.GetByUserAndID(userID, req.ContentLibraryItemID)
		if err != nil {
			return nil, err
		}
		if !s.contentItemAllowedForPlan(contentItem, acc.ID, botIDForUsage(bot)) {
			return nil, fmt.Errorf("content item is not available for this account")
		}
		if contentItem.Status != "active" {
			return nil, fmt.Errorf("content item is not active")
		}
	}
	input := contentDraftInputFromBot(acc, bot, "")
	input.ContentDirection = strings.TrimSpace(req.ContentDirection)
	input.RecentPosts = recent
	input.ContentLengthMode = normalizeContentDraftLengthMode(plan.ContentLengthMode, acc.XSubscriptionTier)
	input.MaxCharacters = contentDraftMaxFor(acc.XSubscriptionTier, input.ContentLengthMode)
	input.FeedbackSignals = s.generationFeedbackSignals(userID, botIDForUsage(bot), "tweet")
	input.FeedbackSignals = appendFeedbackLearningSignals(input.FeedbackSignals, s.verdictRepo, s.prefRepo, userID, botIDForUsage(bot), "tweet")
	selectedTrends := s.selectTrendsForContentDraft(userID, plan.ID, botIDForUsage(bot), req.ExcludedTrendNames, now)
	input.SelectedTrends = trendPromptItems(selectedTrends)
	input.TrendFeedbackSignals = s.trendFeedbackSignals(userID, botIDForUsage(bot))
	if contentItem != nil {
		input.ContentItemTitle = contentItem.Title
		input.ContentItemType = contentItem.ItemType
		input.ContentItemBody = contentItem.Body
		input.ContentItemURL = contentItem.SourceURL
		input.ContentItemTopics = decodeStringList(contentItem.Topics)
		input.ContentItemGoal = contentItem.GrowthGoal
		input.ContentItemCTA = contentItem.CTAPreference
	}
	contentDirection := strings.TrimSpace(req.ContentDirection)
	if contentDirection == "" && contentItem != nil {
		contentDirection = contentItem.Title
	}
	content, contentHash, generated, err := s.generateUniqueContentDraft(ctx, userID, acc.ID, input)
	if err != nil {
		return nil, err
	}
	risk := evaluateAutoCommentRisk(content, bot, nil)
	mode := effectiveExecutionMode(plan.ExecutionMode)
	status, capability, approvalRequired, approvedAt := autoCommentInitialState(mode, risk, now)
	draft := &model.AutoPostDraft{
		UserID:           userID,
		PlanID:           plan.ID,
		BotID:            botIDForUsage(bot),
		XAccountID:       acc.ID,
		ContentLibraryID: req.ContentLibraryItemID,
		ContentDirection: truncateRunes(contentDirection, 512),
		ContentHash:      contentHash,
		SelectedTrends:   encodeTrendTopicItems(selectedTrends),
		GeneratedContent: fitXPostForContentDraft(content, acc.XSubscriptionTier, input.ContentLengthMode),
		Status:           status,
		RiskLevel:        risk.Level,
		CapabilityStatus: capability,
		FailureCategory:  risk.Category,
		FailureReason:    risk.Reason,
		ApprovalRequired: approvalRequired,
		GeneratedAt:      &now,
		ApprovedAt:       approvedAt,
	}
	if err := s.draftRepo.Create(draft); err != nil {
		return nil, err
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, draft.BotID, repository.AIGenerationSceneAutoPost, now, generated.Usage); err != nil {
		return nil, err
	}
	if contentItem != nil {
		if err := s.contentRepo.MarkUsed(contentItem, now); err != nil {
			return nil, err
		}
	}
	plan.BotID = draft.BotID
	_ = s.planRepo.TouchRun(plan, now)
	if err := s.createGeneratedActivity(draft, acc.Username, now); err != nil {
		return nil, err
	}
	if draft.Status == "ready_to_publish" && s.publishing != nil {
		if _, _, err := s.publishing.EnsurePostJob(draft, now); err != nil {
			return nil, err
		}
	}
	item := s.toDraftItem(*draft)
	item.FeedbackSignalCount = len(input.FeedbackSignals)
	return &item, nil
}

func (s *AutoPostService) RunTick(ctx context.Context) {
	if s == nil || s.planRepo == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	now := time.Now().UTC()
	plans, err := s.planRepo.ListDueEnabled(20, now)
	if err != nil {
		zap.L().Warn("auto post scheduler: list due plans failed", zap.Error(err))
		return
	}
	staleBefore := now.Add(-10 * time.Minute)
	for _, plan := range plans {
		claimed, err := s.planRepo.TryClaimDue(plan.ID, now, staleBefore)
		if err != nil {
			zap.L().Warn("auto post scheduler: claim failed", zap.Uint("plan_id", plan.ID), zap.Error(err))
			continue
		}
		if !claimed {
			continue
		}
		if err := s.runSchedulerPlan(ctx, plan.ID); err != nil {
			zap.L().Warn("auto post scheduler: plan tick failed", zap.Uint("plan_id", plan.ID), zap.Error(err))
		}
	}
}

func (s *AutoPostService) runSchedulerPlan(ctx context.Context, planID uint) error {
	_, err := s.runPlannerOnce(ctx, planID, contentDraftPlannerRunOptions{RespectSchedule: true})
	return err
}

func (s *AutoPostService) runPlannerOnce(ctx context.Context, planID uint, options contentDraftPlannerRunOptions) (*model.AutoPostGenerationRun, error) {
	now := time.Now().UTC()
	plan, err := s.planRepo.GetByID(planID)
	if err != nil {
		return nil, err
	}
	next := s.nextContentDraftRun(*plan, now)
	finish := func(lastRun *time.Time) error {
		return s.planRepo.FinishScheduler(plan.ID, lastRun, next)
	}
	recordSkip := func(reason string) (*model.AutoPostGenerationRun, error) {
		run := s.newContentDraftRun(*plan, "skipped", reason, 0, 0, "")
		_ = s.createSchedulerActivity(*plan, "failed", "activity.preview.autoPostSchedulerSkipped", reason)
		if s.runRepo != nil {
			if err := s.runRepo.Create(run); err != nil {
				_ = finish(nil)
				return nil, err
			}
		}
		return run, finish(nil)
	}
	recordFailure := func(reason string, err error) (*model.AutoPostGenerationRun, error) {
		msg := reason
		if err != nil {
			msg = err.Error()
		}
		run := s.newContentDraftRun(*plan, "failed", reason, 0, 0, msg)
		_ = s.createSchedulerActivity(*plan, "failed", "activity.preview.autoPostSchedulerFailed", msg)
		if s.runRepo != nil {
			if createErr := s.runRepo.Create(run); createErr != nil {
				_ = finish(nil)
				return nil, createErr
			}
		}
		return run, finish(nil)
	}

	if !plan.Enabled {
		next = time.Time{}
		return recordSkip("planner_disabled")
	}
	if options.RespectSchedule && !s.isWithinContentDraftWindow(*plan, now) {
		next = s.nextContentDraftRun(*plan, now)
		return recordSkip("outside_posting_window")
	}
	if options.RespectSchedule && plan.LastRunAt != nil && plan.MinIntervalMinutes > 0 && now.Sub(*plan.LastRunAt) < time.Duration(plan.MinIntervalMinutes)*time.Minute {
		next = s.nextContentDraftRun(*plan, *plan.LastRunAt)
		return recordSkip("min_interval_active")
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(plan.UserID, plan.XAccountID)
	if err != nil {
		return recordSkip("account_not_connected")
	}
	user, err := s.userRepo.GetByID(plan.UserID)
	if err != nil {
		return recordFailure("user_load_failed", err)
	}
	if err := subscription.AssertUserMayProduceContent(user, now); err != nil {
		return recordSkip("subscription_inactive")
	}
	bot, err := s.botForAccount(plan.UserID, plan.XAccountID)
	if err != nil {
		return recordFailure("bot_load_failed", err)
	}
	botID := botIDForUsage(bot)
	contentItem, err := s.contentRepo.PickActiveForContentDraft(plan.UserID, plan.XAccountID, botID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return recordSkip("no_active_content_source")
		}
		return recordFailure("content_source_load_failed", err)
	}
	draft, err := s.GenerateDraft(ctx, plan.UserID, plan.ID, dto.ContentDraftGenerateRequest{ContentLibraryItemID: contentItem.ID})
	if err != nil {
		switch {
		case errors.Is(err, ErrAIGenerationQuotaExceeded):
			return recordSkip("ai_generation_quota_exceeded")
		case errors.Is(err, ErrAutoPostMonthlyLimitExceeded):
			return recordSkip("monthly_auto_post_limit_exceeded")
		case errors.Is(err, ErrAutoPostDuplicateContent):
			return recordSkip("duplicate_content")
		default:
			return recordFailure("generation_failed", err)
		}
	}
	run := s.newContentDraftRun(*plan, "completed", "", contentItem.ID, draft.ID, "")
	run.BotID = draft.BotID
	run.SelectedTrends = encodeTrendTopicItems(draft.SelectedTrends)
	if s.runRepo != nil {
		if err := s.runRepo.Create(run); err != nil {
			_ = finish(&now)
			return nil, err
		}
	}
	zap.L().Info("auto post scheduler: draft generated",
		zap.Uint("user_id", plan.UserID),
		zap.Uint("plan_id", plan.ID),
		zap.Uint("x_account_id", acc.ID),
		zap.Uint("draft_id", draft.ID),
		zap.Uint("content_library_item_id", contentItem.ID))
	last := now
	return run, finish(&last)
}

func (s *AutoPostService) UpdateDraft(userID, id uint, content string) (*dto.AutoPostDraftItem, error) {
	draft, err := s.draftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if isDailyXQueueDraft(*draft) {
		return nil, fmt.Errorf("daily x queue drafts must be edited from Daily X Queue")
	}
	if draft.Status != "review" && draft.Status != "pending_review" && draft.Status != "draft" && draft.Status != "approved" {
		return nil, fmt.Errorf("draft cannot be edited from status %s", draft.Status)
	}
	plan, _ := s.planRepo.GetByUserAndID(userID, draft.PlanID)
	accountTier := xSubscriptionTierUnknown
	mode := contentDraftLengthModeStandard
	if acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, draft.XAccountID); err == nil {
		accountTier = acc.XSubscriptionTier
	}
	if plan != nil {
		mode = plan.ContentLengthMode
	}
	draft.GeneratedContent = fitXPostForContentDraft(content, accountTier, mode)
	if draft.Status == "approved" {
		draft.Status = "pending_review"
		draft.ApprovedAt = nil
	}
	if err := s.draftRepo.Save(draft); err != nil {
		return nil, err
	}
	item := s.toDraftItem(*draft)
	return &item, nil
}

func (s *AutoPostService) RewriteDraft(ctx context.Context, userID, id uint, req dto.ContentDraftRewriteRequest) (*dto.AutoPostDraftItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	draft, err := s.draftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if isDailyXQueueDraft(*draft) {
		return nil, fmt.Errorf("daily x queue drafts must be rewritten from Daily X Queue")
	}
	if draft.Status != "review" && draft.Status != "pending_review" && draft.Status != "draft" && draft.Status != "approved" {
		return nil, fmt.Errorf("draft cannot be rewritten from status %s", draft.Status)
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, draft.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	bot, err := s.botForAccount(userID, acc.ID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	recentDrafts, err := s.draftRepo.RecentByAccount(userID, acc.ID, 8)
	if err != nil {
		return nil, err
	}
	recent := make([]string, 0, len(recentDrafts))
	for _, row := range recentDrafts {
		if row.ID == draft.ID || strings.TrimSpace(row.GeneratedContent) == "" {
			continue
		}
		recent = append(recent, row.GeneratedContent)
	}
	var contentItem *model.ContentLibraryItem
	if draft.ContentLibraryID > 0 && s.contentRepo != nil {
		if item, err := s.contentRepo.GetByUserAndID(userID, draft.ContentLibraryID); err == nil {
			contentItem = item
		}
	}
	plan, _ := s.planRepo.GetByUserAndID(userID, draft.PlanID)
	botID := draft.BotID
	if botID == 0 {
		botID = botIDForUsage(bot)
	}
	feedbackRows := s.generationFeedbackRows(userID, botID, "tweet")
	input := contentDraftInputFromBot(acc, bot, "")
	input.ContentDirection = strings.TrimSpace(draft.ContentDirection)
	input.RecentPosts = recent
	input.FeedbackSignals = feedbackSignalsFromRows(feedbackRows)
	var learningRules []dto.OAFBotAppliedLearningRule
	input.FeedbackSignals, learningRules = appendFeedbackLearningSignalsWithRules(input.FeedbackSignals, s.verdictRepo, s.prefRepo, userID, botID, "tweet", req.DisabledLearningIssues)
	if plan != nil {
		input.ContentLengthMode = normalizeContentDraftLengthMode(plan.ContentLengthMode, acc.XSubscriptionTier)
	} else {
		input.ContentLengthMode = contentDraftLengthModeStandard
	}
	input.MaxCharacters = contentDraftMaxFor(acc.XSubscriptionTier, input.ContentLengthMode)
	if contentItem != nil {
		input.ContentItemTitle = contentItem.Title
		input.ContentItemType = contentItem.ItemType
		input.ContentItemBody = contentItem.Body
		input.ContentItemURL = contentItem.SourceURL
		input.ContentItemTopics = decodeStringList(contentItem.Topics)
		input.ContentItemGoal = contentItem.GrowthGoal
		input.ContentItemCTA = contentItem.CTAPreference
	}
	generated, err := s.ai.RewriteContentDraft(ctx, input, draft.GeneratedContent, req.RewriteMode, req.Feedback)
	if err != nil {
		return nil, err
	}
	content := fitXPostForContentDraft(generated.Text, acc.XSubscriptionTier, input.ContentLengthMode)
	risk := evaluateAutoCommentRisk(content, bot, nil)
	draft.GeneratedContent = content
	draft.ContentHash = contentDraftContentHash(content)
	draft.RiskLevel = risk.Level
	draft.FailureCategory = risk.Category
	draft.FailureReason = risk.Reason
	draft.GeneratedAt = &now
	if draft.Status == "approved" {
		draft.Status = "pending_review"
		draft.ApprovedAt = nil
		draft.ApprovalRequired = true
	}
	if err := s.draftRepo.Save(draft); err != nil {
		return nil, err
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, draft.BotID, repository.AIGenerationSceneAutoPost, now, generated.Usage); err != nil {
		return nil, err
	}
	item := s.toDraftItem(*draft)
	item.FeedbackSignalCount = len(input.FeedbackSignals)
	item.FeedbackSignalSummary = feedbackSignalSummaryFromRowsAndRules(feedbackRows, learningRules)
	return &item, nil
}

func (s *AutoPostService) generationFeedbackSignals(userID, botID uint, scene string) []string {
	return feedbackSignalsFromRows(s.generationFeedbackRows(userID, botID, scene))
}

func (s *AutoPostService) generationFeedbackRows(userID, botID uint, scene string) []model.OAFBotGenerationFeedback {
	if s.feedbackRepo == nil || botID == 0 {
		return nil
	}
	rows, err := s.feedbackRepo.ListRecentNegativeByUserBotScene(userID, botID, scene, 6)
	if err != nil {
		zap.L().Warn("load auto post rewrite feedback signals failed", zap.Uint("user_id", userID), zap.Uint("bot_id", botID), zap.String("scene", scene), zap.Error(err))
		return nil
	}
	return rows
}

func (s *AutoPostService) ApproveDraft(userID, id uint) (*dto.AutoPostDraftItem, error) {
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypePost, "approve auto post draft"); err != nil {
		return nil, err
	}
	draft, err := s.draftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if isDailyXQueueDraft(*draft) {
		return nil, fmt.Errorf("daily x queue drafts cannot be approved from Content Drafts")
	}
	if draft.Status != "review" && draft.Status != "pending_review" && draft.Status != "draft" && draft.Status != "approved" {
		return nil, fmt.Errorf("draft cannot be approved from status %s", draft.Status)
	}
	now := time.Now().UTC()
	draft.Status = "approved"
	draft.ApprovedAt = &now
	draft.ApprovalRequired = false
	if err := s.draftRepo.Save(draft); err != nil {
		return nil, err
	}
	if s.publishing != nil {
		if _, _, err := s.publishing.EnsurePostJob(draft, now); err != nil {
			return nil, err
		}
	}
	item := s.toDraftItem(*draft)
	return &item, nil
}

func (s *AutoPostService) PreparePublish(userID, id uint) (*dto.AutoPostDraftItem, error) {
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypePost, "prepare auto post publish job"); err != nil {
		return nil, err
	}
	draft, err := s.draftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if isDailyXQueueDraft(*draft) {
		return nil, fmt.Errorf("daily x queue drafts cannot be prepared for publishing")
	}
	if draft.Status != "ready_to_publish" && draft.Status != "approved" {
		return nil, fmt.Errorf("draft cannot prepare publish from status %s", draft.Status)
	}
	if s.publishing == nil {
		return nil, fmt.Errorf("publishing pipeline is not available")
	}
	if _, _, err := s.publishing.EnsurePostJob(draft, time.Now().UTC()); err != nil {
		return nil, err
	}
	item := s.toDraftItem(*draft)
	return &item, nil
}

func (s *AutoPostService) RejectDraft(userID, id uint, reason string) (*dto.AutoPostDraftItem, error) {
	draft, err := s.draftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if isDailyXQueueDraft(*draft) {
		return nil, fmt.Errorf("daily x queue drafts must be rejected from Daily X Queue")
	}
	now := time.Now().UTC()
	draft.Status = "rejected"
	draft.RejectedAt = &now
	draft.FailureReason = truncateErrMsg(strings.TrimSpace(reason))
	if draft.FailureReason == "" {
		draft.FailureReason = "Rejected by user."
	}
	if err := s.draftRepo.Save(draft); err != nil {
		return nil, err
	}
	item := s.toDraftItem(*draft)
	return &item, nil
}

func isDailyXQueueDraft(draft model.AutoPostDraft) bool {
	return draft.PlanID == 0 || draft.XAccountID == 0 || draft.CapabilityStatus == "daily_x_queue_review"
}

func (s *AutoPostService) assertMonthlyQuota(userID uint, now time.Time) error {
	limit := int64(0)
	if s.userRepo != nil {
		if u, err := s.userRepo.GetByID(userID); err == nil {
			limit = subscription.LimitsForUser(u).MonthlyAutoPosts
		}
	}
	if limit <= 0 {
		return ErrAutoPostMonthlyLimitExceeded
	}
	monthStart := startOfUTCMonth(now)
	used, err := s.draftRepo.CountCreatedBetween(userID, monthStart, now)
	if err != nil {
		return err
	}
	if used >= limit {
		return ErrAutoPostMonthlyLimitExceeded
	}
	return nil
}

func (s *AutoPostService) generateUniqueContentDraft(ctx context.Context, userID, xAccountID uint, input GenerateContentDraftInput) (string, string, AIGeneratedText, error) {
	since := time.Now().UTC().AddDate(0, 0, -30)
	var lastContent string
	var lastHash string
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			input.RecentPosts = append(input.RecentPosts, lastContent)
			if strings.TrimSpace(input.ContentDirection) == "" {
				input.ContentDirection = "Generate a different angle from the same content source."
			} else {
				input.ContentDirection += "\nGenerate a different angle from the same content source."
			}
		}
		generated, err := s.ai.GenerateContentDraft(ctx, input)
		if err != nil {
			return "", "", AIGeneratedText{}, err
		}
		content := generated.Text
		hash := contentDraftContentHash(content)
		exists, err := s.draftRepo.ExistsContentHashForAccountSince(userID, xAccountID, hash, since)
		if err != nil {
			return "", "", AIGeneratedText{}, err
		}
		lastContent = content
		lastHash = hash
		if !exists {
			return content, hash, generated, nil
		}
	}
	return "", lastHash, AIGeneratedText{}, ErrAutoPostDuplicateContent
}

func (s *AutoPostService) selectTrendsForContentDraft(userID, planID, botID uint, excluded []string, now time.Time) []dto.TrendTopicItem {
	if s == nil || s.trends == nil {
		return nil
	}
	data, err := s.trends.SelectForBot(userID, dto.TrendSelectionQuery{PlanID: planID, BotID: botID, Limit: 3, ExcludedTrendNames: excluded}, now)
	if err != nil || data == nil {
		if err != nil {
			zap.L().Warn("auto post trend selection failed", zap.Uint("user_id", userID), zap.Uint("plan_id", planID), zap.Error(err))
		}
		return nil
	}
	return data.Items
}

func (s *AutoPostService) trendFeedbackSignals(userID, botID uint) []string {
	if s == nil || s.trends == nil {
		return nil
	}
	return s.trends.FeedbackPromptSignals(userID, botID)
}

func trendPromptItems(items []dto.TrendTopicItem) []TrendPromptItem {
	if len(items) == 0 {
		return nil
	}
	out := make([]TrendPromptItem, 0, len(items))
	for _, item := range items {
		name := strings.TrimSpace(item.TrendName)
		if name == "" {
			continue
		}
		out = append(out, TrendPromptItem{
			Name:         name,
			RegionName:   item.RegionName,
			Category:     item.Category,
			RiskLevel:    item.RiskLevel,
			TweetCount:   item.TweetCount,
			LanguageHint: item.LanguageHint,
			Reason:       item.RelevanceReason,
		})
		if len(out) >= 3 {
			break
		}
	}
	return out
}

func encodeTrendTopicItems(items []dto.TrendTopicItem) string {
	if len(items) == 0 {
		return ""
	}
	if len(items) > 3 {
		items = items[:3]
	}
	raw, err := json.Marshal(items)
	if err != nil {
		return ""
	}
	return string(raw)
}

func decodeTrendTopicItems(raw string) []dto.TrendTopicItem {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var items []dto.TrendTopicItem
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil
	}
	if len(items) > 3 {
		items = items[:3]
	}
	return items
}

func contentDraftContentHash(content string) string {
	normalized := strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(content)), " "))
	sum := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(sum[:])
}

func (s *AutoPostService) contentItemAllowedForPlan(item *model.ContentLibraryItem, xAccountID, botID uint) bool {
	if item == nil {
		return false
	}
	if item.TwitterAccountID != nil && *item.TwitterAccountID != xAccountID {
		return false
	}
	if item.BotID != nil && botID > 0 && *item.BotID != botID {
		return false
	}
	if item.BotID != nil && botID == 0 {
		return false
	}
	return true
}

func (s *AutoPostService) botForAccount(userID, xAccountID uint) (*model.OAFBot, error) {
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

func (s *AutoPostService) createGeneratedActivity(draft *model.AutoPostDraft, accountUsername string, now time.Time) error {
	if s.activityRepo == nil || draft == nil {
		return nil
	}
	key := "activity.preview.autoPostDraftGenerated"
	status := "review"
	if draft.Status == "ready_to_publish" {
		key = "activity.preview.autoPostAutopilotPrepared"
	} else if draft.RiskLevel == "high" {
		key = "activity.preview.autoPostRiskReview"
	}
	log := &model.ActivityLog{
		UserID:             draft.UserID,
		XAccountID:         draft.XAccountID,
		Type:               "post",
		Status:             status,
		PreviewKey:         key,
		AccountHandle:      formatXAccountHandle(accountUsername),
		ExecutedAt:         now,
		ReplyTextPreview:   truncateReplyPreview(draft.GeneratedContent, contentDraftPreviewRunes),
		ReplyToTextPreview: truncateReplyPreview(draft.ContentDirection, autoReplyPreviewRunes),
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		return err
	}
	draft.ActivityLogID = log.ID
	return s.draftRepo.Save(draft)
}

func (s *AutoPostService) createSchedulerActivity(plan model.AutoPostPlan, status string, previewKey string, errMsg string) error {
	if s.activityRepo == nil {
		return nil
	}
	handle := ""
	if s.accountRepo != nil && plan.XAccountID != 0 {
		if acc, err := s.accountRepo.GetConnectedByUserAndAccountID(plan.UserID, plan.XAccountID); err == nil {
			handle = formatXAccountHandle(acc.Username)
		}
	}
	log := &model.ActivityLog{
		UserID:        plan.UserID,
		XAccountID:    plan.XAccountID,
		Type:          "post",
		Status:        status,
		PreviewKey:    previewKey,
		AccountHandle: handle,
		ExecutedAt:    time.Now().UTC(),
		ErrorMessage:  truncateErrMsg(errMsg),
	}
	return s.activityRepo.DB.Create(log).Error
}

func (s *AutoPostService) newContentDraftRun(plan model.AutoPostPlan, status string, skipReason string, contentID uint, draftID uint, errMsg string) *model.AutoPostGenerationRun {
	return &model.AutoPostGenerationRun{
		UserID:           plan.UserID,
		PlanID:           plan.ID,
		XAccountID:       plan.XAccountID,
		BotID:            plan.BotID,
		ContentLibraryID: contentID,
		Status:           status,
		SkipReason:       truncateRunes(skipReason, 128),
		GeneratedDraftID: draftID,
		ErrorMessage:     truncateErrMsg(errMsg),
	}
}

func (s *AutoPostService) toRunItem(row model.AutoPostGenerationRun) dto.AutoPostGenerationRunItem {
	accountHandle := ""
	if s.accountRepo != nil && row.XAccountID != 0 {
		if acc, err := s.accountRepo.GetConnectedByUserAndAccountID(row.UserID, row.XAccountID); err == nil {
			accountHandle = formatXAccountHandle(acc.Username)
		}
	}
	botName := ""
	if s.oafBotRepo != nil && row.BotID != 0 {
		if bot, err := s.oafBotRepo.GetByUserAndID(row.UserID, row.BotID); err == nil {
			botName = bot.Name
		}
	}
	contentTitle := s.contentTitle(row.UserID, row.ContentLibraryID)
	selectedTrends := decodeTrendTopicItems(row.SelectedTrends)
	if len(selectedTrends) == 0 && row.GeneratedDraftID > 0 && s.draftRepo != nil {
		if draft, err := s.draftRepo.GetByUserAndID(row.UserID, row.GeneratedDraftID); err == nil {
			selectedTrends = decodeTrendTopicItems(draft.SelectedTrends)
		}
	}
	return dto.AutoPostGenerationRunItem{
		ID:               row.ID,
		UserID:           row.UserID,
		PlanID:           row.PlanID,
		XAccountID:       row.XAccountID,
		AccountHandle:    accountHandle,
		BotID:            row.BotID,
		BotName:          botName,
		ContentLibraryID: row.ContentLibraryID,
		ContentTitle:     contentTitle,
		ContentItemTitle: contentTitle,
		Status:           row.Status,
		SkipReason:       row.SkipReason,
		GeneratedDraftID: row.GeneratedDraftID,
		SelectedTrends:   selectedTrends,
		ErrorMessage:     row.ErrorMessage,
		CreatedAt:        row.CreatedAt.UTC().Format(timeRFC3339),
	}
}

func (s *AutoPostService) toPlanItem(row model.AutoPostPlan) dto.AutoPostPlanItem {
	accountHandle := ""
	accountTier := xSubscriptionTierUnknown
	if s.accountRepo != nil && row.XAccountID != 0 {
		if acc, err := s.accountRepo.GetConnectedByUserAndAccountID(row.UserID, row.XAccountID); err == nil {
			accountHandle = formatXAccountHandle(acc.Username)
			accountTier = acc.XSubscriptionTier
		}
	}
	botName := ""
	if s.oafBotRepo != nil && row.BotID != 0 {
		if bot, err := s.oafBotRepo.GetByUserAndID(row.UserID, row.BotID); err == nil {
			botName = bot.Name
		}
	}
	return dto.AutoPostPlanItem{
		ID:                   row.ID,
		UserID:               row.UserID,
		XAccountID:           row.XAccountID,
		BotID:                row.BotID,
		AccountHandle:        accountHandle,
		BotName:              botName,
		Enabled:              row.Enabled,
		ExecutionMode:        effectiveExecutionMode(row.ExecutionMode),
		DailyLimit:           0,
		MinIntervalMinutes:   row.MinIntervalMinutes,
		PostingWindows:       row.PostingWindows,
		Timezone:             row.Timezone,
		ContentLengthMode:    normalizeContentDraftLengthMode(row.ContentLengthMode, accountTier),
		TrendRegions:         normalizeTrendRegions(decodeStringList(row.TrendRegions)),
		TrendCategories:      normalizeTrendCategories(decodeStringList(row.TrendCategories)),
		ExcludedTrendNames:   normalizeTrendExcludeNames(decodeStringList(row.ExcludedTrendNames)),
		AllowGeneralTrends:   row.AllowGeneralTrends,
		SensitiveTrendPolicy: normalizeSensitiveTrendPolicy(row.SensitiveTrendPolicy),
		LastRunAt:            formatOptionalTime(row.LastRunAt),
		NextRunAt:            formatOptionalTime(row.NextRunAt),
		ProcessingAt:         formatOptionalTime(row.ProcessingAt),
		CreatedAt:            row.CreatedAt.UTC().Format(timeRFC3339),
		UpdatedAt:            row.UpdatedAt.UTC().Format(timeRFC3339),
	}
}

func (s *AutoPostService) toDraftItem(row model.AutoPostDraft) dto.AutoPostDraftItem {
	accountHandle := ""
	if s.accountRepo != nil && row.XAccountID != 0 {
		if acc, err := s.accountRepo.GetConnectedByUserAndAccountID(row.UserID, row.XAccountID); err == nil {
			accountHandle = formatXAccountHandle(acc.Username)
		}
	}
	botName := ""
	if s.oafBotRepo != nil && row.BotID != 0 {
		if bot, err := s.oafBotRepo.GetByUserAndID(row.UserID, row.BotID); err == nil {
			botName = bot.Name
		}
	}
	contentTitle := ""
	var exposureTrace *dto.ExposureSourceTrace
	if contentItem := s.contentItem(row.UserID, row.ContentLibraryID); contentItem != nil {
		contentTitle = contentItem.Title
		exposureTrace = exposureSourceTraceFromContentItem(contentItem)
	}
	return dto.AutoPostDraftItem{
		ID:                  row.ID,
		UserID:              row.UserID,
		PlanID:              row.PlanID,
		BotID:               row.BotID,
		XAccountID:          row.XAccountID,
		ActivityLogID:       row.ActivityLogID,
		BotName:             botName,
		AccountHandle:       accountHandle,
		ContentLibraryID:    row.ContentLibraryID,
		ContentTitle:        contentTitle,
		ExposureSourceTrace: exposureTrace,
		ContentDirection:    row.ContentDirection,
		ContentHash:         row.ContentHash,
		SelectedTrends:      decodeTrendTopicItems(row.SelectedTrends),
		GeneratedContent:    row.GeneratedContent,
		Status:              row.Status,
		RiskLevel:           row.RiskLevel,
		CapabilityStatus:    row.CapabilityStatus,
		FailureCategory:     row.FailureCategory,
		FailureReason:       row.FailureReason,
		ApprovalRequired:    row.ApprovalRequired,
		CreatedAt:           row.CreatedAt.UTC().Format(timeRFC3339),
		GeneratedAt:         formatOptionalTime(row.GeneratedAt),
		ApprovedAt:          formatOptionalTime(row.ApprovedAt),
		RejectedAt:          formatOptionalTime(row.RejectedAt),
		PublishedAt:         formatOptionalTime(row.PublishedAt),
	}
}

func (s *AutoPostService) contentTitle(userID, contentID uint) string {
	if item := s.contentItem(userID, contentID); item != nil {
		return item.Title
	}
	return ""
}

func (s *AutoPostService) contentItem(userID, contentID uint) *model.ContentLibraryItem {
	if s.contentRepo == nil || contentID == 0 {
		return nil
	}
	item, err := s.contentRepo.GetByUserAndID(userID, contentID)
	if err != nil {
		return nil
	}
	return item
}

func applyContentDraftPlanRequest(plan *model.AutoPostPlan, req dto.ContentDraftPlanRequest, botID uint, accountTier string) {
	plan.BotID = botID
	plan.Enabled = req.Enabled
	plan.ExecutionMode = effectiveExecutionMode(req.ExecutionMode)
	if plan.ExecutionMode == "" {
		plan.ExecutionMode = ExecutionModeReview
	}
	plan.DailyLimit = 0
	plan.MinIntervalMinutes = req.MinIntervalMinutes
	if plan.MinIntervalMinutes <= 0 {
		plan.MinIntervalMinutes = 120
	}
	plan.PostingWindows = truncateRunes(req.PostingWindows, 512)
	plan.Timezone = strings.TrimSpace(req.Timezone)
	if plan.Timezone == "" {
		plan.Timezone = "UTC"
	}
	plan.ContentLengthMode = normalizeContentDraftLengthMode(req.ContentLengthMode, accountTier)
	plan.ExcludedTrendNames = encodeStringList(normalizeTrendExcludeNames(req.ExcludedTrendNames))
	if plan.Enabled && plan.NextRunAt == nil {
		now := time.Now().UTC()
		next := computeContentDraftNextRun(plan.MinIntervalMinutes, plan.PostingWindows, plan.Timezone, now)
		plan.NextRunAt = &next
	}
	if !plan.Enabled {
		plan.NextRunAt = nil
		plan.ProcessingAt = nil
	}
}

func formatOptionalTime(t *time.Time) string {
	if t == nil || t.IsZero() {
		return ""
	}
	return t.UTC().Format(timeRFC3339)
}

type contentDraftTimeWindow struct {
	start int
	end   int
}

func (s *AutoPostService) isWithinContentDraftWindow(plan model.AutoPostPlan, now time.Time) bool {
	windows := parseContentDraftWindows(plan.PostingWindows)
	if len(windows) == 0 {
		return true
	}
	loc := contentDraftLocation(plan.Timezone)
	local := now.In(loc)
	minute := local.Hour()*60 + local.Minute()
	for _, window := range windows {
		if window.start <= window.end {
			if minute >= window.start && minute <= window.end {
				return true
			}
			continue
		}
		if minute >= window.start || minute <= window.end {
			return true
		}
	}
	return false
}

func (s *AutoPostService) nextContentDraftRun(plan model.AutoPostPlan, now time.Time) time.Time {
	return computeContentDraftNextRun(plan.MinIntervalMinutes, plan.PostingWindows, plan.Timezone, now)
}

func computeContentDraftNextRun(minInterval int, postingWindows string, timezone string, from time.Time) time.Time {
	if minInterval <= 0 {
		minInterval = 120
	}
	candidate := from.UTC().Add(time.Duration(minInterval) * time.Minute)
	windows := parseContentDraftWindows(postingWindows)
	if len(windows) == 0 {
		return candidate
	}
	loc := contentDraftLocation(timezone)
	local := candidate.In(loc)
	localMinute := local.Hour()*60 + local.Minute()
	for _, window := range windows {
		if windowContainsMinute(window, localMinute) {
			return candidate
		}
	}
	for day := 0; day <= 7; day++ {
		base := time.Date(local.Year(), local.Month(), local.Day()+day, 0, 0, 0, 0, loc)
		for _, window := range windows {
			nextLocal := base.Add(time.Duration(window.start) * time.Minute)
			if nextLocal.After(local) || nextLocal.Equal(local) {
				return nextLocal.UTC()
			}
		}
	}
	return candidate
}

func parseContentDraftWindows(value string) []contentDraftTimeWindow {
	value = strings.ReplaceAll(value, "，", ",")
	value = strings.ReplaceAll(value, ";", ",")
	parts := strings.Split(value, ",")
	windows := make([]contentDraftTimeWindow, 0, len(parts))
	for _, raw := range parts {
		part := strings.TrimSpace(raw)
		if part == "" {
			continue
		}
		bounds := strings.Split(part, "-")
		if len(bounds) != 2 {
			continue
		}
		start, okStart := parseContentDraftClock(bounds[0])
		end, okEnd := parseContentDraftClock(bounds[1])
		if !okStart || !okEnd {
			continue
		}
		windows = append(windows, contentDraftTimeWindow{start: start, end: end})
	}
	return windows
}

func parseContentDraftClock(value string) (int, bool) {
	parts := strings.Split(strings.TrimSpace(value), ":")
	if len(parts) != 2 {
		return 0, false
	}
	hour, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || hour < 0 || hour > 23 {
		return 0, false
	}
	minute, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil || minute < 0 || minute > 59 {
		return 0, false
	}
	return hour*60 + minute, true
}

func normalizeContentDraftRunStatusForQuery(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "completed", "skipped", "failed":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func contentDraftRunTimeRange(query dto.ContentDraftGenerationRunQuery) (time.Time, time.Time) {
	if from := parseContentDraftRunQueryTime(query.DateFrom); !from.IsZero() {
		return from, parseContentDraftRunQueryTime(query.DateTo)
	}
	now := time.Now().UTC()
	switch strings.ToLower(strings.TrimSpace(query.Range)) {
	case "24h":
		return now.Add(-24 * time.Hour), time.Time{}
	case "7d":
		return now.AddDate(0, 0, -7), time.Time{}
	case "30d":
		return now.AddDate(0, 0, -30), time.Time{}
	default:
		return time.Time{}, parseContentDraftRunQueryTime(query.DateTo)
	}
}

func parseContentDraftRunQueryTime(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t.UTC()
	}
	if t, err := time.Parse("2006-01-02", value); err == nil {
		return t.UTC()
	}
	return time.Time{}
}

func windowContainsMinute(window contentDraftTimeWindow, minute int) bool {
	if window.start <= window.end {
		return minute >= window.start && minute <= window.end
	}
	return minute >= window.start || minute <= window.end
}

func contentDraftLocation(timezone string) *time.Location {
	loc, err := time.LoadLocation(strings.TrimSpace(timezone))
	if err != nil {
		return time.UTC
	}
	return loc
}
