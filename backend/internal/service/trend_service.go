package service

import (
	"context"
	"errors"
	"regexp"
	"sort"
	"strings"
	"time"

	"octo-agent/backend/internal/alert"
	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
)

var (
	ErrInvalidTrendFeedbackRating = errors.New("invalid trend feedback rating")
	ErrInvalidTrendFeedbackName   = errors.New("trend_name is required")
)

type TrendService struct {
	repo                 *repository.TrendTopicRepository
	exposure             *repository.ExposureTweetSignalRepository
	feedback             *repository.TrendFeedbackRepository
	botRepo              *repository.OAFBotRepository
	contentDraftPlanRepo *repository.ContentDraftPlanRepository
	contentRepo          *repository.ContentLibraryRepository
	commentRepo          *repository.AutoCommentTaskRepository
	generationFeedback   *repository.OAFBotGenerationFeedbackRepository
	cfg                  config.XTrendsConfig
}

type trendSyncResult struct {
	Enabled       bool
	SyncedRegions int
	SyncedTopics  int
	SkippedReason string
}

func NewTrendService(repo *repository.TrendTopicRepository, exposure *repository.ExposureTweetSignalRepository, feedback *repository.TrendFeedbackRepository, botRepo *repository.OAFBotRepository, contentDraftPlanRepo *repository.ContentDraftPlanRepository, contentRepo *repository.ContentLibraryRepository, cfg config.XTrendsConfig) *TrendService {
	return &TrendService{repo: repo, exposure: exposure, feedback: feedback, botRepo: botRepo, contentDraftPlanRepo: contentDraftPlanRepo, contentRepo: contentRepo, cfg: cfg}
}

func (s *TrendService) WithAutoCommentTaskRepository(repo *repository.AutoCommentTaskRepository) *TrendService {
	if s != nil {
		s.commentRepo = repo
	}
	return s
}

func (s *TrendService) WithOAFBotGenerationFeedbackRepository(repo *repository.OAFBotGenerationFeedbackRepository) *TrendService {
	if s != nil {
		s.generationFeedback = repo
	}
	return s
}

