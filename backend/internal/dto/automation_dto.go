package dto

type AutomationFrequency struct {
	IntervalMinutes int `json:"interval_minutes" binding:"required,min=1,max=1440"`
	DailyLimit      int `json:"daily_limit" binding:"omitempty,min=0,max=5000"` // Deprecated: accepted for API compatibility; monthly plan quota is enforced instead.
}

type AutomationSafety struct {
	RequireApproval bool     `json:"require_approval"`
	MaxPerHour      int      `json:"max_per_hour" binding:"omitempty,min=0,max=500"` // Deprecated: accepted for API compatibility; monthly plan quota is enforced instead.
	BlockedKeywords []string `json:"blocked_keywords"`
}

type AutomationConfigPayload struct {
	Enabled       bool                `json:"enabled"`
	Frequency     AutomationFrequency `json:"frequency" binding:"required"`
	Tone          string              `json:"tone" binding:"required"`
	ExecutionMode string              `json:"execution_mode"`
	Safety        AutomationSafety    `json:"safety" binding:"required"`
}

type AutomationExecutionModeRequest struct {
	ExecutionMode string `json:"execution_mode" binding:"required"`
}

type AutomationReplyUsage struct {
	TodayCount     int    `json:"today_count"`
	DailyLimit     int    `json:"daily_limit"`
	RemainingToday int    `json:"remaining_today"`
	LastExecutedAt string `json:"last_executed_at,omitempty"`
}

type AutomationModuleData struct {
	Type            string                  `json:"type"`
	Name            string                  `json:"name"`
	State           string                  `json:"state"`
	Config          AutomationConfigPayload `json:"config"`
	LastRunAt       string                  `json:"last_run_at,omitempty"`
	NextRunAt       string                  `json:"next_run_at,omitempty"`
	LastScanStatus  string                  `json:"last_scan_status,omitempty"`
	LastScanMessage string                  `json:"last_scan_message,omitempty"`
	LastScanAt      string                  `json:"last_scan_at,omitempty"`
	// ExecutedToday is today's successful execution count for this automation type.
	ExecutedToday int `json:"executed_today"`
	// ReplyUsage is set only for type=reply (today count, remaining daily quota, last reply activity time).
	ReplyUsage *AutomationReplyUsage `json:"reply_usage,omitempty"`
}

type AutomationsResponse struct {
	Modules []AutomationModuleData `json:"modules"`
}

type ToggleAutomationRequest struct {
	Enabled bool `json:"enabled"`
}

type AutomationRuntimeStatusData struct {
	QueueDepth    int    `json:"queue_depth"`
	LastSuccessAt string `json:"last_success_at"`
	RetriesLast24 int    `json:"retries_last_24h"`
	NeedsReview   int    `json:"needs_review"`
}

type AutoReplyDraftRequest struct {
	XAccountID          uint   `json:"x_account_id" binding:"required"`
	CommentAuthorHandle string `json:"comment_author_handle" binding:"required"`
	RootTweetText       string `json:"root_tweet_text"`
	CommentText         string `json:"comment_text" binding:"required"`
	CommentURL          string `json:"comment_url"`
	CommentTweetID      string `json:"comment_tweet_id"`
}

type AutoReplyDraftItem struct {
	ID                    uint                         `json:"id"`
	BotID                 uint                         `json:"bot_id"`
	XAccountID            uint                         `json:"x_account_id"`
	CommentTweetID        string                       `json:"comment_tweet_id,omitempty"`
	CommentURL            string                       `json:"comment_url,omitempty"`
	CommentAuthorHandle   string                       `json:"comment_author_handle"`
	RootTweetText         string                       `json:"root_tweet_text,omitempty"`
	CommentText           string                       `json:"comment_text"`
	GeneratedReply        string                       `json:"generated_reply,omitempty"`
	FeedbackSignalCount   int                          `json:"feedback_signal_count"`
	FeedbackSignalSummary *OAFBotFeedbackSignalSummary `json:"feedback_signal_summary,omitempty"`
	Status                string                       `json:"status"`
	RiskLevel             string                       `json:"risk_level"`
	CapabilityStatus      string                       `json:"capability_status"`
	FailureCategory       string                       `json:"failure_category,omitempty"`
	FailureReason         string                       `json:"failure_reason,omitempty"`
	ApprovalRequired      bool                         `json:"approval_required"`
	ActivityLogID         uint                         `json:"activity_log_id,omitempty"`
	CreatedAt             string                       `json:"created_at"`
	GeneratedAt           string                       `json:"generated_at,omitempty"`
	ApprovedAt            string                       `json:"approved_at,omitempty"`
	RejectedAt            string                       `json:"rejected_at,omitempty"`
	SentAt                string                       `json:"sent_at,omitempty"`
}

type AutoReplyDraftsResponse struct {
	Items []AutoReplyDraftItem `json:"items"`
}

type AutoReplyDraftUpdateRequest struct {
	GeneratedReply string `json:"generated_reply" binding:"required"`
}

type SocialDraftRewriteRequest struct {
	RewriteMode            string   `json:"rewrite_mode"`
	Feedback               string   `json:"feedback"`
	DisabledLearningIssues []string `json:"disabled_learning_issues"`
}

// AutoPost* DTOs remain the legacy wire contract for /auto-post and persisted
// clients. ContentDraft* aliases below are the preferred runtime names.
type AutoPostPlanRequest struct {
	XAccountID           uint     `json:"x_account_id" binding:"required"`
	Enabled              bool     `json:"enabled"`
	ExecutionMode        string   `json:"execution_mode"`
	DailyLimit           int      `json:"daily_limit"` // Deprecated: kept for API compatibility; monthly plan quota is enforced instead.
	MinIntervalMinutes   int      `json:"min_interval_minutes"`
	PostingWindows       string   `json:"posting_windows"`
	Timezone             string   `json:"timezone"`
	ContentLengthMode    string   `json:"content_length_mode"`
	TrendRegions         []string `json:"trend_regions"`
	TrendCategories      []string `json:"trend_categories"`
	ExcludedTrendNames   []string `json:"excluded_trend_names"`
	AllowGeneralTrends   bool     `json:"allow_general_trends"`
	SensitiveTrendPolicy string   `json:"sensitive_trend_policy"`
}

type AutoPostGenerateRequest struct {
	ContentDirection     string   `json:"content_direction"`
	ContentLibraryItemID uint     `json:"content_library_item_id"`
	ExcludedTrendNames   []string `json:"excluded_trend_names"`
}

type AutoPostDraftUpdateRequest struct {
	GeneratedContent string `json:"generated_content" binding:"required"`
}

type AutoPostDraftRewriteRequest struct {
	RewriteMode            string   `json:"rewrite_mode"`
	Feedback               string   `json:"feedback"`
	DisabledLearningIssues []string `json:"disabled_learning_issues"`
}

type AutoPostDraftRejectRequest struct {
	Reason string `json:"reason"`
}

