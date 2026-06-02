package dto

type DailyXQueueSetupRequest struct {
	XHandle         string `json:"x_handle" binding:"required"`
	WebsiteURL      string `json:"website_url"`
	ProductContext  string `json:"product_context" binding:"required"`
	TargetAudience  string `json:"target_audience"`
	VoicePreference string `json:"voice_preference"`
	Guardrails      string `json:"guardrails"`
}

type DailyXQueueSourceMaterialRequest struct {
	Title         string   `json:"title" binding:"required"`
	Body          string   `json:"body" binding:"required"`
	SourceURL     string   `json:"source_url"`
	Topics        []string `json:"topics"`
	GrowthGoal    string   `json:"growth_goal"`
	CTAPreference string   `json:"cta_preference"`
}

type DailyXQueueDraftUpdateRequest struct {
	GeneratedContent string `json:"generated_content" binding:"required"`
}

type DailyXQueueDraftRejectRequest struct {
	Reason string `json:"reason" binding:"required"`
}

type DailyXQueueDraftRewriteRequest struct {
	RewriteMode string `json:"rewrite_mode"`
	Feedback    string `json:"feedback"`
}

type DailyXQueueContextItem struct {
	ID               uint   `json:"id"`
	XHandle          string `json:"x_handle"`
	WebsiteURL       string `json:"website_url,omitempty"`
	ProductContext   string `json:"product_context,omitempty"`
	TargetAudience   string `json:"target_audience,omitempty"`
	VoicePreference  string `json:"voice_preference,omitempty"`
	Guardrails       string `json:"guardrails,omitempty"`
	BotID            uint   `json:"bot_id"`
	ContentLibraryID uint   `json:"content_library_id"`
	Activated        bool   `json:"activated"`
}

type DailyXQueueDraftItem struct {
	AutoPostDraftItem
	WhyGenerated string `json:"why_generated"`
	SourceUsed   string `json:"source_used"`
	CopiedCount  int64  `json:"copied_count"`
}

type DailyXQueueOverviewResponse struct {
	Context              *DailyXQueueContextItem `json:"context,omitempty"`
	Bot                  *OAFBotItem             `json:"bot,omitempty"`
	SourceMaterial       *ContentLibraryItem     `json:"source_material,omitempty"`
	Drafts               []DailyXQueueDraftItem  `json:"drafts"`
	ReviewActionsCount   int64                   `json:"review_actions_count"`
	ApprovedOrCopied     int64                   `json:"approved_or_copied_count"`
	Activated            bool                    `json:"activated"`
	LearningAppliedCount int                     `json:"learning_applied_count"`
	LearningSummary      string                  `json:"learning_summary,omitempty"`
}

type DailyXQueueSetupResponse struct {
	Context DailyXQueueContextItem `json:"context"`
	Bot     OAFBotItem             `json:"bot"`
}

type DailyXQueueSourceMaterialResponse struct {
	Context        DailyXQueueContextItem `json:"context"`
	SourceMaterial ContentLibraryItem     `json:"source_material"`
}

type DailyXQueueGenerateResponse struct {
	Context              DailyXQueueContextItem `json:"context"`
	Drafts               []DailyXQueueDraftItem `json:"drafts"`
	LearningAppliedCount int                    `json:"learning_applied_count"`
	LearningSummary      string                 `json:"learning_summary,omitempty"`
}

type DailyXQueueActionResponse struct {
	Draft              DailyXQueueDraftItem `json:"draft"`
	ReviewActionsCount int64                `json:"review_actions_count"`
	ApprovedOrCopied   int64                `json:"approved_or_copied_count"`
	Activated          bool                 `json:"activated"`
	Message            string               `json:"message,omitempty"`
}
