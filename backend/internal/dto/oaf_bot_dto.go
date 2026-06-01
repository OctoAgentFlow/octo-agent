package dto

type OAFBotItem struct {
	ID                   uint     `json:"id"`
	Name                 string   `json:"name"`
	TwitterAccountID     uint     `json:"twitter_account_id"`
	Occupation           string   `json:"occupation"`
	Industry             string   `json:"industry"`
	AgeRange             string   `json:"age_range"`
	Gender               string   `json:"gender"`
	Education            string   `json:"education"`
	MBTI                 string   `json:"mbti"`
	PersonalityTags      []string `json:"personality_tags"`
	IdentitySummary      string   `json:"identity_summary"`
	VoiceTone            string   `json:"voice_tone"`
	Topics               []string `json:"topics"`
	ForbiddenTopics      []string `json:"forbidden_topics"`
	GrowthGoal           string   `json:"growth_goal"`
	ProjectOneLiner      string   `json:"project_one_liner"`
	TargetAudience       string   `json:"target_audience"`
	CoreValueProps       string   `json:"core_value_props"`
	ProductFeatures      string   `json:"product_features"`
	Differentiators      string   `json:"differentiators"`
	ContentPillars       []string `json:"content_pillars"`
	ContentObjectives    string   `json:"content_objectives"`
	PreferredCTA         string   `json:"preferred_cta"`
	WebsiteURL           string   `json:"website_url"`
	TelegramURL          string   `json:"telegram_url"`
	DiscordURL           string   `json:"discord_url"`
	DocsURL              string   `json:"docs_url"`
	CTAPolicy            string   `json:"cta_policy"`
	Hashtags             []string `json:"hashtags"`
	Keywords             []string `json:"keywords"`
	ComplianceNotes      string   `json:"compliance_notes"`
	AvoidClaims          []string `json:"avoid_claims"`
	SafetyMode           string   `json:"safety_mode"`
	PrimaryLanguage      string   `json:"primary_language"`
	LanguageStrategy     string   `json:"language_strategy"`
	TrendRegions         []string `json:"trend_regions"`
	TrendCategories      []string `json:"trend_categories"`
	AllowGeneralTrends   bool     `json:"allow_general_trends"`
	SensitiveTrendPolicy string   `json:"sensitive_trend_policy"`
	CreatedAt            string   `json:"created_at"`
	UpdatedAt            string   `json:"updated_at"`
}

type OAFBotListResponse struct {
	Items  []OAFBotItem   `json:"items"`
	Usage  PlanUsageData  `json:"usage"`
	Limits PlanLimitsData `json:"limits"`
}

type OAFBotUpsertRequest struct {
	Name                 string   `json:"name" binding:"required"`
	TwitterAccountID     uint     `json:"twitter_account_id"`
	Occupation           string   `json:"occupation"`
	Industry             string   `json:"industry"`
	AgeRange             string   `json:"age_range"`
	Gender               string   `json:"gender"`
	Education            string   `json:"education"`
	MBTI                 string   `json:"mbti"`
	PersonalityTags      []string `json:"personality_tags"`
	IdentitySummary      string   `json:"identity_summary"`
	VoiceTone            string   `json:"voice_tone"`
	Topics               []string `json:"topics"`
	ForbiddenTopics      []string `json:"forbidden_topics"`
	GrowthGoal           string   `json:"growth_goal"`
	ProjectOneLiner      string   `json:"project_one_liner"`
	TargetAudience       string   `json:"target_audience"`
	CoreValueProps       string   `json:"core_value_props"`
	ProductFeatures      string   `json:"product_features"`
	Differentiators      string   `json:"differentiators"`
	ContentPillars       []string `json:"content_pillars"`
	ContentObjectives    string   `json:"content_objectives"`
	PreferredCTA         string   `json:"preferred_cta"`
	WebsiteURL           string   `json:"website_url"`
	TelegramURL          string   `json:"telegram_url"`
	DiscordURL           string   `json:"discord_url"`
	DocsURL              string   `json:"docs_url"`
	CTAPolicy            string   `json:"cta_policy"`
	Hashtags             []string `json:"hashtags"`
	Keywords             []string `json:"keywords"`
	ComplianceNotes      string   `json:"compliance_notes"`
	AvoidClaims          []string `json:"avoid_claims"`
	SafetyMode           string   `json:"safety_mode"`
	PrimaryLanguage      string   `json:"primary_language"`
	LanguageStrategy     string   `json:"language_strategy"`
	TrendRegions         []string `json:"trend_regions"`
	TrendCategories      []string `json:"trend_categories"`
	AllowGeneralTrends   bool     `json:"allow_general_trends"`
	SensitiveTrendPolicy string   `json:"sensitive_trend_policy"`
}