type AutoPostPlanItem struct {
	ID                   uint     `json:"id"`
	UserID               uint     `json:"user_id"`
	XAccountID           uint     `json:"x_account_id"`
	AccountHandle        string   `json:"account_handle,omitempty"`
	BotID                uint     `json:"bot_id"`
	BotName              string   `json:"bot_name,omitempty"`
	Enabled              bool     `json:"enabled"`
	ExecutionMode        string   `json:"execution_mode"`
	DailyLimit           int      `json:"daily_limit"` // Deprecated: kept for API compatibility; monthly plan quota is enforced instead.
	MinIntervalMinutes   int      `json:"min_interval_minutes"`
	PostingWindows       string   `json:"posting_windows"`
	Timezone             string   `json:"timezone"`
	ContentLengthMode    string   `json:"content_length_mode"`
	TrendRegions         []string `json:"trend_regions"`
	TrendCategories      []string `json:"trend_categories"`
	ExcludedTrendNames   []string `json:"excluded_trend_names"`
	AllowGeneralTrends   bool     `json:"allow_general_trends"`
	SensitiveTrendPolicy string   `json:"sensitive_trend_policy"`
	LastRunAt            string   `json:"last_run_at,omitempty"`
	NextRunAt            string   `json:"next_run_at,omitempty"`
	ProcessingAt         string   `json:"processing_at,omitempty"`
	CreatedAt            string   `json:"created_at"`
	UpdatedAt            string   `json:"updated_at"`
}

type AutoPostDraftItem struct {
	ID                    uint                         `json:"id"`
	UserID                uint                         `json:"user_id"`
	PlanID                uint                         `json:"plan_id"`
	BotID                 uint                         `json:"bot_id"`
	BotName               string                       `json:"bot_name,omitempty"`
	XAccountID            uint                         `json:"x_account_id"`
	ContentLibraryID      uint                         `json:"content_library_item_id,omitempty"`
	ContentTitle          string                       `json:"content_title,omitempty"`
	ExposureSourceTrace   *ExposureSourceTrace         `json:"exposure_source_trace,omitempty"`
	AccountHandle         string                       `json:"account_handle,omitempty"`
	ContentDirection      string                       `json:"content_direction,omitempty"`
	ContentHash           string                       `json:"content_hash,omitempty"`
	SelectedTrends        []TrendTopicItem             `json:"selected_trends,omitempty"`
	GeneratedContent      string                       `json:"generated_content"`
	FeedbackSignalCount   int                          `json:"feedback_signal_count"`
	FeedbackSignalSummary *OAFBotFeedbackSignalSummary `json:"feedback_signal_summary,omitempty"`
	Status                string                       `json:"status"`
	RiskLevel             string                       `json:"risk_level"`
	CapabilityStatus      string                       `json:"capability_status"`
	FailureCategory       string                       `json:"failure_category,omitempty"`
	FailureReason         string                       `json:"failure_reason,omitempty"`
	ApprovalRequired      bool                         `json:"approval_required"`
	ActivityLogID         uint                         `json:"activity_log_id,omitempty"`
	CreatedAt             string                       `json:"created_at"`
	GeneratedAt           string                       `json:"generated_at,omitempty"`
	ApprovedAt            string                       `json:"approved_at,omitempty"`
	RejectedAt            string                       `json:"rejected_at,omitempty"`
	PublishedAt           string                       `json:"published_at,omitempty"`
}

type AutoPostPlansResponse struct {
	Items []AutoPostPlanItem `json:"items"`
}

type AutoPostDraftsResponse struct {
	Items []AutoPostDraftItem `json:"items"`
}

type AutoPostGenerationRunItem struct {
	ID               uint             `json:"id"`
	UserID           uint             `json:"user_id"`
	PlanID           uint             `json:"plan_id"`
	XAccountID       uint             `json:"x_account_id"`
	AccountHandle    string           `json:"account_handle,omitempty"`
	BotID            uint             `json:"bot_id"`
	BotName          string           `json:"bot_name,omitempty"`
	ContentLibraryID uint             `json:"content_library_item_id,omitempty"`
	ContentTitle     string           `json:"content_title,omitempty"`
	ContentItemTitle string           `json:"content_library_item_title,omitempty"`
	Status           string           `json:"status"`
	SkipReason       string           `json:"skip_reason,omitempty"`
	GeneratedDraftID uint             `json:"generated_draft_id,omitempty"`
	SelectedTrends   []TrendTopicItem `json:"selected_trends,omitempty"`
	ErrorMessage     string           `json:"error_message,omitempty"`
	CreatedAt        string           `json:"created_at"`
}

type AutoPostGenerationRunQuery struct {
	Status     string `form:"status"`
	XAccountID uint   `form:"x_account_id"`
	Range      string `form:"range"`
	DateFrom   string `form:"date_from"`
	DateTo     string `form:"date_to"`
	Page       int    `form:"page"`
	PageSize   int    `form:"page_size"`
}

type AutoPostGenerationRunsResponse struct {
	Items      []AutoPostGenerationRunItem `json:"items"`
	Pagination ActivityPagination          `json:"pagination"`
}

type ContentDraftPlanRequest = AutoPostPlanRequest
type ContentDraftGenerateRequest = AutoPostGenerateRequest
type ContentDraftUpdateRequest = AutoPostDraftUpdateRequest
type ContentDraftRewriteRequest = AutoPostDraftRewriteRequest
type ContentDraftRejectRequest = AutoPostDraftRejectRequest
type ContentDraftPlanItem = AutoPostPlanItem
type ContentDraftItem = AutoPostDraftItem
type ContentDraftPlansResponse = AutoPostPlansResponse
type ContentDraftsResponse = AutoPostDraftsResponse
type ContentDraftGenerationRunItem = AutoPostGenerationRunItem
type ContentDraftGenerationRunQuery = AutoPostGenerationRunQuery
type ContentDraftGenerationRunsResponse = AutoPostGenerationRunsResponse

type AutoDMTaskItem struct {
	ID                  uint                       `json:"id"`
	XAccountID          uint                       `json:"x_account_id,omitempty"`
	AccountHandle       string                     `json:"account_handle"`
	RecipientSource     string                     `json:"recipient_source"`
	RecipientUserID     string                     `json:"recipient_user_id,omitempty"`
	RecipientUsername   string                     `json:"recipient_username,omitempty"`
	RecipientSegment    string                     `json:"recipient_segment,omitempty"`
	MessagePreview      string                     `json:"message_preview,omitempty"`
	GenerationReason    string                     `json:"generation_reason,omitempty"`
	MessageVariants     []AutoDMMessageVariantItem `json:"message_variants,omitempty"`
	Status              string                     `json:"status"`
	CapabilityStatus    string                     `json:"capability_status"`
	FailureCategory     string                     `json:"failure_category,omitempty"`
	FailureReason       string                     `json:"failure_reason,omitempty"`
	Retryable           bool                       `json:"retryable"`
	RetryAfterAt        string                     `json:"retry_after_at,omitempty"`
	AttemptCount        int                        `json:"attempt_count"`
	LastAttemptAt       string                     `json:"last_attempt_at,omitempty"`
	ApprovalRequired    bool                       `json:"approval_required"`
	ActivityLogID       uint                       `json:"activity_log_id,omitempty"`
	DMConversationID    string                     `json:"dm_conversation_id,omitempty"`
	DMEventID           string                     `json:"dm_event_id,omitempty"`
	LastInboundScanAt   string                     `json:"last_inbound_scan_at,omitempty"`
	InboundReplyAt      string                     `json:"inbound_reply_at,omitempty"`
	InboundReplyEventID string                     `json:"inbound_reply_event_id,omitempty"`
	GeneratedAt         string                     `json:"generated_at"`
	ApprovedAt          string                     `json:"approved_at,omitempty"`
	BlockedAt           string                     `json:"blocked_at,omitempty"`
	SentAt              string                     `json:"sent_at,omitempty"`
	Diagnostics         []AutoDMDiagnosticItem     `json:"diagnostics,omitempty"`
}

