package repository

import (
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoCommentTargetRepository struct {
	DB *gorm.DB
}

func NewAutoCommentTargetRepository(db *gorm.DB) *AutoCommentTargetRepository {
	return &AutoCommentTargetRepository{DB: db}
}

func normalizeXUsername(v string) string {
	return strings.ToLower(strings.TrimSpace(strings.TrimPrefix(v, "@")))
}

func (r *AutoCommentTargetRepository) ListByUser(userID uint) ([]model.AutoCommentTarget, error) {
	var rows []model.AutoCommentTarget
	err := r.DB.Where("user_id = ?", userID).Order("status ASC, updated_at DESC, id DESC").Find(&rows).Error
	return rows, err
}

func (r *AutoCommentTargetRepository) Create(target *model.AutoCommentTarget) error {
	target.TargetUsername = normalizeXUsername(target.TargetUsername)
	return r.DB.Create(target).Error
}

func (r *AutoCommentTargetRepository) GetByUserAndID(userID, id uint) (*model.AutoCommentTarget, error) {
	var row model.AutoCommentTarget
	err := r.DB.Where("user_id = ? AND id = ?", userID, id).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoCommentTargetRepository) GetByUserAccountAndTweet(userID, xAccountID uint, tweetID string) (*model.AutoCommentTarget, error) {
	var row model.AutoCommentTarget
	err := r.DB.Where("user_id = ? AND x_account_id = ? AND target_tweet_id = ?", userID, xAccountID, strings.TrimSpace(tweetID)).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoCommentTargetRepository) GetByUserAccountAndUsername(userID, xAccountID uint, username string) (*model.AutoCommentTarget, error) {
	var row model.AutoCommentTarget
	err := r.DB.Where("user_id = ? AND x_account_id = ? AND target_username = ?", userID, xAccountID, normalizeXUsername(username)).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoCommentTargetRepository) Save(target *model.AutoCommentTarget) error {
	target.TargetUsername = normalizeXUsername(target.TargetUsername)
	return r.DB.Save(target).Error
}

func (r *AutoCommentTargetRepository) DeleteByUserAndID(userID, id uint) error {
	return r.DB.Where("user_id = ? AND id = ?", userID, id).Delete(&model.AutoCommentTarget{}).Error
}

func (r *AutoCommentTargetRepository) ListDueActiveTargets(limit int, now time.Time) ([]model.AutoCommentTarget, error) {
	if limit <= 0 {
		limit = 100
	}
	var rows []model.AutoCommentTarget
	err := r.DB.Model(&model.AutoCommentTarget{}).
		Joins(`INNER JOIN automation_configs ac ON ac.user_id = auto_comment_targets.user_id AND ac.type = ? AND ac.enabled = ?`,
			AutomationTypeComment, true).
		Joins(`INNER JOIN users ON users.id = auto_comment_targets.user_id AND users.subscription_status = ? AND users.subscription_expires_at IS NOT NULL AND users.subscription_expires_at > ?`,
			"active", now).
		Where("auto_comment_targets.status = ?", "active").
		Where("(auto_comment_targets.last_checked_at IS NULL OR auto_comment_targets.last_checked_at <= ?)", now.Add(-2*time.Minute)).
		Order("auto_comment_targets.last_checked_at ASC, auto_comment_targets.id ASC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}