type OAFBotCompleteProfileRequest struct {
	Draft OAFBotUpsertRequest `json:"draft"`
	Mode  string              `json:"mode"`
}

type OAFBotCompleteProfileResponse struct {
	Profile       OAFBotUpsertRequest `json:"profile"`
	Provider      string              `json:"provider"`
	UsageConsumed int                 `json:"usage_consumed"`
	RawResult     string              `json:"raw_result,omitempty"`
}

type OAFBotFeedbackProfileSuggestionResponse struct {
	Profile       OAFBotUpsertRequest `json:"profile"`
	Provider      string              `json:"provider"`
	UsageConsumed int                 `json:"usage_consumed"`
	FeedbackCount int                 `json:"feedback_count"`
	RawResult     string              `json:"raw_result,omitempty"`
}

type OAFBotTestGenerateRequest struct {
	Scene                  string   `json:"scene"`
	SampleContext          string   `json:"sample_context"`
	DisabledLearningIssues []string `json:"disabled_learning_issues"`
}

type OAFBotRewriteSafetyRequest struct {
	Scene                  string            `json:"scene"`
	Content                string            `json:"content"`
	SampleContext          string            `json:"sample_context"`
	RewriteMode            string            `json:"rewrite_mode"`
	MatchedHits            []OAFBotSafetyHit `json:"matched_hits"`
	DisabledLearningIssues []string          `json:"disabled_learning_issues"`
}

type OAFBotTestGenerateResponse struct {
	BotID                 uint                         `json:"bot_id"`
	Scene                 string                       `json:"scene"`
	Content               string                       `json:"content"`
	Provider              string                       `json:"provider"`
	UsageConsumed         int                          `json:"usage_consumed"`
	FeedbackSignalCount   int                          `json:"feedback_signal_count"`
	FeedbackSignalSummary *OAFBotFeedbackSignalSummary `json:"feedback_signal_summary,omitempty"`
	RawResult             string                       `json:"raw_result,omitempty"`
	SafetyEvaluation      OAFBotSafetyEvaluationResult `json:"safety_evaluation"`
	Tweet                 string                       `json:"tweet"`
	Reply                 string                       `json:"reply"`
	Comment               string                       `json:"comment"`
	DM                    string                       `json:"dm"`
}

type OAFBotFeedbackSignalSummary struct {
	Count                int                         `json:"count"`
	Scenes               []string                    `json:"scenes"`
	IssueTags            []string                    `json:"issue_tags"`
	LatestComment        string                      `json:"latest_comment,omitempty"`
	AppliedLearningRules []OAFBotAppliedLearningRule `json:"applied_learning_rules,omitempty"`
}

type OAFBotAppliedLearningRule struct {
	Issue             string   `json:"issue"`
	Confidence        int      `json:"confidence"`
	AccurateJudgments int      `json:"accurate_judgments"`
	Instruction       string   `json:"instruction"`
	Evidence          []string `json:"evidence,omitempty"`
	PreferenceStatus  string   `json:"preference_status,omitempty"`
}

type OAFBotLearningRulePreferenceItem struct {
	BotID         uint   `json:"bot_id"`
	FeedbackIssue string `json:"feedback_issue"`
	Status        string `json:"status"`
}

type OAFBotLearningRulePreferenceResponse struct {
	Items []OAFBotLearningRulePreferenceItem `json:"items"`
}

type OAFBotLearningRulePreferenceRequest struct {
	FeedbackIssue string `json:"feedback_issue" binding:"required"`
	Status        string `json:"status" binding:"required"`
}

type OAFBotSafetyHit struct {
	Source string `json:"source"`
	Term   string `json:"term"`
}

