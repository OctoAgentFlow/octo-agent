package dto

type AccountItem struct {
	ID           uint   `json:"id"`
	AvatarURL    string `json:"avatar_url"`
	Username     string `json:"username"`
	DisplayName  string `json:"display_name"`
	Status       string `json:"status"`
	LastSyncedAt string `json:"last_synced_at,omitempty"`
	Followers    string `json:"followers,omitempty"`
}

type AccountListResponse struct {
	Items []AccountItem `json:"items"`
}

type OAuthStartResponse struct {
	AuthURL string `json:"auth_url"`
	State   string `json:"state"`
}
