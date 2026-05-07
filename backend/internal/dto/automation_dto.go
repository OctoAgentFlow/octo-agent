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
	FailureReason     string `json:"failure_reason,omitempty"`
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
