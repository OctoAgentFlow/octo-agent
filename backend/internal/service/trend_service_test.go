package service

import (
	"testing"
	"time"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
)

func TestNormalizeTrendName(t *testing.T) {
	if got := normalizeTrendName("  #AI Agents!!  "); got != "#ai agents" {
		t.Fatalf("normalized = %q", got)
	}
	if got := normalizeTrendName("比特币 牛市"); got != "比特币 牛市" {
		t.Fatalf("normalized zh = %q", got)
	}
}

func TestClassifyTrendTopic(t *testing.T) {
	category, risk := classifyTrendTopic("Bitcoin ETF")
	if category != "crypto" || risk != "low" {
		t.Fatalf("bitcoin classified as %s/%s", category, risk)
	}
	category, risk = classifyTrendTopic("Election lawsuit")
	if category != "politics" || risk != "medium" {
		t.Fatalf("election classified as %s/%s", category, risk)
	}
	category, risk = classifyTrendTopic("earthquake")
	if risk != "high" {
		t.Fatalf("earthquake risk = %s", risk)
	}
}

func TestTrendTopicFromAPI(t *testing.T) {
	now := time.Date(2026, 5, 29, 12, 0, 0, 0, time.UTC)
	row := trendTopicFromAPI(twitter.TrendTopic{Name: "NBA Finals", TweetCount: 123}, config.XTrendsRegionConfig{WOEID: "1", Name: "Worldwide"}, now)
	if row.Category != "sports" || row.RiskLevel != "low" {
		t.Fatalf("unexpected category/risk: %s/%s", row.Category, row.RiskLevel)
	}
	if row.ExpiresAt.Sub(now) != 24*time.Hour {
		t.Fatalf("expires in %s", row.ExpiresAt.Sub(now))
	}
	if row.FetchedBucket != "2026-05-29T12" {
		t.Fatalf("bucket = %s", row.FetchedBucket)
	}
}

func TestSelectRelevantTrendTopics(t *testing.T) {
	now := time.Date(2026, 5, 29, 12, 0, 0, 0, time.UTC)
	candidates := []model.TrendTopic{
		{TrendName: "NBA Finals", NormalizedName: "nba finals", Category: "sports", RiskLevel: "low", TweetCount: 9000, FetchedAt: now},
		{TrendName: "AI Agents", NormalizedName: "ai agents", Category: "tech", RiskLevel: "low", TweetCount: 100, FetchedAt: now},
		{TrendName: "Crypto Market", NormalizedName: "crypto market", Category: "crypto", RiskLevel: "low", TweetCount: 500, FetchedAt: now},
		{TrendName: "Election lawsuit", NormalizedName: "election lawsuit", Category: "politics", RiskLevel: "medium", TweetCount: 12000, FetchedAt: now},
	}
	selected := selectRelevantTrendTopics(candidates, trendPreference{
		Categories:           []string{"crypto"},
		AllowGeneral:         false,
		SensitiveTrendPolicy: "avoid",
	}, []string{"AI Agent"}, nil, 3)
	if len(selected) != 2 {
		t.Fatalf("selected %d trends, want 2", len(selected))
	}
	if selected[0].TrendName != "AI Agents" {
		t.Fatalf("keyword match should rank first, got %s", selected[0].TrendName)
	}
	if selected[1].TrendName != "Crypto Market" {
		t.Fatalf("category match should rank second, got %s", selected[1].TrendName)
	}
}

func TestSelectRelevantTrendTopicsAllowsGeneralWithSensitivePolicy(t *testing.T) {
	now := time.Date(2026, 5, 29, 12, 0, 0, 0, time.UTC)
	candidates := []model.TrendTopic{
		{TrendName: "Breaking market news", NormalizedName: "breaking market news", Category: "news", RiskLevel: "low", TweetCount: 1000, FetchedAt: now},
		{TrendName: "Election lawsuit", NormalizedName: "election lawsuit", Category: "politics", RiskLevel: "medium", TweetCount: 9000, FetchedAt: now},
		{TrendName: "Earthquake", NormalizedName: "earthquake", Category: "news", RiskLevel: "high", TweetCount: 20000, FetchedAt: now},
	}
	selected := selectRelevantTrendTopics(candidates, trendPreference{
		AllowGeneral:         true,
		SensitiveTrendPolicy: "review_only",
	}, nil, nil, 3)
	if len(selected) != 2 {
		t.Fatalf("selected %d trends, want 2", len(selected))
	}
	for _, row := range selected {
		if row.RiskLevel == "high" {
			t.Fatalf("high-risk trend should be skipped: %s", row.TrendName)
		}
	}
}

