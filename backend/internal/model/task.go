package model

type Task struct {
	Base
	UserID   uint   `gorm:"index;comment:所属用户ID" json:"user_id"`
	Type     string `gorm:"size:64;comment:任务类型" json:"type"`
	Status   string `gorm:"size:32;comment:任务状态" json:"status"`
	TargetID uint   `gorm:"index;comment:关联目标ID" json:"target_id"`
}
