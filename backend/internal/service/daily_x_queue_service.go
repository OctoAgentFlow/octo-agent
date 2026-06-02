package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

const (
	dailyXQueueDraftCount       = 3
	dailyXQueuePreviewSetup     = "activity.preview.dailyXQueueSetupSaved"
	dailyXQueuePreviewSource    = "activity.preview.dailyXQueueSourceSaved"
	dailyXQueuePreviewGenerated = "activity.preview.dailyXQueueGenerated"
	dailyXQueuePreviewEdited    = "activity.preview.dailyXQueueDraftEdited"
	dailyXQueuePreviewApproved  = "activity.preview.dailyXQueueDraftApproved"
	dailyXQueuePreviewRejected  = "activity.preview.dailyXQueueDraftRejected"
	dailyXQueuePreviewRewritten = "activity.preview.dailyXQueueDraftRewritten"
	dailyXQueuePreviewCopied    = "activity.preview.dailyXQueueDraftCopied"
	dailyXQueuePreviewActivated = "daily_x_queue_activated"
	dailyXQueueSceneTweet       = "tweet"
)

var (
	ErrDailyXQueueSetupRequired    = errors.New("daily x queue setup is required")
	ErrDailyXQueueSourceRequired   = errors.New("source material is required")
	ErrDailyXQueueRejectReason     = errors.New("reject reason is required")
	ErrDailyXQueueDraftUnsupported = errors.New("draft is not available in daily x queue")
)

type dailyXQueueTextGenerator func(context.Context, GenerateAutoPostInput) (AIGeneratedText, error)
type dailyXQueueRewriteGenerator func(context.Context, GenerateAutoPostInput, string, string, string) (AIGeneratedText, error)

type DailyXQueueService struct {
	contextRepo  *repository.DailyXQueueContextRepository
	botRepo      *repository.OAFBotRepository
	contentRepo  *repository.ContentLibraryRepository
	draftRepo    *repository.AutoPostDraftRepository
	usageRepo    *repository.AIGenerationUsageRepository
	feedbackRepo *repository.OAFBotGenerationFeedbackRepository
	activityRepo *repository.ActivityRepository
	verdictRepo  *repository.ReviewQueueFeedbackIssueVerdictRepository
	prefRepo     *repository.OAFBotLearningRulePreferenceRepository
	oafBot       *OAFBotService
	ai           *AIService

	generateText dailyXQueueTextGenerator
	rewriteText  dailyXQueueRewriteGenerator
}

func NewDailyXQueueService(contextRepo *repository.DailyXQueueContextRepository, botRepo *repository.OAFBotRepository, contentRepo *repository.ContentLibraryRepository, draftRepo *repository.AutoPostDraftRepository, usageRepo *repository.AIGenerationUsageRepository, feedbackRepo *repository.OAFBotGenerationFeedbackRepository, activityRepo *repository.ActivityRepository, verdictRepo *repository.ReviewQueueFeedbackIssueVerdictRepository, prefRepo *repository.OAFBotLearningRulePreferenceRepository, oafBot *OAFBotService, ai *AIService) *DailyXQueueService {
	return &DailyXQueueService{
		contextRepo:  contextRepo,
		botRepo:      botRepo,
		contentRepo:  contentRepo,
		draftRepo:    draftRepo,
		usageRepo:    usageRepo,
		feedbackRepo: feedbackRepo,
		activityRepo: activityRepo,
		verdictRepo:  verdictRepo,
		prefRepo:     prefRepo,
		oafBot:       oafBot,
		ai:           ai,
	}
}

func (s *DailyXQueueService) Overview(userID uint) (*dto.DailyXQueueOverviewResponse, error) {
	ctxRow, err := s.latestContext(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &dto.DailyXQueueOverviewResponse{Drafts: []dto.DailyXQueueDraftItem{}}, nil
		}
		return nil, err
	}
	return s.overviewForContext(userID, ctxRow)
}

