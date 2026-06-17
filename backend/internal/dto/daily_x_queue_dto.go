package dto

type DailyXQueueSetupRequest struct {
	BotID           uint   `json:"bot_id"`
	XHandle         string `json:"x_handle"`
	WebsiteURL      string `json:"website_url"`
	ProductContext  string `json:"product_context"`
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

type DailyXQueueImportURLRequest struct {
	SourceURL string `json:"source_url" binding:"required"`
}

type DailyXQueueSelectSourceMaterialRequest struct {
	ContentLibraryID uint `json:"content_library_id" binding:"required"`
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

type DailyXQueueRunItem struct {
	ID               uint   `json:"id"`
	RunID            uint   `json:"run_id"`
	DraftID          uint   `json:"draft_id"`
	ItemType         string `json:"item_type"`
	Status           string `json:"status"`
	ContentDirection string `json:"content_direction,omitempty"`
	CreatedAt        string `json:"created_at"`
}

type DailyXQueueRunSummary struct {
	ID                    uint                 `json:"id"`
	Status                string               `json:"status"`
	DraftCount            int                  `json:"draft_count"`
	ReviewActionsCount    int64                `json:"review_actions_count"`
	ApprovedOrCopiedCount int64                `json:"approved_or_copied_count"`
	LearningAppliedCount  int                  `json:"learning_applied_count"`
	StartedAt             string               `json:"started_at"`
	CompletedAt           string               `json:"completed_at,omitempty"`
	Items                 []DailyXQueueRunItem `json:"items"`
}

type DailyXQueueOverviewResponse struct {
	Context              *DailyXQueueContextItem `json:"context,omitempty"`
	Bot                  *OAFBotItem             `json:"bot,omitempty"`
	SourceMaterial       *ContentLibraryItem     `json:"source_material,omitempty"`
	Drafts               []DailyXQueueDraftItem  `json:"drafts"`
	LatestRun            *DailyXQueueRunSummary  `json:"latest_run,omitempty"`
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
	Run                  *DailyXQueueRunSummary `json:"run,omitempty"`
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
