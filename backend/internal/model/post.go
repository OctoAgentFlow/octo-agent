package model

type Post struct {
	Base
	UserID    uint   `gorm:"index" json:"user_id"`
	Content   string `gorm:"type:text" json:"content"`
	Status    string `gorm:"size:32;default:draft" json:"status"`
	AccountID uint   `gorm:"index" json:"account_id"`
}
