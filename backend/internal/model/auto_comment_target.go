package model

import "time"

type AutoCommentTarget struct {
	Base
	UserID             uint       `gorm:"index;not null;uniqueIndex:ux_auto_comment_user_target;comment:所属用户ID" json:"user_id"`
	XAccountID         uint       `gorm:"index;column:x_account_id;not null;uniqueIndex:ux_auto_comment_user_target;comment:执行评论的X账号ID" json:"x_account_id"`
	TargetUserID       string     `gorm:"size:64;index;comment:目标X用户ID" json:"target_user_id,omitempty"`
	TargetUsername     string     `gorm:"size:128;not null;uniqueIndex:ux_auto_comment_user_target;comment:目标X用户名" json:"target_username"`
	TargetDisplayName  string     `gorm:"size:128;comment:目标X显示名" json:"target_display_name,omitempty"`
	TargetTweetID      string     `gorm:"size:64;index;comment:手动录入的目标推文ID" json:"target_tweet_id,omitempty"`
	TargetTweetURL     string     `gorm:"size:512;comment:手动录入的目标推文URL" json:"target_tweet_url,omitempty"`
	TargetAuthorHandle string     `gorm:"size:128;comment:手动录入的目标推文作者Handle" json:"target_author_handle,omitempty"`
	TargetText         string     `gorm:"type:text;comment:手动录入的目标推文正文" json:"target_text,omitempty"`
	TargetCategory     string     `gorm:"size:64;index;not null;default:kol;comment:目标分类（kol/founder/project/competitor/customer/media/analyst/investor/developer/community/ecosystem/partner/other）" json:"target_category"`
	Priority           int        `gorm:"not null;default:3;comment:目标优先级（1-5）" json:"priority"`
	Notes              string     `gorm:"size:512;comment:运营备注" json:"notes,omitempty"`
	Status             string     `gorm:"size:32;index;not null;default:active;comment:目标状态（active/paused）" json:"status"`
	LastSeenTweetID    string     `gorm:"size:64;index;comment:最近已发现目标推文ID" json:"last_seen_tweet_id,omitempty"`
	LastSeenTweetAt    *time.Time `gorm:"index;comment:最近已发现目标推文时间" json:"last_seen_tweet_at,omitempty"`
	LastCheckedAt      *time.Time `gorm:"index;comment:最近检查时间" json:"last_checked_at,omitempty"`
	LastCommentedAt    *time.Time `gorm:"index;comment:最近评论时间" json:"last_commented_at,omitempty"`
	LastFailureReason  string     `gorm:"size:1024;comment:最近失败原因" json:"last_failure_reason,omitempty"`
	ResolvedAt         *time.Time `gorm:"comment:目标用户ID解析时间" json:"resolved_at,omitempty"`
}
