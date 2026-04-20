package model

import "time"

type WalletChallenge struct {
	Base
	ChallengeID string     `gorm:"uniqueIndex;size:64;not null;comment:挑战ID" json:"challenge_id"`
	UserID      uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	Address     string     `gorm:"size:128;index;not null;comment:钱包地址" json:"address"`
	ChainID     int64      `gorm:"index;not null;comment:链ID" json:"chain_id"`
	Nonce       string     `gorm:"uniqueIndex;size:64;not null;comment:签名随机数" json:"nonce"`
	Message     string     `gorm:"type:text;not null;comment:待签名消息" json:"message"`
	ExpiredAt   time.Time  `gorm:"index;not null;comment:过期时间" json:"expired_at"`
	UsedAt      *time.Time `gorm:"index;comment:使用时间" json:"used_at,omitempty"`
}
