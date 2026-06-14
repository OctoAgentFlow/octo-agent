package dto

type TrendTopicQuery struct {
	WOEID     string `form:"woeid"`
	Region    string `form:"region"`
	Category  string `form:"category"`
	RiskLevel string `form:"risk_level"`
	Limit     int    `form:"limit"`
}

type ExposureRadarQuery struct {
	Region      string `form:"region"`
	BotID       uint   `form:"bot_id"`
	XAccountID  uint   `form:"x_account_id"`
	Hours       int    `form:"hours"`
	MaxFans     int64  `form:"max_fans"`
	MinHotCount int    `form:"min_hot_count"`
	Limit       int    `form:"limit"`
}

type ExposureRadarPerformanceQuery struct {
	Region     string `form:"region"`
	BotID      uint   `form:"bot_id"`
	XAccountID uint   `form:"x_account_id"`
	Days       int    `form:"days"`
}

type ExposureRadarBriefQuery struct {
	Region     string `form:"region"`
	BotID      uint   `form:"bot_id"`
	XAccountID uint   `form:"x_account_id"`
	Hours      int    `form:"hours"`
	Limit      int    `form:"limit"`
}

type ExposureRadarArchiveQuery struct {
	Region     string `form:"region"`
	BotID      uint   `form:"bot_id"`
	XAccountID uint   `form:"x_account_id"`
	Days       int    `form:"days"`
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

type ExposureRadarItem struct {
	ID               string   `json:"id"`
	Region           string   `json:"region"`
	DataSource       string   `json:"data_source"`
	DataQuality      string   `json:"data_quality"`
	Title            string   `json:"title"`
	AuthorHandle     string   `json:"author_handle,omitempty"`
	AuthorName       string   `json:"author_name,omitempty"`
	AuthorID         string   `json:"author_id,omitempty"`
	Content          string   `json:"content"`
	URL              string   `json:"url,omitempty"`
	TweetID          string   `json:"tweet_id,omitempty"`
	Status           string   `json:"status"`
	SignalLabel      string   `json:"signal_label"`
	TopicName        string   `json:"topic_name,omitempty"`
	PublishedAt      string   `json:"published_at,omitempty"`
	ViewsPerMin      float64  `json:"views_per_min,omitempty"`
	HeatCount        int64    `json:"heat_count,omitempty"`
	FollowersCount   int64    `json:"followers_count,omitempty"`
	LikeCount        int64    `json:"like_count,omitempty"`
	ReplyCount       int64    `json:"reply_count,omitempty"`
	RetweetCount     int64    `json:"retweet_count,omitempty"`
	QuoteCount       int64    `json:"quote_count,omitempty"`
	BookmarkCount    int64    `json:"bookmark_count,omitempty"`
	ImpressionCount  int64    `json:"impression_count,omitempty"`
	HotCount         int      `json:"hot_count,omitempty"`
	AgeLabel         string   `json:"age_label,omitempty"`
	VelocityState    string   `json:"velocity_state,omitempty"`
	OpportunityTier  string   `json:"opportunity_tier,omitempty"`
	TierReason       string   `json:"tier_reason,omitempty"`
	Cooling          bool     `json:"cooling,omitempty"`
	VelocityHistory  []int64  `json:"velocity_history,omitempty"`
	Score            int      `json:"score"`
	RiskLevel        string   `json:"risk_level"`
	OpportunityType  string   `json:"opportunity_type"`
	RecommendedUse   string   `json:"recommended_use"`
	Reason           string   `json:"reason"`
	RankingDelta     int      `json:"ranking_delta,omitempty"`
	RankingReason    string   `json:"ranking_reason,omitempty"`
	Guardrails       []string `json:"guardrails,omitempty"`
	ReviewTaskID     uint     `json:"review_task_id,omitempty"`
	ReviewStatus     string   `json:"review_status,omitempty"`
	ReviewQueueURL   string   `json:"review_queue_url,omitempty"`
	GeneratedComment string   `json:"generated_comment,omitempty"`
	ManualActionURL  string   `json:"manual_action_url,omitempty"`
	CommentTweetID   string   `json:"comment_tweet_id,omitempty"`
	CommentURL       string   `json:"comment_url,omitempty"`
	SavedMemoryID    uint     `json:"saved_memory_id,omitempty"`
	UpdatedAt        string   `json:"updated_at,omitempty"`
}

type ExposureRadarResponse struct {
	Region           string                        `json:"region"`
	DataSource       string                        `json:"data_source"`
	DataQuality      string                        `json:"data_quality"`
	SourceType       string                        `json:"source_type"`
	SourceStatus     string                        `json:"source_status"`
	UpdatedAt        string                        `json:"updated_at,omitempty"`
	LastCollectedAt  string                        `json:"last_collected_at,omitempty"`
	FreshnessSeconds int64                         `json:"freshness_seconds,omitempty"`
	Filters          ExposureRadarQuery            `json:"filters"`
	LearningControls ExposureRadarLearningControls `json:"learning_controls"`
	Items            []ExposureRadarItem           `json:"items"`
	SourceNotice     string                        `json:"source_notice"`
}

type ExposureRadarLearningControls struct {
	RankingEnabled   bool   `json:"ranking_enabled"`
	CollectorEnabled bool   `json:"collector_enabled"`
	Mode             string `json:"mode"`
	WindowDays       int    `json:"window_days"`
	RankingScope     string `json:"ranking_scope"`
}

type ExposureRadarBriefResponse struct {
	Region           string                        `json:"region"`
	HourKey          string                        `json:"hour_key"`
	GeneratedAt      string                        `json:"generated_at"`
	SourceType       string                        `json:"source_type"`
	SourceStatus     string                        `json:"source_status"`
	DataQuality      string                        `json:"data_quality"`
	Summary          string                        `json:"summary"`
	LearningControls ExposureRadarLearningControls `json:"learning_controls"`
	Items            []ExposureRadarBriefItem      `json:"items"`
}

type ExposureRadarBriefItem struct {
	Rank             int      `json:"rank"`
	SignalID         string   `json:"signal_id"`
	Region           string   `json:"region"`
	DataSource       string   `json:"data_source,omitempty"`
	DataQuality      string   `json:"data_quality,omitempty"`
	TopicName        string   `json:"topic_name,omitempty"`
	Title            string   `json:"title"`
	Summary          string   `json:"summary"`
	Content          string   `json:"content,omitempty"`
	AuthorHandle     string   `json:"author_handle,omitempty"`
	AuthorName       string   `json:"author_name,omitempty"`
	WhyItMatters     string   `json:"why_it_matters"`
	SuggestedAction  string   `json:"suggested_action"`
	BestUse          string   `json:"best_use"`
	Score            int      `json:"score"`
	VelocityState    string   `json:"velocity_state,omitempty"`
	RiskLevel        string   `json:"risk_level"`
	SourceURL        string   `json:"source_url,omitempty"`
	Guardrails       []string `json:"guardrails,omitempty"`
	ReviewTaskID     uint     `json:"review_task_id,omitempty"`
	ReviewStatus     string   `json:"review_status,omitempty"`
	ReviewQueueURL   string   `json:"review_queue_url,omitempty"`
	GeneratedComment string   `json:"generated_comment,omitempty"`
	SavedMemoryID    uint     `json:"saved_memory_id,omitempty"`
}

type ExposureRadarPerformanceResponse struct {
	Region              string                         `json:"region"`
	BotID               uint                           `json:"bot_id,omitempty"`
	XAccountID          uint                           `json:"x_account_id,omitempty"`
	RangeDays           int                            `json:"range_days"`
	GeneratedAt         string                         `json:"generated_at"`
	OwnedSignalCount    int64                          `json:"owned_signal_count"`
	DraftCount          int64                          `json:"draft_count"`
	PendingReviewCount  int64                          `json:"pending_review_count"`
	ApprovedCount       int64                          `json:"approved_count"`
	RejectedCount       int64                          `json:"rejected_count"`
	PublishedCount      int64                          `json:"published_count"`
	HandledCount        int64                          `json:"handled_count"`
	PositiveCount       int64                          `json:"positive_count"`
	ApprovalRate        float64                        `json:"approval_rate"`
	CompletionRate      float64                        `json:"completion_rate"`
	OwnedCollectorShare float64                        `json:"owned_collector_share"`
	LearningControls    ExposureRadarLearningControls  `json:"learning_controls"`
	Regions             []ExposureRadarPerformanceStat `json:"regions"`
	TopTopics           []ExposureRadarTopicStat       `json:"top_topics"`
}

type ExposureRadarArchiveResponse struct {
	Region      string                    `json:"region"`
	BotID       uint                      `json:"bot_id,omitempty"`
	XAccountID  uint                      `json:"x_account_id,omitempty"`
	RangeDays   int                       `json:"range_days"`
	GeneratedAt string                    `json:"generated_at"`
	Days        []ExposureRadarArchiveDay `json:"days"`
}

type ExposureRadarArchiveDay struct {
	DateKey          string                   `json:"date_key"`
	Region           string                   `json:"region"`
	SignalCount      int64                    `json:"signal_count"`
	DraftCount       int64                    `json:"draft_count"`
	PendingCount     int64                    `json:"pending_count"`
	PositiveCount    int64                    `json:"positive_count"`
	RejectedCount    int64                    `json:"rejected_count"`
	SavedMemoryCount int64                    `json:"saved_memory_count"`
	TopTopics        []ExposureRadarTopicStat `json:"top_topics"`
}

type ExposureRadarPerformanceStat struct {
	Region             string `json:"region"`
	OwnedSignalCount   int64  `json:"owned_signal_count"`
	DraftCount         int64  `json:"draft_count"`
	PendingReviewCount int64  `json:"pending_review_count"`
	ApprovedCount      int64  `json:"approved_count"`
	RejectedCount      int64  `json:"rejected_count"`
	PublishedCount     int64  `json:"published_count"`
	HandledCount       int64  `json:"handled_count"`
	LatestCollectedAt  string `json:"latest_collected_at,omitempty"`
	LatestDraftedAt    string `json:"latest_drafted_at,omitempty"`
	SourceHealthStatus string `json:"source_health_status"`
}

type ExposureRadarTopicStat struct {
	TopicName    string `json:"topic_name"`
	Region       string `json:"region"`
	SignalCount  int64  `json:"signal_count"`
	DraftCount   int64  `json:"draft_count"`
	SuccessCount int64  `json:"success_count"`
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