func (s *DailyXQueueService) Setup(ctx context.Context, userID uint, req dto.DailyXQueueSetupRequest) (*dto.DailyXQueueSetupResponse, error) {
	handle := normalizeDailyXHandleForService(req.XHandle)
	if handle == "" {
		return nil, fmt.Errorf("x_handle is required")
	}
	draft := dto.OAFBotUpsertRequest{
		Name:              defaultDailyBotName(handle),
		TwitterAccountID:  0,
		ProjectOneLiner:   strings.TrimSpace(req.ProductContext),
		WebsiteURL:        strings.TrimSpace(req.WebsiteURL),
		TargetAudience:    strings.TrimSpace(req.TargetAudience),
		VoiceTone:         strings.TrimSpace(req.VoicePreference),
		GrowthGoal:        "Generate a practical daily X operating queue for this account.",
		ComplianceNotes:   strings.TrimSpace(req.Guardrails),
		AvoidClaims:       splitDailyGuardrails(req.Guardrails),
		SafetyMode:        "balanced",
		PrimaryLanguage:   "en",
		LanguageStrategy:  "follow_context",
		ContentObjectives: "Create reviewable X post drafts grounded in the provided product context.",
	}
	// Setup is the first-value save step. Keep it deterministic and fast; LLM calls
	// happen during queue generation/rewrite where waiting is expected.
	bot, err := s.upsertDailyBot(userID, handle, draft)
	if err != nil {
		return nil, err
	}
	row := &model.DailyXQueueContext{
		UserID:          userID,
		XHandle:         handle,
		WebsiteURL:      strings.TrimSpace(req.WebsiteURL),
		ProductContext:  strings.TrimSpace(req.ProductContext),
		TargetAudience:  strings.TrimSpace(req.TargetAudience),
		VoicePreference: strings.TrimSpace(req.VoicePreference),
		Guardrails:      strings.TrimSpace(req.Guardrails),
		BotID:           bot.ID,
	}
	if err := s.contextRepo.Upsert(row); err != nil {
		return nil, err
	}
	row, err = s.contextRepo.GetByUserAndHandle(userID, handle)
	if err != nil {
		return nil, err
	}
	_ = s.recordActivity(userID, 0, "system", "review", dailyXQueuePreviewSetup, "@"+handle, "Daily X Queue setup saved.")
	return &dto.DailyXQueueSetupResponse{Context: dailyXContextToDTO(*row), Bot: oafBotToDTO(*bot)}, nil
}

func (s *DailyXQueueService) SaveSourceMaterial(userID uint, req dto.DailyXQueueSourceMaterialRequest) (*dto.DailyXQueueSourceMaterialResponse, error) {
	ctxRow, err := s.latestContext(userID)
	if err != nil {
		return nil, ErrDailyXQueueSetupRequired
	}
	item := &model.ContentLibraryItem{
		UserID:        userID,
		Title:         limitString(strings.TrimSpace(req.Title), 160),
		ItemType:      normalizeContentLibraryType("idea"),
		Body:          strings.TrimSpace(req.Body),
		SourceURL:     limitString(req.SourceURL, 512),
		Topics:        encodeStringList(req.Topics),
		GrowthGoal:    limitString(req.GrowthGoal, 512),
		CTAPreference: limitString(req.CTAPreference, 256),
		Priority:      50,
		Status:        "active",
	}
	if ctxRow.BotID > 0 {
		botID := ctxRow.BotID
		item.BotID = &botID
	}
	if item.Title == "" || item.Body == "" {
		return nil, ErrDailyXQueueSourceRequired
	}
	if err := s.contentRepo.Create(item); err != nil {
		return nil, err
	}
	ctxRow.ContentLibraryID = item.ID
	if err := s.contextRepo.Save(ctxRow); err != nil {
		return nil, err
	}
	_ = s.recordActivity(userID, 0, "system", "review", dailyXQueuePreviewSource, "@"+ctxRow.XHandle, "Daily X Queue source material saved.")
	out := contentLibraryItemToDTO(*item)
	return &dto.DailyXQueueSourceMaterialResponse{Context: dailyXContextToDTO(*ctxRow), SourceMaterial: out}, nil
}

