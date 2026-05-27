package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	botRepo      *repository.OAFBotRepository
	accountRepo  *repository.TwitterAccountRepository
	userRepo     *repository.UserRepository
	usageRepo    *repository.AIGenerationUsageRepository
	feedbackRepo *repository.OAFBotGenerationFeedbackRepository
	ai           *AIService
}

func NewOAFBotService(botRepo *repository.OAFBotRepository, accountRepo *repository.TwitterAccountRepository, userRepo *repository.UserRepository, usageRepo *repository.AIGenerationUsageRepository, feedbackRepo *repository.OAFBotGenerationFeedbackRepository, ai *AIService) *OAFBotService {
	return &OAFBotService{botRepo: botRepo, accountRepo: accountRepo, userRepo: userRepo, usageRepo: usageRepo, feedbackRepo: feedbackRepo, ai: ai}
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

func (s *OAFBotService) Get(userID, id uint) (*dto.OAFBotItem, error) {
	bot, err := s.botRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	item := oafBotToDTO(*bot)
	return &item, nil
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

func (s *OAFBotService) TestGenerate(ctx context.Context, userID, id uint, scene string, sampleContext string) (*dto.OAFBotTestGenerateResponse, error) {
	bot, err := s.botRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	scene = normalizeOAFBotSampleScene(scene)
	if scene == "" {
		return nil, fmt.Errorf("invalid sample scene")
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	out, usage, err := s.ai.GenerateOAFBotSamples(ctx, GenerateOAFBotSamplesInput{
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
		Hashtags:          decodeStringList(bot.Hashtags),
		Keywords:          decodeStringList(bot.Keywords),
		ComplianceNotes:   bot.ComplianceNotes,
		AvoidClaims:       decodeStringList(bot.AvoidClaims),
		SafetyMode:        bot.SafetyMode,
		PrimaryLanguage:   normalizeOAFBotPrimaryLanguage(bot.PrimaryLanguage),
		LanguageStrategy:  normalizeOAFBotLanguageStrategy(bot.LanguageStrategy),
	})
	if err != nil {
		return nil, err
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, bot.ID, repository.AIGenerationSceneOAFBotTestGenerate, now, usage); err != nil {
		return nil, err
	}
	out.BotID = bot.ID
	out.UsageConsumed = 1
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
		items = append(items, dto.OAFBotGenerationUsageItem{
			BotID:     row.BotID,
			Scene:     row.Scene,
			Month:     row.Month,
			Count:     row.Count,
			UpdatedAt: row.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}
	return &dto.OAFBotGenerationUsageResponse{Items: items}, nil
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
	rows, err := s.feedbackRepo.ListRecentByUserBot(userID, id, 10)
	if err != nil {
		return nil, err
	}
	items := make([]dto.OAFBotGenerationFeedbackItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, oafBotGenerationFeedbackToDTO(row))
	}
	return &dto.OAFBotGenerationFeedbackResponse{Items: items}, nil
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
		ID:                bot.ID,
		Name:              bot.Name,
		TwitterAccountID:  bot.TwitterAccountID,
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
		Hashtags:          decodeStringList(bot.Hashtags),
		Keywords:          decodeStringList(bot.Keywords),
		ComplianceNotes:   bot.ComplianceNotes,
		AvoidClaims:       decodeStringList(bot.AvoidClaims),
		SafetyMode:        bot.SafetyMode,
		PrimaryLanguage:   normalizeOAFBotPrimaryLanguage(bot.PrimaryLanguage),
		LanguageStrategy:  normalizeOAFBotLanguageStrategy(bot.LanguageStrategy),
		CreatedAt:         bot.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:         bot.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func oafBotToUpsertRequest(bot model.OAFBot) dto.OAFBotUpsertRequest {
	return dto.OAFBotUpsertRequest{
		Name:              bot.Name,
		TwitterAccountID:  bot.TwitterAccountID,
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
		Hashtags:          decodeStringList(bot.Hashtags),
		Keywords:          decodeStringList(bot.Keywords),
		ComplianceNotes:   bot.ComplianceNotes,
		AvoidClaims:       decodeStringList(bot.AvoidClaims),
		SafetyMode:        bot.SafetyMode,
		PrimaryLanguage:   normalizeOAFBotPrimaryLanguage(bot.PrimaryLanguage),
		LanguageStrategy:  normalizeOAFBotLanguageStrategy(bot.LanguageStrategy),
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
