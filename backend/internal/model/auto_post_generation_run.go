package model

type AutoPostGenerationRun struct {
	Base
	UserID           uint   `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	PlanID           uint   `gorm:"index;not null;comment:Auto Post Planner ID" json:"plan_id"`
	XAccountID       uint   `gorm:"index;column:x_account_id;not null;comment:执行发推的X账号ID" json:"x_account_id"`
	BotID            uint   `gorm:"index;not null;default:0;comment:生成推文使用的OAF Bot ID，0表示未绑定" json:"bot_id"`
	ContentLibraryID uint   `gorm:"index;column:content_library_item_id;not null;default:0;comment:内容池素材ID，0表示未使用素材" json:"content_library_item_id,omitempty"`
	Status           string `gorm:"size:32;index;not null;comment:运行状态completed/skipped/failed" json:"status"`
	SkipReason       string `gorm:"size:128;index;comment:跳过原因" json:"skip_reason,omitempty"`
	GeneratedDraftID uint   `gorm:"index;comment:生成的Auto Post草稿ID" json:"generated_draft_id,omitempty"`
	ErrorMessage     string `gorm:"size:1024;comment:失败错误信息" json:"error_message,omitempty"`
}