func (s *TrendService) ListTopics(query dto.TrendTopicQuery, now time.Time) (*dto.TrendTopicListResponse, error) {
	if s == nil || s.repo == nil {
		return &dto.TrendTopicListResponse{Items: []dto.TrendTopicItem{}}, nil
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	rows, err := s.repo.List(repository.TrendTopicListQuery{
		WOEID:     query.WOEID,
		Region:    query.Region,
		Category:  query.Category,
		RiskLevel: query.RiskLevel,
		ActiveAt:  now,
		Limit:     query.Limit,
	})
	if err != nil {
		return nil, err
	}
	items := make([]dto.TrendTopicItem, 0, len(rows))
	for i := range rows {
		items = append(items, trendTopicToDTO(&rows[i]))
	}
	return &dto.TrendTopicListResponse{Items: items}, nil
}

func (s *TrendService) SelectForBot(userID uint, query dto.TrendSelectionQuery, now time.Time) (*dto.TrendSelectionResponse, error) {
	if s == nil || s.repo == nil {
		return &dto.TrendSelectionResponse{Items: []dto.TrendTopicItem{}}, nil
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	pref, bot, plan, err := s.trendPreference(userID, query)
	if err != nil {
		return nil, err
	}
	limit := query.Limit
	if limit <= 0 || limit > 10 {
		limit = 3
	}
	if len(pref.Regions) == 0 {
		pref.Regions = []string{"1", "23424977"}
	}
	pref.ExcludedNames = append(pref.ExcludedNames, s.recentNegativeTrendNames(userID, botIDFromTrendContext(bot, plan))...)
	candidates := make([]model.TrendTopic, 0, 100)
	for _, region := range pref.Regions {
		rows, err := s.repo.List(repository.TrendTopicListQuery{WOEID: region, ActiveAt: now, Limit: 100})
		if err != nil {
			return nil, err
		}
		candidates = append(candidates, rows...)
	}
	keywords := s.trendRelevanceKeywords(userID, bot, plan)
	qualitySignals := s.trendQualitySignals()
	selected := selectRelevantTrendTopics(candidates, pref, keywords, qualitySignals, limit)
	items := make([]dto.TrendTopicItem, 0, len(selected))
	for i := range selected {
		item := trendTopicToDTO(&selected[i])
		item.MatchedKeywords = trendMatchedKeywords(selected[i], keywords)
		item.RelevanceReason = trendRelevanceReason(selected[i], pref, item.MatchedKeywords, qualitySignals[normalizeTrendName(selected[i].TrendName)])
		items = append(items, item)
	}
	return &dto.TrendSelectionResponse{Items: items}, nil
}

func (s *TrendService) CreateFeedback(userID uint, req dto.TrendFeedbackRequest) (*dto.TrendFeedbackResponse, error) {
	if s == nil || s.feedback == nil {
		return nil, nil
	}
	rating := repository.NormalizeFeedbackRating(req.Rating)
	if rating == "" {
		return nil, ErrInvalidTrendFeedbackRating
	}
	name := strings.TrimSpace(req.TrendName)
	if name == "" {
		return nil, ErrInvalidTrendFeedbackName
	}
	normalized := strings.TrimSpace(req.NormalizedName)
	if normalized == "" {
		normalized = normalizeTrendName(name)
	}
	row := &model.TrendFeedback{
		UserID:         userID,
		BotID:          req.BotID,
		XAccountID:     req.XAccountID,
		TrendName:      truncateRunes(name, 255),
		NormalizedName: truncateRunes(normalized, 255),
		WOEID:          truncateRunes(strings.TrimSpace(req.WOEID), 32),
		Category:       truncateRunes(strings.TrimSpace(req.Category), 32),
		Rating:         rating,
		SourceType:     truncateRunes(strings.TrimSpace(req.SourceType), 48),
		SourceID:       req.SourceID,
		Comment:        truncateRunes(strings.TrimSpace(req.Comment), 512),
	}
	if err := s.feedback.Create(row); err != nil {
		return nil, err
	}
	return &dto.TrendFeedbackResponse{Item: trendFeedbackToDTO(row)}, nil
}

func (s *TrendService) ListFeedback(userID uint, query dto.TrendFeedbackQuery) (*dto.TrendFeedbackListResponse, error) {
	if s == nil || s.feedback == nil {
		return &dto.TrendFeedbackListResponse{Items: []dto.TrendFeedbackItem{}}, nil
	}
	limit := query.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := s.feedback.ListRecent(repository.TrendFeedbackListQuery{
		UserID:       userID,
		BotID:        query.BotID,
		OnlyNegative: query.OnlyNegative,
		Since:        time.Now().UTC().AddDate(0, 0, -30),
		Limit:        limit,
	})
	if err != nil {
		return nil, err
	}
	items := make([]dto.TrendFeedbackItem, 0, len(rows))
	summary := dto.TrendFeedbackSummary{}
	for i := range rows {
		item := trendFeedbackToDTO(&rows[i])
		items = append(items, item)
		summary.Total++
		switch item.Rating {
		case "relevant":
			summary.Relevant++
		case "irrelevant":
			summary.Irrelevant++
		case "too_forced":
			summary.TooForced++
		}
	}
	return &dto.TrendFeedbackListResponse{Items: items, Summary: summary}, nil
}

func (s *TrendService) DeleteFeedback(userID, id uint) error {
	if s == nil || s.feedback == nil {
		return nil
	}
	return s.feedback.DeleteByUserAndID(userID, id)
}

func (s *TrendService) FeedbackPromptSignals(userID, botID uint) []string {
	if s == nil || s.feedback == nil || userID == 0 {
		return nil
	}
	since := time.Now().UTC().AddDate(0, 0, -30)
	rows, err := s.feedback.ListRecentNegative(userID, botID, since, 20)
	if err != nil {
		zap.L().Warn("trend feedback prompt signals failed", zap.Uint("user_id", userID), zap.Uint("bot_id", botID), zap.Error(err))
		return nil
	}
	signals := []string{}
	seen := map[string]bool{}
	for _, row := range rows {
		key := strings.TrimSpace(row.NormalizedName)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		label := strings.TrimSpace(row.TrendName)
		if label == "" {
			label = key
		}
		switch strings.TrimSpace(row.Rating) {
		case "too_forced":
			signals = append(signals, "Avoid forcing trend '"+label+"' into content unless there is a direct product/persona connection.")
		case "irrelevant":
			signals = append(signals, "Treat trend '"+label+"' as previously marked irrelevant for this Bot/account context.")
		}
		if len(signals) >= 5 {
			break
		}
	}
	return signals
}

func (s *TrendService) RunTick(ctx context.Context, now time.Time) (*trendSyncResult, error) {
	return s.runTick(ctx, now, false)
}

func (s *TrendService) RunManualSync(ctx context.Context, now time.Time) (*trendSyncResult, error) {
	return s.runTick(ctx, now, true)
}

func (s *TrendService) runTick(ctx context.Context, now time.Time, force bool) (*trendSyncResult, error) {
	if s == nil || s.repo == nil {
		return &trendSyncResult{SkippedReason: "trend service is not configured"}, nil
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if !s.cfg.Enabled {
		return &trendSyncResult{Enabled: false, SkippedReason: "x trends sync disabled"}, nil
	}
	if strings.TrimSpace(s.cfg.BearerToken) == "" {
		return &trendSyncResult{Enabled: true, SkippedReason: "x trends bearer token missing"}, nil
	}
	interval := time.Duration(s.cfg.IntervalHours) * time.Hour
	if interval <= 0 {
		interval = 12 * time.Hour
	}
	result := &trendSyncResult{Enabled: true}
	for _, region := range s.cfg.Regions {
		woeid := strings.TrimSpace(region.WOEID)
		if woeid == "" {
			continue
		}
		latest, err := s.repo.LatestFetchedAt(woeid)
		if err != nil {
			return result, err
		}
		if !force && latest != nil && now.Sub(latest.UTC()) < interval {
			continue
		}
		topics, err := twitter.ListTrendsByWOEID(ctx, s.cfg.BearerToken, woeid, s.cfg.MaxTrends)
		if err != nil {
			zap.L().Warn("x trends sync failed", zap.String("woeid", woeid), zap.Error(err))
			alert.Notify(ctx, alert.Event{
				Level:    alert.LevelWarning,
				Category: alert.CategoryScheduler,
				Title:    "X trends sync failed",
				Message:  "Failed to refresh cached X trends for region " + trendRegionName(region) + ".",
				Error:    err,
				Fields: map[string]any{
					"woeid":       woeid,
					"region_name": trendRegionName(region),
				},
			})
			continue
		}
		rows := make([]model.TrendTopic, 0, len(topics))
		for _, topic := range topics {
			row := trendTopicFromAPI(topic, region, now)
			if strings.TrimSpace(row.NormalizedName) != "" {
				rows = append(rows, row)
			}
		}
		if err := s.repo.UpsertBatch(rows); err != nil {
			return result, err
		}
		result.SyncedRegions++
		result.SyncedTopics += len(rows)
	}
	retention := time.Duration(s.cfg.RetentionDays) * 24 * time.Hour
	if retention <= 0 {
		retention = 14 * 24 * time.Hour
	}
	if _, err := s.repo.DeleteExpired(now.Add(-retention)); err != nil {
		zap.L().Warn("x trends cleanup failed", zap.Error(err))
	}
	if result.SyncedRegions == 0 && result.SyncedTopics == 0 {
		result.SkippedReason = "all trend regions are still fresh"
	}
	if err := s.RefreshEnglishExposureSignals(ctx, now); err != nil {
		zap.L().Warn("english exposure signal refresh failed", zap.Error(err))
	}
	if err := s.RefreshChineseExposureSignals(ctx, now); err != nil {
		zap.L().Warn("chinese exposure signal refresh failed", zap.Error(err))
	}
	return result, nil
}

type trendPreference struct {
	Regions              []string
	Categories           []string
	ExcludedNames        []string
	AllowGeneral         bool
	SensitiveTrendPolicy string
}

func (s *TrendService) trendPreference(userID uint, query dto.TrendSelectionQuery) (trendPreference, *model.OAFBot, *model.AutoPostPlan, error) {
	pref := trendPreference{SensitiveTrendPolicy: "avoid"}
	var bot *model.OAFBot
	var plan *model.AutoPostPlan
	if query.BotID > 0 && s.botRepo != nil {
		row, err := s.botRepo.GetByUserAndID(userID, query.BotID)
		if err != nil {
			return pref, nil, nil, err
		}
		bot = row
		pref = preferenceFromBot(row)
	}
	if query.PlanID > 0 && s.contentDraftPlanRepo != nil {
		row, err := s.contentDraftPlanRepo.GetByUserAndID(userID, query.PlanID)
		if err != nil {
			return pref, bot, nil, err
		}
		plan = row
		if bot == nil && row.BotID > 0 && s.botRepo != nil {
			if b, err := s.botRepo.GetByUserAndID(userID, row.BotID); err == nil {
				bot = b
				pref = preferenceFromBot(b)
			}
		}
		pref = mergeTrendPreference(pref, preferenceFromPlan(row))
	}
	if len(pref.Regions) == 0 {
		pref.Regions = []string{"1", "23424977"}
	}
	pref.Regions = normalizeTrendRegions(pref.Regions)
	pref.Categories = normalizeTrendCategories(pref.Categories)
	pref.ExcludedNames = normalizeTrendExcludeNames(append(pref.ExcludedNames, query.ExcludedTrendNames...))
	pref.SensitiveTrendPolicy = normalizeSensitiveTrendPolicy(pref.SensitiveTrendPolicy)
	return pref, bot, plan, nil
}

func preferenceFromBot(bot *model.OAFBot) trendPreference {
	if bot == nil {
		return trendPreference{SensitiveTrendPolicy: "avoid"}
	}
	return trendPreference{
		Regions:              normalizeTrendRegions(decodeStringList(bot.TrendRegions)),
		Categories:           normalizeTrendCategories(decodeStringList(bot.TrendCategories)),
		AllowGeneral:         bot.AllowGeneralTrends,
		SensitiveTrendPolicy: normalizeSensitiveTrendPolicy(bot.SensitiveTrendPolicy),
	}
}

func preferenceFromPlan(plan *model.AutoPostPlan) trendPreference {
	if plan == nil {
		return trendPreference{}
	}
	return trendPreference{
		ExcludedNames: normalizeTrendExcludeNames(decodeStringList(plan.ExcludedTrendNames)),
	}
}

func mergeTrendPreference(base, override trendPreference) trendPreference {
	if len(override.Regions) > 0 {
		base.Regions = override.Regions
	}
	if len(override.Categories) > 0 {
		base.Categories = override.Categories
	}
	if len(override.ExcludedNames) > 0 {
		base.ExcludedNames = override.ExcludedNames
	}
	base.AllowGeneral = override.AllowGeneral
	if strings.TrimSpace(override.SensitiveTrendPolicy) != "" {
		base.SensitiveTrendPolicy = override.SensitiveTrendPolicy
	}
	return base
}

func trendTopicFromAPI(topic twitter.TrendTopic, region config.XTrendsRegionConfig, now time.Time) model.TrendTopic {
	name := strings.TrimSpace(topic.Name)
	category, risk := classifyTrendTopic(name)
	return model.TrendTopic{
		TrendName:      name,
		NormalizedName: normalizeTrendName(name),
		WOEID:          strings.TrimSpace(region.WOEID),
		RegionName:     trendRegionName(region),
		TweetCount:     topic.TweetCount,
		Category:       category,
		RiskLevel:      risk,
		LanguageHint:   trendLanguageHint(name),
		Source:         "x_trends",
		FetchedBucket:  now.UTC().Format("2006-01-02T15"),
		FetchedAt:      now.UTC(),
		ExpiresAt:      now.UTC().Add(24 * time.Hour),
		RawPayload:     topic.Raw,
	}
}

func trendTopicToDTO(row *model.TrendTopic) dto.TrendTopicItem {
	if row == nil {
		return dto.TrendTopicItem{}
	}
	return dto.TrendTopicItem{
		ID:             row.ID,
		TrendName:      row.TrendName,
		NormalizedName: row.NormalizedName,
		WOEID:          row.WOEID,
		RegionName:     row.RegionName,
		TweetCount:     row.TweetCount,
		Category:       row.Category,
		RiskLevel:      row.RiskLevel,
		LanguageHint:   row.LanguageHint,
		Source:         row.Source,
		FetchedAt:      row.FetchedAt.UTC().Format(time.RFC3339),
		ExpiresAt:      row.ExpiresAt.UTC().Format(time.RFC3339),
	}
}

func trendFeedbackToDTO(row *model.TrendFeedback) dto.TrendFeedbackItem {
	if row == nil {
		return dto.TrendFeedbackItem{}
	}
	return dto.TrendFeedbackItem{
		ID:             row.ID,
		BotID:          row.BotID,
		XAccountID:     row.XAccountID,
		TrendName:      row.TrendName,
		NormalizedName: row.NormalizedName,
		WOEID:          row.WOEID,
		Category:       row.Category,
		Rating:         row.Rating,
		SourceType:     row.SourceType,
		SourceID:       row.SourceID,
		CreatedAt:      row.CreatedAt.UTC().Format(time.RFC3339),
	}
}

func (s *TrendService) recentNegativeTrendNames(userID, botID uint) []string {
	if s == nil || s.feedback == nil || userID == 0 {
		return nil
	}
	rows, err := s.feedback.ListRecentNegative(userID, botID, time.Now().UTC().AddDate(0, 0, -30), 50)
	if err != nil {
		zap.L().Warn("trend feedback exclusion failed", zap.Uint("user_id", userID), zap.Uint("bot_id", botID), zap.Error(err))
		return nil
	}
	out := []string{}
	seen := map[string]bool{}
	for _, row := range rows {
		key := strings.TrimSpace(row.NormalizedName)
		if key == "" {
			key = normalizeTrendName(row.TrendName)
		}
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, key)
	}
	return out
}

func botIDFromTrendContext(bot *model.OAFBot, plan *model.AutoPostPlan) uint {
	if bot != nil {
		return bot.ID
	}
	if plan != nil {
		return plan.BotID
	}
	return 0
}

type trendQualitySignal struct {
	Irrelevant    int64
	TooForced     int64
	TotalNegative int64
	Rules         map[string]bool
}

func (s *TrendService) trendQualitySignals() map[string]trendQualitySignal {
	if s == nil || s.feedback == nil {
		return nil
	}
	rows, err := s.feedback.ListQualitySignals(time.Now().UTC().AddDate(0, 0, -30), 2, 200)
	if err != nil {
		zap.L().Warn("trend quality signals failed", zap.Error(err))
		return nil
	}
	out := make(map[string]trendQualitySignal, len(rows))
	for key, row := range rows {
		out[key] = trendQualitySignal{
			Irrelevant:    row.Irrelevant,
			TooForced:     row.TooForced,
			TotalNegative: row.TotalNegative,
		}
	}
	rules, err := s.feedback.ListActiveOperationRules()
	if err != nil {
		zap.L().Warn("trend operation rules failed", zap.Error(err))
		return out
	}
	for key, items := range rules {
		signal := out[key]
		if signal.Rules == nil {
			signal.Rules = map[string]bool{}
		}
		for _, item := range items {
			ruleType := strings.TrimSpace(item.RuleType)
			if ruleType != "" {
				signal.Rules[ruleType] = true
			}
		}
		out[key] = signal
	}
	return out
}

func (s *TrendService) trendRelevanceKeywords(userID uint, bot *model.OAFBot, plan *model.AutoPostPlan) []string {
	terms := []string{}
	if bot != nil {
		terms = append(terms,
			bot.Name,
			bot.Occupation,
			bot.Industry,
			bot.IdentitySummary,
			bot.GrowthGoal,
			bot.ProjectOneLiner,
			bot.TargetAudience,
			bot.CoreValueProps,
			bot.ProductFeatures,
			bot.Differentiators,
			bot.ContentObjectives,
		)
		terms = append(terms, decodeStringList(bot.Topics)...)
		terms = append(terms, decodeStringList(bot.ContentPillars)...)
		terms = append(terms, decodeStringList(bot.Hashtags)...)
		terms = append(terms, decodeStringList(bot.Keywords)...)
	}
	if s.contentRepo != nil {
		var accountID uint
		var botID uint
		if plan != nil {
			accountID = plan.XAccountID
			botID = plan.BotID
		} else if bot != nil {
			botID = bot.ID
			accountID = bot.TwitterAccountID
		}
		if rows, err := s.contentRepo.ListActiveForGenerationContext(userID, accountID, botID, 20); err == nil {
			for _, item := range rows {
				terms = append(terms, item.Title, item.Body, item.GrowthGoal, item.CTAPreference)
				terms = append(terms, decodeStringList(item.Topics)...)
			}
		}
	}
	return normalizeTrendKeywords(terms)
}

func selectRelevantTrendTopics(candidates []model.TrendTopic, pref trendPreference, keywords []string, qualitySignals map[string]trendQualitySignal, limit int) []model.TrendTopic {
	if limit <= 0 {
		limit = 3
	}
	categorySet := stringSet(pref.Categories)
	excludedSet := normalizedStringSet(pref.ExcludedNames)
	seen := map[string]bool{}
	type scoredTrend struct {
		row   model.TrendTopic
		score int64
	}
	scored := []scoredTrend{}
	for _, row := range candidates {
		key := strings.TrimSpace(row.NormalizedName)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		if excludedSet[key] {
			continue
		}
		risk := strings.TrimSpace(row.RiskLevel)
		if pref.SensitiveTrendPolicy == "avoid" && risk != "" && risk != "low" {
			continue
		}
		if pref.SensitiveTrendPolicy == "review_only" && risk == "high" {
			continue
		}
		categoryMatch := len(categorySet) == 0 || categorySet[strings.TrimSpace(row.Category)]
		explicitCategoryMatch := len(categorySet) > 0 && categorySet[strings.TrimSpace(row.Category)]
		keywordMatch := trendMatchesKeywords(row, keywords)
		if !pref.AllowGeneral && !categoryMatch && !keywordMatch {
			continue
		}
		quality := qualitySignals[key]
		generalOnly := pref.AllowGeneral && !explicitCategoryMatch && !keywordMatch
		if (quality.TooForced >= 3 || quality.Rules["review_pool"]) && generalOnly {
			continue
		}
		score := row.TweetCount
		if score <= 0 {
			score = 1
		}
		if categoryMatch {
			score += 1000000
		}
		if keywordMatch {
			score += 2000000
		}
		if risk == "medium" {
			score -= 500000
		}
		score -= trendFeedbackPenalty(quality)
		scored = append(scored, scoredTrend{row: row, score: score})
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score == scored[j].score {
			return scored[i].row.FetchedAt.After(scored[j].row.FetchedAt)
		}
		return scored[i].score > scored[j].score
	})
	out := make([]model.TrendTopic, 0, limit)
	for _, item := range scored {
		out = append(out, item.row)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func trendFeedbackPenalty(signal trendQualitySignal) int64 {
	var penalty int64
	if signal.Rules["review_pool"] {
		penalty += 2500000
	}
	if signal.Rules["downweight"] {
		penalty += 1800000
	}
	if signal.Rules["classification_review"] {
		penalty += 900000
	}
	if signal.TooForced >= 2 {
		penalty += signal.TooForced * 700000
	}
	if signal.Irrelevant >= 3 {
		penalty += signal.Irrelevant * 500000
	}
	if penalty > 3000000 {
		return 3000000
	}
	return penalty
}

func trendMatchesKeywords(row model.TrendTopic, keywords []string) bool {
	return len(trendMatchedKeywords(row, keywords)) > 0
}

func trendMatchedKeywords(row model.TrendTopic, keywords []string) []string {
	if len(keywords) == 0 {
		return nil
	}
	name := normalizeTrendName(row.TrendName)
	out := []string{}
	seen := map[string]bool{}
	for _, keyword := range keywords {
		kw := normalizeTrendName(keyword)
		if kw != "" && (strings.Contains(name, kw) || strings.Contains(kw, name)) {
			if !seen[kw] {
				seen[kw] = true
				out = append(out, strings.TrimSpace(keyword))
				if len(out) >= 3 {
					break
				}
			}
		}
	}
	return out
}

func trendRelevanceReason(row model.TrendTopic, pref trendPreference, matchedKeywords []string, quality trendQualitySignal) string {
	reasons := []string{}
	if len(matchedKeywords) > 0 {
		reasons = append(reasons, "matched Bot/content keywords: "+strings.Join(matchedKeywords, ", "))
	}
	category := strings.TrimSpace(row.Category)
	if category != "" {
		if len(pref.Categories) == 0 {
			reasons = append(reasons, "category is allowed by the current broad category setting: "+category)
		} else if stringSet(pref.Categories)[category] {
			reasons = append(reasons, "category matches the selected trend preference: "+category)
		}
	}
	if pref.AllowGeneral && len(reasons) == 0 {
		reasons = append(reasons, "general hot topics are allowed for this Planner")
	}
	if row.TweetCount > 0 {
		reasons = append(reasons, "has visible X trend volume")
	}
	if strings.TrimSpace(row.RiskLevel) == "low" {
		reasons = append(reasons, "risk level is low")
	}
	if trendFeedbackPenalty(quality) > 0 {
		reasons = append(reasons, "rank adjusted by historical trend feedback")
	}
	if quality.Rules["review_pool"] {
		reasons = append(reasons, "admin rule requires review before broad use")
	} else if quality.Rules["downweight"] {
		reasons = append(reasons, "admin rule lowers this trend for broad matching")
	} else if quality.Rules["classification_review"] {
		reasons = append(reasons, "admin rule marks classification for review")
	}
	if len(reasons) == 0 {
		return "selected by cached trend relevance and safety filters"
	}
	return strings.Join(reasons, "; ")
}

func normalizeTrendKeywords(values []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, value := range values {
		for _, part := range strings.FieldsFunc(value, func(r rune) bool {
			return r == ',' || r == '，' || r == '#' || r == '\n' || r == ';' || r == '；'
		}) {
			part = strings.TrimSpace(part)
			if len([]rune(part)) < 2 || len([]rune(part)) > 40 {
				continue
			}
			key := normalizeTrendName(part)
			if key == "" || seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, part)
			if len(out) >= 80 {
				return out
			}
		}
	}
	return out
}

func stringSet(values []string) map[string]bool {
	out := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out[value] = true
		}
	}
	return out
}