func (s *DailyXQueueService) Generate(ctx context.Context, userID uint) (*dto.DailyXQueueGenerateResponse, error) {
	ctxRow, err := s.latestContext(userID)
	if err != nil || ctxRow.BotID == 0 {
		return nil, ErrDailyXQueueSetupRequired
	}
	if ctxRow.ContentLibraryID == 0 {
		return nil, ErrDailyXQueueSourceRequired
	}
	bot, err := s.botRepo.GetByUserAndID(userID, ctxRow.BotID)
	if err != nil {
		return nil, err
	}
	content, err := s.contentRepo.GetByUserAndID(userID, ctxRow.ContentLibraryID)
	if err != nil {
		return nil, err
	}
	feedbackRows := s.feedbackRows(userID, bot.ID)
	var learningRules []dto.OAFBotAppliedLearningRule
	baseSignals := feedbackSignalsFromRows(feedbackRows)
	feedbackSignals, learningRules := appendFeedbackLearningSignalsWithRules(baseSignals, s.verdictRepo, s.prefRepo, userID, bot.ID, dailyXQueueSceneTweet, nil)
	directions := dailyXQueueDirections(content.Title)
	drafts := make([]dto.DailyXQueueDraftItem, 0, dailyXQueueDraftCount)
	for i, direction := range directions {
		in := s.generateInput(ctxRow, bot, content, direction, feedbackSignals)
		generated, err := s.callGenerateText(ctx, in)
		if err != nil {
			return nil, err
		}
		now := time.Now().UTC()
		text := fitXPostForAutoPost(generated.Text, xSubscriptionTierUnknown, autoPostLengthModeStandard)
		risk := evaluateAutoCommentRisk(text, bot, nil)
		draft := &model.AutoPostDraft{
			UserID:           userID,
			PlanID:           0,
			BotID:            bot.ID,
			XAccountID:       0,
			ContentLibraryID: content.ID,
			ContentDirection: truncateRunes(direction, 512),
			ContentHash:      autoPostContentHash(text),
			GeneratedContent: text,
			Status:           "pending_review",
			RiskLevel:        risk.Level,
			CapabilityStatus: "daily_x_queue_review",
			FailureCategory:  risk.Category,
			FailureReason:    risk.Reason,
			ApprovalRequired: true,
			GeneratedAt:      &now,
		}
		if err := s.draftRepo.Create(draft); err != nil {
			return nil, err
		}
		if err := recordAIGenerationUsage(s.usageRepo, userID, bot.ID, repository.AIGenerationSceneAutoPost, now, generated.Usage); err != nil {
			return nil, err
		}
		item := s.toDailyDraftItem(*draft)
		item.WhyGenerated = directions[i]
		item.FeedbackSignalCount = len(feedbackSignals)
		item.FeedbackSignalSummary = feedbackSignalSummaryFromRowsAndRules(feedbackRows, learningRules)
		drafts = append(drafts, item)
	}
	_ = s.recordActivity(userID, 0, "post", "review", dailyXQueuePreviewGenerated, "@"+ctxRow.XHandle, "Daily X Queue generated exactly 3 post drafts.")
	return &dto.DailyXQueueGenerateResponse{
		Context:              dailyXContextToDTO(*ctxRow),
		Drafts:               drafts,
		LearningAppliedCount: len(feedbackSignals),
		LearningSummary:      dailyLearningSummary(feedbackRows, learningRules),
	}, nil
}