type AutoDMDiagnosticItem struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Status   string `json:"status"`
	Severity string `json:"severity"`
	Detail   string `json:"detail,omitempty"`
}

type AutoDMTasksResponse struct {
	Items []AutoDMTaskItem `json:"items"`
}

type AutoDMOverviewResponse struct {
	PlanCode        string                `json:"plan_code"`
	PeriodStart     string                `json:"period_start,omitempty"`
	PeriodEnd       string                `json:"period_end,omitempty"`
	MonthlyLimit    int64                 `json:"monthly_limit"`
	MonthlyUsed     int64                 `json:"monthly_used"`
	MonthlyRemain   int64                 `json:"monthly_remaining"`
	DailySoftLimit  int64                 `json:"daily_soft_limit"`
	DailyUsed       int64                 `json:"daily_used"`
	DailyRemaining  int64                 `json:"daily_remaining"`
	NextResetAt     string                `json:"next_reset_at,omitempty"`
	QuotaExhausted  bool                  `json:"quota_exhausted"`
	UpgradeRequired bool                  `json:"upgrade_required"`
	SegmentMetrics  []AutoDMSegmentMetric `json:"segment_metrics,omitempty"`
}

type AutoDMSegmentMetric struct {
	Segment                string `json:"segment"`
	Sent                   int64  `json:"sent"`
	Failed                 int64  `json:"failed"`
	Blocked                int64  `json:"blocked"`
	Review                 int64  `json:"review"`
	Unsubscribed           int64  `json:"unsubscribed"`
	Replies                int64  `json:"replies"`
	SendSuccessRatePct     int    `json:"send_success_rate_pct"`
	ReplyRatePct           int    `json:"reply_rate_pct"`
	ReplyTrackingAvailable bool   `json:"reply_tracking_available"`
}

type AutoDMTaskBlockRequest struct {
	Reason string `json:"reason"`
}

type AutoDMTaskUpdateRequest struct {
	MessagePreview string `json:"message_preview" binding:"required"`
}

type AutoDMMessageVariantItem struct {
	Type    string `json:"type"`
	Label   string `json:"label"`
	Message string `json:"message"`
}

type AutoDMRecipientRuleItem struct {
	ID                uint   `json:"id"`
	XAccountID        uint   `json:"x_account_id"`
	RecipientUserID   string `json:"recipient_user_id"`
	RecipientUsername string `json:"recipient_username,omitempty"`
	RecipientSegment  string `json:"recipient_segment,omitempty"`
	Status            string `json:"status"`
	UnsubscribeToken  string `json:"unsubscribe_token,omitempty"`
	UnsubscribeURL    string `json:"unsubscribe_url,omitempty"`
	Source            string `json:"source,omitempty"`
	Reason            string `json:"reason,omitempty"`
	LastMatchedAt     string `json:"last_matched_at,omitempty"`
	UpdatedAt         string `json:"updated_at,omitempty"`
}

type AutoDMRecipientRuleQuery struct {
	Search     string `form:"search"`
	Status     string `form:"status"`
	Segment    string `form:"segment"`
	XAccountID uint   `form:"x_account_id"`
	Limit      int    `form:"limit"`
}

type AutoDMRecipientRulesResponse struct {
	Items []AutoDMRecipientRuleItem `json:"items"`
	Total int64                     `json:"total"`
}

type AutoDMRecipientRuleRequest struct {
	Status           string `json:"status" binding:"required"`
	RecipientSegment string `json:"recipient_segment"`
	Reason           string `json:"reason"`
}

type AutoDMRecipientRuleBulkRequest struct {
	IDs    []uint `json:"ids" binding:"required"`
	Status string `json:"status" binding:"required"`
	Reason string `json:"reason"`
}

type AutoDMRecipientRuleBulkResponse struct {
	Updated int                       `json:"updated"`
	Items   []AutoDMRecipientRuleItem `json:"items"`
}

type AutoDMRecipientImportRequest struct {
	XAccountID uint   `json:"x_account_id"`
	CSV        string `json:"csv" binding:"required"`
}

type AutoDMRecipientImportResponse struct {
	Imported int                        `json:"imported"`
	Skipped  int                        `json:"skipped"`
	Batch    *AutoDMRecipientImportItem `json:"batch,omitempty"`
	Items    []AutoDMRecipientRuleItem  `json:"items"`
	Errors   []string                   `json:"errors,omitempty"`
}

type AutoDMRecipientImportPreviewResponse struct {
	Valid            int                               `json:"valid"`
	Skipped          int                               `json:"skipped"`
	DuplicatesInFile int                               `json:"duplicates_in_file"`
	Existing         int                               `json:"existing"`
	WillImport       int                               `json:"will_import"`
	Rows             []AutoDMRecipientImportPreviewRow `json:"rows,omitempty"`
	Errors           []string                          `json:"errors,omitempty"`
	Warnings         []string                          `json:"warnings,omitempty"`
}

type AutoDMRecipientImportPreviewRow struct {
	Line              int    `json:"line"`
	RecipientUserID   string `json:"recipient_user_id,omitempty"`
	RecipientUsername string `json:"recipient_username,omitempty"`
	RecipientSegment  string `json:"recipient_segment,omitempty"`
	Status            string `json:"status"`
	Message           string `json:"message,omitempty"`
}

type AutoDMRecipientImportItem struct {
	ID         uint     `json:"id"`
	XAccountID uint     `json:"x_account_id"`
	Source     string   `json:"source"`
	Imported   int      `json:"imported"`
	Skipped    int      `json:"skipped"`
	Errors     []string `json:"errors,omitempty"`
	ImportedAt string   `json:"imported_at"`
}

type AutoDMRecipientImportsResponse struct {
	Items []AutoDMRecipientImportItem `json:"items"`
}

type AutoDMPreferenceResponse struct {
	RecipientUsername string `json:"recipient_username,omitempty"`
	Status            string `json:"status"`
}

