package dto

type ContentLibraryItemRequest struct {
	TwitterAccountID uint     `json:"twitter_account_id"`
	BotID            uint     `json:"bot_id"`
	Title            string   `json:"title" binding:"required"`
	ItemType         string   `json:"item_type"`
	Body             string   `json:"body" binding:"required"`
	SourceURL        string   `json:"source_url"`
	Topics           []string `json:"topics"`
	GrowthGoal       string   `json:"growth_goal"`
	CTAPreference    string   `json:"cta_preference"`
	Priority         int      `json:"priority"`
	Status           string   `json:"status"`
}

type ContentLibraryItemQuery struct {
	TwitterAccountID uint   `form:"twitter_account_id"`
	BotID            uint   `form:"bot_id"`
	Status           string `form:"status"`
	Limit            int    `form:"limit"`
}

type ContentLibraryItem struct {
	ID               uint     `json:"id"`
	UserID           uint     `json:"user_id"`
	TwitterAccountID uint     `json:"twitter_account_id,omitempty"`
	BotID            uint     `json:"bot_id,omitempty"`
	Title            string   `json:"title"`
	ItemType         string   `json:"item_type"`
	Body             string   `json:"body"`
	SourceURL        string   `json:"source_url,omitempty"`
	Topics           []string `json:"topics"`
	GrowthGoal       string   `json:"growth_goal,omitempty"`
	CTAPreference    string   `json:"cta_preference,omitempty"`
	Priority         int      `json:"priority"`
	Status           string   `json:"status"`
	UsageCount       int      `json:"usage_count"`
	LastUsedAt       string   `json:"last_used_at,omitempty"`
	CreatedAt        string   `json:"created_at"`
	UpdatedAt        string   `json:"updated_at"`
}

type ContentLibraryItemsResponse struct {
	Items []ContentLibraryItem `json:"items"`
}
