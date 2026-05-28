package model

import "time"

type AutoCommentTask struct {
	Base
	UserID              uint       `gorm:"index;not null;uniqueIndex:ux_auto_comment_task_tweet;comment:所属用户ID" json:"user_id"`
	BotID               uint       `gorm:"index;not null;default:0;comment:生成评论使用的OAF Bot ID，0表示未绑定" json:"bot_id"`
	XAccountID          uint       `gorm:"index;column:x_account_id;not null;uniqueIndex:ux_auto_comment_task_tweet;comment:执行评论的X账号ID" json:"x_account_id"`
	TargetID            uint       `gorm:"index;not null;comment:目标账号配置ID" json:"target_id"`
	TargetUserID        string     `gorm:"size:64;index;comment:目标X用户ID" json:"target_user_id,omitempty"`
	TargetUsername      string     `gorm:"size:128;comment:目标X用户名" json:"target_username"`
	TargetTweetID       string     `gorm:"size:64;not null;uniqueIndex:ux_auto_comment_task_tweet;comment:目标推文ID" json:"target_tweet_id"`
	TargetTweetText     string     `gorm:"type:text;comment:目标推文正文" json:"target_tweet_text,omitempty"`
	TargetTweetAuthor   string     `gorm:"size:128;comment:目标推文作者" json:"target_tweet_author,omitempty"`
	GeneratedComment    string     `gorm:"size:512;comment:LLM生成的评论内容" json:"generated_comment,omitempty"`
	OpportunityScore    int        `gorm:"not null;default:0;comment:评论机会评分（0-100）" json:"opportunity_score"`
	GenerationReason    string     `gorm:"size:1024;comment:生成原因说明" json:"generation_reason,omitempty"`
	MatchedKeywords     string     `gorm:"type:text;comment:命中的关键词JSON数组" json:"matched_keywords,omitempty"`
	ReferencedContent   string     `gorm:"type:text;comment:参考的内容池素材标题JSON数组" json:"referenced_content,omitempty"`
	CommentVariants     string     `gorm:"type:text;comment:评论候选JSON数组" json:"comment_variants,omitempty"`
	DeliveryMode        string     `gorm:"size:32;index;not null;default:manual_comment;comment:推荐投递方式（auto_comment/manual_comment/quote_post/skip/inbound_handoff）" json:"delivery_mode"`
	DeliveryReason      string     `gorm:"size:1024;comment:推荐投递方式说明" json:"delivery_reason,omitempty"`
	APIReplyEligible    bool       `gorm:"index;not null;default:false;comment:是否判断为可通过X API回复" json:"api_reply_eligible"`
	APIReplyBlockReason string     `gorm:"size:512;comment:X API回复不可用原因" json:"api_reply_block_reason,omitempty"`
	ManualActionURL     string     `gorm:"size:512;comment:人工评论操作链接" json:"manual_action_url,omitempty"`
	QuotePostCandidate  string     `gorm:"size:512;comment:引用发布候选文案" json:"quote_post_candidate,omitempty"`
	Status              string     `gorm:"size:32;index;not null;default:pending_review;comment:任务状态（draft/pending_review/approved/ready_to_publish/sending/blocked/failed/sent）" json:"status"`
	RiskLevel           string     `gorm:"size:32;index;not null;default:low;comment:草稿风险等级" json:"risk_level"`
	CapabilityStatus    string     `gorm:"size:64;index;not null;comment:发送能力状态" json:"capability_status"`
	FailureCategory     string     `gorm:"size:64;index;comment:失败分类" json:"failure_category,omitempty"`
	FailureReason       string     `gorm:"size:1024;comment:失败或阻断原因" json:"failure_reason,omitempty"`
	Retryable           bool       `gorm:"index;not null;default:false;comment:是否可重试" json:"retryable"`
	RetryAfterAt        *time.Time `gorm:"index;comment:下次可重试时间" json:"retry_after_at,omitempty"`
	AttemptCount        int        `gorm:"not null;default:0;comment:发送尝试次数" json:"attempt_count"`
	LastAttemptAt       *time.Time `gorm:"comment:最近一次发送尝试时间" json:"last_attempt_at,omitempty"`
	ApprovalRequired    bool       `gorm:"not null;default:true;comment:是否需要人工审批" json:"approval_required"`
	ActivityLogID       uint       `gorm:"index;comment:关联活动日志ID" json:"activity_log_id,omitempty"`
	CommentTweetID      string     `gorm:"size:64;index;comment:评论推文ID" json:"comment_tweet_id,omitempty"`
	DetectedAt          time.Time  `gorm:"index;not null;comment:发现目标推文时间" json:"detected_at"`
	GeneratedAt         *time.Time `gorm:"comment:评论生成时间" json:"generated_at,omitempty"`
	ApprovedAt          *time.Time `gorm:"comment:审批通过时间" json:"approved_at,omitempty"`
	BlockedAt           *time.Time `gorm:"comment:阻断时间" json:"blocked_at,omitempty"`
	SentAt              *time.Time `gorm:"comment:真实发送时间" json:"sent_at,omitempty"`
}
