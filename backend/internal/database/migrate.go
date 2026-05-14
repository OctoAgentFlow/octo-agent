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
		&model.AutoCommentTarget{},
		&model.AutoCommentTask{},
		&model.AutoDMRecipientRule{},
		&model.AutoDMRecipientImport{},
		&model.AutoDMTask{},
		&model.Post{},
		&model.Agent{},
		&model.OAFBot{},
		&model.AIGenerationUsage{},
		&model.Task{},
		&model.BillingOrder{},
		&model.BillingOrderAudit{},
		&model.BillingChainTx{},
	); err != nil {
		return err
	}
	if err := ApplyTableComments(db); err != nil {
		return err
	}
	if err := BackfillActivityReplyFields(db); err != nil {
		return err
	}
	if err := BackfillAutomationDefaultsDisabled(db); err != nil {
		return err
	}
	return BackfillUserOwnerRole(db)
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
		{&model.AutoCommentTarget{}, "Auto Comment目标账号配置"},
		{&model.AutoCommentTask{}, "Auto Comment生成、审批与发送任务"},
		{&model.AutoDMRecipientRule{}, "Auto DM收件人白名单/黑名单/退订规则"},
		{&model.AutoDMRecipientImport{}, "Auto DM收件人白名单导入批次"},
		{&model.AutoDMTask{}, "Auto DM发送前审批与审计任务"},
		{&model.Post{}, "帖子内容与发布状态"},
		{&model.Agent{}, "Agent定义"},
		{&model.OAFBot{}, "OAF Bot社交人格机器人配置"},
		{&model.AIGenerationUsage{}, "AI生成次数月度用量记录"},
		{&model.Task{}, "任务执行记录"},
		{&model.BillingOrder{}, "订阅支付订单"},
		{&model.BillingOrderAudit{}, "订阅支付订单运营审计"},
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

// BackfillAutomationDefaultsDisabled fixes historical rows created while the model default
// allowed new automation_configs to inherit enabled=true from the database.
func BackfillAutomationDefaultsDisabled(db *gorm.DB) error {
	if err := db.Exec(`
ALTER TABLE automation_configs
MODIFY enabled boolean NOT NULL DEFAULT false,
MODIFY state varchar(32) NOT NULL DEFAULT 'Paused'
`).Error; err != nil {
		return err
	}
	return db.Exec(`
UPDATE automation_configs ac
LEFT JOIN twitter_accounts ta
  ON ta.user_id = ac.user_id AND ta.status = 'connected'
SET ac.enabled = false,
    ac.state = 'Paused',
    ac.next_run_at = NULL
WHERE ta.id IS NULL
  AND ac.enabled = true
`).Error
}

// BackfillUserOwnerRole keeps legacy local/projects usable after introducing role-based operator permissions.
func BackfillUserOwnerRole(db *gorm.DB) error {
	if err := db.Model(&model.User{}).
		Where("role = '' OR role IS NULL").
		Update("role", "user").Error; err != nil {
		return err
	}
	var operators int64
	if err := db.Model(&model.User{}).
		Where("role IN ?", []string{"owner", "admin"}).
		Count(&operators).Error; err != nil {
		return err
	}
	if operators > 0 {
		return nil
	}
	var first model.User
	if err := db.Order("id ASC").First(&first).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil
		}
		return err
	}
	return db.Model(&model.User{}).Where("id = ?", first.ID).Update("role", "owner").Error
}
