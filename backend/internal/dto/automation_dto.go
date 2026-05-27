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
	Type      string                  `json:"type"`
	Name      string                  `json:"name"`
	State     string                  `json:"state"`
	Config    AutomationConfigPayload `json:"config"`
	LastRunAt string                  `json:"last_run_at,omitempty"`
	NextRunAt string                  `json:"next_run_at,omitempty"`
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
	Page       int    `form:"page"`
	PageSize   int    `form:"page_size"`
}

type AutoPostGenerationRunsResponse struct {
	Items      []AutoPostGenerationRunItem `json:"items"`
	Pagination ActivityPagination          `json:"pagination"`
}

type AutoDMTaskItem struct {
	ID                uint   `json:"id"`
	XAccountID        uint   `json:"x_account_id,omitempty"`
	AccountHandle     string `json:"account_handle"`
	RecipientSource   string `json:"recipient_source"`
	RecipientUserID   string `json:"recipient_user_id,omitempty"`
	RecipientUsername string `json:"recipient_username,omitempty"`
	MessagePreview    string `json:"message_preview,omitempty"`
	Status            string `json:"status"`
	CapabilityStatus  string `json:"capability_status"`
	FailureCategory   string `json:"failure_category,omitempty"`
	FailureReason     string `json:"failure_reason,omitempty"`
	Retryable         bool   `json:"retryable"`
	RetryAfterAt      string `json:"retry_after_at,omitempty"`
	AttemptCount      int    `json:"attempt_count"`
	LastAttemptAt     string `json:"last_attempt_at,omitempty"`
	ApprovalRequired  bool   `json:"approval_required"`
	ActivityLogID     uint   `json:"activity_log_id,omitempty"`
	DMConversationID  string `json:"dm_conversation_id,omitempty"`
	DMEventID         string `json:"dm_event_id,omitempty"`
	GeneratedAt       string `json:"generated_at"`
	ApprovedAt        string `json:"approved_at,omitempty"`
	BlockedAt         string `json:"blocked_at,omitempty"`
	SentAt            string `json:"sent_at,omitempty"`
}

type AutoDMTasksResponse struct {
	Items []AutoDMTaskItem `json:"items"`
}

type AutoDMTaskBlockRequest struct {
	Reason string `json:"reason"`
}

type AutoDMRecipientRuleItem struct {
	ID                uint   `json:"id"`
	XAccountID        uint   `json:"x_account_id"`
	RecipientUserID   string `json:"recipient_user_id"`
	RecipientUsername string `json:"recipient_username,omitempty"`
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
	XAccountID uint   `form:"x_account_id"`
	Limit      int    `form:"limit"`
}

type AutoDMRecipientRulesResponse struct {
	Items []AutoDMRecipientRuleItem `json:"items"`
	Total int64                     `json:"total"`
}

type AutoDMRecipientRuleRequest struct {
	Status string `json:"status" binding:"required"`
	Reason string `json:"reason"`
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
}

type AutoCommentTargetStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type AutoCommentTaskItem struct {
	ID                uint   `json:"id"`
	BotID             uint   `json:"bot_id"`
	XAccountID        uint   `json:"x_account_id"`
	TargetID          uint   `json:"target_id"`
	TargetUserID      string `json:"target_user_id,omitempty"`
	TargetUsername    string `json:"target_username"`
	TargetTweetID     string `json:"target_tweet_id"`
	TargetTweetText   string `json:"target_tweet_text,omitempty"`
	TargetTweetAuthor string `json:"target_tweet_author,omitempty"`
	GeneratedComment  string `json:"generated_comment,omitempty"`
	Status            string `json:"status"`
	RiskLevel         string `json:"risk_level"`
	CapabilityStatus  string `json:"capability_status"`
	FailureCategory   string `json:"failure_category,omitempty"`
	FailureReason     string `json:"failure_reason,omitempty"`
	Retryable         bool   `json:"retryable"`
	RetryAfterAt      string `json:"retry_after_at,omitempty"`
	AttemptCount      int    `json:"attempt_count"`
	LastAttemptAt     string `json:"last_attempt_at,omitempty"`
	ApprovalRequired  bool   `json:"approval_required"`
	ActivityLogID     uint   `json:"activity_log_id,omitempty"`
	CommentTweetID    string `json:"comment_tweet_id,omitempty"`
	DetectedAt        string `json:"detected_at"`
	GeneratedAt       string `json:"generated_at,omitempty"`
	ApprovedAt        string `json:"approved_at,omitempty"`
	BlockedAt         string `json:"blocked_at,omitempty"`
	SentAt            string `json:"sent_at,omitempty"`
}

type AutoCommentTasksResponse struct {
	Items []AutoCommentTaskItem `json:"items"`
}

type AutoCommentTaskBlockRequest struct {
	Reason string `json:"reason"`
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