func normalizedStringSet(values []string) map[string]bool {
	out := map[string]bool{}
	for _, value := range values {
		key := normalizeTrendName(value)
		if key != "" {
			out[key] = true
		}
	}
	return out
}

func trendRegionName(region config.XTrendsRegionConfig) string {
	if strings.TrimSpace(region.Name) != "" {
		return strings.TrimSpace(region.Name)
	}
	return strings.TrimSpace(region.WOEID)
}

var nonTrendChars = regexp.MustCompile(`[^a-z0-9#@\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}]+`)

func normalizeTrendName(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.TrimSpace(nonTrendChars.ReplaceAllString(value, " "))
	return strings.Join(strings.Fields(value), " ")
}

func classifyTrendTopic(name string) (category string, risk string) {
	text := strings.ToLower(strings.TrimSpace(name))
	risk = "low"
	if containsAny(text, "war", "attack", "terror", "shooting", "earthquake", "flood", "wildfire", "death", "dead", "killed", "murder", "hostage", "genocide", "porn", "nsfw", "hate", "racist") {
		risk = "high"
	} else if containsAny(text, "election", "president", "government", "minister", "protest", "lawsuit", "court", "trial", "scandal") {
		risk = "medium"
	}
	switch {
	case containsAny(text, "bitcoin", "btc", "ethereum", "eth", "crypto", "web3", "defi", "nft", "airdrop", "token", "solana", "base", "binance"):
		category = "crypto"
	case containsAny(text, "stock", "stocks", "market", "fed", "inflation", "bank", "earnings", "nasdaq", "sp500", "dow", "rate cut", "finance"):
		category = "finance"
	case containsAny(text, "ai", "openai", "chatgpt", "agent", "iphone", "apple", "google", "microsoft", "nvidia", "tesla", "startup", "tech"):
		category = "tech"
	case containsAny(text, "nba", "nfl", "mlb", "nhl", "fifa", "football", "soccer", "tennis", "golf", "olympic", "sports"):
		category = "sports"
	case containsAny(text, "movie", "music", "album", "netflix", "disney", "celebrity", "actor", "singer", "concert", "trailer"):
		category = "entertainment"
	case containsAny(text, "game", "gaming", "xbox", "playstation", "nintendo", "steam", "fortnite", "minecraft"):
		category = "gaming"
	case containsAny(text, "election", "president", "senate", "congress", "minister", "government", "politics"):
		category = "politics"
	case containsAny(text, "breaking", "news", "report", "announces", "confirmed"):
		category = "news"
	case containsAny(text, "fashion", "food", "travel", "fitness", "beauty", "lifestyle"):
		category = "lifestyle"
	case strings.HasPrefix(strings.TrimSpace(name), "#"):
		category = "meme"
	default:
		category = "other"
	}
	return category, risk
}