func TestSelectRelevantTrendTopicsExcludesNames(t *testing.T) {
	now := time.Date(2026, 5, 29, 12, 0, 0, 0, time.UTC)
	candidates := []model.TrendTopic{
		{TrendName: "AI Agents", NormalizedName: "ai agents", Category: "tech", RiskLevel: "low", TweetCount: 9000, FetchedAt: now},
		{TrendName: "Crypto Market", NormalizedName: "crypto market", Category: "crypto", RiskLevel: "low", TweetCount: 500, FetchedAt: now},
	}
	selected := selectRelevantTrendTopics(candidates, trendPreference{
		AllowGeneral:         true,
		SensitiveTrendPolicy: "avoid",
		ExcludedNames:        []string{"AI Agents"},
	}, nil, nil, 3)
	if len(selected) != 1 {
		t.Fatalf("selected %d trends, want 1", len(selected))
	}
	if selected[0].TrendName != "Crypto Market" {
		t.Fatalf("excluded trend should not be selected, got %s", selected[0].TrendName)
	}
}

func TestSelectRelevantTrendTopicsPenalizesForcedTrend(t *testing.T) {
	now := time.Date(2026, 5, 29, 12, 0, 0, 0, time.UTC)
	candidates := []model.TrendTopic{
		{TrendName: "Generic Viral Meme", NormalizedName: "generic viral meme", Category: "meme", RiskLevel: "low", TweetCount: 20000, FetchedAt: now},
		{TrendName: "AI Agents", NormalizedName: "ai agents", Category: "tech", RiskLevel: "low", TweetCount: 1000, FetchedAt: now},
	}
	selected := selectRelevantTrendTopics(candidates, trendPreference{
		AllowGeneral:         true,
		SensitiveTrendPolicy: "avoid",
	}, []string{"AI Agent"}, map[string]trendQualitySignal{
		"generic viral meme": {TooForced: 3, TotalNegative: 3},
	}, 3)
	if len(selected) != 1 {
		t.Fatalf("selected %d trends, want 1", len(selected))
	}
	if selected[0].TrendName != "AI Agents" {
		t.Fatalf("forced general trend should be skipped, got %s", selected[0].TrendName)
	}
}

func TestSelectRelevantTrendTopicsKeepsStrongMatchDespiteFeedback(t *testing.T) {
	now := time.Date(2026, 5, 29, 12, 0, 0, 0, time.UTC)
	candidates := []model.TrendTopic{
		{TrendName: "AI Agents", NormalizedName: "ai agents", Category: "tech", RiskLevel: "low", TweetCount: 20000, FetchedAt: now},
		{TrendName: "Crypto Market", NormalizedName: "crypto market", Category: "crypto", RiskLevel: "low", TweetCount: 1000, FetchedAt: now},
	}
	selected := selectRelevantTrendTopics(candidates, trendPreference{
		Categories:           []string{"tech"},
		AllowGeneral:         false,
		SensitiveTrendPolicy: "avoid",
	}, []string{"AI Agent"}, map[string]trendQualitySignal{
		"ai agents": {TooForced: 2, TotalNegative: 2},
	}, 3)
	if len(selected) != 1 {
		t.Fatalf("selected %d trends, want 1", len(selected))
	}
	if selected[0].TrendName != "AI Agents" {
		t.Fatalf("strong matched trend should remain selectable, got %s", selected[0].TrendName)
	}
}

func TestExposureRadarOutcomeFeedbackMetadataAndDelta(t *testing.T) {
	meta := exposureRadarOutcomeFeedbackMetadata("manual_outcome=effective | region=en | topic=AI Agents | opportunity_type=contextual_reply | data_quality=tweet_level")
	if meta["manual_outcome"] != "effective" || meta["region"] != "en" || meta["topic"] != "AI Agents" {
		t.Fatalf("unexpected metadata: %#v", meta)
	}
	stat := exposureRadarOutcomePerformanceFromFeedback(model.OAFBotGenerationFeedback{}, meta)
	if stat.Effective != 1 || exposureRadarOutcomeRankingDelta(stat) != 3 {
		t.Fatalf("unexpected effective stat: %#v delta=%d", stat, exposureRadarOutcomeRankingDelta(stat))
	}

	negative := exposureRadarOutcomePerformanceFromFeedback(model.OAFBotGenerationFeedback{}, map[string]string{"manual_outcome": "not_suitable"})
	if negative.NotSuitable != 1 || exposureRadarOutcomeRankingDelta(negative) != -6 {
		t.Fatalf("unexpected not_suitable stat: %#v delta=%d", negative, exposureRadarOutcomeRankingDelta(negative))
	}
}

