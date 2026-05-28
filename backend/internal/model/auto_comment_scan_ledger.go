package model

import "time"

type AutoCommentScanLedger struct {
	Base
	UserID                  uint      `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	XAccountID              uint      `gorm:"index;column:x_account_id;not null;comment:执行扫描的X账号ID" json:"x_account_id"`
	TargetID                uint      `gorm:"index;not null;comment:目标账号配置ID" json:"target_id"`
	TargetUsername          string    `gorm:"size:128;comment:目标X用户名" json:"target_username"`
	Status                  string    `gorm:"size:32;index;not null;default:scanned;comment:扫描状态（scanned/failed/skipped）" json:"status"`
	XReadUnits              int       `gorm:"not null;default:0;comment:X读取单位估算" json:"x_read_units"`
	EstimatedCostMilliCents int64     `gorm:"not null;default:0;comment:估算成本，千分之一美分" json:"estimated_cost_millicents"`
	SkipReason              string    `gorm:"size:512;comment:跳过或失败原因" json:"skip_reason,omitempty"`
	ScannedAt               time.Time `gorm:"index;not null;comment:扫描发生时间" json:"scanned_at"`
}