type AutoCommentTargetItem struct {
	ID                 uint   `json:"id"`
	XAccountID         uint   `json:"x_account_id"`
	TargetUserID       string `json:"target_user_id,omitempty"`
	TargetUsername     string `json:"target_username"`
	TargetDisplayName  string `json:"target_display_name,omitempty"`
	TargetTweetID      string `json:"target_tweet_id,omitempty"`
	TargetTweetURL     string `json:"target_tweet_url,omitempty"`
	TargetAuthorHandle string `json:"target_author_handle,omitempty"`
	TargetText         string `json:"target_text,omitempty"`
	TargetCategory     string `json:"target_category"`
	Priority           int    `json:"priority"`
	Notes              string `json:"notes,omitempty"`
	Status             string `json:"status"`
	LastSeenTweetID    string `json:"last_seen_tweet_id,omitempty"`
	LastSeenTweetAt    string `json:"last_seen_tweet_at,omitempty"`
	LastCheckedAt      string `json:"last_checked_at,omitempty"`
	LastCommentedAt    string `json:"last_commented_at,omitempty"`
	LastFailureReason  string `json:"last_failure_reason,omitempty"`
	ResolvedAt         string `json:"resolved_at,omitempty"`
}

type AutoCommentTargetsResponse struct {
	Items []AutoCommentTargetItem `json:"items"`
}

type AutoCommentTargetRequest struct {
	XAccountID         uint   `json:"x_account_id"`
	TargetUsername     string `json:"target_username"`
	TargetTweetID      string `json:"target_tweet_id"`
	TargetTweetURL     string `json:"target_tweet_url"`
	TargetAuthorHandle string `json:"target_author_handle"`
	TargetText         string `json:"target_text"`
	TargetCategory     string `json:"target_category"`
	Priority           int    `json:"priority"`
	Notes              string `json:"notes"`
}

type AutoCommentTargetBulkImportRequest struct {
	XAccountID     uint     `json:"x_account_id"`
	Handles        []string `json:"handles"`
	RawHandles     string   `json:"raw_handles"`
	TargetCategory string   `json:"target_category"`
	Priority       int      `json:"priority"`
	Notes          string   `json:"notes"`
}

type AutoCommentTargetBulkImportResponse struct {
	Imported int                     `json:"imported"`
	Updated  int                     `json:"updated"`
	Skipped  int                     `json:"skipped"`
	Items    []AutoCommentTargetItem `json:"items"`
	Errors   []string                `json:"errors,omitempty"`
}

type AutoCommentTargetSuggestionRequest struct {
	XAccountID uint `json:"x_account_id"`
}

type AutoCommentTargetSuggestionItem struct {
	Handle      string `json:"handle"`
	DisplayName string `json:"display_name,omitempty"`
	Category    string `json:"category"`
	Priority    int    `json:"priority"`
	Reason      string `json:"reason"`
	SearchQuery string `json:"search_query,omitempty"`
	NeedsVerify bool   `json:"needs_verify"`
}

type AutoCommentTargetSuggestionResponse struct {
	Items           []AutoCommentTargetSuggestionItem `json:"items"`
	TargetCount     int64                             `json:"target_count"`
	TargetLimit     int64                             `json:"target_limit"`
	SuggestionLimit int64                             `json:"suggestion_limit"`
}

type AutoCommentTargetStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type ExposureRadarManualHandleRequest struct {
	PublishedURL   string `json:"published_url"`
	CommentTweetID string `json:"comment_tweet_id"`
	Note           string `json:"note"`
}

