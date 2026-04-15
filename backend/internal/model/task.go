package model

type Task struct {
	Base
	UserID   uint   `gorm:"index" json:"user_id"`
	Type     string `gorm:"size:64" json:"type"`
	Status   string `gorm:"size:32" json:"status"`
	TargetID uint   `gorm:"index" json:"target_id"`
}
