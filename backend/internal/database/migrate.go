package database

import (
	"errors"
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
		&model.UserPointAccount{},
		&model.PointActivity{},
		&model.PointRiskConfig{},
		&model.GrossMarginAlertConfig{},
		&model.GrossMarginAlertEvent{},
		&model.PointGrant{},
		&model.PointRedemptionCode{},
		&model.PointRedemptionClaim{},
		&model.PointLedgerEntry{},
		&model.PointActivityClaim{},
		&model.TwitterAccount{},
		&model.ReferralInvite{},
		&model.ReferralRecord{},
		&model.AutomationConfig{},
		&model.ActivityLog{},
		&model.ReplyReservation{},
		&model.AutoReplyDraft{},
		&model.AutoPostPlan{},
		&model.AutoPostDraft{},
		&model.AutoPostGenerationRun{},
		&model.ContentLibraryItem{},
		&model.AutoCommentTarget{},
		&model.AutoCommentTask{},
		&model.PublishJob{},
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
		&model.BillingLedgerEntry{},
		&model.SubscriptionChangeEvent{},
		&model.CostUsageLedger{},
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
	if err := BackfillAutomationPackageQuotaOnly(db); err != nil {
		return err
	}
	if err := SeedDefaultPointActivities(db); err != nil {
		return err
	}
	if err := BackfillDefaultPointActivityRewards(db); err != nil {
		return err
	}
	if err := SeedDefaultPointRiskConfig(db); err != nil {
		return err
	}
	if err := SeedDefaultGrossMarginAlertConfig(db); err != nil {
		return err
	}
	return BackfillUserOwnerRole(db)
}

func SeedDefaultPointActivities(db *gorm.DB) error {
	defaults := []model.PointActivity{
		{
			Code:        "daily_check_in",
			Title:       "Daily check-in",
			Description: "Claim once per day after signing in.",
			Points:      1,
			ClaimPeriod: "daily",
			Enabled:     true,
			SortOrder:   10,
		},
		{
			Code:        "bind_x_account",
			Title:       "Bind an X account",
			Description: "Claim after connecting at least one X account.",
			Points:      10,
			ClaimPeriod: "once",
			Enabled:     true,
			SortOrder:   20,
		},
		{
			Code:        "create_oaf_bot",
			Title:       "Create an OAF Bot",
			Description: "Claim after creating at least one OAF Bot.",
			Points:      15,
			ClaimPeriod: "once",
			Enabled:     true,
			SortOrder:   30,
		},
	}
	for _, activity := range defaults {
		var existing model.PointActivity
		err := db.Where("code = ?", activity.Code).First(&existing).Error
		if err == nil {
			continue
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err := db.Create(&activity).Error; err != nil {
			return err
		}
	}
	return nil
}

func BackfillDefaultPointActivityRewards(db *gorm.DB) error {
	updates := []struct {
		code      string
		oldPoints int64
		newPoints int64
	}{
		{code: "daily_check_in", oldPoints: 5, newPoints: 1},
		{code: "bind_x_account", oldPoints: 30, newPoints: 10},
		{code: "create_oaf_bot", oldPoints: 50, newPoints: 15},
	}
	for _, item := range updates {
		if err := db.Model(&model.PointActivity{}).
			Where("code = ? AND points = ?", item.code, item.oldPoints).
			Update("points", item.newPoints).Error; err != nil {
			return err
		}
	}
	return nil
}

func SeedDefaultPointRiskConfig(db *gorm.DB) error {
	var existing model.PointRiskConfig
	err := db.Where("code = ?", "default").First(&existing).Error
	if err == nil {
		return nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return db.Create(&model.PointRiskConfig{
		Code:                          "default",
		DailyEarnLimit:                100,
		MonthlyDiscountLimit:          1000,
		LargeAdjustmentAlertThreshold: 200,
		PointExpiryDays:               365,
		Enabled:                       true,
	}).Error
}

func SeedDefaultGrossMarginAlertConfig(db *gorm.DB) error {
	var existing model.GrossMarginAlertConfig
	err := db.Where("code = ?", "default").First(&existing).Error
	if err == nil {
		return nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return db.Create(&model.GrossMarginAlertConfig{
		Code:                        "default",
		Enabled:                     true,
		TargetMarginBps:             5000,
		OpenAICostShareThresholdBps: 2000,
		XCostShareThresholdBps:      2000,
		PointCostShareThresholdBps:  2000,
		CheckIntervalHours:          24,
	}).Error
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
		{&model.UserPointAccount{}, "用户积分账户"},
		{&model.PointActivity{}, "积分活动配置"},
		{&model.PointRiskConfig{}, "积分风控配置"},
		{&model.GrossMarginAlertConfig{}, "毛利告警配置"},
		{&model.GrossMarginAlertEvent{}, "毛利告警事件"},
		{&model.PointGrant{}, "积分批次与有效期"},
		{&model.PointRedemptionCode{}, "积分兑换码"},
		{&model.PointRedemptionClaim{}, "积分兑换记录"},
		{&model.PointLedgerEntry{}, "积分账本事件"},
		{&model.PointActivityClaim{}, "积分活动领取记录"},
		{&model.TwitterAccount{}, "用户绑定的X账号信息"},
		{&model.ReferralInvite{}, "用户邀请邀请码"},
		{&model.ReferralRecord{}, "邀请归因与奖励记录"},
		{&model.AutomationConfig{}, "自动化模块配置"},
		{&model.ActivityLog{}, "自动化执行活动日志"},
		{&model.ReplyReservation{}, "自动回复并发占位锁"},
		{&model.AutoReplyDraft{}, "Auto Reply生成、审批与发送任务"},
		{&model.AutoPostPlan{}, "Auto Post Planner配置"},
		{&model.AutoPostDraft{}, "Auto Post生成、审批与发布任务"},
		{&model.AutoPostGenerationRun{}, "Auto Post Scheduler生成运行记录"},
		{&model.ContentLibraryItem{}, "Auto Post轻量内容池素材"},
		{&model.AutoCommentTarget{}, "Auto Comment目标账号配置"},
		{&model.AutoCommentTask{}, "Auto Comment生成、审批与发送任务"},
		{&model.PublishJob{}, "统一发布器任务"},
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
		{&model.BillingLedgerEntry{}, "订阅支付账本事件"},
		{&model.SubscriptionChangeEvent{}, "订阅套餐变更事件"},
		{&model.CostUsageLedger{}, "成本用量账本"},
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

// BackfillAutomationPackageQuotaOnly removes legacy per-day and per-hour automation throttles.
func BackfillAutomationPackageQuotaOnly(db *gorm.DB) error {
	return db.Exec(`
UPDATE automation_configs
SET frequency_daily_limit = 0,
    safety_max_per_hour = 0
WHERE frequency_daily_limit <> 0
   OR safety_max_per_hour <> 0
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