type ExposureRadarSafetyCheckItem struct {
	Key    string `json:"key"`
	Status string `json:"status"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
}

type ExposureRadarManualRecordRequest struct {
	BotID                 uint                           `json:"bot_id"`
	XAccountID            uint                           `json:"x_account_id"`
	SignalID              string                         `json:"signal_id" binding:"required"`
	Region                string                         `json:"region"`
	DataSource            string                         `json:"data_source"`
	DataQuality           string                         `json:"data_quality"`
	TweetID               string                         `json:"tweet_id"`
	URL                   string                         `json:"url"`
	Title                 string                         `json:"title"`
	Content               string                         `json:"content"`
	AuthorID              string                         `json:"author_id"`
	AuthorHandle          string                         `json:"author_handle"`
	AuthorName            string                         `json:"author_name"`
	TopicName             string                         `json:"topic_name"`
	Score                 int                            `json:"score"`
	RiskLevel             string                         `json:"risk_level"`
	OpportunityType       string                         `json:"opportunity_type"`
	OpportunityTier       string                         `json:"opportunity_tier"`
	QualityStage          string                         `json:"quality_stage"`
	ViewsPerMinute        float64                        `json:"views_per_minute"`
	FollowersCount        int64                          `json:"followers_count"`
	HeatCount             int64                          `json:"heat_count"`
	ReplyCount            int64                          `json:"reply_count"`
	RetweetCount          int64                          `json:"retweet_count"`
	LikeCount             int64                          `json:"like_count"`
	QuoteCount            int64                          `json:"quote_count"`
	BookmarkCount         int64                          `json:"bookmark_count"`
	ImpressionCount       int64                          `json:"impression_count"`
	ReviewTaskID          uint                           `json:"review_task_id"`
	SavedMemoryID         uint                           `json:"saved_memory_id"`
	GeneratedComment      string                         `json:"generated_comment"`
	TaskStatus            string                         `json:"task_status"`
	Copied                bool                           `json:"copied"`
	Opened                bool                           `json:"opened"`
	Saved                 bool                           `json:"saved"`
	Handled               bool                           `json:"handled"`
	PublishedURL          string                         `json:"published_url"`
	Outcome               string                         `json:"outcome"`
	FeedbackComment       string                         `json:"feedback_comment"`
	ResultImpressionCount *int64                         `json:"result_impression_count"`
	ResultLikeCount       *int64                         `json:"result_like_count"`
	ResultReplyCount      *int64                         `json:"result_reply_count"`
	ResultRetweetCount    *int64                         `json:"result_retweet_count"`
	ResultQuoteCount      *int64                         `json:"result_quote_count"`
	ResultBookmarkCount   *int64                         `json:"result_bookmark_count"`
	ResultNotes           string                         `json:"result_notes"`
	SafetyStatus          string                         `json:"safety_status"`
	SafetySummary         string                         `json:"safety_summary"`
	SafetyChecks          []ExposureRadarSafetyCheckItem `json:"safety_checks"`
	ReplyAngleID          string                         `json:"reply_angle_id"`
	ReplyAngleTitle       string                         `json:"reply_angle_title"`
}

type ExposureRadarManualRecordItem struct {
	ID                    uint                           `json:"id"`
	BotID                 uint                           `json:"bot_id,omitempty"`
	XAccountID            uint                           `json:"x_account_id,omitempty"`
	SignalID              string                         `json:"signal_id"`
	Region                string                         `json:"region"`
	DataSource            string                         `json:"data_source,omitempty"`
	DataQuality           string                         `json:"data_quality,omitempty"`
	TweetID               string                         `json:"tweet_id,omitempty"`
	URL                   string                         `json:"url,omitempty"`
	Title                 string                         `json:"title,omitempty"`
	Content               string                         `json:"content,omitempty"`
	AuthorID              string                         `json:"author_id,omitempty"`
	AuthorHandle          string                         `json:"author_handle,omitempty"`
	AuthorName            string                         `json:"author_name,omitempty"`
	TopicName             string                         `json:"topic_name,omitempty"`
	Score                 int                            `json:"score"`
	RiskLevel             string                         `json:"risk_level,omitempty"`
	OpportunityType       string                         `json:"opportunity_type,omitempty"`
	OpportunityTier       string                         `json:"opportunity_tier,omitempty"`
	QualityStage          string                         `json:"quality_stage,omitempty"`
	ViewsPerMinute        float64                        `json:"views_per_minute,omitempty"`
	FollowersCount        int64                          `json:"followers_count,omitempty"`
	HeatCount             int64                          `json:"heat_count,omitempty"`
	ReplyCount            int64                          `json:"reply_count,omitempty"`
	RetweetCount          int64                          `json:"retweet_count,omitempty"`
	LikeCount             int64                          `json:"like_count,omitempty"`
	QuoteCount            int64                          `json:"quote_count,omitempty"`
	BookmarkCount         int64                          `json:"bookmark_count,omitempty"`
	ImpressionCount       int64                          `json:"impression_count,omitempty"`
	ReviewTaskID          uint                           `json:"review_task_id,omitempty"`
	SavedMemoryID         uint                           `json:"saved_memory_id,omitempty"`
	GeneratedComment      string                         `json:"generated_comment,omitempty"`
	TaskStatus            string                         `json:"task_status,omitempty"`
	PublishedURL          string                         `json:"published_url,omitempty"`
	Outcome               string                         `json:"outcome,omitempty"`
	FeedbackComment       string                         `json:"feedback_comment,omitempty"`
	ResultImpressionCount int64                          `json:"result_impression_count,omitempty"`
	ResultLikeCount       int64                          `json:"result_like_count,omitempty"`
	ResultReplyCount      int64                          `json:"result_reply_count,omitempty"`
	ResultRetweetCount    int64                          `json:"result_retweet_count,omitempty"`
	ResultQuoteCount      int64                          `json:"result_quote_count,omitempty"`
	ResultBookmarkCount   int64                          `json:"result_bookmark_count,omitempty"`
	ResultNotes           string                         `json:"result_notes,omitempty"`
	ResultScore           int                            `json:"result_score,omitempty"`
	ResultCheckedAt       string                         `json:"result_checked_at,omitempty"`
	SafetyStatus          string                         `json:"safety_status,omitempty"`
	SafetySummary         string                         `json:"safety_summary,omitempty"`
	SafetyChecks          []ExposureRadarSafetyCheckItem `json:"safety_checks,omitempty"`
	ReplyAngleID          string                         `json:"reply_angle_id,omitempty"`
	ReplyAngleTitle       string                         `json:"reply_angle_title,omitempty"`
	CopiedAt              string                         `json:"copied_at,omitempty"`
	OpenedAt              string                         `json:"opened_at,omitempty"`
	SavedAt               string                         `json:"saved_at,omitempty"`
	HandledAt             string                         `json:"handled_at,omitempty"`
	FeedbackAt            string                         `json:"feedback_at,omitempty"`
	CreatedAt             string                         `json:"created_at,omitempty"`
	UpdatedAt             string                         `json:"updated_at,omitempty"`
}

type ExposureRadarManualRecordsResponse struct {
	Items []ExposureRadarManualRecordItem `json:"items"`
}

type ExposureRadarResultLookupRequest struct {
	PublishedURL   string `json:"published_url"`
	CommentTweetID string `json:"comment_tweet_id"`
}

type ExposureRadarResultLookupResponse struct {
	PublishedURL          string `json:"published_url,omitempty"`
	CommentTweetID        string `json:"comment_tweet_id,omitempty"`
	Status                string `json:"status"`
	Source                string `json:"source"`
	Message               string `json:"message,omitempty"`
	MetricsFetched        bool   `json:"metrics_fetched"`
	ResultImpressionCount *int64 `json:"result_impression_count,omitempty"`
	ResultLikeCount       *int64 `json:"result_like_count,omitempty"`
	ResultReplyCount      *int64 `json:"result_reply_count,omitempty"`
	ResultRetweetCount    *int64 `json:"result_retweet_count,omitempty"`
	ResultQuoteCount      *int64 `json:"result_quote_count,omitempty"`
	ResultBookmarkCount   *int64 `json:"result_bookmark_count,omitempty"`
}

type ExposureRadarResultRefreshRequest struct {
	Region string `json:"region"`
	Days   int    `json:"days"`
	Limit  int    `json:"limit"`
}

type ExposureRadarResultRefreshItem struct {
	SignalID              string `json:"signal_id"`
	PublishedURL          string `json:"published_url,omitempty"`
	CommentTweetID        string `json:"comment_tweet_id,omitempty"`
	Status                string `json:"status"`
	Message               string `json:"message,omitempty"`
	ResultImpressionCount int64  `json:"result_impression_count,omitempty"`
	ResultLikeCount       int64  `json:"result_like_count,omitempty"`
	ResultReplyCount      int64  `json:"result_reply_count,omitempty"`
	ResultRetweetCount    int64  `json:"result_retweet_count,omitempty"`
	ResultQuoteCount      int64  `json:"result_quote_count,omitempty"`
	ResultBookmarkCount   int64  `json:"result_bookmark_count,omitempty"`
	ResultScore           int    `json:"result_score,omitempty"`
	ResultCheckedAt       string `json:"result_checked_at,omitempty"`
}

type ExposureRadarResultRefreshResponse struct {
	Region          string                           `json:"region"`
	Days            int                              `json:"days"`
	Limit           int                              `json:"limit"`
	TokenConfigured bool                             `json:"token_configured"`
	ScannedCount    int                              `json:"scanned_count"`
	EligibleCount   int                              `json:"eligible_count"`
	RefreshedCount  int                              `json:"refreshed_count"`
	SkippedCount    int                              `json:"skipped_count"`
	FailedCount     int                              `json:"failed_count"`
	Message         string                           `json:"message,omitempty"`
	Items           []ExposureRadarResultRefreshItem `json:"items"`
}

type ExposureRadarGrowthStrategyRequest struct {
	BotID          uint     `json:"bot_id"`
	XAccountID     uint     `json:"x_account_id"`
	Region         string   `json:"region"`
	TargetAudience string   `json:"target_audience"`
	PrimaryGoal    string   `json:"primary_goal"`
	CoreTopics     []string `json:"core_topics"`
	AvoidTopics    []string `json:"avoid_topics"`
	Competitors    []string `json:"competitors"`
	ReplyStyle     string   `json:"reply_style"`
	DailyMoveLimit int      `json:"daily_move_limit"`
	SafetyMode     string   `json:"safety_mode"`
	OperatorNotes  string   `json:"operator_notes"`
}

type ExposureRadarGrowthStrategyItem struct {
	ID                  uint     `json:"id,omitempty"`
	BotID               uint     `json:"bot_id,omitempty"`
	XAccountID          uint     `json:"x_account_id,omitempty"`
	Region              string   `json:"region"`
	TargetAudience      string   `json:"target_audience,omitempty"`
	PrimaryGoal         string   `json:"primary_goal,omitempty"`
	CoreTopics          []string `json:"core_topics"`
	AvoidTopics         []string `json:"avoid_topics"`
	Competitors         []string `json:"competitors"`
	ReplyStyle          string   `json:"reply_style"`
	DailyMoveLimit      int      `json:"daily_move_limit"`
	SafetyMode          string   `json:"safety_mode"`
	OperatorNotes       string   `json:"operator_notes,omitempty"`
	LastReviewedSummary string   `json:"last_reviewed_summary,omitempty"`
	CreatedAt           string   `json:"created_at,omitempty"`
	UpdatedAt           string   `json:"updated_at,omitempty"`
}

type ExposureRadarPeopleNoteRequest struct {
	Region       string   `json:"region"`
	AuthorHandle string   `json:"author_handle" binding:"required"`
	AuthorName   string   `json:"author_name"`
	Stage        string   `json:"stage"`
	Tags         []string `json:"tags"`
	Notes        string   `json:"notes"`
	LastSignalID string   `json:"last_signal_id"`
}

type ExposureRadarPeopleNoteItem struct {
	ID                uint     `json:"id,omitempty"`
	Region            string   `json:"region"`
	AuthorHandle      string   `json:"author_handle"`
	AuthorName        string   `json:"author_name,omitempty"`
	Stage             string   `json:"stage,omitempty"`
	Tags              []string `json:"tags"`
	Notes             string   `json:"notes,omitempty"`
	LastSignalID      string   `json:"last_signal_id,omitempty"`
	LastInteractionAt string   `json:"last_interaction_at,omitempty"`
	UpdatedAt         string   `json:"updated_at,omitempty"`
}

type ExposureRadarPersonItem struct {
	Key               string                        `json:"key"`
	Name              string                        `json:"name"`
	Handle            string                        `json:"handle,omitempty"`
	Count             int                           `json:"count"`
	Handled           int                           `json:"handled"`
	Copied            int                           `json:"copied"`
	Opened            int                           `json:"opened"`
	Saved             int                           `json:"saved"`
	Feedback          int                           `json:"feedback"`
	MaxScore          int                           `json:"max_score"`
	TotalEngagement   int64                         `json:"total_engagement"`
	Followers         int64                         `json:"followers,omitempty"`
	Stage             string                        `json:"stage"`
	CRMStage          string                        `json:"crm_stage,omitempty"`
	Notes             string                        `json:"notes,omitempty"`
	Tags              []string                      `json:"tags,omitempty"`
	LastInteractionAt string                        `json:"last_interaction_at,omitempty"`
	CRMUpdatedAt      string                        `json:"crm_updated_at,omitempty"`
	LatestRecord      ExposureRadarManualRecordItem `json:"latest_record"`
}

type ExposureRadarPeopleResponse struct {
	Items []ExposureRadarPersonItem `json:"items"`
}

type ExposureRadarWeeklyReviewResponse struct {
	Region             string                            `json:"region"`
	Days               int                               `json:"days"`
	GeneratedAt        string                            `json:"generated_at"`
	TotalRecords       int                               `json:"total_records"`
	HandledCount       int                               `json:"handled_count"`
	PublishedCount     int                               `json:"published_count"`
	EffectiveCount     int                               `json:"effective_count"`
	NegativeCount      int                               `json:"negative_count"`
	CompletionRate     float64                           `json:"completion_rate"`
	EffectiveRate      float64                           `json:"effective_rate"`
	AverageResultScore float64                           `json:"average_result_score"`
	TopTopics          []ExposureRadarWeeklyReviewTopic  `json:"top_topics"`
	TopPeople          []ExposureRadarWeeklyReviewPerson `json:"top_people"`
	Recommendations    []string                          `json:"recommendations"`
}

type ExposureRadarWeeklyReviewTopic struct {
	TopicName string `json:"topic_name"`
	Count     int    `json:"count"`
	Effective int    `json:"effective"`
}

type ExposureRadarWeeklyReviewPerson struct {
	Handle string `json:"handle"`
	Name   string `json:"name"`
	Count  int    `json:"count"`
}

type ExposureRadarSafetyCenterResponse struct {
	Region          string   `json:"region"`
	Days            int      `json:"days"`
	GeneratedAt     string   `json:"generated_at"`
	TotalRecords    int      `json:"total_records"`
	PassCount       int      `json:"pass_count"`
	WatchCount      int      `json:"watch_count"`
	BlockCount      int      `json:"block_count"`
	PromotionSmell  int      `json:"promotion_smell_count"`
	RiskyClaimCount int      `json:"risky_claim_count"`
	Warnings        []string `json:"warnings"`
}

type AutoCommentVariantItem struct {
	Type    string `json:"type"`
	Label   string `json:"label"`
	Comment string `json:"comment"`
}

type AutoCommentTaskItem struct {
	ID                    uint                         `json:"id"`
	BotID                 uint                         `json:"bot_id"`
	XAccountID            uint                         `json:"x_account_id"`
	TargetID              uint                         `json:"target_id"`
	TargetUserID          string                       `json:"target_user_id,omitempty"`
	TargetUsername        string                       `json:"target_username"`
	TargetTweetID         string                       `json:"target_tweet_id"`
	TargetTweetText       string                       `json:"target_tweet_text,omitempty"`
	TargetTweetAuthor     string                       `json:"target_tweet_author,omitempty"`
	GeneratedComment      string                       `json:"generated_comment,omitempty"`
	FeedbackSignalCount   int                          `json:"feedback_signal_count"`
	FeedbackSignalSummary *OAFBotFeedbackSignalSummary `json:"feedback_signal_summary,omitempty"`
	OpportunityScore      int                          `json:"opportunity_score"`
	GenerationReason      string                       `json:"generation_reason,omitempty"`
	MatchedKeywords       []string                     `json:"matched_keywords,omitempty"`
	ReferencedContent     []string                     `json:"referenced_content,omitempty"`
	SourceType            string                       `json:"source_type,omitempty"`
	SourceRef             string                       `json:"source_ref,omitempty"`
	SourceRegion          string                       `json:"source_region,omitempty"`
	CommentVariants       []AutoCommentVariantItem     `json:"comment_variants,omitempty"`
	DeliveryMode          string                       `json:"delivery_mode"`
	DeliveryReason        string                       `json:"delivery_reason,omitempty"`
	APIReplyEligible      bool                         `json:"api_reply_eligible"`
	APIReplyBlockReason   string                       `json:"api_reply_block_reason,omitempty"`
	ManualActionURL       string                       `json:"manual_action_url,omitempty"`
	QuotePostCandidate    string                       `json:"quote_post_candidate,omitempty"`
	Status                string                       `json:"status"`
	RiskLevel             string                       `json:"risk_level"`
	CapabilityStatus      string                       `json:"capability_status"`
	FailureCategory       string                       `json:"failure_category,omitempty"`
	FailureReason         string                       `json:"failure_reason,omitempty"`
	Retryable             bool                         `json:"retryable"`
	RetryAfterAt          string                       `json:"retry_after_at,omitempty"`
	AttemptCount          int                          `json:"attempt_count"`
	LastAttemptAt         string                       `json:"last_attempt_at,omitempty"`
	ApprovalRequired      bool                         `json:"approval_required"`
	ActivityLogID         uint                         `json:"activity_log_id,omitempty"`
	CommentTweetID        string                       `json:"comment_tweet_id,omitempty"`
	CommentURL            string                       `json:"comment_url,omitempty"`
	DetectedAt            string                       `json:"detected_at"`
	GeneratedAt           string                       `json:"generated_at,omitempty"`
	ApprovedAt            string                       `json:"approved_at,omitempty"`
	BlockedAt             string                       `json:"blocked_at,omitempty"`
	SentAt                string                       `json:"sent_at,omitempty"`
}

type AutoCommentTasksResponse struct {
	Items []AutoCommentTaskItem `json:"items"`
}

type AutoCommentAnalyticsSummary struct {
	TotalTasks          int   `json:"total_tasks"`
	Published           int   `json:"published"`
	Failed              int   `json:"failed"`
	Pending             int   `json:"pending"`
	AutoCommentable     int   `json:"auto_commentable"`
	ManualSuggestions   int   `json:"manual_suggestions"`
	QuotePostReady      int   `json:"quote_post_ready"`
	Restricted          int   `json:"restricted"`
	AverageOpportunity  int   `json:"average_opportunity"`
	TargetCount         int64 `json:"target_count"`
	TargetLimit         int64 `json:"target_limit"`
	MonthlyScansUsed    int64 `json:"monthly_scans_used"`
	MonthlyScanLimit    int64 `json:"monthly_scan_limit"`
	MonthlyCommentsUsed int64 `json:"monthly_comments_used"`
	MonthlyCommentLimit int64 `json:"monthly_comment_limit"`
}

type AutoCommentAnalyticsGroup struct {
	Key                string `json:"key"`
	Label              string `json:"label"`
	Total              int    `json:"total"`
	Published          int    `json:"published"`
	Failed             int    `json:"failed"`
	AverageOpportunity int    `json:"average_opportunity"`
}

type AutoCommentPublishedItem struct {
	ID               uint   `json:"id"`
	TargetUsername   string `json:"target_username"`
	TargetCategory   string `json:"target_category"`
	CommentTweetID   string `json:"comment_tweet_id"`
	CommentURL       string `json:"comment_url"`
	GeneratedComment string `json:"generated_comment"`
	SentAt           string `json:"sent_at,omitempty"`
}

type AutoCommentFailureItem struct {
	ID              uint   `json:"id"`
	TargetUsername  string `json:"target_username"`
	TargetCategory  string `json:"target_category"`
	FailureCategory string `json:"failure_category,omitempty"`
	FailureReason   string `json:"failure_reason,omitempty"`
	UpdatedAt       string `json:"updated_at,omitempty"`
}

type AutoCommentHealthItem struct {
	TargetID           uint   `json:"target_id"`
	TargetUsername     string `json:"target_username"`
	TargetCategory     string `json:"target_category"`
	Priority           int    `json:"priority"`
	Status             string `json:"status"`
	IssueType          string `json:"issue_type"`
	Severity           string `json:"severity"`
	Message            string `json:"message"`
	SuggestedAction    string `json:"suggested_action"`
	LastCheckedAt      string `json:"last_checked_at,omitempty"`
	LastSeenTweetAt    string `json:"last_seen_tweet_at,omitempty"`
	LastFailureReason  string `json:"last_failure_reason,omitempty"`
	AverageOpportunity int    `json:"average_opportunity"`
	FailedCount        int    `json:"failed_count"`
	TotalTasks         int    `json:"total_tasks"`
}

type AutoCommentAnalyticsResponse struct {
	Summary         AutoCommentAnalyticsSummary `json:"summary"`
	ByCategory      []AutoCommentAnalyticsGroup `json:"by_category"`
	ByTarget        []AutoCommentAnalyticsGroup `json:"by_target"`
	RecentPublished []AutoCommentPublishedItem  `json:"recent_published"`
	RecentFailures  []AutoCommentFailureItem    `json:"recent_failures"`
	Health          []AutoCommentHealthItem     `json:"health"`
}

type AutoCommentTaskBlockRequest struct {
	Reason string `json:"reason"`
}

type AutoCommentFeedbackRequest struct {
	Rating    string   `json:"rating" binding:"required"`
	IssueTags []string `json:"issue_tags"`
	Comment   string   `json:"comment"`
	Outcome   string   `json:"outcome"`
}

type AutoCommentDraftUpdateRequest struct {
	GeneratedComment string `json:"generated_comment" binding:"required"`
}

type ExposureRadarCommentDraftRequest struct {
	BotID           uint   `json:"bot_id" binding:"required"`
	XAccountID      uint   `json:"x_account_id" binding:"required"`
	SignalID        string `json:"signal_id"`
	Region          string `json:"region"`
	DataSource      string `json:"data_source"`
	DataQuality     string `json:"data_quality"`
	TweetID         string `json:"tweet_id"`
	URL             string `json:"url"`
	Title           string `json:"title"`
	AuthorHandle    string `json:"author_handle"`
	AuthorName      string `json:"author_name"`
	Content         string `json:"content" binding:"required"`
	TopicName       string `json:"topic_name"`
	Score           int    `json:"score"`
	RiskLevel       string `json:"risk_level"`
	OpportunityType string `json:"opportunity_type"`
	RecommendedUse  string `json:"recommended_use"`
	Reason          string `json:"reason"`
}

type ReviewQueueQuery struct {
	Type          string `form:"type"`
	Status        string `form:"status"`
	ExecutionMode string `form:"execution_mode"`
	Page          int    `form:"page"`
	PageSize      int    `form:"page_size"`
}

type ReviewQueueStats struct {
	PendingReview  int `json:"pending_review"`
	ReadyToPublish int `json:"ready_to_publish"`
	Approved       int `json:"approved"`
	Rejected       int `json:"rejected"`
	Failed         int `json:"failed"`
}

type ReviewQueueItem struct {
	ID                  uint                 `json:"id"`
	Type                string               `json:"type"`
	DeliveryMode        string               `json:"delivery_mode,omitempty"`
	Content             string               `json:"content"`
	Status              string               `json:"status"`
	ExecutionMode       string               `json:"execution_mode"`
	BotID               uint                 `json:"bot_id"`
	BotName             string               `json:"bot_name,omitempty"`
	TwitterAccountID    uint                 `json:"twitter_account_id"`
	TwitterAccountName  string               `json:"twitter_account_name,omitempty"`
	TargetSummary       string               `json:"target_summary,omitempty"`
	RiskLevel           string               `json:"risk_level"`
	RiskReasons         []string             `json:"risk_reasons"`
	PlanID              uint                 `json:"plan_id,omitempty"`
	ContentLibraryID    uint                 `json:"content_library_item_id,omitempty"`
	ContentTitle        string               `json:"content_title,omitempty"`
	ExposureSourceTrace *ExposureSourceTrace `json:"exposure_source_trace,omitempty"`
	ContentDirection    string               `json:"content_direction,omitempty"`
	SelectedTrends      []TrendTopicItem     `json:"selected_trends,omitempty"`
	PublishJobID        uint                 `json:"publish_job_id,omitempty"`
	PublishStatus       string               `json:"publish_status,omitempty"`
	PublishMode         string               `json:"publish_mode,omitempty"`
	PublishLastError    string               `json:"publish_last_error,omitempty"`
	PublishExternalURL  string               `json:"publish_external_url,omitempty"`
	CreatedAt           string               `json:"created_at"`
	SourceStatus        string               `json:"source_status,omitempty"`
	SourceID            uint                 `json:"source_id"`
	SourceType          string               `json:"source_type,omitempty"`
	SourceRef           string               `json:"source_ref,omitempty"`
	SourceRegion        string               `json:"source_region,omitempty"`
}

type ExposureSourceTrace struct {
	Kind            string `json:"kind"`
	SignalTitle     string `json:"signal_title"`
	Summary         string `json:"summary,omitempty"`
	WhyItMatters    string `json:"why_it_matters,omitempty"`
	SuggestedAction string `json:"suggested_action,omitempty"`
	BestUse         string `json:"best_use,omitempty"`
	Region          string `json:"region,omitempty"`
	Score           string `json:"score,omitempty"`
	Velocity        string `json:"velocity,omitempty"`
	Risk            string `json:"risk,omitempty"`
	Quality         string `json:"quality,omitempty"`
	SourceURL       string `json:"source_url,omitempty"`
}

type ReviewQueueResponse struct {
	Items    []ReviewQueueItem `json:"items"`
	Total    int               `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
	Stats    ReviewQueueStats  `json:"stats"`
}

