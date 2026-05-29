package model

type TrendFeedback struct {
	Base
	UserID         uint   `gorm:"index;not null;comment:用户ID" json:"user_id"`
	BotID          uint   `gorm:"index;not null;default:0;comment:OAF Bot ID" json:"bot_id"`
	XAccountID     uint   `gorm:"column:x_account_id;index;not null;default:0;comment:X账号ID" json:"x_account_id"`
	TrendName      string `gorm:"size:255;not null;comment:趋势原始名称" json:"trend_name"`
	NormalizedName string `gorm:"size:255;index;not null;comment:归一化趋势名称" json:"normalized_name"`
	WOEID          string `gorm:"size:32;index;comment:趋势地区WOEID" json:"woeid"`
	Category       string `gorm:"size:32;index;comment:趋势分类" json:"category"`
	Rating         string `gorm:"size:32;index;not null;comment:反馈结果" json:"rating"`
	SourceType     string `gorm:"size:48;index;comment:反馈来源类型" json:"source_type"`
	SourceID       uint   `gorm:"index;not null;default:0;comment:反馈来源ID" json:"source_id"`
	Comment        string `gorm:"size:512;comment:用户备注" json:"comment"`
}
