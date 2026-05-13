package dto

type AutomationFrequency struct {
	IntervalMinutes int `json:"interval_minutes" binding:"required,min=1,max=1440"`
	DailyLimit      int `json:"daily_limit" binding:"required,min=0,max=5000"`
}

type AutomationSafety struct {
	RequireApproval bool     `json:"require_approval"`
	MaxPerHour      int      `json:"max_per_hour" binding:"required,min=0,max=500"`
	BlockedKeywords []string `json:"blocked_keywords"`
}

type AutomationConfigPayload struct {
	Enabled   bool                `json:"enabled"`
	Frequency AutomationFrequency `json:"frequency" binding:"required"`
	Tone      string              `json:"tone" binding:"required"`
	Safety    AutomationSafety    `json:"safety" binding:"required"`
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
	ID                uint   `json:"id"`
	XAccountID        uint   `json:"x_account_id"`
	TargetUserID      string `json:"target_user_id,omitempty"`
	TargetUsername    string `json:"target_username"`
	TargetDisplayName string `json:"target_display_name,omitempty"`
	Status            string `json:"status"`
	LastSeenTweetID   string `json:"last_seen_tweet_id,omitempty"`
	LastSeenTweetAt   string `json:"last_seen_tweet_at,omitempty"`
	LastCheckedAt     string `json:"last_checked_at,omitempty"`
	LastCommentedAt   string `json:"last_commented_at,omitempty"`
	LastFailureReason string `json:"last_failure_reason,omitempty"`
	ResolvedAt        string `json:"resolved_at,omitempty"`
}

type AutoCommentTargetsResponse struct {
	Items []AutoCommentTargetItem `json:"items"`
}

type AutoCommentTargetRequest struct {
	XAccountID     uint   `json:"x_account_id"`
	TargetUsername string `json:"target_username" binding:"required"`
}

type AutoCommentTargetStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type AutoCommentTaskItem struct {
	ID                uint   `json:"id"`
	XAccountID        uint   `json:"x_account_id"`
	TargetID          uint   `json:"target_id"`
	TargetUserID      string `json:"target_user_id,omitempty"`
	TargetUsername    string `json:"target_username"`
	TargetTweetID     string `json:"target_tweet_id"`
	TargetTweetText   string `json:"target_tweet_text,omitempty"`
	TargetTweetAuthor string `json:"target_tweet_author,omitempty"`
	GeneratedComment  string `json:"generated_comment,omitempty"`
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
