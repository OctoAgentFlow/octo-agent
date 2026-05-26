package model

type PointLedgerEntry struct {
	Base
	UserID       uint   `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	OrderID      uint   `gorm:"index;comment:关联订单ID" json:"order_id,omitempty"`
	ActivityCode string `gorm:"size:64;index;comment:活动编码" json:"activity_code,omitempty"`
	EventType    string `gorm:"size:32;index;not null;comment:事件类型（earn/freeze/consume/release）" json:"event_type"`
	Points       int64  `gorm:"not null;comment:积分变动数量" json:"points"`
	BalanceAfter int64  `gorm:"not null;default:0;comment:变动后可用余额" json:"balance_after"`
	FrozenAfter  int64  `gorm:"not null;default:0;comment:变动后冻结余额" json:"frozen_after"`
	UniqueKey    string `gorm:"size:191;uniqueIndex;comment:账本幂等键" json:"unique_key,omitempty"`
	Details      string `gorm:"type:text;comment:事件详情JSON" json:"details,omitempty"`
}
