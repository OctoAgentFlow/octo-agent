package model

import "time"

type AutoReplyDraft struct {
	Base
	UserID              uint       `gorm:"index;not null;comment:所属用户ID" json:"user_id"`
	BotID               uint       `gorm:"index;not null;default:0;comment:生成回复使用的OAF Bot ID，0表示未绑定" json:"bot_id"`
	XAccountID          uint       `gorm:"index;column:x_account_id;not null;comment:执行回复的X账号ID" json:"x_account_id"`
	CommentTweetID      string     `gorm:"size:64;index;comment:待回复评论Tweet ID" json:"comment_tweet_id,omitempty"`
	CommentURL          string     `gorm:"size:512;comment:待回复评论URL" json:"comment_url,omitempty"`
	CommentAuthorHandle string     `gorm:"size:128;comment:评论作者handle" json:"comment_author_handle"`
	RootTweetText       string     `gorm:"type:text;comment:原推文正文" json:"root_tweet_text,omitempty"`
	CommentText         string     `gorm:"type:text;comment:待回复评论正文" json:"comment_text"`
	GeneratedReply      string     `gorm:"size:512;comment:LLM生成的回复内容" json:"generated_reply,omitempty"`
	Status              string     `gorm:"size:32;index;not null;default:pending_review;comment:任务状态（draft/pending_review/approved/ready_to_publish/rejected/failed/sent）" json:"status"`
	RiskLevel           string     `gorm:"size:32;index;not null;default:low;comment:草稿风险等级" json:"risk_level"`
	CapabilityStatus    string     `gorm:"size:64;index;not null;comment:能力状态" json:"capability_status"`
	FailureCategory     string     `gorm:"size:64;index;comment:失败分类" json:"failure_category,omitempty"`
	FailureReason       string     `gorm:"size:1024;comment:失败或阻断原因" json:"failure_reason,omitempty"`
	ApprovalRequired    bool       `gorm:"not null;default:true;comment:是否需要人工审批" json:"approval_required"`
	ActivityLogID       uint       `gorm:"index;comment:关联活动日志ID" json:"activity_log_id,omitempty"`
	GeneratedAt         *time.Time `gorm:"comment:回复生成时间" json:"generated_at,omitempty"`
	ApprovedAt          *time.Time `gorm:"comment:审批通过时间" json:"approved_at,omitempty"`
	RejectedAt          *time.Time `gorm:"comment:拒绝时间" json:"rejected_at,omitempty"`
	SentAt              *time.Time `gorm:"comment:真实发送时间" json:"sent_at,omitempty"`
}
