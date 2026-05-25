package dto

type PointAccountData struct {
	Balance        int64  `json:"balance"`
	Frozen         int64  `json:"frozen"`
	LifetimeEarned int64  `json:"lifetime_earned"`
	LifetimeSpent  int64  `json:"lifetime_spent"`
	ExchangeRate   string `json:"exchange_rate"`
}

type PointActivityData struct {
	Code        string `json:"code"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Points      int64  `json:"points"`
	Claimed     bool   `json:"claimed"`
	Claimable   bool   `json:"claimable"`
}

type PointLedgerItem struct {
	ID           string `json:"id"`
	EventType    string `json:"event_type"`
	ActivityCode string `json:"activity_code,omitempty"`
	OrderID      string `json:"order_id,omitempty"`
	Points       int64  `json:"points"`
	BalanceAfter int64  `json:"balance_after"`
	FrozenAfter  int64  `json:"frozen_after"`
	CreatedAt    string `json:"created_at"`
	Details      string `json:"details,omitempty"`
}

type PointCenterResponse struct {
	Account    PointAccountData    `json:"account"`
	Activities []PointActivityData `json:"activities"`
	Ledger     []PointLedgerItem   `json:"ledger"`
}

type PointClaimRequest struct {
	ActivityCode string `json:"activity_code" binding:"required"`
}
