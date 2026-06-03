package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

var ErrOAFBotLimitExceeded = errors.New("oaf bot limit exceeded for current plan")
var ErrOAFBotTwitterAccountAlreadyBound = errors.New("twitter_account_id is already bound to another active OAF Bot; unbind it first or choose another X account")

const (
	oafBotProfileAssistModeFillMissing = "fill_missing_only"
	oafBotProfileAssistModeImproveAll  = "improve_all"
)

type OAFBotService struct {
	botRepo         *repository.OAFBotRepository
	accountRepo     *repository.TwitterAccountRepository
	userRepo        *repository.UserRepository
	usageRepo       *repository.AIGenerationUsageRepository
	feedbackRepo    *repository.OAFBotGenerationFeedbackRepository
	planRepo        *repository.AutoPostPlanRepository
	contentRepo     *repository.ContentLibraryRepository
	postDraftRepo   *repository.AutoPostDraftRepository
	replyDraftRepo  *repository.AutoReplyDraftRepository
	commentTaskRepo *repository.AutoCommentTaskRepository
	verdictRepo     *repository.ReviewQueueFeedbackIssueVerdictRepository
	prefRepo        *repository.OAFBotLearningRulePreferenceRepository
	ai              *AIService
}

func NewOAFBotService(botRepo *repository.OAFBotRepository, accountRepo *repository.TwitterAccountRepository, userRepo *repository.UserRepository, usageRepo *repository.AIGenerationUsageRepository, feedbackRepo *repository.OAFBotGenerationFeedbackRepository, planRepo *repository.AutoPostPlanRepository, contentRepo *repository.ContentLibraryRepository, postDraftRepo *repository.AutoPostDraftRepository, replyDraftRepo *repository.AutoReplyDraftRepository, commentTaskRepo *repository.AutoCommentTaskRepository, verdictRepo *repository.ReviewQueueFeedbackIssueVerdictRepository, prefRepo *repository.OAFBotLearningRulePreferenceRepository, ai *AIService) *OAFBotService {
	return &OAFBotService{botRepo: botRepo, accountRepo: accountRepo, userRepo: userRepo, usageRepo: usageRepo, feedbackRepo: feedbackRepo, planRepo: planRepo, contentRepo: contentRepo, postDraftRepo: postDraftRepo, replyDraftRepo: replyDraftRepo, commentTaskRepo: commentTaskRepo, verdictRepo: verdictRepo, prefRepo: prefRepo, ai: ai}
}

func (s *OAFBotService) List(userID uint) (*dto.OAFBotListResponse, error) {
	rows, err := s.botRepo.ListByUserID(userID)
	if err != nil {
		return nil, err
	}
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	limits := subscription.LimitsForUser(user)
	items := make([]dto.OAFBotItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, oafBotToDTO(row))
	}
	usage := dto.PlanUsageData{OAFBots: int64(len(items))}
	if n, err := s.accountRepo.CountByUserID(userID); err == nil {
		usage.TwitterAccounts = n
	}
	usage.AIGenerationsMonth = currentAIGenerationUsage(s.usageRepo, userID, time.Now().UTC())
	return &dto.OAFBotListResponse{
		Items:  items,
		Usage:  usage,
		Limits: planLimitsToDTO(limits),
	}, nil
}

func (s *OAFBotService) DashboardSummary(userID uint, days int) (*dto.OAFBotDashboardSummaryResponse, error) {
	list, err := s.List(userID)
	if err != nil {
		return nil, err
	}
	bots, err := s.botRepo.ListByUserID(userID)
	if err != nil {
		return nil, err
	}
	botIDs := make([]uint, 0, len(bots))
	for _, bot := range bots {
		botIDs = append(botIDs, bot.ID)
	}
	feedbackRows := []model.OAFBotGenerationFeedback{}
	if s.feedbackRepo != nil && len(botIDs) > 0 {
		feedbackRows, err = s.feedbackRepo.ListRecentByUserBots(userID, botIDs, 10)
		if err != nil {
			return nil, err
		}
	}
	_, inspectionSummary, err := s.matrixInspectionByBot(userID, bots, feedbackRows)
	if err != nil {
		return nil, err
	}
	feedbackSummary, err := s.FeedbackSummary(userID, days)
	if err != nil {
		return nil, err
	}
	verdictStats, err := s.dashboardVerdictStats(userID)
	if err != nil {
		return nil, err
	}
	learningRulePreferences := []dto.OAFBotLearningRulePreferenceItem{}
	if len(bots) > 0 {
		preferences, err := s.LearningRulePreferences(userID, bots[0].ID)
		if err != nil {
			return nil, err
		}
		learningRulePreferences = preferences.Items
	}
	return &dto.OAFBotDashboardSummaryResponse{
		Bots:                    list.Items,
		Usage:                   list.Usage,
		Limits:                  list.Limits,
		InspectionSummary:       inspectionSummary,
		FeedbackSummary:         *feedbackSummary,
		VerdictStats:            verdictStats,
		LearningRulePreferences: learningRulePreferences,
	}, nil
}

func (s *OAFBotService) Get(userID, id uint) (*dto.OAFBotItem, error) {
	bot, err := s.botRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	item := oafBotToDTO(*bot)
	return &item, nil
}

func (s *OAFBotService) LearningRulePreferences(userID, id uint) (*dto.OAFBotLearningRulePreferenceResponse, error) {
	if _, err := s.botRepo.GetByUserAndID(userID, id); err != nil {
		return nil, err
	}
	if s.prefRepo == nil {
		return &dto.OAFBotLearningRulePreferenceResponse{Items: []dto.OAFBotLearningRulePreferenceItem{}}, nil
	}
	rows, err := s.prefRepo.ListByUserBot(userID, id)
	if err != nil {
		return nil, err
	}
	items := make([]dto.OAFBotLearningRulePreferenceItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, dto.OAFBotLearningRulePreferenceItem{
			BotID:         row.BotID,
			FeedbackIssue: row.FeedbackIssue,
			Status:        normalizeLearningRulePreferenceStatus(row.Status),
		})
	}
	return &dto.OAFBotLearningRulePreferenceResponse{Items: items}, nil
}

func (s *OAFBotService) UpsertLearningRulePreference(userID, id uint, req dto.OAFBotLearningRulePreferenceRequest) (*dto.OAFBotLearningRulePreferenceItem, error) {
	if _, err := s.botRepo.GetByUserAndID(userID, id); err != nil {
		return nil, err
	}
	if s.prefRepo == nil {
		return nil, fmt.Errorf("learning rule preference repository is not configured")
	}
	issue := strings.ToLower(strings.TrimSpace(req.FeedbackIssue))
	if issue == "" {
		return nil, fmt.Errorf("feedback_issue is required")
	}
	status := normalizeLearningRulePreferenceStatus(req.Status)
	row := &model.OAFBotLearningRulePreference{
		UserID:        userID,
		BotID:         id,
		FeedbackIssue: issue,
		Status:        status,
	}
	if err := s.prefRepo.Upsert(row); err != nil {
		return nil, err
	}
	return &dto.OAFBotLearningRulePreferenceItem{BotID: id, FeedbackIssue: issue, Status: status}, nil
}

