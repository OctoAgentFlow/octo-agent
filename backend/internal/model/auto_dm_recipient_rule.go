package model

import "time"

// AutoDMRecipientRule stores per-recipient safety decisions before Auto DM sends.
type AutoDMRecipientRule struct {
	Base
	UserID            uint       `gorm:"index;not null;uniqueIndex:ux_auto_dm_rule_recipient;comment:所属用户ID" json:"user_id"`
	XAccountID        uint       `gorm:"index;column:x_account_id;not null;uniqueIndex:ux_auto_dm_rule_recipient;comment:X账号ID" json:"x_account_id"`
	RecipientUserID   string     `gorm:"size:64;not null;uniqueIndex:ux_auto_dm_rule_recipient;comment:X收件人ID" json:"recipient_user_id"`
	RecipientUsername string     `gorm:"size:128;comment:X收件人用户名" json:"recipient_username,omitempty"`
	Status            string     `gorm:"size:32;index;not null;comment:名单状态（allowlisted/blocked/unsubscribed）" json:"status"`
	Source            string     `gorm:"size:64;comment:来源（task/manual/import）" json:"source,omitempty"`
	Reason            string     `gorm:"size:512;comment:名单原因" json:"reason,omitempty"`
	LastMatchedAt     *time.Time `gorm:"index;comment:最近一次命中时间" json:"last_matched_at,omitempty"`
}
