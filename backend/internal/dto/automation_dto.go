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
	ID                  uint   `json:"id"`
	BotID               uint   `json:"bot_id"`
	XAccountID          uint   `json:"x_account_id"`
	CommentTweetID      string `json:"comment_tweet_id,omitempty"`
	CommentURL          string `json:"comment_url,omitempty"`
	CommentAuthorHandle string `json:"comment_author_handle"`
	RootTweetText       string `json:"root_tweet_text,omitempty"`
	CommentText         string `json:"comment_text"`
	GeneratedReply      string `json:"generated_reply,omitempty"`
	Status              string `json:"status"`
	RiskLevel           string `json:"risk_level"`
	CapabilityStatus    string `json:"capability_status"`
	FailureCategory     string `json:"failure_category,omitempty"`
	FailureReason       string `json:"failure_reason,omitempty"`
	ApprovalRequired    bool   `json:"approval_required"`
	ActivityLogID       uint   `json:"activity_log_id,omitempty"`
	CreatedAt           string `json:"created_at"`
	GeneratedAt         string `json:"generated_at,omitempty"`
	ApprovedAt          string `json:"approved_at,omitempty"`
	RejectedAt          string `json:"rejected_at,omitempty"`
	SentAt              string `json:"sent_at,omitempty"`
}

type AutoReplyDraftsResponse struct {
	Items []AutoReplyDraftItem `json:"items"`
}

type AutoReplyDraftUpdateRequest struct {
	GeneratedReply string `json:"generated_reply" binding:"required"`
}

type AutoPostPlanRequest struct {
	XAccountID         uint   `json:"x_account_id" binding:"required"`
	Enabled            bool   `json:"enabled"`
	ExecutionMode      string `json:"execution_mode"`
	DailyLimit         int    `json:"daily_limit"` // Deprecated: kept for API compatibility; monthly plan quota is enforced instead.
	MinIntervalMinutes int    `json:"min_interval_minutes"`
	PostingWindows     string `json:"posting_windows"`
	Timezone           string `json:"timezone"`
	ContentLengthMode  string `json:"content_length_mode"`
}

type AutoPostGenerateRequest struct {
	ContentDirection     string `json:"content_direction"`
	ContentLibraryItemID uint   `json:"content_library_item_id"`
}

type AutoPostDraftUpdateRequest struct {
	GeneratedContent string `json:"generated_content" binding:"required"`
}

type AutoPostDraftRejectRequest struct {
	Reason string `json:"reason"`
}

type AutoPostPlanItem struct {
	ID                 uint   `json:"id"`
	UserID             uint   `json:"user_id"`
	XAccountID         uint   `json:"x_account_id"`
	AccountHandle      string `json:"account_handle,omitempty"`
	BotID              uint   `json:"bot_id"`
	BotName            string `json:"bot_name,omitempty"`
	Enabled            bool   `json:"enabled"`
	ExecutionMode      string `json:"execution_mode"`
	DailyLimit         int    `json:"daily_limit"` // Deprecated: kept for API compatibility; monthly plan quota is enforced instead.
	MinIntervalMinutes int    `json:"min_interval_minutes"`
	PostingWindows     string `json:"posting_windows"`
	Timezone           string `json:"timezone"`
	ContentLengthMode  string `json:"content_length_mode"`
	LastRunAt          string `json:"last_run_at,omitempty"`
	NextRunAt          string `json:"next_run_at,omitempty"`
	ProcessingAt       string `json:"processing_at,omitempty"`
	CreatedAt          string `json:"created_at"`
	UpdatedAt          string `json:"updated_at"`
}

type AutoPostDraftItem struct {
	ID               uint   `json:"id"`
	UserID           uint   `json:"user_id"`
	PlanID           uint   `json:"plan_id"`
	BotID            uint   `json:"bot_id"`
	BotName          string `json:"bot_name,omitempty"`
	XAccountID       uint   `json:"x_account_id"`
	ContentLibraryID uint   `json:"content_library_item_id,omitempty"`
	ContentTitle     string `json:"content_title,omitempty"`
	AccountHandle    string `json:"account_handle,omitempty"`
	ContentDirection string `json:"content_direction,omitempty"`
	ContentHash      string `json:"content_hash,omitempty"`
	GeneratedContent string `json:"generated_content"`
	Status           string `json:"status"`
	RiskLevel        string `json:"risk_level"`
	CapabilityStatus string `json:"capability_status"`
	FailureCategory  string `json:"failure_category,omitempty"`
	FailureReason    string `json:"failure_reason,omitempty"`
	ApprovalRequired bool   `json:"approval_required"`
	ActivityLogID    uint   `json:"activity_log_id,omitempty"`
	CreatedAt        string `json:"created_at"`
	GeneratedAt      string `json:"generated_at,omitempty"`
	ApprovedAt       string `json:"approved_at,omitempty"`
	RejectedAt       string `json:"rejected_at,omitempty"`
	PublishedAt      string `json:"published_at,omitempty"`
}

type AutoPostPlansResponse struct {
	Items []AutoPostPlanItem `json:"items"`
}

type AutoPostDraftsResponse struct {
	Items []AutoPostDraftItem `json:"items"`
}