func (s *OAFBotService) Create(userID uint, req dto.OAFBotUpsertRequest) (*dto.OAFBotItem, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	limits := subscription.LimitsForUser(user)
	count, err := s.botRepo.CountByUserID(userID)
	if err != nil {
		return nil, err
	}
	if count >= limits.MaxBots {
		return nil, ErrOAFBotLimitExceeded
	}
	if err := s.assertTwitterAccountBinding(userID, 0, req.TwitterAccountID); err != nil {
		return nil, err
	}
	bot := &model.OAFBot{UserID: userID}
	applyOAFBotRequest(bot, req)
	if err := s.botRepo.Create(bot); err != nil {
		return nil, err
	}
	item := oafBotToDTO(*bot)
	return &item, nil
}

func (s *OAFBotService) Update(userID, id uint, req dto.OAFBotUpsertRequest) (*dto.OAFBotItem, error) {
	bot, err := s.botRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if err := s.assertTwitterAccountBinding(userID, bot.ID, req.TwitterAccountID); err != nil {
		return nil, err
	}
	applyOAFBotRequest(bot, req)
	if err := s.botRepo.Save(bot); err != nil {
		return nil, err
	}
	item := oafBotToDTO(*bot)
	return &item, nil
}

func (s *OAFBotService) Delete(userID, id uint) error {
	if s.botRepo == nil || s.botRepo.DB == nil {
		return fmt.Errorf("oaf bot repository is not configured")
	}
	if _, err := s.botRepo.GetByUserAndID(userID, id); err != nil {
		return err
	}
	now := time.Now().UTC()
	return s.botRepo.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.AutoPostPlan{}).
			Where("user_id = ? AND bot_id = ?", userID, id).
			Updates(map[string]any{
				"bot_id":        0,
				"enabled":       false,
				"next_run_at":   nil,
				"processing_at": nil,
				"updated_at":    now,
			}).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.PublishJob{}).
			Where("user_id = ? AND bot_id = ? AND status NOT IN ?", userID, id, []string{repository.PublishStatusPublished, repository.PublishStatusCancelled}).
			Updates(map[string]any{
				"status":          repository.PublishStatusCancelled,
				"next_attempt_at": nil,
				"last_error":      "OAF Bot deleted.",
				"updated_at":      now,
			}).Error; err != nil {
			return err
		}
		zeroBotModels := []any{
			&model.AutoPostDraft{},
			&model.AutoReplyDraft{},
			&model.AutoCommentTask{},
			&model.AutoPostGenerationRun{},
			&model.PublishJob{},
			&model.CostUsageLedger{},
			&model.TrendFeedback{},
			&model.ReviewQueueFeedbackIssueVerdict{},
			&model.DailyXQueueContext{},
		}
		for _, m := range zeroBotModels {
			if err := tx.Model(m).
				Where("user_id = ? AND bot_id = ?", userID, id).
				Updates(map[string]any{"bot_id": 0, "updated_at": now}).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&model.ContentLibraryItem{}).
			Where("user_id = ? AND bot_id = ?", userID, id).
			Updates(map[string]any{"bot_id": nil, "updated_at": now}).Error; err != nil {
			return err
		}
		deleteModels := []any{
			&model.OAFBotGenerationFeedback{},
			&model.OAFBotLearningRulePreference{},
			&model.AIGenerationUsage{},
		}
		for _, m := range deleteModels {
			if err := tx.Where("user_id = ? AND bot_id = ?", userID, id).Delete(m).Error; err != nil {
				return err
			}
		}
		res := tx.Where("user_id = ? AND id = ?", userID, id).Delete(&model.OAFBot{})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

func (s *OAFBotService) CompleteProfile(ctx context.Context, userID uint, req dto.OAFBotCompleteProfileRequest) (*dto.OAFBotCompleteProfileResponse, error) {
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	mode := normalizeOAFBotProfileAssistMode(req.Mode)
	profile, raw, usage, err := s.ai.CompleteOAFBotProfile(ctx, completeOAFBotProfileInput(req.Draft, mode))
	if err != nil {
		return nil, err
	}
	profile = mergeCompletedOAFBotProfile(req.Draft, profile, mode)
	if err := recordAIGenerationUsage(s.usageRepo, userID, 0, repository.AIGenerationSceneOAFBotProfileAssist, now, usage); err != nil {
		return nil, err
	}
	return &dto.OAFBotCompleteProfileResponse{
		Profile:       profile,
		Provider:      s.ai.providerSource(),
		UsageConsumed: 1,
		RawResult:     raw,
	}, nil
}