func TestExposureRadarOutcomeStatsPrefersTopicMatch(t *testing.T) {
	outcomes := map[string]exposureRadarOutcomePerformance{}
	for _, key := range exposureRadarOutcomeKeysFromMetadata("en", map[string]string{
		"topic":            "AI Agents",
		"opportunity_type": "contextual_reply",
		"data_quality":     "tweet_level",
	}) {
		outcomes[key] = exposureRadarOutcomePerformance{Effective: 1}
	}

	stat := exposureRadarOutcomeStatsForItem(outcomes, dto.ExposureRadarItem{
		Region:          "en",
		TopicName:       "AI Agents",
		OpportunityType: "contextual_reply",
		DataQuality:     "tweet_level",
	})
	if stat.Effective != 1 {
		t.Fatalf("topic match should not double count dimension matches: %#v", stat)
	}
}

func TestExposureOpportunityTierRequiresRealImpressionsForHot(t *testing.T) {
	tier, reason := exposureOpportunityTier("tweet_level", 5200, 0, 80, "burst", true)
	if tier != exposureRisingSignalTier {
		t.Fatalf("engagement-estimated heat should not be a hot opportunity: tier=%s reason=%s", tier, reason)
	}

	tier, reason = exposureOpportunityTier("tweet_level", 5200, 5200, 80, "burst", true)
	if tier != exposureHotOpportunityTier {
		t.Fatalf("real impressions with momentum should be hot: tier=%s reason=%s", tier, reason)
	}
}

func TestExposureOpportunityTierSeparatesSamplingAndTopicLeads(t *testing.T) {
	tier, _ := exposureOpportunityTier("topic_level", 50000, 0, 0, "", false)
	if tier != exposureTopicLeadTier {
		t.Fatalf("topic-level signal tier = %s, want %s", tier, exposureTopicLeadTier)
	}

	tier, _ = exposureOpportunityTier("tweet_level", 12, 0, 0, "new", false)
	if tier != exposureSamplingTier {
		t.Fatalf("first tweet sample tier = %s, want %s", tier, exposureSamplingTier)
	}

	confidence, _ := exposureDataConfidence("tweet_level", 0, false)
	if confidence != exposureConfidenceFirstSample {
		t.Fatalf("first sample confidence = %s, want %s", confidence, exposureConfidenceFirstSample)
	}
}

func TestSelectExposureTweetCandidatesPrioritizesRealImpressions(t *testing.T) {
	now := time.Date(2026, 6, 14, 12, 0, 0, 0, time.UTC)
	tweets := []twitter.TweetSearchItem{
		{ID: "recent-low", CreatedAt: now.Add(-10 * time.Minute), LikeCount: 4, ReplyCount: 1, FollowersCount: 900},
		{ID: "older-real", CreatedAt: now.Add(-3 * time.Hour), ImpressionCount: 4200, LikeCount: 10, FollowersCount: 8000},
		{ID: "engagement", CreatedAt: now.Add(-30 * time.Minute), LikeCount: 30, ReplyCount: 4, RetweetCount: 2, FollowersCount: 700},
	}

	selected := selectExposureTweetCandidates(tweets, now, 2)
	if len(selected) != 2 {
		t.Fatalf("selected %d candidates, want 2", len(selected))
	}
	if selected[0].ID != "older-real" {
		t.Fatalf("real impression candidate should rank first, got %s", selected[0].ID)
	}
	if selected[1].ID != "engagement" {
		t.Fatalf("engagement candidate should beat low-heat recency, got %s", selected[1].ID)
	}
}

func TestSelectExposureTweetCandidatesDedupesBeforeLimit(t *testing.T) {
	now := time.Date(2026, 6, 14, 12, 0, 0, 0, time.UTC)
	tweets := []twitter.TweetSearchItem{
		{ID: "same", CreatedAt: now.Add(-10 * time.Minute), ImpressionCount: 300},
		{ID: "same", CreatedAt: now.Add(-5 * time.Minute), ImpressionCount: 10000},
		{ID: "other", CreatedAt: now.Add(-20 * time.Minute), ImpressionCount: 5000},
	}

	selected := selectExposureTweetCandidates(tweets, now, 10)
	if len(selected) != 2 {
		t.Fatalf("selected %d candidates after dedupe, want 2", len(selected))
	}
}
