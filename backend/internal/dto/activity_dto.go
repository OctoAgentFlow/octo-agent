package dto

type ActivityQuery struct {
	Page        int    `form:"page"`
	PageSize    int    `form:"page_size"`
	Type        string `form:"type"`
	EventScope  string `form:"event_scope"`
	Status      string `form:"status"`
	Range       string `form:"range"`
	AccountID   uint   `form:"account_id"`
	ErrorReason string `form:"error_reason"`
}

type ActivityItemData struct {
	ID            uint   `json:"id"`
	XAccountID    uint   `json:"x_account_id,omitempty"`
	Type          string `json:"type"`
	Status        string `json:"status"`
	PreviewKey    string `json:"preview_key"`
	AccountHandle string `json:"account_handle"`
	SourceModule  string `json:"source_module,omitempty"`
	ExecutedAt    string `json:"executed_at"`
	ErrorMessage  string `json:"error_message,omitempty"`
	// Reply-specific (type=reply)
	ReplyCommentTweetID string `json:"reply_comment_tweet_id,omitempty"`
	ReplyToUsername     string `json:"reply_to_username,omitempty"`
	ReplyToTextPreview  string `json:"reply_to_text_preview,omitempty"`
	ReplyTextPreview    string `json:"reply_text_preview,omitempty"`
}

type ActivityPagination struct {
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
	Total    int64 `json:"total"`
}

type ActivityListResponse struct {
	Items      []ActivityItemData `json:"items"`
	Pagination ActivityPagination `json:"pagination"`
}