func (s *OAFBotService) SuggestProfileFromFeedback(ctx context.Context, userID, id uint) (*dto.OAFBotFeedbackProfileSuggestionResponse, error) {
	bot, err := s.botRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	feedbackRows, err := s.feedbackRepo.ListRecentNegativeByUserBot(userID, id, 8)
	if err != nil {
		return nil, err
	}
	if len(feedbackRows) == 0 {
		return nil, fmt.Errorf("no negative feedback available for this OAF Bot")
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	draft := oafBotToUpsertRequest(*bot)
	input := completeOAFBotProfileInput(draft, oafBotProfileAssistModeImproveAll)
	input.FeedbackSignals = feedbackSignalsFromRows(feedbackRows)
	profile, raw, usage, err := s.ai.CompleteOAFBotProfile(ctx, input)
	if err != nil {
		return nil, err
	}
	profile = mergeCompletedOAFBotProfile(draft, profile, oafBotProfileAssistModeImproveAll)
	if err := recordAIGenerationUsage(s.usageRepo, userID, bot.ID, repository.AIGenerationSceneOAFBotProfileAssist, now, usage); err != nil {
		return nil, err
	}
	return &dto.OAFBotFeedbackProfileSuggestionResponse{
		Profile:       profile,
		Provider:      s.ai.providerSource(),
		UsageConsumed: 1,
		FeedbackCount: len(feedbackRows),
		RawResult:     raw,
	}, nil
}

func (s *OAFBotService) TestGenerate(ctx context.Context, userID, id uint, req dto.OAFBotTestGenerateRequest) (*dto.OAFBotTestGenerateResponse, error) {
	bot, err := s.botRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	scene := normalizeOAFBotSampleScene(req.Scene)
	if scene == "" {
		return nil, fmt.Errorf("invalid sample scene")
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	input := oafBotSampleInput(bot, scene, req.SampleContext)
	feedbackRows := s.sampleFeedbackRows(userID, bot.ID, scene)
	input.FeedbackSignals = feedbackSignalsFromRows(feedbackRows)
	var learningRules []dto.OAFBotAppliedLearningRule
	input.FeedbackSignals, learningRules = appendFeedbackLearningSignalsWithRules(input.FeedbackSignals, s.verdictRepo, s.prefRepo, userID, bot.ID, scene, req.DisabledLearningIssues)
	out, usage, err := s.ai.GenerateOAFBotSamples(ctx, input)
	if err != nil {
		return nil, err
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, bot.ID, repository.AIGenerationSceneOAFBotTestGenerate, now, usage); err != nil {
		return nil, err
	}
	out.BotID = bot.ID
	out.UsageConsumed = 1
	out.FeedbackSignalCount = len(input.FeedbackSignals)
	out.FeedbackSignalSummary = feedbackSignalSummaryFromRowsAndRules(feedbackRows, learningRules)
	out.SafetyEvaluation = evaluateOAFBotSampleSafety(out.Content, bot)
	return out, nil
}

func (s *OAFBotService) sampleFeedbackSignals(userID, botID uint, scene string) []string {
	return feedbackSignalsFromRows(s.sampleFeedbackRows(userID, botID, scene))
}

func (s *OAFBotService) sampleFeedbackRows(userID, botID uint, scene string) []model.OAFBotGenerationFeedback {
	if s.feedbackRepo == nil || botID == 0 {
		return nil
	}
	rows, err := s.feedbackRepo.ListRecentNegativeByUserBotScenes(userID, botID, sampleFeedbackScenes(scene), 6)
	if err != nil {
		return nil
	}
	return rows
}

func (s *OAFBotService) RewriteSampleForSafety(ctx context.Context, userID, id uint, req dto.OAFBotRewriteSafetyRequest) (*dto.OAFBotTestGenerateResponse, error) {
	bot, err := s.botRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	scene := normalizeOAFBotSampleScene(req.Scene)
	if scene == "" {
		return nil, fmt.Errorf("invalid sample scene")
	}
	content := strings.TrimSpace(req.Content)
	if content == "" {
		return nil, fmt.Errorf("content is required")
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	input := oafBotSampleInput(bot, scene, req.SampleContext)
	input.UnsafeContent = content
	input.RewriteMode = normalizeSafetyRewriteMode(req.RewriteMode)
	input.SafetyHits = req.MatchedHits
	var learningRules []dto.OAFBotAppliedLearningRule
	input.FeedbackSignals, learningRules = appendFeedbackLearningSignalsWithRules(input.FeedbackSignals, s.verdictRepo, s.prefRepo, userID, bot.ID, scene, req.DisabledLearningIssues)
	out, usage, err := s.ai.RewriteOAFBotSampleForSafety(ctx, input)
	if err != nil {
		return nil, err
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, bot.ID, repository.AIGenerationSceneOAFBotTestGenerate, now, usage); err != nil {
		return nil, err
	}
	out.BotID = bot.ID
	out.UsageConsumed = 1
	out.FeedbackSignalCount = len(input.FeedbackSignals)
	out.FeedbackSignalSummary = feedbackSignalSummaryFromRowsAndRules(nil, learningRules)
	out.SafetyEvaluation = evaluateOAFBotSampleSafety(out.Content, bot)
	return out, nil
}

func (s *OAFBotService) GenerationUsages(userID, id uint) (*dto.OAFBotGenerationUsageResponse, error) {
	if _, err := s.botRepo.GetByUserAndID(userID, id); err != nil {
		return nil, err
	}
	rows, err := s.usageRepo.ListByUserBot(userID, id, 24)
	if err != nil {
		return nil, err
	}
	items := make([]dto.OAFBotGenerationUsageItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, oafBotGenerationUsageToDTO(row))
	}
	return &dto.OAFBotGenerationUsageResponse{Items: items}, nil
}

func (s *OAFBotService) MatrixSignals(userID uint) (*dto.OAFBotMatrixSignalsResponse, error) {
	bots, err := s.botRepo.ListByUserID(userID)
	if err != nil {
		return nil, err
	}
	botIDs := make([]uint, 0, len(bots))
	for _, bot := range bots {
		botIDs = append(botIDs, bot.ID)
	}
	usageRows, err := s.usageRepo.ListByUserBotsMonth(userID, botIDs, repository.UsageMonth(time.Now().UTC()))
	if err != nil {
		return nil, err
	}
	feedbackRows, err := s.feedbackRepo.ListRecentByUserBots(userID, botIDs, 10)
	if err != nil {
		return nil, err
	}
	inspectionByBot, summary, err := s.matrixInspectionByBot(userID, bots, feedbackRows)
	if err != nil {
		return nil, err
	}
	usageByBot := make(map[uint][]dto.OAFBotGenerationUsageItem, len(botIDs))
	for _, row := range usageRows {
		usageByBot[row.BotID] = append(usageByBot[row.BotID], oafBotGenerationUsageToDTO(row))
	}
	feedbackByBot := make(map[uint][]dto.OAFBotGenerationFeedbackItem, len(botIDs))
	for _, row := range feedbackRows {
		if len(feedbackByBot[row.BotID]) >= 10 {
			continue
		}
		feedbackByBot[row.BotID] = append(feedbackByBot[row.BotID], oafBotGenerationFeedbackToDTO(row))
	}
	items := make([]dto.OAFBotMatrixSignalItem, 0, len(botIDs))
	for _, id := range botIDs {
		inspection := inspectionByBot[id]
		items = append(items, dto.OAFBotMatrixSignalItem{
			BotID:             id,
			Usages:            usageByBot[id],
			Feedback:          feedbackByBot[id],
			InspectionFlags:   inspection.Flags,
			InspectionMetrics: inspection.Metrics,
		})
	}
	return &dto.OAFBotMatrixSignalsResponse{Items: items, Summary: summary}, nil
}

type oafBotMatrixInspection struct {
	Flags   []string
	Metrics dto.OAFBotMatrixInspectionMetrics
}

func (s *OAFBotService) matrixInspectionByBot(userID uint, bots []model.OAFBot, feedbackRows []model.OAFBotGenerationFeedback) (map[uint]oafBotMatrixInspection, dto.OAFBotMatrixInspectionSummary, error) {
	botIDs := make([]uint, 0, len(bots))
	for _, bot := range bots {
		botIDs = append(botIDs, bot.ID)
	}
	summary := dto.OAFBotMatrixInspectionSummary{}
	accountByID := map[uint]bool{}
	accounts, err := s.accountRepo.ListByUserID(userID)
	if err != nil {
		return nil, summary, err
	}
	for _, account := range accounts {
		accountByID[account.ID] = true
	}
	planByBot, planByAccount, err := s.matrixPlansByBot(userID)
	if err != nil {
		return nil, summary, err
	}
	activeContentCounts, err := s.matrixActiveContentCounts(userID, bots)
	if err != nil {
		return nil, summary, err
	}
	negativeFeedbackByBot := map[uint]int{}
	for _, row := range feedbackRows {
		if row.Rating == "negative" {
			negativeFeedbackByBot[row.BotID]++
		}
	}
	pendingReviewByBot, err := s.pendingReviewCountsByBot(userID, botIDs)
	if err != nil {
		return nil, summary, err
	}
	out := make(map[uint]oafBotMatrixInspection, len(bots))
	for _, bot := range bots {
		flags := []string{}
		if bot.TwitterAccountID == 0 {
			flags = append(flags, "unbound")
			summary.UnboundCount++
		}
		plan, ok := planByBot[bot.ID]
		if !ok && bot.TwitterAccountID > 0 {
			plan, ok = planByAccount[bot.TwitterAccountID]
		}
		autoPostReady := bot.TwitterAccountID > 0 &&
			accountByID[bot.TwitterAccountID] &&
			ok &&
			plan.Enabled &&
			plan.ExecutionMode == "autopilot" &&
			activeContentCounts[bot.ID] > 0
		if !autoPostReady {
			flags = append(flags, "auto_post_not_ready")
			summary.AutoPostNotReadyCount++
		}
		if negativeFeedbackByBot[bot.ID] >= 3 {
			flags = append(flags, "negative_feedback")
			summary.NegativeFeedbackCount++
		}
		if pendingReviewByBot[bot.ID] >= 5 {
			flags = append(flags, "review_backlog")
			summary.ReviewBacklogCount++
		}
		out[bot.ID] = oafBotMatrixInspection{
			Flags: flags,
			Metrics: dto.OAFBotMatrixInspectionMetrics{
				ActiveContentCount: activeContentCounts[bot.ID],
				NegativeFeedback:   negativeFeedbackByBot[bot.ID],
				PendingReview:      pendingReviewByBot[bot.ID],
			},
		}
	}
	return out, summary, nil
}

func (s *OAFBotService) matrixPlansByBot(userID uint) (map[uint]model.AutoPostPlan, map[uint]model.AutoPostPlan, error) {
	planByBot := map[uint]model.AutoPostPlan{}
	planByAccount := map[uint]model.AutoPostPlan{}
	if s.planRepo == nil {
		return planByBot, planByAccount, nil
	}
	plans, err := s.planRepo.ListByUser(userID)
	if err != nil {
		return nil, nil, err
	}
	for _, plan := range plans {
		if plan.BotID > 0 {
			planByBot[plan.BotID] = plan
		}
		if plan.XAccountID > 0 {
			planByAccount[plan.XAccountID] = plan
		}
	}
	return planByBot, planByAccount, nil
}

func (s *OAFBotService) matrixActiveContentCounts(userID uint, bots []model.OAFBot) (map[uint]int, error) {
	activeContentCounts := map[uint]int{}
	if s.contentRepo == nil {
		return activeContentCounts, nil
	}
	contentItems, err := s.contentRepo.ListActiveByUser(userID)
	if err != nil {
		return nil, err
	}
	for _, bot := range bots {
		for _, item := range contentItems {
			if contentItemMatchesOAFBot(item, bot) {
				activeContentCounts[bot.ID]++
			}
		}
	}
	return activeContentCounts, nil
}

func (s *OAFBotService) pendingReviewCountsByBot(userID uint, botIDs []uint) (map[uint]int, error) {
	out := map[uint]int{}
	if len(botIDs) == 0 {
		return out, nil
	}
	if s.postDraftRepo != nil {
		counts, err := s.postDraftRepo.CountStatusByUserBots(userID, botIDs, "pending_review")
		if err != nil {
			return out, err
		}
		addBotCounts(out, counts)
	}
	if s.replyDraftRepo != nil {
		counts, err := s.replyDraftRepo.CountStatusByUserBots(userID, botIDs, "pending_review")
		if err != nil {
			return out, err
		}
		addBotCounts(out, counts)
	}
	if s.commentTaskRepo != nil {
		counts, err := s.commentTaskRepo.CountStatusByUserBots(userID, botIDs, "pending_review")
		if err != nil {
			return out, err
		}
		addBotCounts(out, counts)
	}
	return out, nil
}

func addBotCounts(dst map[uint]int, src map[uint]int) {
	for id, count := range src {
		dst[id] += count
	}
}

func contentItemMatchesOAFBot(item model.ContentLibraryItem, bot model.OAFBot) bool {
	if item.TwitterAccountID != nil && *item.TwitterAccountID != bot.TwitterAccountID {
		return false
	}
	if item.BotID != nil && *item.BotID != bot.ID {
		return false
	}
	return true
}

func (s *OAFBotService) CreateGenerationFeedback(userID, id uint, req dto.OAFBotGenerationFeedbackRequest) (*dto.OAFBotGenerationFeedbackItem, error) {
	bot, err := s.botRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	scene := normalizeOAFBotSampleScene(req.Scene)
	if scene == "" {
		return nil, fmt.Errorf("invalid sample scene")
	}
	rating := normalizeOAFBotFeedbackRating(req.Rating)
	if rating == "" {
		return nil, fmt.Errorf("invalid feedback rating")
	}
	row := &model.OAFBotGenerationFeedback{
		UserID:           userID,
		BotID:            bot.ID,
		Scene:            scene,
		Rating:           rating,
		IssueTags:        encodeStringList(req.IssueTags),
		Comment:          limitString(req.Comment, 1200),
		SampleContext:    limitString(req.SampleContext, 2000),
		GeneratedContent: limitString(req.GeneratedContent, 4000),
		Provider:         limitString(req.Provider, 64),
	}
	if err := s.feedbackRepo.Create(row); err != nil {
		return nil, err
	}
	item := oafBotGenerationFeedbackToDTO(*row)
	return &item, nil
}

func (s *OAFBotService) GenerationFeedback(userID, id uint) (*dto.OAFBotGenerationFeedbackResponse, error) {
	if _, err := s.botRepo.GetByUserAndID(userID, id); err != nil {
		return nil, err
	}
	rows, err := s.feedbackRepo.ListRecentByUserBot(userID, id, 30)
	if err != nil {
		return nil, err
	}
	items := make([]dto.OAFBotGenerationFeedbackItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, oafBotGenerationFeedbackToDTO(row))
	}
	return &dto.OAFBotGenerationFeedbackResponse{Items: items}, nil
}

func (s *OAFBotService) DeleteGenerationFeedback(userID, id, feedbackID uint) error {
	if _, err := s.botRepo.GetByUserAndID(userID, id); err != nil {
		return err
	}
	if s.feedbackRepo == nil {
		return nil
	}
	return s.feedbackRepo.DeleteByUserBotAndID(userID, id, feedbackID)
}

func (s *OAFBotService) FeedbackSummary(userID uint, days int) (*dto.OAFBotFeedbackSummaryResponse, error) {
	if days <= 0 {
		days = 7
	}
	if days > 30 {
		days = 30
	}
	if s.feedbackRepo == nil {
		return &dto.OAFBotFeedbackSummaryResponse{Days: days}, nil
	}
	since := time.Now().UTC().AddDate(0, 0, -days)
	rows, err := s.feedbackRepo.ListRecentNegativeByUserSince(userID, since, 500)
	if err != nil {
		return nil, err
	}
	issueCounts := map[string]int{}
	sceneCounts := map[string]int{}
	lastFeedbackAt := ""
	for index, row := range rows {
		if index == 0 {
			lastFeedbackAt = row.CreatedAt.UTC().Format(time.RFC3339)
		}
		scene := strings.TrimSpace(row.Scene)
		if scene == "" {
			scene = "unknown"
		}
		sceneCounts[scene]++
		tags := decodeStringList(row.IssueTags)
		if len(tags) == 0 {
			issueCounts["other"]++
			continue
		}
		for _, tag := range tags {
			tag = strings.TrimSpace(tag)
			if tag == "" {
				continue
			}
			issueCounts[tag]++
		}
	}
	topIssues := make([]dto.OAFBotFeedbackSummaryIssue, 0, len(issueCounts))
	for tag, count := range issueCounts {
		topIssues = append(topIssues, dto.OAFBotFeedbackSummaryIssue{Tag: tag, Count: count})
	}
	sort.Slice(topIssues, func(i, j int) bool {
		if topIssues[i].Count == topIssues[j].Count {
			return topIssues[i].Tag < topIssues[j].Tag
		}
		return topIssues[i].Count > topIssues[j].Count
	})
	if len(topIssues) > 5 {
		topIssues = topIssues[:5]
	}
	scenes := make([]dto.OAFBotFeedbackSummaryScene, 0, len(sceneCounts))
	for scene, count := range sceneCounts {
		scenes = append(scenes, dto.OAFBotFeedbackSummaryScene{Scene: scene, Count: count})
	}
	sort.Slice(scenes, func(i, j int) bool {
		if scenes[i].Count == scenes[j].Count {
			return scenes[i].Scene < scenes[j].Scene
		}
		return scenes[i].Count > scenes[j].Count
	})
	return &dto.OAFBotFeedbackSummaryResponse{
		Days:           days,
		NegativeCount:  len(rows),
		TopIssues:      topIssues,
		Scenes:         scenes,
		LastFeedbackAt: lastFeedbackAt,
	}, nil
}

func (s *OAFBotService) dashboardVerdictStats(userID uint) ([]dto.ReviewQueueFeedbackIssueVerdictStat, error) {
	if s.verdictRepo == nil {
		return []dto.ReviewQueueFeedbackIssueVerdictStat{}, nil
	}
	rows, err := s.verdictRepo.ListRecentByUser(userID, 500)
	if err != nil {
		return nil, err
	}
	type reasonCounter struct {
		accurate   int
		irrelevant int
	}
	type issueCounter struct {
		accurate   int
		irrelevant int
		reasons    map[string]*reasonCounter
	}
	counters := map[string]*issueCounter{}
	for _, row := range rows {
		issue := strings.TrimSpace(row.FeedbackIssue)
		if issue == "" {
			continue
		}
		counter := counters[issue]
		if counter == nil {
			counter = &issueCounter{reasons: map[string]*reasonCounter{}}
			counters[issue] = counter
		}
		isAccurate := row.Verdict == "accurate"
		if isAccurate {
			counter.accurate++
		} else if row.Verdict == "irrelevant" {
			counter.irrelevant++
		}
		for _, reason := range decodeStringList(row.Reasons) {
			reason = strings.TrimSpace(reason)
			if reason == "" {
				continue
			}
			reasonStats := counter.reasons[reason]
			if reasonStats == nil {
				reasonStats = &reasonCounter{}
				counter.reasons[reason] = reasonStats
			}
			if isAccurate {
				reasonStats.accurate++
			} else if row.Verdict == "irrelevant" {
				reasonStats.irrelevant++
			}
		}
	}
	issues := make([]dto.ReviewQueueFeedbackIssueVerdictStat, 0, len(counters))
	for issue, counter := range counters {
		total := counter.accurate + counter.irrelevant
		if total == 0 {
			continue
		}
		reasons := make([]dto.ReviewQueueFeedbackIssueReasonStat, 0, len(counter.reasons))
		for reason, reasonStats := range counter.reasons {
			reasonTotal := reasonStats.accurate + reasonStats.irrelevant
			if reasonTotal == 0 {
				continue
			}
			reasons = append(reasons, dto.ReviewQueueFeedbackIssueReasonStat{
				Reason:          reason,
				Accurate:        reasonStats.accurate,
				Irrelevant:      reasonStats.irrelevant,
				Total:           reasonTotal,
				AccuracyRate:    ratio(reasonStats.accurate, reasonTotal),
				ScoreAdjustment: verdictScoreAdjustment(reasonStats.accurate, reasonStats.irrelevant),
			})
		}
		sort.SliceStable(reasons, func(i, j int) bool {
			if reasons[i].Total != reasons[j].Total {
				return reasons[i].Total > reasons[j].Total
			}
			return reasons[i].Reason < reasons[j].Reason
		})
		if len(reasons) > 5 {
			reasons = reasons[:5]
		}
		issues = append(issues, dto.ReviewQueueFeedbackIssueVerdictStat{
			FeedbackIssue: issue,
			Accurate:      counter.accurate,
			Irrelevant:    counter.irrelevant,
			Total:         total,
			AccuracyRate:  ratio(counter.accurate, total),
			Reasons:       reasons,
		})
	}
	sort.SliceStable(issues, func(i, j int) bool {
		if issues[i].Total != issues[j].Total {
			return issues[i].Total > issues[j].Total
		}
		return issues[i].FeedbackIssue < issues[j].FeedbackIssue
	})
	return issues, nil
}

func (s *OAFBotService) assertTwitterAccountBinding(userID uint, currentBotID uint, accountID uint) error {
	if accountID == 0 {
		return nil
	}
	if _, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, accountID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("twitter_account_id does not belong to current user")
		}
		return err
	}
	existing, err := s.botRepo.GetByUserAndTwitterAccountIDExcludingBot(userID, accountID, currentBotID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if existing != nil {
		return ErrOAFBotTwitterAccountAlreadyBound
	}
	return nil
}