func (s *DailyXQueueService) UpdateDraft(userID, id uint, content string) (*dto.DailyXQueueActionResponse, error) {
	draft, err := s.dailyDraft(userID, id)
	if err != nil {
		return nil, err
	}
	original := draft.GeneratedContent
	draft.GeneratedContent = fitXPostForAutoPost(content, xSubscriptionTierUnknown, autoPostLengthModeStandard)
	draft.ContentHash = autoPostContentHash(draft.GeneratedContent)
	if draft.Status == "approved" {
		draft.Status = "pending_review"
		draft.ApprovedAt = nil
		draft.ApprovalRequired = true
	}
	if err := s.draftRepo.Save(draft); err != nil {
		return nil, err
	}
	_ = s.createFeedback(userID, draft.BotID, "negative", []string{"edited"}, "User edited this draft. Prefer the edited version in future queues.", original, draft.GeneratedContent)
	_ = s.recordActivity(userID, 0, "post", "review", dailyXQueuePreviewEdited, "", fmt.Sprintf("Daily X Queue draft edited; draft_id=%d; edit captured for future queues.", draft.ID))
	return s.actionResponse(userID, *draft, "Edit captured for future queues.")
}

func (s *DailyXQueueService) ApproveDraft(userID, id uint) (*dto.DailyXQueueActionResponse, error) {
	draft, err := s.dailyDraft(userID, id)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	draft.Status = "approved"
	draft.ApprovedAt = &now
	draft.ApprovalRequired = false
	if err := s.draftRepo.Save(draft); err != nil {
		return nil, err
	}
	_ = s.recordActivity(userID, 0, "post", "success", dailyXQueuePreviewApproved, "", fmt.Sprintf("Daily X Queue draft approved; draft_id=%d. No publish job was created.", draft.ID))
	return s.actionResponse(userID, *draft, "")
}

func (s *DailyXQueueService) RejectDraft(userID, id uint, reason string) (*dto.DailyXQueueActionResponse, error) {
	normalized := normalizeDailyRejectReason(reason)
	if normalized == "" {
		return nil, ErrDailyXQueueRejectReason
	}
	draft, err := s.dailyDraft(userID, id)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	draft.Status = "rejected"
	draft.RejectedAt = &now
	draft.FailureReason = normalized
	if err := s.draftRepo.Save(draft); err != nil {
		return nil, err
	}
	_ = s.createFeedback(userID, draft.BotID, "negative", []string{normalized}, "Rejected from Daily X Queue: "+normalized, draft.ContentDirection, draft.GeneratedContent)
	_ = s.recordActivity(userID, 0, "post", "review", dailyXQueuePreviewRejected, "", fmt.Sprintf("Daily X Queue draft rejected; draft_id=%d; reason=%s", draft.ID, normalized))
	return s.actionResponse(userID, *draft, "")
}

func (s *DailyXQueueService) RewriteDraft(ctx context.Context, userID, id uint, req dto.DailyXQueueDraftRewriteRequest) (*dto.DailyXQueueActionResponse, error) {
	draft, err := s.dailyDraft(userID, id)
	if err != nil {
		return nil, err
	}
	ctxRow, err := s.contextForDraft(userID, draft.BotID)
	if err != nil {
		return nil, err
	}
	bot, err := s.botRepo.GetByUserAndID(userID, draft.BotID)
	if err != nil {
		return nil, err
	}
	var content *model.ContentLibraryItem
	if draft.ContentLibraryID > 0 {
		content, _ = s.contentRepo.GetByUserAndID(userID, draft.ContentLibraryID)
	}
	in := s.generateInput(ctxRow, bot, content, draft.ContentDirection, feedbackSignalsFromRows(s.feedbackRows(userID, bot.ID)))
	generated, err := s.callRewriteText(ctx, in, draft.GeneratedContent, firstNonEmpty(req.RewriteMode, "more_specific"), req.Feedback)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	text := fitXPostForAutoPost(generated.Text, xSubscriptionTierUnknown, autoPostLengthModeStandard)
	risk := evaluateAutoCommentRisk(text, bot, nil)
	draft.GeneratedContent = text
	draft.ContentHash = autoPostContentHash(text)
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
	_ = recordAIGenerationUsage(s.usageRepo, userID, draft.BotID, repository.AIGenerationSceneAutoPost, now, generated.Usage)
	_ = s.recordActivity(userID, 0, "post", "review", dailyXQueuePreviewRewritten, "", fmt.Sprintf("Daily X Queue draft rewritten; draft_id=%d.", draft.ID))
	return s.actionResponse(userID, *draft, "")
}

