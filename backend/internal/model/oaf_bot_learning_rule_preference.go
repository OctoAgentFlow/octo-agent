package model

type OAFBotLearningRulePreference struct {
	Base
	UserID        uint   `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	BotID         uint   `gorm:"index:idx_oaf_bot_learning_rule_pref,unique;not null;comment:OAF Bot ID" json:"bot_id"`
	FeedbackIssue string `gorm:"size:64;index:idx_oaf_bot_learning_rule_pref,unique;not null;comment:反馈问题类型" json:"feedback_issue"`
	Status        string `gorm:"size:32;index;not null;comment:规则偏好状态" json:"status"`
}