type ReviewQueueBulkActionItemRequest struct {
	QueueType    string `json:"queue_type" binding:"required"`
	SourceID     uint   `json:"source_id" binding:"required"`
	PublishJobID uint   `json:"publish_job_id,omitempty"`
}

type ReviewQueueBulkActionRequest struct {
	Action       string                             `json:"action" binding:"required"`
	RejectReason string                             `json:"reject_reason,omitempty"`
	Items        []ReviewQueueBulkActionItemRequest `json:"items" binding:"required"`
}

type ReviewQueueBulkActionResult struct {
	QueueType    string `json:"queue_type"`
	SourceID     uint   `json:"source_id"`
	PublishJobID uint   `json:"publish_job_id,omitempty"`
	Success      bool   `json:"success"`
	Error        string `json:"error,omitempty"`
}

type ReviewQueueBulkActionResponse struct {
	Action          string                        `json:"action"`
	Total           int                           `json:"total"`
	Succeeded       int                           `json:"succeeded"`
	Failed          int                           `json:"failed"`
	AuditActivityID uint                          `json:"audit_activity_id,omitempty"`
	AuditPreviewKey string                        `json:"audit_preview_key,omitempty"`
	Results         []ReviewQueueBulkActionResult `json:"results"`
}

type ReviewQueueFeedbackIssueVerdictRequest struct {
	QueueType     string   `json:"queue_type" binding:"required"`
	SourceID      uint     `json:"source_id" binding:"required"`
	BotID         uint     `json:"bot_id"`
	FeedbackIssue string   `json:"feedback_issue" binding:"required"`
	Verdict       string   `json:"verdict" binding:"required"`
	Reasons       []string `json:"reasons"`
}

