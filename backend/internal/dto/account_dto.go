package dto

type AccountItem struct {
	ID                    uint     `json:"id"`
	AvatarURL             string   `json:"avatar_url"`
	Username              string   `json:"username"`
	DisplayName           string   `json:"display_name"`
	Status                string   `json:"status"`
	LastSyncedAt          string   `json:"last_synced_at,omitempty"`
	Followers             string   `json:"followers,omitempty"`
	XSubscriptionTier     string   `json:"x_subscription_tier"`
	XSubscriptionSource   string   `json:"x_subscription_source"`
	PublishReady          bool     `json:"publish_ready"`
	PublishReauthRequired bool     `json:"publish_reauth_required"`
	PublishIssue          string   `json:"publish_issue,omitempty"`
	MissingScopes         []string `json:"missing_scopes,omitempty"`
	OAuthScopes           []string `json:"oauth_scopes,omitempty"`
}

type AccountListResponse struct {
	Items []AccountItem `json:"items"`
}

type OAuthStartResponse struct {
	AuthURL string `json:"auth_url"`
	State   string `json:"state"`
}

type AccountSettingsRequest struct {
	XSubscriptionTier string `json:"x_subscription_tier" binding:"required"`
}

type AccountIntelligencePost struct {
	ID              string   `json:"id"`
	Text            string   `json:"text"`
	URL             string   `json:"url,omitempty"`
	CreatedAt       string   `json:"created_at,omitempty"`
	LikeCount       int64    `json:"like_count"`
	ReplyCount      int64    `json:"reply_count"`
	RetweetCount    int64    `json:"retweet_count"`
	QuoteCount      int64    `json:"quote_count"`
	BookmarkCount   int64    `json:"bookmark_count"`
	ImpressionCount int64    `json:"impression_count"`
	Engagements     int64    `json:"engagements"`
	EngagementRate  float64  `json:"engagement_rate"`
	Score           int      `json:"score"`
	Topics          []string `json:"topics,omitempty"`
}

type AccountIntelligenceMetrics struct {
	PostCount             int     `json:"post_count"`
	PostsWithImpressions  int     `json:"posts_with_impressions"`
	TotalImpressions      int64   `json:"total_impressions"`
	TotalEngagements      int64   `json:"total_engagements"`
	AverageImpressions    int64   `json:"average_impressions"`
	AverageEngagementRate float64 `json:"average_engagement_rate"`
	BestPostID            string  `json:"best_post_id,omitempty"`
	BestPostURL           string  `json:"best_post_url,omitempty"`
	BestPostText          string  `json:"best_post_text,omitempty"`
	BestPostScore         int     `json:"best_post_score,omitempty"`
}

type AccountPositioningSnapshot struct {
	Confidence         int      `json:"confidence"`
	PrimaryLanguage    string   `json:"primary_language"`
	PositioningSummary string   `json:"positioning_summary"`
	AudienceGuess      string   `json:"audience_guess"`
	VoiceTone          string   `json:"voice_tone"`
	MaturityStage      string   `json:"maturity_stage"`
	DetectedTopics     []string `json:"detected_topics"`
	ContentPillars     []string `json:"content_pillars"`
	Strengths          []string `json:"strengths"`
	Risks              []string `json:"risks"`
}

type AccountRadarGuidance struct {
	FitKeywords         []string `json:"fit_keywords"`
	AvoidKeywords       []string `json:"avoid_keywords"`
	PreferredRegions    []string `json:"preferred_regions"`
	OpportunityFitRules []string `json:"opportunity_fit_rules"`
	RecommendedActions  []string `json:"recommended_actions"`
}

type AccountWeeklyReview struct {
	Headline    string   `json:"headline"`
	Wins        []string `json:"wins"`
	Risks       []string `json:"risks"`
	NextActions []string `json:"next_actions"`
}

type AccountIntelligenceResponse struct {
	Account       AccountItem                `json:"account"`
	GeneratedAt   string                     `json:"generated_at"`
	SourceStatus  string                     `json:"source_status"`
	LimitReason   string                     `json:"limit_reason,omitempty"`
	Metrics       AccountIntelligenceMetrics `json:"metrics"`
	Positioning   AccountPositioningSnapshot `json:"positioning"`
	BotSuggestion OAFBotUpsertRequest        `json:"bot_suggestion"`
	RadarGuidance AccountRadarGuidance       `json:"radar_guidance"`
	WeeklyReview  AccountWeeklyReview        `json:"weekly_review"`
	RecentPosts   []AccountIntelligencePost  `json:"recent_posts"`
}
