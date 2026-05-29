package service

import (
	"testing"
	"time"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/integration/twitter"
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
