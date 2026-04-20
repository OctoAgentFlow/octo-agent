package model

import "time"

type EmailVerificationCode struct {
	Base
	Email     string     `gorm:"size:128;index;not null;comment:邮箱地址" json:"email"`
	Purpose   string     `gorm:"size:32;index;not null;comment:验证码用途" json:"purpose"`
	Code      string     `gorm:"size:16;not null;comment:验证码" json:"code"`
	ExpiredAt time.Time  `gorm:"index;not null;comment:过期时间" json:"expired_at"`
	UsedAt    *time.Time `gorm:"index;comment:使用时间" json:"used_at,omitempty"`
}