type AutoPostGenerationRunItem struct {
	ID               uint   `json:"id"`
	UserID           uint   `json:"user_id"`
	PlanID           uint   `json:"plan_id"`
	XAccountID       uint   `json:"x_account_id"`
	AccountHandle    string `json:"account_handle,omitempty"`
	BotID            uint   `json:"bot_id"`
	BotName          string `json:"bot_name,omitempty"`
	ContentLibraryID uint   `json:"content_library_item_id,omitempty"`
	ContentTitle     string `json:"content_title,omitempty"`
	ContentItemTitle string `json:"content_library_item_title,omitempty"`
	Status           string `json:"status"`
	SkipReason       string `json:"skip_reason,omitempty"`
	GeneratedDraftID uint   `json:"generated_draft_id,omitempty"`
	ErrorMessage     string `json:"error_message,omitempty"`
	CreatedAt        string `json:"created_at"`
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

type AutoCommentVariantItem struct {
	Type    string `json:"type"`
	Label   string `json:"label"`
	Comment string `json:"comment"`
}

type AutoCommentTaskItem struct {
	ID                  uint                     `json:"id"`
	BotID               uint                     `json:"bot_id"`
	XAccountID          uint                     `json:"x_account_id"`
	TargetID            uint                     `json:"target_id"`
	TargetUserID        string                   `json:"target_user_id,omitempty"`
	TargetUsername      string                   `json:"target_username"`
	TargetTweetID       string                   `json:"target_tweet_id"`
	TargetTweetText     string                   `json:"target_tweet_text,omitempty"`
	TargetTweetAuthor   string                   `json:"target_tweet_author,omitempty"`
	GeneratedComment    string                   `json:"generated_comment,omitempty"`
	OpportunityScore    int                      `json:"opportunity_score"`
	GenerationReason    string                   `json:"generation_reason,omitempty"`
	MatchedKeywords     []string                 `json:"matched_keywords,omitempty"`
	ReferencedContent   []string                 `json:"referenced_content,omitempty"`
	CommentVariants     []AutoCommentVariantItem `json:"comment_variants,omitempty"`
	DeliveryMode        string                   `json:"delivery_mode"`
	DeliveryReason      string                   `json:"delivery_reason,omitempty"`
	APIReplyEligible    bool                     `json:"api_reply_eligible"`
	APIReplyBlockReason string                   `json:"api_reply_block_reason,omitempty"`
	ManualActionURL     string                   `json:"manual_action_url,omitempty"`
	QuotePostCandidate  string                   `json:"quote_post_candidate,omitempty"`
	Status              string                   `json:"status"`
	RiskLevel           string                   `json:"risk_level"`
	CapabilityStatus    string                   `json:"capability_status"`
	FailureCategory     string                   `json:"failure_category,omitempty"`
	FailureReason       string                   `json:"failure_reason,omitempty"`
	Retryable           bool                     `json:"retryable"`
	RetryAfterAt        string                   `json:"retry_after_at,omitempty"`
	AttemptCount        int                      `json:"attempt_count"`
	LastAttemptAt       string                   `json:"last_attempt_at,omitempty"`
	ApprovalRequired    bool                     `json:"approval_required"`
	ActivityLogID       uint                     `json:"activity_log_id,omitempty"`
	CommentTweetID      string                   `json:"comment_tweet_id,omitempty"`
	DetectedAt          string                   `json:"detected_at"`
	GeneratedAt         string                   `json:"generated_at,omitempty"`
	ApprovedAt          string                   `json:"approved_at,omitempty"`
	BlockedAt           string                   `json:"blocked_at,omitempty"`
	SentAt              string                   `json:"sent_at,omitempty"`
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
}

type AutoCommentDraftUpdateRequest struct {
	GeneratedComment string `json:"generated_comment" binding:"required"`
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
	ID                 uint     `json:"id"`
	Type               string   `json:"type"`
	DeliveryMode       string   `json:"delivery_mode,omitempty"`
	Content            string   `json:"content"`
	Status             string   `json:"status"`
	ExecutionMode      string   `json:"execution_mode"`
	BotID              uint     `json:"bot_id"`
	BotName            string   `json:"bot_name,omitempty"`
	TwitterAccountID   uint     `json:"twitter_account_id"`
	TwitterAccountName string   `json:"twitter_account_name,omitempty"`
	TargetSummary      string   `json:"target_summary,omitempty"`
	RiskLevel          string   `json:"risk_level"`
	RiskReasons        []string `json:"risk_reasons"`
	PublishJobID       uint     `json:"publish_job_id,omitempty"`
	PublishStatus      string   `json:"publish_status,omitempty"`
	PublishMode        string   `json:"publish_mode,omitempty"`
	PublishLastError   string   `json:"publish_last_error,omitempty"`
	PublishExternalURL string   `json:"publish_external_url,omitempty"`
	CreatedAt          string   `json:"created_at"`
	SourceStatus       string   `json:"source_status,omitempty"`
	SourceID           uint     `json:"source_id"`
}

type ReviewQueueResponse struct {
	Items    []ReviewQueueItem `json:"items"`
	Total    int               `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
	Stats    ReviewQueueStats  `json:"stats"`
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