func (s *DailyXQueueService) CopyDraft(userID, id uint) (*dto.DailyXQueueActionResponse, error) {
	draft, err := s.dailyDraft(userID, id)
	if err != nil {
		return nil, err
	}
	_ = s.recordActivity(userID, 0, "post", "success", dailyXQueuePreviewCopied, "", fmt.Sprintf("Daily X Queue draft copied; draft_id=%d.", draft.ID))
	return s.actionResponse(userID, *draft, "")
}

func (s *DailyXQueueService) latestContext(userID uint) (*model.DailyXQueueContext, error) {
	return s.contextRepo.LatestByUser(userID)
}

func (s *DailyXQueueService) overviewForContext(userID uint, ctxRow *model.DailyXQueueContext) (*dto.DailyXQueueOverviewResponse, error) {
	var botDTO *dto.OAFBotItem
	if ctxRow.BotID > 0 {
		if bot, err := s.botRepo.GetByUserAndID(userID, ctxRow.BotID); err == nil {
			item := oafBotToDTO(*bot)
			botDTO = &item
		}
	}
	var sourceDTO *dto.ContentLibraryItem
	if ctxRow.ContentLibraryID > 0 {
		if item, err := s.contentRepo.GetByUserAndID(userID, ctxRow.ContentLibraryID); err == nil {
			out := contentLibraryItemToDTO(*item)
			sourceDTO = &out
		}
	}
	drafts, err := s.dailyDrafts(userID, ctxRow.BotID)
	if err != nil {
		return nil, err
	}
	reviewActions, approvedOrCopied := s.activationCounts(userID)
	return &dto.DailyXQueueOverviewResponse{
		Context:              ptrDailyXContextToDTO(ctxRow),
		Bot:                  botDTO,
		SourceMaterial:       sourceDTO,
		Drafts:               drafts,
		ReviewActionsCount:   reviewActions,
		ApprovedOrCopied:     approvedOrCopied,
		Activated:            ctxRow.Activated,
		LearningAppliedCount: len(feedbackSignalsFromRows(s.feedbackRows(userID, ctxRow.BotID))),
		LearningSummary:      dailyLearningSummary(s.feedbackRows(userID, ctxRow.BotID), nil),
	}, nil
}

func (s *DailyXQueueService) upsertDailyBot(userID uint, handle string, req dto.OAFBotUpsertRequest) (*model.OAFBot, error) {
	if existing, err := s.botRepo.GetByUserAndTwitterAccountID(userID, 0); err == nil {
		applyOAFBotRequest(existing, req)
		existing.TwitterAccountID = 0
		if err := s.botRepo.Save(existing); err != nil {
			return nil, err
		}
		return existing, nil
	}
	bot := &model.OAFBot{UserID: userID}
	applyOAFBotRequest(bot, req)
	bot.Name = firstNonEmpty(bot.Name, defaultDailyBotName(handle))
	bot.TwitterAccountID = 0
	if err := s.botRepo.Create(bot); err != nil {
		return nil, err
	}
	return bot, nil
}

func (s *DailyXQueueService) dailyDraft(userID, id uint) (*model.AutoPostDraft, error) {
	draft, err := s.draftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if draft.XAccountID != 0 || draft.PlanID != 0 {
		return nil, ErrDailyXQueueDraftUnsupported
	}
	return draft, nil
}

func (s *DailyXQueueService) dailyDrafts(userID, botID uint) ([]dto.DailyXQueueDraftItem, error) {
	rows, err := s.draftRepo.ListByUser(userID, 30)
	if err != nil {
		return nil, err
	}
	out := make([]dto.DailyXQueueDraftItem, 0, dailyXQueueDraftCount)
	for _, row := range rows {
		if row.PlanID != 0 || row.XAccountID != 0 || (botID > 0 && row.BotID != botID) {
			continue
		}
		out = append(out, s.toDailyDraftItem(row))
		if len(out) >= dailyXQueueDraftCount {
			break
		}
	}
	return out, nil
}

