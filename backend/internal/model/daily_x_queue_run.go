package model

import "time"

type DailyXQueueRun struct {
	Base
	UserID                uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	ContextID             uint       `gorm:"index;not null;default:0;comment:Daily X Queue上下文ID" json:"context_id"`
	BotID                 uint       `gorm:"index;not null;default:0;comment:关联OAF Bot ID" json:"bot_id"`
	ContentLibraryID      uint       `gorm:"index;not null;default:0;comment:本次使用的内容素材ID" json:"content_library_id"`
	Status                string     `gorm:"size:32;index;not null;default:completed;comment:运行状态" json:"status"`
	DraftCount            int        `gorm:"not null;default:0;comment:本次生成草稿数" json:"draft_count"`
	ReviewActionsCount    int64      `gorm:"not null;default:0;comment:累计审核动作数" json:"review_actions_count"`
	ApprovedOrCopiedCount int64      `gorm:"not null;default:0;comment:累计批准或复制数" json:"approved_or_copied_count"`
	LearningAppliedCount  int        `gorm:"not null;default:0;comment:本次应用学习信号数" json:"learning_applied_count"`
	StartedAt             time.Time  `gorm:"index;not null;comment:运行开始时间" json:"started_at"`
	CompletedAt           *time.Time `gorm:"index;comment:运行完成时间" json:"completed_at,omitempty"`
}

type DailyXQueueRunItem struct {
	Base
	RunID            uint   `gorm:"index;not null;comment:Daily X Queue运行ID" json:"run_id"`
	DraftID          uint   `gorm:"index;not null;default:0;comment:关联草稿ID" json:"draft_id"`
	ItemType         string `gorm:"size:32;index;not null;default:draft;comment:条目类型" json:"item_type"`
	Status           string `gorm:"size:32;index;not null;default:pending_review;comment:条目状态" json:"status"`
	ContentDirection string `gorm:"size:512;comment:本条草稿方向" json:"content_direction,omitempty"`
}
