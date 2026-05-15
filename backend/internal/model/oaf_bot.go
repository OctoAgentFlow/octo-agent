package model

type OAFBot struct {
	Base
	UserID           uint   `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	TwitterAccountID uint   `gorm:"index;column:twitter_account_id;comment:绑定的X账号ID" json:"twitter_account_id"`
	Name             string `gorm:"size:96;not null;comment:机器人名称" json:"name"`
	Occupation       string `gorm:"size:128;comment:职业" json:"occupation,omitempty"`
	Industry         string `gorm:"size:128;comment:行业" json:"industry,omitempty"`
	AgeRange         string `gorm:"size:64;comment:年龄段" json:"age_range,omitempty"`
	Gender           string `gorm:"size:64;comment:性别表达" json:"gender,omitempty"`
	Education        string `gorm:"size:128;comment:学历" json:"education,omitempty"`
	MBTI             string `gorm:"size:32;comment:MBTI" json:"mbti,omitempty"`
	PersonalityTags  string `gorm:"type:text;comment:性格标签JSON" json:"personality_tags,omitempty"`
	IdentitySummary  string `gorm:"type:text;comment:身份摘要" json:"identity_summary,omitempty"`
	VoiceTone        string `gorm:"size:128;comment:语言风格" json:"voice_tone,omitempty"`
	Topics           string `gorm:"type:text;comment:话题领域JSON" json:"topics,omitempty"`
	ForbiddenTopics  string `gorm:"type:text;comment:禁聊话题JSON" json:"forbidden_topics,omitempty"`
	GrowthGoal       string `gorm:"type:text;comment:增长目标" json:"growth_goal,omitempty"`
	SafetyMode       string `gorm:"size:64;default:balanced;comment:安全模式" json:"safety_mode,omitempty"`
	PrimaryLanguage  string `gorm:"size:32;default:zh-CN;comment:主要输出语言" json:"primary_language,omitempty"`
	LanguageStrategy string `gorm:"size:64;default:follow_context;comment:语言策略" json:"language_strategy,omitempty"`
}