func (s *DailyXQueueService) toDailyDraftItem(row model.AutoPostDraft) dto.DailyXQueueDraftItem {
	item := dto.AutoPostDraftItem{
		ID:               row.ID,
		UserID:           row.UserID,
		PlanID:           row.PlanID,
		BotID:            row.BotID,
		XAccountID:       row.XAccountID,
		ContentLibraryID: row.ContentLibraryID,
		ContentTitle:     s.contentTitle(row.UserID, row.ContentLibraryID),
		ContentDirection: row.ContentDirection,
		ContentHash:      row.ContentHash,
		GeneratedContent: row.GeneratedContent,
		Status:           row.Status,
		RiskLevel:        row.RiskLevel,
		CapabilityStatus: row.CapabilityStatus,
		FailureCategory:  row.FailureCategory,
		FailureReason:    row.FailureReason,
		ApprovalRequired: row.ApprovalRequired,
		CreatedAt:        row.CreatedAt.UTC().Format(timeRFC3339),
		GeneratedAt:      formatOptionalTime(row.GeneratedAt),
		ApprovedAt:       formatOptionalTime(row.ApprovedAt),
		RejectedAt:       formatOptionalTime(row.RejectedAt),
		PublishedAt:      formatOptionalTime(row.PublishedAt),
	}
	return dto.DailyXQueueDraftItem{
		AutoPostDraftItem: item,
		WhyGenerated:      row.ContentDirection,
		SourceUsed:        s.contentTitle(row.UserID, row.ContentLibraryID),
		CopiedCount:       s.copyCount(row.UserID),
	}
}

func (s *DailyXQueueService) contentTitle(userID, contentID uint) string {
	if contentID == 0 {
		return ""
	}
	if item, err := s.contentRepo.GetByUserAndID(userID, contentID); err == nil {
		return item.Title
	}
	return ""
}

func (s *DailyXQueueService) contextForDraft(userID, botID uint) (*model.DailyXQueueContext, error) {
	ctxRow, err := s.latestContext(userID)
	if err == nil && (botID == 0 || ctxRow.BotID == botID) {
		return ctxRow, nil
	}
	return nil, err
}

func (s *DailyXQueueService) generateInput(ctxRow *model.DailyXQueueContext, bot *model.OAFBot, content *model.ContentLibraryItem, direction string, feedbackSignals []string) GenerateAutoPostInput {
	in := GenerateAutoPostInput{
		AccountHandle:     formatXAccountHandle(ctxRow.XHandle),
		ContentDirection:  direction,
		ContentLengthMode: autoPostLengthModeStandard,
		MaxCharacters:     autoPostDraftMaxFor(xSubscriptionTierUnknown, autoPostLengthModeStandard),
		FeedbackSignals:   feedbackSignals,
		HasBot:            true,
		Name:              bot.Name,
		Occupation:        bot.Occupation,
		Industry:          bot.Industry,
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
		CTAPolicy:         bot.CTAPolicy,
		Hashtags:          decodeStringList(bot.Hashtags),
		Keywords:          decodeStringList(bot.Keywords),
		ComplianceNotes:   bot.ComplianceNotes,
		AvoidClaims:       decodeStringList(bot.AvoidClaims),
		SafetyMode:        bot.SafetyMode,
		PrimaryLanguage:   bot.PrimaryLanguage,
		LanguageStrategy:  bot.LanguageStrategy,
	}
	if content != nil {
		in.ContentItemTitle = content.Title
		in.ContentItemType = content.ItemType
		in.ContentItemBody = content.Body
		in.ContentItemURL = content.SourceURL
		in.ContentItemTopics = decodeStringList(content.Topics)
		in.ContentItemGoal = content.GrowthGoal
		in.ContentItemCTA = content.CTAPreference
	}
	return in
}

