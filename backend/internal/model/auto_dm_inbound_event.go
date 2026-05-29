package model

import "time"

// AutoDMInboundEvent stores inbound DM events detected after an Auto DM send.
type AutoDMInboundEvent struct {
	Base
	UserID            uint      `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	XAccountID        uint      `gorm:"index;column:x_account_id;comment:X账号ID" json:"x_account_id,omitempty"`
	AutoDMTaskID      uint      `gorm:"index;comment:关联Auto DM任务ID" json:"auto_dm_task_id,omitempty"`
	RecipientUserID   string    `gorm:"size:64;index;comment:X收件人ID" json:"recipient_user_id,omitempty"`
	RecipientUsername string    `gorm:"size:128;comment:X收件人用户名" json:"recipient_username,omitempty"`
	RecipientSegment  string    `gorm:"size:32;index;default:lead;comment:收件人分组快照" json:"recipient_segment,omitempty"`
	DMConversationID  string    `gorm:"size:128;index;comment:X DM会话ID" json:"dm_conversation_id,omitempty"`
	DMEventID         string    `gorm:"size:128;uniqueIndex;comment:X DM事件ID" json:"dm_event_id,omitempty"`
	SenderID          string    `gorm:"size:64;index;comment:X发送者ID" json:"sender_id,omitempty"`
	Text              string    `gorm:"size:1024;comment:入站DM文本摘要" json:"text,omitempty"`
	EventCreatedAt    time.Time `gorm:"index;not null;comment:X事件创建时间" json:"event_created_at"`
	DetectedAt        time.Time `gorm:"index;not null;comment:系统检测时间" json:"detected_at"`
}
