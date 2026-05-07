package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

const AutomationTypePost = "post"

type PostRepository struct {
	DB *gorm.DB
}

type PostStatusCount struct {
	Status string
	Count  int64
}

func NewPostRepository(db *gorm.DB) *PostRepository {
	return &PostRepository{DB: db}
}

func (r *PostRepository) List(userID uint, page, pageSize int) ([]model.Post, int64, error) {
	q := r.DB.Model(&model.Post{}).Where("user_id = ?", userID)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	offset := (page - 1) * pageSize
	var items []model.Post
	err := q.Order("id DESC").Limit(pageSize).Offset(offset).Find(&items).Error
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (r *PostRepository) GetByUserAndID(userID, id uint) (*model.Post, error) {
	var p model.Post
	err := r.DB.Where("id = ? AND user_id = ?", id, userID).First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PostRepository) Create(p *model.Post) error {
	return r.DB.Create(p).Error
}

func (r *PostRepository) Save(p *model.Post) error {
	return r.DB.Save(p).Error
}

// ListDueScheduledWithPostAutomationEnabled returns scheduled posts at or before `before`,
// for users who have post automation enabled (automation_configs.type=post, enabled=true)
// and an active subscription (users.subscription_*).
func (r *PostRepository) ListDueScheduledWithPostAutomationEnabled(limit int, before time.Time) ([]model.Post, error) {
	if limit <= 0 {
		limit = 10
	}
	now := time.Now().UTC()
	var posts []model.Post
	err := r.DB.Model(&model.Post{}).
		Joins(`INNER JOIN automation_configs ON automation_configs.user_id = posts.user_id AND automation_configs.type = ? AND automation_configs.enabled = ?`,
			AutomationTypePost, true).
		Joins(`INNER JOIN users ON users.id = posts.user_id AND users.subscription_status = ? AND users.subscription_expires_at IS NOT NULL AND users.subscription_expires_at > ?`,
			"active", now).
		Where("posts.status = ? AND posts.scheduled_at IS NOT NULL AND posts.scheduled_at <= ?", "scheduled", before).
		Order("posts.scheduled_at ASC").
		Limit(limit).
		Find(&posts).Error
	if err != nil {
		return nil, err
	}
	return posts, nil
}

// ResetStaleProcessing sets status from processing → scheduled when the row has been stuck past `olderThan` (UTC).
func (r *PostRepository) ResetStaleProcessing(olderThan time.Time) (int64, error) {
	res := r.DB.Model(&model.Post{}).
		Where("status = ? AND updated_at < ?", "processing", olderThan).
		Updates(map[string]any{
			"status":     "scheduled",
			"updated_at": time.Now().UTC(),
		})
	if res.Error != nil {
		return 0, res.Error
	}
	return res.RowsAffected, nil
}

// RevertProcessingToScheduled is used when a claimed post must be deferred (limits, etc.).
func (r *PostRepository) RevertProcessingToScheduled(userID, postID uint, newScheduledAt time.Time) error {
	res := r.DB.Model(&model.Post{}).
		Where("id = ? AND user_id = ? AND status = ?", postID, userID, "processing").
		Updates(map[string]any{
			"status":       "scheduled",
			"scheduled_at": newScheduledAt.UTC(),
			"updated_at":   time.Now().UTC(),
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// ClaimScheduledAsProcessing sets status from scheduled → processing if still due (idempotent guard).
func (r *PostRepository) ClaimScheduledAsProcessing(id uint, before time.Time) (claimed bool, err error) {
	res := r.DB.Model(&model.Post{}).
		Where("id = ? AND status = ? AND scheduled_at IS NOT NULL AND scheduled_at <= ?", id, "scheduled", before).
		Updates(map[string]any{
			"status":     "processing",
			"updated_at": time.Now().UTC(),
		})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

func (r *PostRepository) DeleteByUserAndID(userID, id uint) error {
	res := r.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.Post{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// CountByUserAndStatuses counts posts for the user in one of statuses.
func (r *PostRepository) CountByUserAndStatuses(userID uint, statuses []string) (int64, error) {
	var n int64
	q := r.DB.Model(&model.Post{}).Where("user_id = ?", userID)
	if len(statuses) > 0 {
		q = q.Where("status IN ?", statuses)
	}
	if err := q.Count(&n).Error; err != nil {
		return 0, err
	}
	return n, nil
}

// CountByStatus aggregates posts for a user by status, optionally filtered by X account.
func (r *PostRepository) CountByStatus(userID uint, accountID uint) ([]PostStatusCount, error) {
	var rows []PostStatusCount
	q := r.DB.Model(&model.Post{}).
		Select("status, COUNT(*) AS count").
		Where("user_id = ?", userID)
	if accountID > 0 {
		q = q.Where("x_account_id = ?", accountID)
	}
	err := q.Group("status").Scan(&rows).Error
	return rows, err
}