type ReviewQueueFeedbackIssueVerdictResponse struct {
	ID    uint `json:"id"`
	Saved bool `json:"saved"`
}

type ReviewQueueFeedbackIssueReasonStat struct {
	Reason          string  `json:"reason"`
	Accurate        int     `json:"accurate"`
	Irrelevant      int     `json:"irrelevant"`
	Total           int     `json:"total"`
	AccuracyRate    float64 `json:"accuracy_rate"`
	ScoreAdjustment int     `json:"score_adjustment"`
}

type ReviewQueueFeedbackIssueVerdictStat struct {
	FeedbackIssue string                               `json:"feedback_issue"`
	Accurate      int                                  `json:"accurate"`
	Irrelevant    int                                  `json:"irrelevant"`
	Total         int                                  `json:"total"`
	AccuracyRate  float64                              `json:"accuracy_rate"`
	Reasons       []ReviewQueueFeedbackIssueReasonStat `json:"reasons"`
}

type ReviewQueueFeedbackIssueVerdictStatsResponse struct {
	Issues []ReviewQueueFeedbackIssueVerdictStat `json:"issues"`
}

type ReviewQueueFeedbackIssueVerdictDetail struct {
	ID                uint     `json:"id"`
	QueueType         string   `json:"queue_type"`
	SourceID          uint     `json:"source_id"`
	BotID             uint     `json:"bot_id,omitempty"`
	FeedbackIssue     string   `json:"feedback_issue"`
	Verdict           string   `json:"verdict"`
	Reasons           []string `json:"reasons"`
	ContentPreview    string   `json:"content_preview,omitempty"`
	TargetSummary     string   `json:"target_summary,omitempty"`
	SourceStatus      string   `json:"source_status,omitempty"`
	CreatedAt         string   `json:"created_at"`
	ExecutionQueueURL string   `json:"execution_queue_url"`
}

