package dto

type TrendTopicQuery struct {
	WOEID     string `form:"woeid"`
	Region    string `form:"region"`
	Category  string `form:"category"`
	RiskLevel string `form:"risk_level"`
	Limit     int    `form:"limit"`
}

type TrendTopicItem struct {
	ID             uint   `json:"id"`
	TrendName      string `json:"trend_name"`
	NormalizedName string `json:"normalized_name"`
	WOEID          string `json:"woeid"`
	RegionName     string `json:"region_name"`
	TweetCount     int64  `json:"tweet_count"`
	Category       string `json:"category"`
	RiskLevel      string `json:"risk_level"`
	LanguageHint   string `json:"language_hint,omitempty"`
	Source         string `json:"source"`
	FetchedAt      string `json:"fetched_at"`
	ExpiresAt      string `json:"expires_at"`
}

type TrendTopicListResponse struct {
	Items []TrendTopicItem `json:"items"`
}

type TrendSyncResponse struct {
	Enabled       bool   `json:"enabled"`
	SyncedRegions int    `json:"synced_regions"`
	SyncedTopics  int    `json:"synced_topics"`
	SkippedReason string `json:"skipped_reason,omitempty"`
}
