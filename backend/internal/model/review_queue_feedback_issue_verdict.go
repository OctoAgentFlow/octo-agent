package model

type ReviewQueueFeedbackIssueVerdict struct {
	Base
	UserID        uint   `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	QueueType     string `gorm:"size:32;index;not null;comment:队列类型" json:"queue_type"`
	SourceID      uint   `gorm:"index;not null;comment:来源记录ID" json:"source_id"`
	BotID         uint   `gorm:"index;comment:OAF Bot ID" json:"bot_id,omitempty"`
	FeedbackIssue string `gorm:"size:64;index;not null;comment:反馈问题类型" json:"feedback_issue"`
	Verdict       string `gorm:"size:32;index;not null;comment:判定结果" json:"verdict"`
	Reasons       string `gorm:"type:text;comment:命中原因JSON" json:"reasons,omitempty"`
}