func (s *DailyXQueueService) feedbackRows(userID, botID uint) []model.OAFBotGenerationFeedback {
	if s.feedbackRepo == nil || botID == 0 {
		return nil
	}
	rows, err := s.feedbackRepo.ListRecentNegativeByUserBotScene(userID, botID, dailyXQueueSceneTweet, 8)
	if err != nil {
		return nil
	}
	return rows
}

func (s *DailyXQueueService) callGenerateText(ctx context.Context, in GenerateAutoPostInput) (AIGeneratedText, error) {
	if s.generateText != nil {
		return s.generateText(ctx, in)
	}
	if s.ai == nil {
		return AIGeneratedText{}, fmt.Errorf("ai service is not configured")
	}
	return s.ai.GenerateAutoPost(ctx, in)
}

func (s *DailyXQueueService) callRewriteText(ctx context.Context, in GenerateAutoPostInput, original string, mode string, feedback string) (AIGeneratedText, error) {
	if s.rewriteText != nil {
		return s.rewriteText(ctx, in, original, mode, feedback)
	}
	if s.ai == nil {
		return AIGeneratedText{}, fmt.Errorf("ai service is not configured")
	}
	return s.ai.RewriteAutoPost(ctx, in, original, mode, feedback)
}

func (s *DailyXQueueService) createFeedback(userID, botID uint, rating string, issueTags []string, comment string, sampleContext string, generatedContent string) error {
	if s.feedbackRepo == nil || botID == 0 {
		return nil
	}
	return s.feedbackRepo.Create(&model.OAFBotGenerationFeedback{
		UserID:           userID,
		BotID:            botID,
		Scene:            dailyXQueueSceneTweet,
		Rating:           rating,
		IssueTags:        encodeStringList(issueTags),
		Comment:          truncateRunes(comment, 1000),
		SampleContext:    truncateRunes(sampleContext, 1000),
		GeneratedContent: truncateRunes(generatedContent, 2000),
		Provider:         "daily_x_queue",
	})
}

func (s *DailyXQueueService) actionResponse(userID uint, draft model.AutoPostDraft, message string) (*dto.DailyXQueueActionResponse, error) {
	activated := s.maybeRecordActivation(userID)
	reviewActions, approvedOrCopied := s.activationCounts(userID)
	return &dto.DailyXQueueActionResponse{
		Draft:              s.toDailyDraftItem(draft),
		ReviewActionsCount: reviewActions,
		ApprovedOrCopied:   approvedOrCopied,
		Activated:          activated,
		Message:            message,
	}, nil
}

func (s *DailyXQueueService) maybeRecordActivation(userID uint) bool {
	ctxRow, err := s.latestContext(userID)
	if err != nil || ctxRow.Activated {
		return ctxRow != nil && ctxRow.Activated
	}
	generated, _ := s.activityRepo.ExistsByPreviewKeySince(userID, dailyXQueuePreviewGenerated, time.Time{})
	if !generated {
		return false
	}
	drafts, err := s.dailyDrafts(userID, ctxRow.BotID)
	if err != nil || len(drafts) < dailyXQueueDraftCount {
		return false
	}
	reviewActions, approvedOrCopied := s.activationCounts(userID)
	if reviewActions < 3 || approvedOrCopied < 1 {
		return false
	}
	logID := s.recordActivity(userID, 0, "system", "success", dailyXQueuePreviewActivated, "@"+ctxRow.XHandle, "daily_x_queue_activated")
	ctxRow.Activated = true
	ctxRow.ActivatedActivity = logID
	_ = s.contextRepo.Save(ctxRow)
	return true
}

