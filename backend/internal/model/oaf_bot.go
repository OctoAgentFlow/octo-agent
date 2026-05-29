package model

type OAFBot struct {
	Base
	UserID               uint   `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	TwitterAccountID     uint   `gorm:"index;column:twitter_account_id;comment:绑定的X账号ID" json:"twitter_account_id"`
	Name                 string `gorm:"size:96;not null;comment:机器人名称" json:"name"`
	Occupation           string `gorm:"size:128;comment:职业" json:"occupation,omitempty"`
	Industry             string `gorm:"size:128;comment:行业" json:"industry,omitempty"`
	AgeRange             string `gorm:"size:64;comment:年龄段" json:"age_range,omitempty"`
	Gender               string `gorm:"size:64;comment:性别表达" json:"gender,omitempty"`
	Education            string `gorm:"size:128;comment:学历" json:"education,omitempty"`
	MBTI                 string `gorm:"size:32;comment:MBTI" json:"mbti,omitempty"`
	PersonalityTags      string `gorm:"type:text;comment:性格标签JSON" json:"personality_tags,omitempty"`
	IdentitySummary      string `gorm:"type:text;comment:身份摘要" json:"identity_summary,omitempty"`
	VoiceTone            string `gorm:"size:128;comment:语言风格" json:"voice_tone,omitempty"`
	Topics               string `gorm:"type:text;comment:话题领域JSON" json:"topics,omitempty"`
	ForbiddenTopics      string `gorm:"type:text;comment:禁聊话题JSON" json:"forbidden_topics,omitempty"`
	GrowthGoal           string `gorm:"type:text;comment:增长目标" json:"growth_goal,omitempty"`
	ProjectOneLiner      string `gorm:"type:text;comment:项目一句话介绍" json:"project_one_liner,omitempty"`
	TargetAudience       string `gorm:"type:text;comment:目标受众" json:"target_audience,omitempty"`
	CoreValueProps       string `gorm:"type:text;comment:核心价值主张" json:"core_value_props,omitempty"`
	ProductFeatures      string `gorm:"type:text;comment:产品功能亮点" json:"product_features,omitempty"`
	Differentiators      string `gorm:"type:text;comment:差异化优势" json:"differentiators,omitempty"`
	ContentPillars       string `gorm:"type:text;comment:内容支柱JSON" json:"content_pillars,omitempty"`
	ContentObjectives    string `gorm:"type:text;comment:内容目标" json:"content_objectives,omitempty"`
	PreferredCTA         string `gorm:"type:text;comment:偏好CTA" json:"preferred_cta,omitempty"`
	WebsiteURL           string `gorm:"size:512;comment:官网/产品入口URL" json:"website_url,omitempty"`
	TelegramURL          string `gorm:"size:512;comment:Telegram社群URL" json:"telegram_url,omitempty"`
	DiscordURL           string `gorm:"size:512;comment:Discord社群URL" json:"discord_url,omitempty"`
	DocsURL              string `gorm:"size:512;comment:文档/白皮书URL" json:"docs_url,omitempty"`
	CTAPolicy            string `gorm:"type:text;comment:推广入口使用规则" json:"cta_policy,omitempty"`
	Hashtags             string `gorm:"type:text;comment:偏好标签JSON" json:"hashtags,omitempty"`
	Keywords             string `gorm:"type:text;comment:关键词JSON" json:"keywords,omitempty"`
	ComplianceNotes      string `gorm:"type:text;comment:合规说明" json:"compliance_notes,omitempty"`
	AvoidClaims          string `gorm:"type:text;comment:避免宣称JSON" json:"avoid_claims,omitempty"`
	SafetyMode           string `gorm:"size:64;default:balanced;comment:安全模式" json:"safety_mode,omitempty"`
	PrimaryLanguage      string `gorm:"size:32;default:zh-CN;comment:主要输出语言" json:"primary_language,omitempty"`
	LanguageStrategy     string `gorm:"size:64;default:follow_context;comment:语言策略" json:"language_strategy,omitempty"`
	TrendRegions         string `gorm:"type:text;comment:关注趋势地区WOEID JSON" json:"trend_regions,omitempty"`
	TrendCategories      string `gorm:"type:text;comment:关注趋势分类JSON" json:"trend_categories,omitempty"`
	AllowGeneralTrends   bool   `gorm:"not null;default:false;comment:是否允许泛热点" json:"allow_general_trends"`
	SensitiveTrendPolicy string `gorm:"size:32;default:avoid;comment:敏感趋势策略（avoid/review_only/allow）" json:"sensitive_trend_policy,omitempty"`
}
