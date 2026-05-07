package database

import (
	"fmt"
	"strings"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

func AutoMigrate(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&model.User{},
		&model.UserNotificationSetting{},
		&model.EmailVerificationCode{},
		&model.WalletChallenge{},
		&model.UserWallet{},
		&model.TwitterAccount{},
		&model.AutomationConfig{},
		&model.ActivityLog{},
		&model.ReplyReservation{},
		&model.AutoDMTask{},
		&model.Post{},
		&model.Agent{},
		&model.Task{},
		&model.BillingOrder{},
		&model.BillingChainTx{},
	); err != nil {
		return err
	}
	if err := ApplyTableComments(db); err != nil {
		return err
	}
	return BackfillActivityReplyFields(db)
}

// ApplyTableComments keeps table comments readable in MySQL.
func ApplyTableComments(db *gorm.DB) error {
	modelComments := []struct {
		model   any
		comment string
	}{
		{&model.User{}, "用户主表"},
		{&model.UserNotificationSetting{}, "用户通知偏好设置"},
		{&model.EmailVerificationCode{}, "邮箱验证码记录"},
		{&model.WalletChallenge{}, "钱包签名挑战记录"},
		{&model.UserWallet{}, "用户钱包绑定记录"},
		{&model.TwitterAccount{}, "用户绑定的X账号信息"},
		{&model.AutomationConfig{}, "自动化模块配置"},
		{&model.ActivityLog{}, "自动化执行活动日志"},
		{&model.ReplyReservation{}, "自动回复并发占位锁"},
		{&model.AutoDMTask{}, "Auto DM发送前审批与审计任务"},
		{&model.Post{}, "帖子内容与发布状态"},
		{&model.Agent{}, "Agent定义"},
		{&model.Task{}, "任务执行记录"},
		{&model.BillingOrder{}, "订阅支付订单"},
		{&model.BillingChainTx{}, "已消费的链上交易哈希"},
	}
	for _, item := range modelComments {
		stmt := &gorm.Statement{DB: db}
		if err := stmt.Parse(item.model); err != nil {
			return err
		}
		table := stmt.Schema.Table
		escaped := strings.ReplaceAll(item.comment, "'", "''")
		sql := fmt.Sprintf("ALTER TABLE `%s` COMMENT = '%s'", table, escaped)
		if err := db.Exec(sql).Error; err != nil {
			return err
		}
	}
	return nil
}

// BackfillActivityReplyFields copies legacy ref_tweet_id into reply_comment_tweet_id and clears ref_tweet_id for non-success reply rows.
func BackfillActivityReplyFields(db *gorm.DB) error {
	if err := db.Exec(`
UPDATE activity_logs
SET reply_comment_tweet_id = ref_tweet_id
WHERE type = 'reply'
AND (reply_comment_tweet_id = '' OR reply_comment_tweet_id IS NULL)
AND ref_tweet_id IS NOT NULL AND TRIM(ref_tweet_id) != ''
`).Error; err != nil {
		return err
	}
	return db.Exec(`
UPDATE activity_logs
SET ref_tweet_id = NULL
WHERE type = 'reply' AND status <> 'success'
`).Error
}