type OAFBotSafetyEvaluationResult struct {
	Level       string            `json:"level"`
	Action      string            `json:"action"`
	Category    string            `json:"category"`
	Reason      string            `json:"reason"`
	MatchedHits []OAFBotSafetyHit `json:"matched_hits"`
}

type OAFBotGenerationUsageItem struct {
	BotID     uint   `json:"bot_id"`
	Scene     string `json:"scene"`
	Month     string `json:"month"`
	Count     int64  `json:"count"`
	UpdatedAt string `json:"updated_at"`
}

type OAFBotGenerationUsageResponse struct {
	Items []OAFBotGenerationUsageItem `json:"items"`
}

type OAFBotGenerationFeedbackRequest struct {
	Scene            string   `json:"scene" binding:"required"`
	Rating           string   `json:"rating" binding:"required"`
	IssueTags        []string `json:"issue_tags"`
	Comment          string   `json:"comment"`
	SampleContext    string   `json:"sample_context"`
	GeneratedContent string   `json:"generated_content"`
	Provider         string   `json:"provider"`
}

type OAFBotGenerationFeedbackItem struct {
	ID               uint     `json:"id"`
	BotID            uint     `json:"bot_id"`
	Scene            string   `json:"scene"`
	Rating           string   `json:"rating"`
	IssueTags        []string `json:"issue_tags"`
	Comment          string   `json:"comment"`
	SampleContext    string   `json:"sample_context"`
	GeneratedContent string   `json:"generated_content"`
	Provider         string   `json:"provider"`
	CreatedAt        string   `json:"created_at"`
}

type OAFBotGenerationFeedbackResponse struct {
	Items []OAFBotGenerationFeedbackItem `json:"items"`
}

type OAFBotFeedbackSummaryIssue struct {
	Tag   string `json:"tag"`
	Count int    `json:"count"`
}

type OAFBotFeedbackSummaryScene struct {
	Scene string `json:"scene"`
	Count int    `json:"count"`
}

type OAFBotFeedbackSummaryResponse struct {
	Days           int                          `json:"days"`
	NegativeCount  int                          `json:"negative_count"`
	TopIssues      []OAFBotFeedbackSummaryIssue `json:"top_issues"`
	Scenes         []OAFBotFeedbackSummaryScene `json:"scenes"`
	LastFeedbackAt string                       `json:"last_feedback_at,omitempty"`
}

type OAFBotMatrixSignalItem struct {
	BotID             uint                           `json:"bot_id"`
	Usages            []OAFBotGenerationUsageItem    `json:"usages"`
	Feedback          []OAFBotGenerationFeedbackItem `json:"feedback"`
	InspectionFlags   []string                       `json:"inspection_flags"`
	InspectionMetrics OAFBotMatrixInspectionMetrics  `json:"inspection_metrics"`
}

type OAFBotMatrixInspectionMetrics struct {
	ActiveContentCount int `json:"active_content_count"`
	NegativeFeedback   int `json:"negative_feedback"`
	PendingReview      int `json:"pending_review"`
}

type OAFBotMatrixInspectionSummary struct {
	UnboundCount          int `json:"unbound_count"`
	AutoPostNotReadyCount int `json:"auto_post_not_ready_count"`
	NegativeFeedbackCount int `json:"negative_feedback_count"`
	ReviewBacklogCount    int `json:"review_backlog_count"`
}

type OAFBotMatrixSignalsResponse struct {
	Items   []OAFBotMatrixSignalItem      `json:"items"`
	Summary OAFBotMatrixInspectionSummary `json:"summary"`
}

type OAFBotDashboardSummaryResponse struct {
	Bots                    []OAFBotItem                          `json:"bots"`
	Usage                   PlanUsageData                         `json:"usage"`
	Limits                  PlanLimitsData                        `json:"limits"`
	InspectionSummary       OAFBotMatrixInspectionSummary         `json:"inspection_summary"`
	FeedbackSummary         OAFBotFeedbackSummaryResponse         `json:"feedback_summary"`
	VerdictStats            []ReviewQueueFeedbackIssueVerdictStat `json:"verdict_stats"`
	LearningRulePreferences []OAFBotLearningRulePreferenceItem    `json:"learning_rule_preferences"`
}
