package repository

import (
	"errors"
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoDMTaskRepository struct{ DB *gorm.DB }

type AutoDMTaskStatusCount struct {
	Status string
	Count  int64
}

type AutoDMTaskFailureCategoryCount struct {
	Category string
	Count    int64
	LastAt   *time.Time
}

func NewAutoDMTaskRepository(db *gorm.DB) *AutoDMTaskRepository {
	return &AutoDMTaskRepository{DB: db}
}

func (r *AutoDMTaskRepository) Create(task *model.AutoDMTask) error {
	return r.DB.Create(task).Error
}

func (r *AutoDMTaskRepository) ListByUser(userID uint, limit int) ([]model.AutoDMTask, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var rows []model.AutoDMTask
	err := r.DB.Where("user_id = ?", userID).
		Order("id DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *AutoDMTaskRepository) ListReadyForSending(limit int, now time.Time, maxAttempts int) ([]model.AutoDMTask, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if maxAttempts <= 0 {
		maxAttempts = 3
	}
	var rows []model.AutoDMTask
	err := r.DB.Where(
		"(status = ? AND capability_status = ?) OR (status = ? AND retryable = ? AND attempt_count < ? AND retry_after_at IS NOT NULL AND retry_after_at <= ?)",
		"approved", "approved_pending_real_send", "failed", true, maxAttempts, now,
	).
		Order("approved_at ASC, id ASC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *AutoDMTaskRepository) GetByUserAndID(userID, id uint) (*model.AutoDMTask, error) {
	var task model.AutoDMTask
	if err := r.DB.Where("user_id = ? AND id = ?", userID, id).First(&task).Error; err != nil {
		return nil, err
	}
	return &task, nil
}

func (r *AutoDMTaskRepository) HasOpenCapabilityTask(userID, accountID uint, capabilityStatus string) (bool, error) {
	var n int64
	err := r.DB.Model(&model.AutoDMTask{}).
		Where("user_id = ? AND x_account_id = ? AND status IN ?", userID, accountID, []string{"review", "approved", "failed"}).
		Where("capability_status = ?", strings.TrimSpace(capabilityStatus)).
		Count(&n).Error
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (r *AutoDMTaskRepository) HasTaskForRecipient(userID, accountID uint, recipientUserID string) (bool, error) {
	recipientUserID = strings.TrimSpace(recipientUserID)
	if recipientUserID == "" {
		return false, nil
	}
	var n int64
	err := r.DB.Model(&model.AutoDMTask{}).
		Where("user_id = ? AND x_account_id = ? AND recipient_user_id = ?", userID, accountID, recipientUserID).
		Where("status IN ?", []string{"review", "approved", "sending", "sent", "failed"}).
		Count(&n).Error
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (r *AutoDMTaskRepository) CountByStatusBetween(userID uint, from, to time.Time, accountID uint) ([]AutoDMTaskStatusCount, int64, error) {
	var rows []AutoDMTaskStatusCount
	q := r.DB.Model(&model.AutoDMTask{}).
		Select("status, COUNT(*) AS count").
		Where("user_id = ?", userID)
	if accountID > 0 {
		q = q.Where("x_account_id = ?", accountID)
	}
	if !from.IsZero() {
		q = q.Where("generated_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("generated_at < ?", to)
	}
	err := q.Group("status").Scan(&rows).Error
	if err != nil {
		return nil, 0, err
	}
	var retryable int64
	retryQ := r.DB.Model(&model.AutoDMTask{}).
		Where("user_id = ? AND retryable = ?", userID, true)
	if accountID > 0 {
		retryQ = retryQ.Where("x_account_id = ?", accountID)
	}
	if !from.IsZero() {
		retryQ = retryQ.Where("generated_at >= ?", from)
	}
	if !to.IsZero() {
		retryQ = retryQ.Where("generated_at < ?", to)
	}
	err = retryQ.Count(&retryable).Error
	return rows, retryable, err
}

func (r *AutoDMTaskRepository) CountFailureCategoriesBetween(userID uint, from, to time.Time, accountID uint, limit int) ([]AutoDMTaskFailureCategoryCount, error) {
	if limit <= 0 || limit > 20 {
		limit = 5
	}
	var rows []AutoDMTaskFailureCategoryCount
	categoryExpr := "COALESCE(NULLIF(TRIM(failure_category), ''), 'unknown')"
	q := r.DB.Model(&model.AutoDMTask{}).
		Select(categoryExpr+" AS category, COUNT(*) AS count, MAX(COALESCE(last_attempt_at, generated_at)) AS last_at").
		Where("user_id = ? AND status IN ?", userID, []string{"failed", "blocked"}).
		Where("(failure_category <> '' OR failure_reason <> '')")
	if accountID > 0 {
		q = q.Where("x_account_id = ?", accountID)
	}
	if !from.IsZero() {
		q = q.Where("generated_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("generated_at < ?", to)
	}
	err := q.Group(categoryExpr).Order("count DESC, last_at DESC").Limit(limit).Scan(&rows).Error
	return rows, err
}

func (r *AutoDMTaskRepository) Approve(task *model.AutoDMTask, at time.Time) error {
	tx := r.DB.Model(&model.AutoDMTask{}).Where("id = ? AND status = ?", task.ID, "review").Updates(map[string]any{
		"status":            "approved",
		"capability_status": "approved_pending_real_send",
		"approved_at":       at,
	})
	if tx.Error != nil {
		return tx.Error
	}
	if tx.RowsAffected == 0 {
		return errors.New("auto dm task is not waiting for approval")
	}
	return nil
}

func (r *AutoDMTaskRepository) ReserveForSending(task *model.AutoDMTask, at time.Time, maxAttempts int) (bool, error) {
	if maxAttempts <= 0 {
		maxAttempts = 3
	}
	tx := r.DB.Model(&model.AutoDMTask{}).
		Where("id = ?", task.ID).
		Where("(status = ? AND capability_status = ?) OR (status = ? AND retryable = ? AND attempt_count < ? AND retry_after_at IS NOT NULL AND retry_after_at <= ?)",
			"approved", "approved_pending_real_send", "failed", true, maxAttempts, at).
		Updates(map[string]any{
			"status":            "sending",
			"capability_status": "real_send_in_progress",
			"failure_category":  "",
			"failure_reason":    "",
			"retryable":         false,
			"retry_after_at":    nil,
			"attempt_count":     gorm.Expr("attempt_count + ?", 1),
			"last_attempt_at":   at,
		})
	if tx.Error != nil {
		return false, tx.Error
	}
	return tx.RowsAffected > 0, nil
}

func (r *AutoDMTaskRepository) MarkSent(task *model.AutoDMTask, conversationID, eventID string, at time.Time) error {
	return r.DB.Model(&model.AutoDMTask{}).Where("id = ?", task.ID).Updates(map[string]any{
		"status":             "sent",
		"capability_status":  "real_send_success",
		"failure_category":   "",
		"failure_reason":     "",
		"retryable":          false,
		"retry_after_at":     nil,
		"dm_conversation_id": strings.TrimSpace(conversationID),
		"dm_event_id":        strings.TrimSpace(eventID),
		"sent_at":            at,
	}).Error
}

func (r *AutoDMTaskRepository) MarkFailed(task *model.AutoDMTask, reason, category string, retryable bool, retryAfterAt *time.Time) error {
	return r.DB.Model(&model.AutoDMTask{}).Where("id = ?", task.ID).Updates(map[string]any{
		"status":            "failed",
		"capability_status": failureCapabilityStatus(retryable),
		"failure_category":  strings.TrimSpace(category),
		"failure_reason":    strings.TrimSpace(reason),
		"retryable":         retryable,
		"retry_after_at":    retryAfterAt,
	}).Error
}

func (r *AutoDMTaskRepository) Requeue(task *model.AutoDMTask, at time.Time) error {
	tx := r.DB.Model(&model.AutoDMTask{}).
		Where("id = ? AND status = ? AND retryable = ?", task.ID, "failed", true).
		Updates(map[string]any{
			"status":            "approved",
			"capability_status": "approved_pending_real_send",
			"failure_category":  "",
			"failure_reason":    "",
			"retryable":         false,
			"retry_after_at":    nil,
			"approved_at":       at,
		})
	if tx.Error != nil {
		return tx.Error
	}
	if tx.RowsAffected == 0 {
		return errors.New("auto dm task is not retryable")
	}
	return nil
}

func (r *AutoDMTaskRepository) Block(task *model.AutoDMTask, reason string, at time.Time) error {
	tx := r.DB.Model(&model.AutoDMTask{}).Where("id = ? AND status IN ?", task.ID, []string{"review", "approved", "failed"}).Updates(map[string]any{
		"status":           "blocked",
		"failure_category": "user_blocked",
		"failure_reason":   reason,
		"retryable":        false,
		"retry_after_at":   nil,
		"blocked_at":       at,
	})
	if tx.Error != nil {
		return tx.Error
	}
	if tx.RowsAffected == 0 {
		return errors.New("auto dm task cannot be blocked")
	}
	return nil
}

func failureCapabilityStatus(retryable bool) string {
	if retryable {
		return "real_send_retry_wait"
	}
	return "real_send_failed"
}