func (s *DailyXQueueService) activationCounts(userID uint) (int64, int64) {
	if s.activityRepo == nil {
		return 0, 0
	}
	reviewKeys := []string{dailyXQueuePreviewEdited, dailyXQueuePreviewApproved, dailyXQueuePreviewRejected, dailyXQueuePreviewRewritten, dailyXQueuePreviewCopied}
	approvedKeys := []string{dailyXQueuePreviewApproved, dailyXQueuePreviewCopied}
	reviews, _ := s.activityRepo.CountByPreviewKeysSince(userID, reviewKeys, time.Time{})
	approved, _ := s.activityRepo.CountByPreviewKeysSince(userID, approvedKeys, time.Time{})
	return reviews, approved
}

func (s *DailyXQueueService) copyCount(userID uint) int64 {
	if s.activityRepo == nil {
		return 0
	}
	n, _ := s.activityRepo.CountByPreviewKeysSince(userID, []string{dailyXQueuePreviewCopied}, time.Time{})
	return n
}

func (s *DailyXQueueService) recordActivity(userID, accountID uint, typ string, status string, previewKey string, handle string, message string) uint {
	if s.activityRepo == nil || s.activityRepo.DB == nil {
		return 0
	}
	log := &model.ActivityLog{
		UserID:        userID,
		XAccountID:    accountID,
		Type:          typ,
		Status:        status,
		PreviewKey:    previewKey,
		AccountHandle: truncateRunes(handle, 128),
		ExecutedAt:    time.Now().UTC(),
		ErrorMessage:  truncateRunes(message, 1024),
	}
	if log.AccountHandle == "" {
		log.AccountHandle = "Daily X Queue"
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		return 0
	}
	return log.ID
}

func dailyXContextToDTO(row model.DailyXQueueContext) dto.DailyXQueueContextItem {
	return dto.DailyXQueueContextItem{
		ID:               row.ID,
		XHandle:          row.XHandle,
		WebsiteURL:       row.WebsiteURL,
		ProductContext:   row.ProductContext,
		TargetAudience:   row.TargetAudience,
		VoicePreference:  row.VoicePreference,
		Guardrails:       row.Guardrails,
		BotID:            row.BotID,
		ContentLibraryID: row.ContentLibraryID,
		Activated:        row.Activated,
	}
}

func ptrDailyXContextToDTO(row *model.DailyXQueueContext) *dto.DailyXQueueContextItem {
	if row == nil {
		return nil
	}
	out := dailyXContextToDTO(*row)
	return &out
}

func normalizeDailyXHandleForService(handle string) string {
	return strings.ToLower(strings.TrimPrefix(strings.TrimSpace(handle), "@"))
}

func defaultDailyBotName(handle string) string {
	if strings.TrimSpace(handle) == "" {
		return "Daily X Queue OAF Bot"
	}
	return "@" + strings.TrimPrefix(strings.TrimSpace(handle), "@") + " OAF Bot"
}

func splitDailyGuardrails(value string) []string {
	parts := strings.FieldsFunc(value, func(r rune) bool {
		return r == ',' || r == '\n' || r == ';'
	})
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func dailyXQueueDirections(sourceTitle string) []string {
	source := strings.TrimSpace(sourceTitle)
	if source == "" {
		source = "the provided source material"
	}
	return []string{
		"Product value: explain the concrete value in " + source + " for the target audience.",
		"User pain point: name the daily X operations problem this product helps solve.",
		"Operational proof: show how the workflow works using the provided source material.",
	}
}

func normalizeDailyRejectReason(reason string) string {
	switch strings.TrimSpace(strings.ToLower(reason)) {
	case "irrelevant", "too_salesy", "wrong_tone", "fact_risk", "weak_context", "duplicate", "other":
		return strings.TrimSpace(strings.ToLower(reason))
	default:
		return ""
	}
}

func dailyLearningSummary(rows []model.OAFBotGenerationFeedback, rules []dto.OAFBotAppliedLearningRule) string {
	count := len(rows) + len(rules)
	if count == 0 {
		return ""
	}
	return fmt.Sprintf("Applied %d learning signal(s) from prior edits or rejections.", count)
}
