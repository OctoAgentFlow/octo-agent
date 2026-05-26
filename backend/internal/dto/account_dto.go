package dto

type AccountItem struct {
	ID                    uint     `json:"id"`
	AvatarURL             string   `json:"avatar_url"`
	Username              string   `json:"username"`
	DisplayName           string   `json:"display_name"`
	Status                string   `json:"status"`
	LastSyncedAt          string   `json:"last_synced_at,omitempty"`
	Followers             string   `json:"followers,omitempty"`
	XSubscriptionTier     string   `json:"x_subscription_tier"`
	XSubscriptionSource   string   `json:"x_subscription_source"`
	PublishReady          bool     `json:"publish_ready"`
	PublishReauthRequired bool     `json:"publish_reauth_required"`
	PublishIssue          string   `json:"publish_issue,omitempty"`
	MissingScopes         []string `json:"missing_scopes,omitempty"`
}

type AccountListResponse struct {
	Items []AccountItem `json:"items"`
}

type OAuthStartResponse struct {
	AuthURL string `json:"auth_url"`
	State   string `json:"state"`
}

type AccountSettingsRequest struct {
	XSubscriptionTier string `json:"x_subscription_tier" binding:"required"`
}
