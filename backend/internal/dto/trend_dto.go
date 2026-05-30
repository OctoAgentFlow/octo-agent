package dto

type TrendTopicQuery struct {
	WOEID     string `form:"woeid"`
	Region    string `form:"region"`
	Category  string `form:"category"`
	RiskLevel string `form:"risk_level"`
	Limit     int    `form:"limit"`
}

type TrendTopicItem struct {
	ID              uint     `json:"id"`
	TrendName       string   `json:"trend_name"`
	NormalizedName  string   `json:"normalized_name"`
	WOEID           string   `json:"woeid"`
	RegionName      string   `json:"region_name"`
	TweetCount      int64    `json:"tweet_count"`
	Category        string   `json:"category"`
	RiskLevel       string   `json:"risk_level"`
	LanguageHint    string   `json:"language_hint,omitempty"`
	Source          string   `json:"source"`
	MatchedKeywords []string `json:"matched_keywords,omitempty"`
	RelevanceReason string   `json:"relevance_reason,omitempty"`
	FetchedAt       string   `json:"fetched_at"`
	ExpiresAt       string   `json:"expires_at"`
}

type TrendTopicListResponse struct {
	Items []TrendTopicItem `json:"items"`
}

type TrendSelectionQuery struct {
	BotID              uint     `form:"bot_id"`
	PlanID             uint     `form:"plan_id"`
	Limit              int      `form:"limit"`
	ExcludedTrendNames []string `form:"excluded_trend_names"`
}

type TrendSelectionResponse struct {
	Items []TrendTopicItem `json:"items"`
}

type TrendFeedbackRequest struct {
	BotID          uint   `json:"bot_id"`
	XAccountID     uint   `json:"x_account_id"`
	TrendName      string `json:"trend_name" binding:"required"`
	NormalizedName string `json:"normalized_name"`
	WOEID          string `json:"woeid"`
	Category       string `json:"category"`
	Rating         string `json:"rating" binding:"required"`
	SourceType     string `json:"source_type"`
	SourceID       uint   `json:"source_id"`
	Comment        string `json:"comment"`
}

type TrendFeedbackItem struct {
	ID             uint   `json:"id"`
	BotID          uint   `json:"bot_id"`
	XAccountID     uint   `json:"x_account_id"`
	TrendName      string `json:"trend_name"`
	NormalizedName string `json:"normalized_name"`
	WOEID          string `json:"woeid"`
	Category       string `json:"category"`
	Rating         string `json:"rating"`
	SourceType     string `json:"source_type"`
	SourceID       uint   `json:"source_id"`
	CreatedAt      string `json:"created_at"`
}

type TrendFeedbackResponse struct {
	Item TrendFeedbackItem `json:"item"`
}

type TrendFeedbackQuery struct {
	BotID        uint `form:"bot_id"`
	OnlyNegative bool `form:"only_negative"`
	Limit        int  `form:"limit"`
}

type TrendFeedbackSummary struct {
	Total      int `json:"total"`
	Relevant   int `json:"relevant"`
	Irrelevant int `json:"irrelevant"`
	TooForced  int `json:"too_forced"`
}

type TrendFeedbackListResponse struct {
	Items   []TrendFeedbackItem  `json:"items"`
	Summary TrendFeedbackSummary `json:"summary"`
}

type TrendSyncResponse struct {
	Enabled       bool   `json:"enabled"`
	SyncedRegions int    `json:"synced_regions"`
	SyncedTopics  int    `json:"synced_topics"`
	SkippedReason string `json:"skipped_reason,omitempty"`
	AttemptedAt   string `json:"attempted_at,omitempty"`
}

type TrendCacheRegionStatus struct {
	RegionName      string `json:"region_name"`
	TotalTopics     int64  `json:"total_topics"`
	LatestFetchedAt string `json:"latest_fetched_at,omitempty"`
	LatestUpdatedAt string `json:"latest_updated_at,omitempty"`
}

type TrendCacheStatusResponse struct {
	Enabled               bool                     `json:"enabled"`
	BearerTokenConfigured bool                     `json:"bearer_token_configured"`
	TotalTopics           int64                    `json:"total_topics"`
	LatestFetchedAt       string                   `json:"latest_fetched_at,omitempty"`
	LatestUpdatedAt       string                   `json:"latest_updated_at,omitempty"`
	Regions               []TrendCacheRegionStatus `json:"regions"`
}
