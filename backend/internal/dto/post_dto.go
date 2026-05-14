package dto

type PostListQuery struct {
	Page     int `form:"page"`
	PageSize int `form:"page_size"`
}

type PostCreateRequest struct {
	XAccountID  uint    `json:"x_account_id" binding:"required"`
	Content     string  `json:"content" binding:"required"`
	Status      string  `json:"status"`
	ScheduledAt *string `json:"scheduled_at"`
	PublishedAt *string `json:"published_at"`
}

type PostGenerateRequest struct {
	XAccountID uint   `json:"x_account_id" binding:"required"`
	Topic      string `json:"topic"`
}

type PostUpdateRequest struct {
	XAccountID  *uint   `json:"x_account_id"`
	Content     *string `json:"content"`
	Status      *string `json:"status"`
	ScheduledAt *string `json:"scheduled_at"`
	PublishedAt *string `json:"published_at"`
}

type PostItem struct {
	ID               uint    `json:"id"`
	UserID           uint    `json:"user_id"`
	XAccountID       uint    `json:"x_account_id"`
	Content          string  `json:"content"`
	Status           string  `json:"status"`
	ScheduledAt      *string `json:"scheduled_at,omitempty"`
	PublishedAt      *string `json:"published_at,omitempty"`
	LastAttemptAt    *string `json:"last_attempt_at,omitempty"`
	LastErrorMessage string  `json:"last_error_message,omitempty"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

type PostListResponse struct {
	Items      []PostItem     `json:"items"`
	Pagination PostPagination `json:"pagination"`
}

type PostPagination struct {
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
	Total    int64 `json:"total"`
}

// PostExecuteResponse is returned after a manual execute (POST /posts/:id/execute).
type PostExecuteResponse struct {
	Post    PostItem `json:"post"`
	TweetID string   `json:"tweet_id,omitempty"`
}

type PostGenerateResponse struct {
	Content string         `json:"content"`
	BotID   uint           `json:"bot_id,omitempty"`
	Scene   string         `json:"scene"`
	Usage   PlanUsageData  `json:"usage"`
	Limits  PlanLimitsData `json:"limits"`
}
