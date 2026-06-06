package dto

type SiteLinksResponse struct {
	OfficialXURL string `json:"official_x_url"`
	TelegramURL  string `json:"telegram_url"`
}

type OAFBotLaunchPlanRequest struct {
	Stage            string `json:"stage"`
	AccountType      string `json:"account_type"`
	XHandle          string `json:"x_handle"`
	ProjectSummary   string `json:"project_summary" binding:"required"`
	TargetAudience   string `json:"target_audience"`
	DesiredFollowers string `json:"desired_followers"`
	Industry         string `json:"industry"`
	SourceMaterial   string `json:"source_material"`
	VoicePreference  string `json:"voice_preference"`
	Guardrails       string `json:"guardrails"`
	WebsiteURL       string `json:"website_url"`
	OutputLanguage   string `json:"output_language"`
}

type OAFBotLaunchPlanResponse struct {
	Token           string                 `json:"token"`
	CreateOAFBotURL string                 `json:"create_oaf_bot_url"`
	Plan            OAFBotLaunchPlanOutput `json:"plan"`
	CreatedAt       string                 `json:"created_at"`
}

type OAFBotLaunchPlanOutput struct {
	AccountPositioning    string                  `json:"account_positioning"`
	RecommendedBotType    string                  `json:"recommended_bot_type"`
	RecommendedOccupation string                  `json:"recommended_occupation"`
	RecommendedIndustries []string                `json:"recommended_industries"`
	ContentThemes         []string                `json:"content_themes"`
	SafetyGuardrails      []string                `json:"safety_guardrails"`
	SevenDayPlan          []OAFBotLaunchPlanDay   `json:"seven_day_plan"`
	FirstPosts            []OAFBotLaunchPlanDraft `json:"first_posts"`
	CommentExamples       []OAFBotLaunchPlanDraft `json:"comment_examples"`
	BioSuggestion         string                  `json:"bio_suggestion"`
	OperatingCadence      string                  `json:"operating_cadence"`
	CreateOAFBotCTA       string                  `json:"create_oaf_bot_cta"`
}

type OAFBotLaunchPlanDay struct {
	Day     int    `json:"day"`
	Theme   string `json:"theme"`
	Action  string `json:"action"`
	Outcome string `json:"outcome"`
}

type OAFBotLaunchPlanDraft struct {
	Label   string `json:"label"`
	Content string `json:"content"`
	Why     string `json:"why"`
}
