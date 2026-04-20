package model

import "time"

type ActivityLog struct {
	Base
	UserID              uint      `gorm:"index;not null;uniqueIndex:ux_activity_user_ref_tweet;comment:所属用户ID" json:"user_id"`
	Type                string    `gorm:"size:16;index;not null;comment:活动类型（post/reply/dm）" json:"type"`
	Status              string    `gorm:"size:16;index;not null;comment:活动状态（success/review/failed）" json:"status"`
	PreviewKey          string    `gorm:"size:128;not null;comment:前端预览文案键" json:"preview_key"`
	AccountHandle       string    `gorm:"size:128;not null;comment:执行账号标识" json:"account_handle"`
	ExecutedAt          time.Time `gorm:"index;not null;comment:执行时间" json:"executed_at"`
	ErrorMessage        string    `gorm:"size:1024;comment:失败错误信息" json:"error_message,omitempty"`
	RefTweetID          *string   `gorm:"size:32;uniqueIndex:ux_activity_user_ref_tweet;comment:成功回复关联的评论Tweet ID" json:"ref_tweet_id,omitempty"`
	ReplyCommentTweetID string    `gorm:"size:32;index;comment:回复目标评论Tweet ID" json:"reply_comment_tweet_id,omitempty"`
	ReplyToUsername     string    `gorm:"size:128;comment:被回复用户账号" json:"reply_to_username,omitempty"`
	ReplyToTextPreview  string    `gorm:"size:512;comment:被回复内容预览" json:"reply_to_text_preview,omitempty"`
	ReplyTextPreview    string    `gorm:"size:512;comment:回复内容预览" json:"reply_text_preview,omitempty"`
}
