package model

import "time"

type UserWallet struct {
	Base
	UserID    uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	Address   string     `gorm:"size:128;not null;uniqueIndex:uk_wallet_address_chain;comment:钱包地址" json:"address"`
	ChainID   int64      `gorm:"not null;uniqueIndex:uk_wallet_address_chain;index;comment:链ID" json:"chain_id"`
	IsPrimary bool       `gorm:"default:true;index;comment:是否主钱包" json:"is_primary"`
	BoundAt   time.Time  `gorm:"not null;comment:绑定时间" json:"bound_at"`
	UnboundAt *time.Time `gorm:"index;comment:解绑时间" json:"unbound_at,omitempty"`
}
