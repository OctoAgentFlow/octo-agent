package model

type User struct {
	Base
	Email    string `gorm:"uniqueIndex;size:128" json:"email"`
	Password string `gorm:"size:255" json:"-"`
	Name     string `gorm:"size:64" json:"name"`
}
