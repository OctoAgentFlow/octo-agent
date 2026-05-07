package dto

type AgentResponse struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	Model     string `json:"model"`
	Type      string `json:"type"`
	State     string `json:"state"`
	Enabled   bool   `json:"enabled"`
	LastRunAt string `json:"last_run_at,omitempty"`
	NextRunAt string `json:"next_run_at,omitempty"`
}
