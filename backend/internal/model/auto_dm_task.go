package model

import "time"

// AutoDMTask is the audit record that must exist before any real DM send.
type AutoDMTask struct {
	Base
	UserID            uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	XAccountID        uint       `gorm:"index;column:x_account_id;comment:X账号ID" json:"x_account_id,omitempty"`
	AccountHandle     string     `gorm:"size:128;not null;comment:执行账号标识" json:"account_handle"`
	RecipientSource   string     `gorm:"size:32;index;not null;comment:收件人来源规则" json:"recipient_source"`
	RecipientUserID   string     `gorm:"size:64;index;comment:X收件人ID" json:"recipient_user_id,omitempty"`
	RecipientUsername string     `gorm:"size:128;comment:X收件人用户名" json:"recipient_username,omitempty"`
	RecipientSegment  string     `gorm:"size:32;index;default:lead;comment:收件人分组快照" json:"recipient_segment,omitempty"`
	MessagePreview    string     `gorm:"size:512;comment:待发送私信预览" json:"message_preview,omitempty"`
	GenerationReason  string     `gorm:"size:1024;comment:私信生成原因说明" json:"generation_reason,omitempty"`
	MessageVariants   string     `gorm:"type:text;comment:私信候选JSON数组" json:"message_variants,omitempty"`
	Status            string     `gorm:"size:32;index;not null;comment:任务状态（review/approved/sending/blocked/failed/sent）" json:"status"`
	CapabilityStatus  string     `gorm:"size:64;index;not null;comment:发送能力状态" json:"capability_status"`
	FailureCategory   string     `gorm:"size:64;index;comment:失败分类（retryable_rate_limit等）" json:"failure_category,omitempty"`
	FailureReason     string     `gorm:"size:1024;comment:失败或阻断原因" json:"failure_reason,omitempty"`
	Retryable         bool       `gorm:"index;not null;default:false;comment:是否可重试" json:"retryable"`
	RetryAfterAt      *time.Time `gorm:"index;comment:下次可重试时间" json:"retry_after_at,omitempty"`
	AttemptCount      int        `gorm:"not null;default:0;comment:真实发送尝试次数" json:"attempt_count"`
	LastAttemptAt     *time.Time `gorm:"comment:最近一次真实发送尝试时间" json:"last_attempt_at,omitempty"`
	ApprovalRequired  bool       `gorm:"not null;default:true;comment:是否需要人工审批" json:"approval_required"`
	ActivityLogID     uint       `gorm:"index;comment:关联活动日志ID" json:"activity_log_id,omitempty"`
	DMConversationID  string     `gorm:"size:128;comment:X DM会话ID" json:"dm_conversation_id,omitempty"`
	DMEventID         string     `gorm:"size:128;comment:X DM事件ID" json:"dm_event_id,omitempty"`
	GeneratedAt       time.Time  `gorm:"index;not null;comment:生成时间" json:"generated_at"`
	ApprovedAt        *time.Time `gorm:"comment:审批通过时间" json:"approved_at,omitempty"`
	BlockedAt         *time.Time `gorm:"comment:阻断时间" json:"blocked_at,omitempty"`
	SentAt            *time.Time `gorm:"comment:真实发送时间" json:"sent_at,omitempty"`
}
