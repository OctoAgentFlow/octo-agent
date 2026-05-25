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

type OAFBotService struct {
	botRepo     *repository.OAFBotRepository
	accountRepo *repository.TwitterAccountRepository
	userRepo    *repository.UserRepository
	usageRepo   *repository.AIGenerationUsageRepository
	ai          *AIService
}

func NewOAFBotService(botRepo *repository.OAFBotRepository, accountRepo *repository.TwitterAccountRepository, userRepo *repository.UserRepository, usageRepo *repository.AIGenerationUsageRepository, ai *AIService) *OAFBotService {
	return &OAFBotService{botRepo: botRepo, accountRepo: accountRepo, userRepo: userRepo, usageRepo: usageRepo, ai: ai}
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
	profile, raw, usage, err := s.ai.CompleteOAFBotProfile(ctx, completeOAFBotProfileInput(req.Draft))
	if err != nil {
		return nil, err
	}
	profile.Name = limitString(firstNonEmpty(req.Draft.Name, profile.Name), 96)
	profile.TwitterAccountID = req.Draft.TwitterAccountID
	profile.AgeRange = limitString(firstNonEmpty(req.Draft.AgeRange, profile.AgeRange), 64)
	profile.Gender = limitString(firstNonEmpty(req.Draft.Gender, profile.Gender), 64)
	profile.Education = limitString(firstNonEmpty(req.Draft.Education, profile.Education), 128)
	profile.MBTI = strings.ToUpper(limitString(firstNonEmpty(req.Draft.MBTI, profile.MBTI), 32))
	profile.SafetyMode = normalizeSafetyMode(firstNonEmpty(profile.SafetyMode, req.Draft.SafetyMode))
	profile.PrimaryLanguage = normalizeOAFBotPrimaryLanguage(firstNonEmpty(profile.PrimaryLanguage, req.Draft.PrimaryLanguage))
	profile.LanguageStrategy = normalizeOAFBotLanguageStrategy(firstNonEmpty(profile.LanguageStrategy, req.Draft.LanguageStrategy))
	profile.Occupation = limitString(firstNonEmpty(profile.Occupation, req.Draft.Occupation), 128)
	profile.Industry = limitString(firstNonEmpty(profile.Industry, req.Draft.Industry), 128)
	profile.IdentitySummary = limitString(firstNonEmpty(profile.IdentitySummary, req.Draft.IdentitySummary), 2000)
	profile.VoiceTone = limitString(firstNonEmpty(profile.VoiceTone, req.Draft.VoiceTone), 128)
	profile.GrowthGoal = limitString(firstNonEmpty(profile.GrowthGoal, req.Draft.GrowthGoal), 2000)
	profile.ProjectOneLiner = limitString(firstNonEmpty(profile.ProjectOneLiner, req.Draft.ProjectOneLiner), 1000)
	profile.TargetAudience = limitString(firstNonEmpty(profile.TargetAudience, req.Draft.TargetAudience), 2000)
	profile.CoreValueProps = limitString(firstNonEmpty(profile.CoreValueProps, req.Draft.CoreValueProps), 2000)
	profile.ProductFeatures = limitString(firstNonEmpty(profile.ProductFeatures, req.Draft.ProductFeatures), 3000)
	profile.Differentiators = limitString(firstNonEmpty(profile.Differentiators, req.Draft.Differentiators), 2000)
	profile.ContentObjectives = limitString(firstNonEmpty(profile.ContentObjectives, req.Draft.ContentObjectives), 2000)
	profile.PreferredCTA = limitString(firstNonEmpty(profile.PreferredCTA, req.Draft.PreferredCTA), 1000)
	profile.ComplianceNotes = limitString(firstNonEmpty(profile.ComplianceNotes, req.Draft.ComplianceNotes), 2000)
	profile.PersonalityTags = firstNonEmptyList(profile.PersonalityTags, req.Draft.PersonalityTags)
	profile.Topics = firstNonEmptyList(profile.Topics, req.Draft.Topics)
	profile.ForbiddenTopics = firstNonEmptyList(profile.ForbiddenTopics, req.Draft.ForbiddenTopics)
	profile.ContentPillars = firstNonEmptyList(profile.ContentPillars, req.Draft.ContentPillars)
	profile.Hashtags = firstNonEmptyList(profile.Hashtags, req.Draft.Hashtags)
	profile.Keywords = firstNonEmptyList(profile.Keywords, req.Draft.Keywords)
	profile.AvoidClaims = firstNonEmptyList(profile.AvoidClaims, req.Draft.AvoidClaims)
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

func (s *OAFBotService) TestGenerate(ctx context.Context, userID, id uint, scene string) (*dto.OAFBotTestGenerateResponse, error) {
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

func completeOAFBotProfileInput(req dto.OAFBotUpsertRequest) CompleteOAFBotProfileInput {
	return CompleteOAFBotProfileInput{
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

func normalizeSafetyMode(value string) string {
	switch strings.TrimSpace(value) {
	case "conservative", "balanced", "autopilot":
		return strings.TrimSpace(value)
	default:
		return "balanced"
	}
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
