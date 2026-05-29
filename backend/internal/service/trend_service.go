package service

import (
	"context"
	"regexp"
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

type TrendService struct {
	repo *repository.TrendTopicRepository
	cfg  config.XTrendsConfig
}

type trendSyncResult struct {
	Enabled       bool
	SyncedRegions int
	SyncedTopics  int
	SkippedReason string
}

func NewTrendService(repo *repository.TrendTopicRepository, cfg config.XTrendsConfig) *TrendService {
	return &TrendService{repo: repo, cfg: cfg}
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

func (s *TrendService) RunTick(ctx context.Context, now time.Time) (*trendSyncResult, error) {
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
		if latest != nil && now.Sub(latest.UTC()) < interval {
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
	return result, nil
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
