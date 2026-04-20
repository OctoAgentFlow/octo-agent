package model

type Agent struct {
	Base
	UserID uint   `gorm:"index;comment:所属用户ID" json:"user_id"`
	Name   string `gorm:"size:64;comment:Agent名称" json:"name"`
	Model  string `gorm:"size:64;comment:模型标识" json:"model"`
}
