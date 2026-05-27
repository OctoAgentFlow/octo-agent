package model

type OAFBotGenerationFeedback struct {
	Base
	UserID           uint   `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	BotID            uint   `gorm:"index;not null;comment:OAF Bot ID" json:"bot_id"`
	Scene            string `gorm:"size:32;index;not null;comment:生成场景" json:"scene"`
	Rating           string `gorm:"size:32;index;not null;comment:反馈结果（positive/negative）" json:"rating"`
	IssueTags        string `gorm:"type:text;comment:问题标签JSON" json:"issue_tags,omitempty"`
	Comment          string `gorm:"type:text;comment:用户反馈备注" json:"comment,omitempty"`
	SampleContext    string `gorm:"type:text;comment:测试上下文" json:"sample_context,omitempty"`
	GeneratedContent string `gorm:"type:text;comment:生成内容" json:"generated_content,omitempty"`
	Provider         string `gorm:"size:64;comment:生成来源" json:"provider,omitempty"`
}
