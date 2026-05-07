package repository

import (
	"errors"
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type AutoDMTaskRepository struct{ DB *gorm.DB }

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

func (r *AutoDMTaskRepository) ListApprovedForSending(limit int) ([]model.AutoDMTask, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var rows []model.AutoDMTask
	err := r.DB.Where("status = ? AND capability_status = ?", "approved", "approved_pending_real_send").
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

func (r *AutoDMTaskRepository) ReserveForSending(task *model.AutoDMTask) (bool, error) {
	tx := r.DB.Model(&model.AutoDMTask{}).
		Where("id = ? AND status = ? AND capability_status = ?", task.ID, "approved", "approved_pending_real_send").
		Updates(map[string]any{
			"status":            "sending",
			"capability_status": "real_send_in_progress",
			"failure_reason":    "",
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
		"failure_reason":     "",
		"dm_conversation_id": strings.TrimSpace(conversationID),
		"dm_event_id":        strings.TrimSpace(eventID),
		"sent_at":            at,
	}).Error
}

func (r *AutoDMTaskRepository) MarkFailed(task *model.AutoDMTask, reason string) error {
	return r.DB.Model(&model.AutoDMTask{}).Where("id = ?", task.ID).Updates(map[string]any{
		"status":            "failed",
		"capability_status": "real_send_failed",
		"failure_reason":    strings.TrimSpace(reason),
	}).Error
}

func (r *AutoDMTaskRepository) Block(task *model.AutoDMTask, reason string, at time.Time) error {
	tx := r.DB.Model(&model.AutoDMTask{}).Where("id = ? AND status IN ?", task.ID, []string{"review", "approved"}).Updates(map[string]any{
		"status":         "blocked",
		"failure_reason": reason,
		"blocked_at":     at,
	})
	if tx.Error != nil {
		return tx.Error
	}
	if tx.RowsAffected == 0 {
		return errors.New("auto dm task cannot be blocked")
	}
	return nil
}
