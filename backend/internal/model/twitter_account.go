package model

import "time"

type TwitterAccount struct {
	Base
	UserID              uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	Platform            string     `gorm:"size:16;default:x;index;comment:平台标识" json:"platform"`
	TwitterUserID       string     `gorm:"size:64;index;comment:X平台用户ID" json:"twitter_user_id"`
	Username            string     `gorm:"size:64;index;comment:X用户名" json:"username"`
	DisplayName         string     `gorm:"size:128;comment:X显示名称" json:"display_name"`
	AvatarURL           string     `gorm:"size:512;comment:头像URL" json:"avatar_url"`
	Status              string     `gorm:"size:32;default:connected;index;comment:账号连接状态" json:"status"`
	Followers           string     `gorm:"size:32;comment:粉丝数量（字符串）" json:"followers"`
	XSubscriptionTier   string     `gorm:"size:32;not null;default:unknown;comment:X账号会员等级（unknown/free/premium/premium_plus）" json:"x_subscription_tier"`
	XSubscriptionSource string     `gorm:"size:32;not null;default:manual;comment:X账号会员等级来源（x_api/manual）" json:"x_subscription_source"`
	LastSyncedAt        *time.Time `gorm:"comment:最近同步时间" json:"last_synced_at,omitempty"`
	AccessToken         string     `gorm:"size:1024;comment:OAuth访问令牌" json:"-"`
	RefreshToken        string     `gorm:"size:1024;comment:OAuth刷新令牌" json:"-"`
	OAuthScopes         string     `gorm:"column:oauth_scopes;size:512;comment:OAuth授权scope列表" json:"-"`
}
