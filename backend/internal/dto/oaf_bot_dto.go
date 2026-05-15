package dto

type OAFBotItem struct {
	ID               uint     `json:"id"`
	Name             string   `json:"name"`
	TwitterAccountID uint     `json:"twitter_account_id"`
	Occupation       string   `json:"occupation"`
	Industry         string   `json:"industry"`
	AgeRange         string   `json:"age_range"`
	Gender           string   `json:"gender"`
	Education        string   `json:"education"`
	MBTI             string   `json:"mbti"`
	PersonalityTags  []string `json:"personality_tags"`
	IdentitySummary  string   `json:"identity_summary"`
	VoiceTone        string   `json:"voice_tone"`
	Topics           []string `json:"topics"`
	ForbiddenTopics  []string `json:"forbidden_topics"`
	GrowthGoal       string   `json:"growth_goal"`
	SafetyMode       string   `json:"safety_mode"`
	PrimaryLanguage  string   `json:"primary_language"`
	LanguageStrategy string   `json:"language_strategy"`
	CreatedAt        string   `json:"created_at"`
	UpdatedAt        string   `json:"updated_at"`
}

type OAFBotListResponse struct {
	Items  []OAFBotItem   `json:"items"`
	Usage  PlanUsageData  `json:"usage"`
	Limits PlanLimitsData `json:"limits"`
}

type OAFBotUpsertRequest struct {
	Name             string   `json:"name" binding:"required"`
	TwitterAccountID uint     `json:"twitter_account_id"`
	Occupation       string   `json:"occupation"`
	Industry         string   `json:"industry"`
	AgeRange         string   `json:"age_range"`
	Gender           string   `json:"gender"`
	Education        string   `json:"education"`
	MBTI             string   `json:"mbti"`
	PersonalityTags  []string `json:"personality_tags"`
	IdentitySummary  string   `json:"identity_summary"`
	VoiceTone        string   `json:"voice_tone"`
	Topics           []string `json:"topics"`
	ForbiddenTopics  []string `json:"forbidden_topics"`
	GrowthGoal       string   `json:"growth_goal"`
	SafetyMode       string   `json:"safety_mode"`
	PrimaryLanguage  string   `json:"primary_language"`
	LanguageStrategy string   `json:"language_strategy"`
}

type OAFBotTestGenerateResponse struct {
	Tweet   string `json:"tweet"`
	Reply   string `json:"reply"`
	Comment string `json:"comment"`
	DM      string `json:"dm"`
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
