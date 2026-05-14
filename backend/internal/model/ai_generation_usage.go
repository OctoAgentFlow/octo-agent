package model

type AIGenerationUsage struct {
	Base
	UserID uint   `gorm:"index;not null;uniqueIndex:ux_ai_usage_user_bot_scene_month;comment:所属用户ID" json:"user_id"`
	BotID  uint   `gorm:"index;not null;default:0;uniqueIndex:ux_ai_usage_user_bot_scene_month;comment:OAF Bot ID，0表示未绑定" json:"bot_id"`
	Scene  string `gorm:"size:64;index;not null;uniqueIndex:ux_ai_usage_user_bot_scene_month;comment:AI生成场景" json:"scene"`
	Month  string `gorm:"size:7;index;not null;uniqueIndex:ux_ai_usage_user_bot_scene_month;comment:统计月份YYYY-MM" json:"month"`
	Count  int64  `gorm:"not null;default:0;comment:生成次数" json:"count"`
}
