package dto

type OAFBotItem struct {
	ID                uint     `json:"id"`
	Name              string   `json:"name"`
	TwitterAccountID  uint     `json:"twitter_account_id"`
	Occupation        string   `json:"occupation"`
	Industry          string   `json:"industry"`
	AgeRange          string   `json:"age_range"`
	Gender            string   `json:"gender"`
	Education         string   `json:"education"`
	MBTI              string   `json:"mbti"`
	PersonalityTags   []string `json:"personality_tags"`
	IdentitySummary   string   `json:"identity_summary"`
	VoiceTone         string   `json:"voice_tone"`
	Topics            []string `json:"topics"`
	ForbiddenTopics   []string `json:"forbidden_topics"`
	GrowthGoal        string   `json:"growth_goal"`
	ProjectOneLiner   string   `json:"project_one_liner"`
	TargetAudience    string   `json:"target_audience"`
	CoreValueProps    string   `json:"core_value_props"`
	ProductFeatures   string   `json:"product_features"`
	Differentiators   string   `json:"differentiators"`
	ContentPillars    []string `json:"content_pillars"`
	ContentObjectives string   `json:"content_objectives"`
	PreferredCTA      string   `json:"preferred_cta"`
	Hashtags          []string `json:"hashtags"`
	Keywords          []string `json:"keywords"`
	ComplianceNotes   string   `json:"compliance_notes"`
	AvoidClaims       []string `json:"avoid_claims"`
	SafetyMode        string   `json:"safety_mode"`
	PrimaryLanguage   string   `json:"primary_language"`
	LanguageStrategy  string   `json:"language_strategy"`
	CreatedAt         string   `json:"created_at"`
	UpdatedAt         string   `json:"updated_at"`
}

type OAFBotListResponse struct {
	Items  []OAFBotItem   `json:"items"`
	Usage  PlanUsageData  `json:"usage"`
	Limits PlanLimitsData `json:"limits"`
}

type OAFBotUpsertRequest struct {
	Name              string   `json:"name" binding:"required"`
	TwitterAccountID  uint     `json:"twitter_account_id"`
	Occupation        string   `json:"occupation"`
	Industry          string   `json:"industry"`
	AgeRange          string   `json:"age_range"`
	Gender            string   `json:"gender"`
	Education         string   `json:"education"`
	MBTI              string   `json:"mbti"`
	PersonalityTags   []string `json:"personality_tags"`
	IdentitySummary   string   `json:"identity_summary"`
	VoiceTone         string   `json:"voice_tone"`
	Topics            []string `json:"topics"`
	ForbiddenTopics   []string `json:"forbidden_topics"`
	GrowthGoal        string   `json:"growth_goal"`
	ProjectOneLiner   string   `json:"project_one_liner"`
	TargetAudience    string   `json:"target_audience"`
	CoreValueProps    string   `json:"core_value_props"`
	ProductFeatures   string   `json:"product_features"`
	Differentiators   string   `json:"differentiators"`
	ContentPillars    []string `json:"content_pillars"`
	ContentObjectives string   `json:"content_objectives"`
	PreferredCTA      string   `json:"preferred_cta"`
	Hashtags          []string `json:"hashtags"`
	Keywords          []string `json:"keywords"`
	ComplianceNotes   string   `json:"compliance_notes"`
	AvoidClaims       []string `json:"avoid_claims"`
	SafetyMode        string   `json:"safety_mode"`
	PrimaryLanguage   string   `json:"primary_language"`
	LanguageStrategy  string   `json:"language_strategy"`
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
	Scene         string `json:"scene"`
	SampleContext string `json:"sample_context"`
}

type OAFBotTestGenerateResponse struct {
	BotID            uint                         `json:"bot_id"`
	Scene            string                       `json:"scene"`
	Content          string                       `json:"content"`
	Provider         string                       `json:"provider"`
	UsageConsumed    int                          `json:"usage_consumed"`
	RawResult        string                       `json:"raw_result,omitempty"`
	SafetyEvaluation OAFBotSafetyEvaluationResult `json:"safety_evaluation"`
	Tweet            string                       `json:"tweet"`
	Reply            string                       `json:"reply"`
	Comment          string                       `json:"comment"`
	DM               string                       `json:"dm"`
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
