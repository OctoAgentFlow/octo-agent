package model

import "time"

// AutoDMRecipientImport stores an allowlist import batch for auditability.
type AutoDMRecipientImport struct {
	Base
	UserID       uint      `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	XAccountID   uint      `gorm:"index;column:x_account_id;not null;comment:X账号ID" json:"x_account_id"`
	Source       string    `gorm:"size:64;index;not null;comment:导入来源" json:"source"`
	Imported     int       `gorm:"not null;default:0;comment:成功导入数量" json:"imported"`
	Skipped      int       `gorm:"not null;default:0;comment:跳过数量" json:"skipped"`
	ErrorSummary string    `gorm:"type:text;comment:错误详情JSON" json:"error_summary,omitempty"`
	ImportedAt   time.Time `gorm:"index;not null;comment:导入时间" json:"imported_at"`
}