type ReviewQueueFeedbackIssueVerdictDetailsResponse struct {
	Items []ReviewQueueFeedbackIssueVerdictDetail `json:"items"`
}

type PublishJobItem struct {
	ID                 uint   `json:"id"`
	UserID             uint   `json:"user_id"`
	TwitterAccountID   uint   `json:"twitter_account_id"`
	BotID              uint   `json:"bot_id"`
	SourceType         string `json:"source_type"`
	SourceID           uint   `json:"source_id"`
	Content            string `json:"content"`
	Status             string `json:"status"`
	ExecutionMode      string `json:"execution_mode"`
	PublishMode        string `json:"publish_mode"`
	AttemptCount       int    `json:"attempt_count"`
	MaxAttempts        int    `json:"max_attempts"`
	NextAttemptAt      string `json:"next_attempt_at,omitempty"`
	LastError          string `json:"last_error,omitempty"`
	ExternalID         string `json:"external_id,omitempty"`
	ExternalURL        string `json:"external_url,omitempty"`
	RawResponse        string `json:"raw_response,omitempty"`
	PublishedAt        string `json:"published_at,omitempty"`
	CreatedAt          string `json:"created_at"`
	UpdatedAt          string `json:"updated_at"`
	DryRun             bool   `json:"dry_run"`
	RealPublishEnabled bool   `json:"real_publish_enabled"`
}

type XPublisherSettings struct {
	RealPublishEnabled           bool `json:"real_publish_enabled"`
	ManualPublishEnabled         bool `json:"manual_publish_enabled"`
	PerAccountDailyLimit         int  `json:"per_account_daily_limit"`
	PerAccountMinIntervalSeconds int  `json:"per_account_min_interval_seconds"`
	DryRun                       bool `json:"dry_run"`
}

type PublishJobsResponse struct {
	Items    []PublishJobItem   `json:"items"`
	Settings XPublisherSettings `json:"settings"`
}

type PublishingStatusResponse struct {
	RealPublishEnabled             bool `json:"real_publish_enabled"`
	ManualPublishEnabled           bool `json:"manual_publish_enabled"`
	DryRun                         bool `json:"dry_run"`
	PerAccountDailyLimit           int  `json:"per_account_daily_limit"`
	PerAccountMinIntervalSeconds   int  `json:"per_account_min_interval_seconds"`
	CurrentUserConnectedAccounts   int  `json:"current_user_connected_accounts_count"`
	AccountsMissingTweetWriteCount int  `json:"accounts_missing_tweet_write_count"`
}
