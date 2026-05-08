package model

import "time"

type User struct {
	Base
	Email    string `gorm:"uniqueIndex;size:128;comment:用户邮箱（唯一）" json:"email"`
	Password string `gorm:"size:255;column:password_hash;comment:密码哈希" json:"-"`
	Name     string `gorm:"size:64;column:display_name;comment:显示名称" json:"name"`
	Status   string `gorm:"size:32;default:active;index;comment:用户状态" json:"status"`
	Role     string `gorm:"size:32;default:user;index;comment:用户角色（user/owner/admin）" json:"role"`

	SubscriptionPlanCode  string     `gorm:"size:64;comment:订阅方案编码" json:"subscription_plan_code,omitempty"`
	SubscriptionStatus    string     `gorm:"size:32;index;comment:订阅状态（none/active/expired）" json:"subscription_status,omitempty"`
	SubscriptionExpiresAt *time.Time `gorm:"comment:订阅到期时间" json:"subscription_expires_at,omitempty"`
}