func applyOAFBotRequest(bot *model.OAFBot, req dto.OAFBotUpsertRequest) {
	bot.Name = limitString(req.Name, 96)
	bot.TwitterAccountID = req.TwitterAccountID
	bot.Occupation = limitString(req.Occupation, 128)
	bot.Industry = limitString(req.Industry, 128)
	bot.AgeRange = limitString(req.AgeRange, 64)
	bot.Gender = limitString(req.Gender, 64)
	bot.Education = limitString(req.Education, 128)
	bot.MBTI = strings.ToUpper(limitString(req.MBTI, 32))
	bot.PersonalityTags = encodeStringList(req.PersonalityTags)
	bot.IdentitySummary = limitString(req.IdentitySummary, 2000)
	bot.VoiceTone = limitString(req.VoiceTone, 128)
	bot.Topics = encodeStringList(req.Topics)
	bot.ForbiddenTopics = encodeStringList(req.ForbiddenTopics)
	bot.GrowthGoal = limitString(req.GrowthGoal, 2000)
	bot.ProjectOneLiner = limitString(req.ProjectOneLiner, 1000)
	bot.TargetAudience = limitString(req.TargetAudience, 2000)
	bot.CoreValueProps = limitString(req.CoreValueProps, 2000)
	bot.ProductFeatures = limitString(req.ProductFeatures, 3000)
	bot.Differentiators = limitString(req.Differentiators, 2000)
	bot.ContentPillars = encodeStringList(req.ContentPillars)
	bot.ContentObjectives = limitString(req.ContentObjectives, 2000)
	bot.PreferredCTA = limitString(req.PreferredCTA, 1000)
	bot.WebsiteURL = limitString(req.WebsiteURL, 512)
	bot.TelegramURL = limitString(req.TelegramURL, 512)
	bot.DiscordURL = limitString(req.DiscordURL, 512)
	bot.DocsURL = limitString(req.DocsURL, 512)
	bot.CTAPolicy = limitString(req.CTAPolicy, 1600)
	bot.Hashtags = encodeStringList(req.Hashtags)
	bot.Keywords = encodeStringList(req.Keywords)
	bot.ComplianceNotes = limitString(req.ComplianceNotes, 2000)
	bot.AvoidClaims = encodeStringList(req.AvoidClaims)
	bot.SafetyMode = limitString(req.SafetyMode, 64)
	if bot.SafetyMode == "" {
		bot.SafetyMode = "balanced"
	}
	bot.PrimaryLanguage = normalizeOAFBotPrimaryLanguage(req.PrimaryLanguage)
	bot.LanguageStrategy = normalizeOAFBotLanguageStrategy(req.LanguageStrategy)
	bot.TrendRegions = encodeStringList(normalizeTrendRegions(req.TrendRegions))
	bot.TrendCategories = encodeStringList(normalizeTrendCategories(req.TrendCategories))
	bot.AllowGeneralTrends = req.AllowGeneralTrends
	bot.SensitiveTrendPolicy = normalizeSensitiveTrendPolicy(req.SensitiveTrendPolicy)
}

