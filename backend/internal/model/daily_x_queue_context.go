package model

type DailyXQueueContext struct {
	Base
	UserID            uint   `gorm:"index;not null;uniqueIndex:ux_daily_x_queue_context_handle;comment:所属用户ID" json:"user_id"`
	XHandle           string `gorm:"size:64;not null;uniqueIndex:ux_daily_x_queue_context_handle;comment:手动输入的X账号Handle，不代表OAuth连接" json:"x_handle"`
	WebsiteURL        string `gorm:"size:512;comment:产品网站URL" json:"website_url,omitempty"`
	ProductContext    string `gorm:"type:text;comment:产品上下文" json:"product_context,omitempty"`
	TargetAudience    string `gorm:"type:text;comment:目标受众" json:"target_audience,omitempty"`
	VoicePreference   string `gorm:"size:256;comment:声音偏好" json:"voice_preference,omitempty"`
	Guardrails        string `gorm:"type:text;comment:生成守则" json:"guardrails,omitempty"`
	BotID             uint   `gorm:"index;not null;default:0;comment:关联OAF Bot ID" json:"bot_id"`
	ContentLibraryID  uint   `gorm:"index;not null;default:0;comment:最近使用的内容素材ID" json:"content_library_id"`
	Activated         bool   `gorm:"not null;default:false;comment:是否已达成Daily X Queue激活事件" json:"activated"`
	ActivatedActivity uint   `gorm:"index;not null;default:0;comment:激活活动日志ID" json:"activated_activity_id"`
}
