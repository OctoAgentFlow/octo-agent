package model

type Agent struct {
	Base
	UserID uint   `gorm:"index" json:"user_id"`
	Name   string `gorm:"size:64" json:"name"`
	Model  string `gorm:"size:64" json:"model"`
}