func oafBotSampleInput(bot *model.OAFBot, scene string, sampleContext string) GenerateOAFBotSamplesInput {
	if bot == nil {
		return GenerateOAFBotSamplesInput{Scene: scene, SampleContext: sampleContext}
	}
	return GenerateOAFBotSamplesInput{
		Scene:             scene,
		SampleContext:     sampleContext,
		Name:              bot.Name,
		Occupation:        bot.Occupation,
		Industry:          bot.Industry,
		AgeRange:          bot.AgeRange,
		Gender:            bot.Gender,
		Education:         bot.Education,
		MBTI:              bot.MBTI,
		PersonalityTags:   decodeStringList(bot.PersonalityTags),
		IdentitySummary:   bot.IdentitySummary,
		VoiceTone:         bot.VoiceTone,
		Topics:            decodeStringList(bot.Topics),
		ForbiddenTopics:   decodeStringList(bot.ForbiddenTopics),
		GrowthGoal:        bot.GrowthGoal,
		ProjectOneLiner:   bot.ProjectOneLiner,
		TargetAudience:    bot.TargetAudience,
		CoreValueProps:    bot.CoreValueProps,
		ProductFeatures:   bot.ProductFeatures,
		Differentiators:   bot.Differentiators,
		ContentPillars:    decodeStringList(bot.ContentPillars),
		ContentObjectives: bot.ContentObjectives,
		PreferredCTA:      bot.PreferredCTA,
		WebsiteURL:        bot.WebsiteURL,
		TelegramURL:       bot.TelegramURL,
		DiscordURL:        bot.DiscordURL,
		DocsURL:           bot.DocsURL,
		CTAPolicy:         bot.CTAPolicy,
		Hashtags:          decodeStringList(bot.Hashtags),
		Keywords:          decodeStringList(bot.Keywords),
		ComplianceNotes:   bot.ComplianceNotes,
		AvoidClaims:       decodeStringList(bot.AvoidClaims),
		SafetyMode:        bot.SafetyMode,
		PrimaryLanguage:   normalizeOAFBotPrimaryLanguage(bot.PrimaryLanguage),
		LanguageStrategy:  normalizeOAFBotLanguageStrategy(bot.LanguageStrategy),
	}
}

