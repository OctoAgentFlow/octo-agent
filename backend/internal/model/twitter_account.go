package model

type TwitterAccount struct {
	Base
	UserID       uint   `gorm:"index" json:"user_id"`
	Username     string `gorm:"size:64" json:"username"`
	AccessToken  string `gorm:"size:255" json:"-"`
	RefreshToken string `gorm:"size:255" json:"-"`
}