func trendLanguageHint(name string) string {
	for _, ch := range name {
		if ch >= '\u4e00' && ch <= '\u9fff' {
			return "zh"
		}
		if ch >= '\u3040' && ch <= '\u30ff' {
			return "ja"
		}
		if ch >= '\uac00' && ch <= '\ud7af' {
			return "ko"
		}
	}
	return "en"
}

func normalizeTrendRegions(values []string) []string {
	allowed := map[string]bool{"1": true, "23424977": true}
	out := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || !allowed[value] || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func normalizeTrendCategories(values []string) []string {
	allowed := map[string]bool{
		"crypto": true, "finance": true, "tech": true, "sports": true, "entertainment": true,
		"gaming": true, "politics": true, "news": true, "culture": true, "lifestyle": true,
		"meme": true, "other": true,
	}
	out := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.ToLower(strings.TrimSpace(value))
		if value == "" || !allowed[value] || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func normalizeTrendExcludeNames(values []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || len([]rune(value)) > 80 {
			continue
		}
		key := normalizeTrendName(value)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
		if len(out) >= 50 {
			break
		}
	}
	return out
}

func normalizeSensitiveTrendPolicy(value string) string {
	switch strings.TrimSpace(value) {
	case "review_only", "allow":
		return strings.TrimSpace(value)
	default:
		return "avoid"
	}
}