func completeOAFBotProfileInput(req dto.OAFBotUpsertRequest, mode string) CompleteOAFBotProfileInput {
	return CompleteOAFBotProfileInput{
		Mode:              mode,
		Name:              req.Name,
		Occupation:        req.Occupation,
		Industry:          req.Industry,
		AgeRange:          req.AgeRange,
		Gender:            req.Gender,
		Education:         req.Education,
		MBTI:              req.MBTI,
		PersonalityTags:   req.PersonalityTags,
		IdentitySummary:   req.IdentitySummary,
		VoiceTone:         req.VoiceTone,
		Topics:            req.Topics,
		ForbiddenTopics:   req.ForbiddenTopics,
		GrowthGoal:        req.GrowthGoal,
		ProjectOneLiner:   req.ProjectOneLiner,
		TargetAudience:    req.TargetAudience,
		CoreValueProps:    req.CoreValueProps,
		ProductFeatures:   req.ProductFeatures,
		Differentiators:   req.Differentiators,
		ContentPillars:    req.ContentPillars,
		ContentObjectives: req.ContentObjectives,
		PreferredCTA:      req.PreferredCTA,
		WebsiteURL:        req.WebsiteURL,
		TelegramURL:       req.TelegramURL,
		DiscordURL:        req.DiscordURL,
		DocsURL:           req.DocsURL,
		CTAPolicy:         req.CTAPolicy,
		Hashtags:          req.Hashtags,
		Keywords:          req.Keywords,
		ComplianceNotes:   req.ComplianceNotes,
		AvoidClaims:       req.AvoidClaims,
		SafetyMode:        req.SafetyMode,
		PrimaryLanguage:   req.PrimaryLanguage,
		LanguageStrategy:  req.LanguageStrategy,
	}
}

func feedbackSignalsFromRows(rows []model.OAFBotGenerationFeedback) []string {
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		parts := []string{
			"scene=" + row.Scene,
			"issue_tags=" + strings.Join(decodeStringList(row.IssueTags), ", "),
		}
		if strings.TrimSpace(row.Comment) != "" {
			parts = append(parts, "comment="+strings.TrimSpace(row.Comment))
		}
		if strings.TrimSpace(row.SampleContext) != "" {
			parts = append(parts, "sample_context="+limitString(row.SampleContext, 280))
		}
		if strings.TrimSpace(row.GeneratedContent) != "" {
			parts = append(parts, "generated_content="+limitString(row.GeneratedContent, 360))
		}
		out = append(out, strings.Join(parts, " | "))
	}
	return out
}

func feedbackSignalSummaryFromRows(rows []model.OAFBotGenerationFeedback) *dto.OAFBotFeedbackSignalSummary {
	return feedbackSignalSummaryFromRowsAndRules(rows, nil)
}

func feedbackSignalSummaryFromRowsAndRules(rows []model.OAFBotGenerationFeedback, learningRules []dto.OAFBotAppliedLearningRule) *dto.OAFBotFeedbackSignalSummary {
	if len(rows) == 0 {
		if len(learningRules) == 0 {
			return nil
		}
		return &dto.OAFBotFeedbackSignalSummary{
			Count:                len(learningRules),
			IssueTags:            learningRuleIssues(learningRules),
			AppliedLearningRules: learningRules,
		}
	}
	sceneCounts := map[string]int{}
	issueCounts := map[string]int{}
	latestComment := ""
	for _, row := range rows {
		if scene := strings.TrimSpace(row.Scene); scene != "" {
			sceneCounts[scene]++
		}
		for _, tag := range decodeStringList(row.IssueTags) {
			if tag = strings.TrimSpace(tag); tag != "" {
				issueCounts[tag]++
			}
		}
		if latestComment == "" && strings.TrimSpace(row.Comment) != "" {
			latestComment = limitString(strings.TrimSpace(row.Comment), 160)
		}
	}
	return &dto.OAFBotFeedbackSignalSummary{
		Count:                len(rows) + len(learningRules),
		Scenes:               topFeedbackKeys(sceneCounts, 3),
		IssueTags:            mergeFeedbackKeys(topFeedbackKeys(issueCounts, 4), learningRuleIssues(learningRules), 5),
		LatestComment:        latestComment,
		AppliedLearningRules: learningRules,
	}
}

func learningRuleIssues(rules []dto.OAFBotAppliedLearningRule) []string {
	out := make([]string, 0, len(rules))
	seen := map[string]bool{}
	for _, rule := range rules {
		issue := strings.TrimSpace(rule.Issue)
		if issue == "" || seen[issue] {
			continue
		}
		seen[issue] = true
		out = append(out, issue)
	}
	return out
}

func mergeFeedbackKeys(primary []string, secondary []string, limit int) []string {
	out := make([]string, 0, len(primary)+len(secondary))
	seen := map[string]bool{}
	for _, key := range append(primary, secondary...) {
		key = strings.TrimSpace(key)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, key)
		if limit > 0 && len(out) >= limit {
			return out
		}
	}
	return out
}

func topFeedbackKeys(counts map[string]int, limit int) []string {
	if len(counts) == 0 || limit <= 0 {
		return nil
	}
	keys := make([]string, 0, len(counts))
	for key := range counts {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		if counts[keys[i]] == counts[keys[j]] {
			return keys[i] < keys[j]
		}
		return counts[keys[i]] > counts[keys[j]]
	})
	if len(keys) > limit {
		keys = keys[:limit]
	}
	return keys
}

