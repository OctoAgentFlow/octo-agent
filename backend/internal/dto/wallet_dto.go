package dto

type WalletChallengeRequest struct {
	Address string `json:"address" binding:"required"`
	ChainID int64  `json:"chain_id" binding:"required"`
}

type WalletChallengeData struct {
	ChallengeID string `json:"challenge_id"`
	Message     string `json:"message"`
	Nonce       string `json:"nonce"`
	ExpiredAt   string `json:"expired_at"`
}

type WalletBindRequest struct {
	ChallengeID string `json:"challenge_id" binding:"required"`
	Address     string `json:"address" binding:"required"`
	Signature   string `json:"signature" binding:"required"`
	ChainID     int64  `json:"chain_id" binding:"required"`
}

type WalletBindData struct {
	WalletAddress string `json:"wallet_address"`
	BoundAt       string `json:"bound_at"`
}

type WalletUnbindRequest struct {
	Address string `json:"address"`
	ChainID int64  `json:"chain_id"`
}
