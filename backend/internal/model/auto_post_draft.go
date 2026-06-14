package model

import "time"

// AutoPostDraft is a legacy persisted contract. New Content Draft runtime code
// may alias it, but the model/table/json field contract must remain stable.
type AutoPostDraft struct {
	Base
	UserID           uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	PlanID           uint       `gorm:"index;not null;comment:Auto Post Planner ID" json:"plan_id"`
	BotID            uint       `gorm:"index;not null;default:0;comment:生成推文使用的OAF Bot ID，0表示未绑定" json:"bot_id"`
	XAccountID       uint       `gorm:"index;column:x_account_id;not null;comment:执行发推的X账号ID" json:"x_account_id"`
	ContentLibraryID uint       `gorm:"index;column:content_library_item_id;not null;default:0;comment:内容池素材ID，0表示未使用素材" json:"content_library_item_id,omitempty"`
	ContentDirection string     `gorm:"size:512;comment:本次内容方向" json:"content_direction,omitempty"`
	ContentHash      string     `gorm:"size:64;index;comment:生成内容去重Hash" json:"content_hash,omitempty"`
	SelectedTrends   string     `gorm:"type:text;comment:本次生成使用的趋势上下文JSON" json:"selected_trends,omitempty"`
	GeneratedContent string     `gorm:"type:text;comment:LLM生成的推文内容" json:"generated_content"`
	Status           string     `gorm:"size:32;index;not null;default:pending_review;comment:状态（draft/pending_review/approved/ready_to_publish/published/rejected/failed）" json:"status"`
	RiskLevel        string     `gorm:"size:32;index;not null;default:low;comment:风险等级" json:"risk_level"`
	CapabilityStatus string     `gorm:"size:64;index;not null;comment:能力状态" json:"capability_status"`
	FailureCategory  string     `gorm:"size:64;index;comment:失败分类" json:"failure_category,omitempty"`
	FailureReason    string     `gorm:"size:1024;comment:失败或阻断原因" json:"failure_reason,omitempty"`
	ApprovalRequired bool       `gorm:"not null;default:true;comment:是否需要人工审批" json:"approval_required"`
	ActivityLogID    uint       `gorm:"index;comment:关联活动日志ID" json:"activity_log_id,omitempty"`
	GeneratedAt      *time.Time `gorm:"comment:生成时间" json:"generated_at,omitempty"`
	ApprovedAt       *time.Time `gorm:"comment:审批通过时间" json:"approved_at,omitempty"`
	RejectedAt       *time.Time `gorm:"comment:拒绝时间" json:"rejected_at,omitempty"`
	PublishedAt      *time.Time `gorm:"comment:发布时间" json:"published_at,omitempty"`
}