func evaluateOAFBotSampleSafety(content string, bot *model.OAFBot) dto.OAFBotSafetyEvaluationResult {
	text := strings.ToLower(strings.TrimSpace(content))
	if text == "" {
		return dto.OAFBotSafetyEvaluationResult{
			Level:    "high",
			Action:   "avoid",
			Category: "empty_content",
			Reason:   "Generated content is empty, so it should not be published.",
		}
	}
	if bot != nil {
		if hits := safetyHits(text, decodeStringList(bot.ForbiddenTopics), "forbidden_topic"); len(hits) > 0 {
			return dto.OAFBotSafetyEvaluationResult{
				Level:       "high",
				Action:      "avoid",
				Category:    "forbidden_topic",
				Reason:      "Generated content matched configured forbidden topics.",
				MatchedHits: hits,
			}
		}
		if hits := safetyHits(text, decodeStringList(bot.AvoidClaims), "avoid_claim"); len(hits) > 0 {
			return dto.OAFBotSafetyEvaluationResult{
				Level:       "high",
				Action:      "avoid",
				Category:    "avoid_claim",
				Reason:      "Generated content matched claims this Bot should avoid.",
				MatchedHits: hits,
			}
		}
	}
	if hits := safetyHits(text, defaultHighRiskSafetyTerms(), "platform_policy"); len(hits) > 0 {
		return dto.OAFBotSafetyEvaluationResult{
			Level:       "high",
			Action:      "avoid",
			Category:    "platform_policy",
			Reason:      "Generated content matched a high-risk safety rule.",
			MatchedHits: hits,
		}
	}
	if bot != nil && strings.TrimSpace(bot.SafetyMode) == "conservative" {
		if hits := safetyHits(text, conservativeReviewTerms(), "conservative_review"); len(hits) > 0 {
			return dto.OAFBotSafetyEvaluationResult{
				Level:       "medium",
				Action:      "review",
				Category:    "conservative_review",
				Reason:      "Conservative safety mode recommends human review for this wording.",
				MatchedHits: hits,
			}
		}
	}
	return dto.OAFBotSafetyEvaluationResult{
		Level:    "low",
		Action:   "allow",
		Category: "clear",
		Reason:   "No configured forbidden topics, avoid-claims, or high-risk safety terms were detected.",
	}
}

func safetyHits(text string, terms []string, source string) []dto.OAFBotSafetyHit {
	hits := []dto.OAFBotSafetyHit{}
	seen := map[string]bool{}
	for _, term := range terms {
		t := strings.TrimSpace(term)
		key := strings.ToLower(t)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		if strings.Contains(text, key) {
			hits = append(hits, dto.OAFBotSafetyHit{Source: source, Term: t})
		}
	}
	return hits
}

func defaultHighRiskSafetyTerms() []string {
	return []string{
		"guaranteed return", "guaranteed profit", "risk-free", "100x", "pump", "airdrop",
		"seed phrase", "private key", "connect wallet", "official support",
		"稳赚", "保本", "收益保证", "私钥", "助记词", "连接钱包", "官方客服",
	}
}

func conservativeReviewTerms() []string {
	return []string{
		"buy", "claim", "limited time", "exclusive", "profit", "yield", "token", "wallet",
		"购买", "领取", "限时", "独家", "收益", "回报", "代币", "钱包",
	}
}

func normalizeSafetyMode(value string) string {
	switch strings.TrimSpace(value) {
	case "conservative", "balanced", "autopilot":
		return strings.TrimSpace(value)
	default:
		return "balanced"
	}
}

func normalizeOAFBotFeedbackRating(value string) string {
	switch strings.TrimSpace(value) {
	case "positive", "negative":
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func normalizeOAFBotProfileAssistMode(value string) string {
	switch strings.TrimSpace(value) {
	case oafBotProfileAssistModeImproveAll:
		return oafBotProfileAssistModeImproveAll
	default:
		return oafBotProfileAssistModeFillMissing
	}
}

func mergeCompletedOAFBotProfile(draft, generated dto.OAFBotUpsertRequest, mode string) dto.OAFBotUpsertRequest {
	pickString := func(primary, fallback string) string {
		return firstNonEmpty(primary, fallback)
	}
	pickList := firstNonEmptyList
	if normalizeOAFBotProfileAssistMode(mode) == oafBotProfileAssistModeFillMissing {
		pickString = func(primary, fallback string) string {
			return firstNonEmpty(fallback, primary)
		}
		pickList = func(primary, fallback []string) []string {
			return firstNonEmptyList(fallback, primary)
		}
	}

	out := generated
	out.Name = limitString(firstNonEmpty(draft.Name, generated.Name), 96)
	out.TwitterAccountID = draft.TwitterAccountID
	out.AgeRange = limitString(pickString(generated.AgeRange, draft.AgeRange), 64)
	out.Gender = limitString(pickString(generated.Gender, draft.Gender), 64)
	out.Education = limitString(pickString(generated.Education, draft.Education), 128)
	out.MBTI = strings.ToUpper(limitString(pickString(generated.MBTI, draft.MBTI), 32))
	out.SafetyMode = normalizeSafetyMode(pickString(generated.SafetyMode, draft.SafetyMode))
	out.PrimaryLanguage = normalizeOAFBotPrimaryLanguage(pickString(generated.PrimaryLanguage, draft.PrimaryLanguage))
	out.LanguageStrategy = normalizeOAFBotLanguageStrategy(pickString(generated.LanguageStrategy, draft.LanguageStrategy))
	out.Occupation = limitString(pickString(generated.Occupation, draft.Occupation), 128)
	out.Industry = limitString(pickString(generated.Industry, draft.Industry), 128)
	out.IdentitySummary = limitString(pickString(generated.IdentitySummary, draft.IdentitySummary), 2000)
	out.VoiceTone = limitString(pickString(generated.VoiceTone, draft.VoiceTone), 128)
	out.GrowthGoal = limitString(pickString(generated.GrowthGoal, draft.GrowthGoal), 2000)
	out.ProjectOneLiner = limitString(pickString(generated.ProjectOneLiner, draft.ProjectOneLiner), 1000)
	out.TargetAudience = limitString(pickString(generated.TargetAudience, draft.TargetAudience), 2000)
	out.CoreValueProps = limitString(pickString(generated.CoreValueProps, draft.CoreValueProps), 2000)
	out.ProductFeatures = limitString(pickString(generated.ProductFeatures, draft.ProductFeatures), 3000)
	out.Differentiators = limitString(pickString(generated.Differentiators, draft.Differentiators), 2000)
	out.ContentObjectives = limitString(pickString(generated.ContentObjectives, draft.ContentObjectives), 2000)
	out.PreferredCTA = limitString(pickString(generated.PreferredCTA, draft.PreferredCTA), 1000)
	out.WebsiteURL = limitString(pickString(generated.WebsiteURL, draft.WebsiteURL), 512)
	out.TelegramURL = limitString(pickString(generated.TelegramURL, draft.TelegramURL), 512)
	out.DiscordURL = limitString(pickString(generated.DiscordURL, draft.DiscordURL), 512)
	out.DocsURL = limitString(pickString(generated.DocsURL, draft.DocsURL), 512)
	out.CTAPolicy = limitString(pickString(generated.CTAPolicy, draft.CTAPolicy), 1600)
	out.ComplianceNotes = limitString(pickString(generated.ComplianceNotes, draft.ComplianceNotes), 2000)
	out.PersonalityTags = pickList(generated.PersonalityTags, draft.PersonalityTags)
	out.Topics = pickList(generated.Topics, draft.Topics)
	out.ForbiddenTopics = pickList(generated.ForbiddenTopics, draft.ForbiddenTopics)
	out.ContentPillars = pickList(generated.ContentPillars, draft.ContentPillars)
	out.Hashtags = pickList(generated.Hashtags, draft.Hashtags)
	out.Keywords = pickList(generated.Keywords, draft.Keywords)
	out.AvoidClaims = pickList(generated.AvoidClaims, draft.AvoidClaims)
	return out
}

func firstNonEmptyList(primary, fallback []string) []string {
	if len(primary) > 0 {
		return primary
	}
	return fallback
}

func oafBotToDTO(bot model.OAFBot) dto.OAFBotItem {
	return dto.OAFBotItem{
		ID:                   bot.ID,
		Name:                 bot.Name,
		TwitterAccountID:     bot.TwitterAccountID,
		Occupation:           bot.Occupation,
		Industry:             bot.Industry,
		AgeRange:             bot.AgeRange,
		Gender:               bot.Gender,
		Education:            bot.Education,
		MBTI:                 bot.MBTI,
		PersonalityTags:      decodeStringList(bot.PersonalityTags),
		IdentitySummary:      bot.IdentitySummary,
		VoiceTone:            bot.VoiceTone,
		Topics:               decodeStringList(bot.Topics),
		ForbiddenTopics:      decodeStringList(bot.ForbiddenTopics),
		GrowthGoal:           bot.GrowthGoal,
		ProjectOneLiner:      bot.ProjectOneLiner,
		TargetAudience:       bot.TargetAudience,
		CoreValueProps:       bot.CoreValueProps,
		ProductFeatures:      bot.ProductFeatures,
		Differentiators:      bot.Differentiators,
		ContentPillars:       decodeStringList(bot.ContentPillars),
		ContentObjectives:    bot.ContentObjectives,
		PreferredCTA:         bot.PreferredCTA,
		WebsiteURL:           bot.WebsiteURL,
		TelegramURL:          bot.TelegramURL,
		DiscordURL:           bot.DiscordURL,
		DocsURL:              bot.DocsURL,
		CTAPolicy:            bot.CTAPolicy,
		Hashtags:             decodeStringList(bot.Hashtags),
		Keywords:             decodeStringList(bot.Keywords),
		ComplianceNotes:      bot.ComplianceNotes,
		AvoidClaims:          decodeStringList(bot.AvoidClaims),
		SafetyMode:           bot.SafetyMode,
		PrimaryLanguage:      normalizeOAFBotPrimaryLanguage(bot.PrimaryLanguage),
		LanguageStrategy:     normalizeOAFBotLanguageStrategy(bot.LanguageStrategy),
		TrendRegions:         normalizeTrendRegions(decodeStringList(bot.TrendRegions)),
		TrendCategories:      normalizeTrendCategories(decodeStringList(bot.TrendCategories)),
		AllowGeneralTrends:   bot.AllowGeneralTrends,
		SensitiveTrendPolicy: normalizeSensitiveTrendPolicy(bot.SensitiveTrendPolicy),
		CreatedAt:            bot.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:            bot.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func oafBotToUpsertRequest(bot model.OAFBot) dto.OAFBotUpsertRequest {
	return dto.OAFBotUpsertRequest{
		Name:                 bot.Name,
		TwitterAccountID:     bot.TwitterAccountID,
		Occupation:           bot.Occupation,
		Industry:             bot.Industry,
		AgeRange:             bot.AgeRange,
		Gender:               bot.Gender,
		Education:            bot.Education,
		MBTI:                 bot.MBTI,
		PersonalityTags:      decodeStringList(bot.PersonalityTags),
		IdentitySummary:      bot.IdentitySummary,
		VoiceTone:            bot.VoiceTone,
		Topics:               decodeStringList(bot.Topics),
		ForbiddenTopics:      decodeStringList(bot.ForbiddenTopics),
		GrowthGoal:           bot.GrowthGoal,
		ProjectOneLiner:      bot.ProjectOneLiner,
		TargetAudience:       bot.TargetAudience,
		CoreValueProps:       bot.CoreValueProps,
		ProductFeatures:      bot.ProductFeatures,
		Differentiators:      bot.Differentiators,
		ContentPillars:       decodeStringList(bot.ContentPillars),
		ContentObjectives:    bot.ContentObjectives,
		PreferredCTA:         bot.PreferredCTA,
		WebsiteURL:           bot.WebsiteURL,
		TelegramURL:          bot.TelegramURL,
		DiscordURL:           bot.DiscordURL,
		DocsURL:              bot.DocsURL,
		CTAPolicy:            bot.CTAPolicy,
		Hashtags:             decodeStringList(bot.Hashtags),
		Keywords:             decodeStringList(bot.Keywords),
		ComplianceNotes:      bot.ComplianceNotes,
		AvoidClaims:          decodeStringList(bot.AvoidClaims),
		SafetyMode:           bot.SafetyMode,
		PrimaryLanguage:      normalizeOAFBotPrimaryLanguage(bot.PrimaryLanguage),
		LanguageStrategy:     normalizeOAFBotLanguageStrategy(bot.LanguageStrategy),
		TrendRegions:         normalizeTrendRegions(decodeStringList(bot.TrendRegions)),
		TrendCategories:      normalizeTrendCategories(decodeStringList(bot.TrendCategories)),
		AllowGeneralTrends:   bot.AllowGeneralTrends,
		SensitiveTrendPolicy: normalizeSensitiveTrendPolicy(bot.SensitiveTrendPolicy),
	}
}

func oafBotGenerationFeedbackToDTO(row model.OAFBotGenerationFeedback) dto.OAFBotGenerationFeedbackItem {
	return dto.OAFBotGenerationFeedbackItem{
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
}

func oafBotGenerationUsageToDTO(row model.AIGenerationUsage) dto.OAFBotGenerationUsageItem {
	return dto.OAFBotGenerationUsageItem{
		BotID:     row.BotID,
		Scene:     row.Scene,
		Month:     row.Month,
		Count:     row.Count,
		UpdatedAt: row.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func normalizeOAFBotPrimaryLanguage(value string) string {
	v := strings.TrimSpace(value)
	switch v {
	case "zh-CN", "zh-TW", "en", "ja", "ko", "es", "pt", "vi", "id", "de", "fr", "mixed_zh_en":
		return v
	default:
		return "zh-CN"
	}
}

func normalizeOAFBotLanguageStrategy(value string) string {
	v := strings.TrimSpace(value)
	switch v {
	case "always_primary", "follow_context", "bilingual", "mixed_style":
		return v
	default:
		return "follow_context"
	}
}

func normalizeSafetyRewriteMode(value string) string {
	switch strings.TrimSpace(value) {
	case "conservative", "shorter":
		return strings.TrimSpace(value)
	default:
		return "natural"
	}
}

func normalizeOAFBotSampleScene(value string) string {
	v := strings.TrimSpace(value)
	switch v {
	case "", "tweet":
		return "tweet"
	case "reply", "comment", "dm":
		return v
	default:
		return ""
	}
}

func sampleFeedbackScenes(scene string) []string {
	switch normalizeOAFBotSampleScene(scene) {
	case "comment":
		return []string{"comment", "auto_comment"}
	case "reply":
		return []string{"reply"}
	case "dm":
		return []string{"dm"}
	default:
		return []string{"tweet"}
	}
}

func encodeStringList(items []string) string {
	clean := make([]string, 0, len(items))
	seen := map[string]bool{}
	for _, item := range items {
		v := strings.TrimSpace(item)
		if v == "" || seen[strings.ToLower(v)] {
			continue
		}
		seen[strings.ToLower(v)] = true
		clean = append(clean, limitString(v, 80))
	}
	raw, _ := json.Marshal(clean)
	return string(raw)
}

func decodeStringList(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []string{}
	}
	return out
}

func limitString(s string, max int) string {
	s = strings.TrimSpace(s)
	if max <= 0 {
		return s
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
