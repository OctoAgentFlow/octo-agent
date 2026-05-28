package repository

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	PublishSourcePost    = "post"
	PublishSourceComment = "comment"
	PublishSourceReply   = "reply"
	PublishSourceDM      = "dm"

	PublishStatusPending    = "pending"
	PublishStatusProcessing = "processing"
	PublishStatusPublished  = "published"
	PublishStatusFailed     = "failed"
	PublishStatusCancelled  = "cancelled"

	PublishModeSimulated = "simulated"
	PublishModeDryRun    = "dry_run"
	PublishModeReal      = "real"
)

type PublishJobRepository struct {
	DB *gorm.DB
}

func NewPublishJobRepository(db *gorm.DB) *PublishJobRepository {
	return &PublishJobRepository{DB: db}
}

func (r *PublishJobRepository) Ensure(job *model.PublishJob) (*model.PublishJob, bool, error) {
	var existing model.PublishJob
	err := r.DB.Where("source_type = ? AND source_id = ?", job.SourceType, job.SourceID).First(&existing).Error
	if err == nil {
		return &existing, false, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, err
	}
	if job.Status == "" {
		job.Status = PublishStatusPending
	}
	if job.PublishMode == "" {
		job.PublishMode = PublishModeSimulated
	}
	if job.MaxAttempts <= 0 {
		job.MaxAttempts = 3
	}
	if err := r.DB.Create(job).Error; err != nil {
		return nil, false, err
	}
	return job, true, nil
}

func (r *PublishJobRepository) ListByUser(userID uint, limit int) ([]model.PublishJob, error) {
	if limit <= 0 {
		limit = 50
	}
	var rows []model.PublishJob
	err := r.DB.Where("user_id = ?", userID).Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *PublishJobRepository) ListDuePending(limit int, now time.Time) ([]model.PublishJob, error) {
	if limit <= 0 {
		limit = 20
	}
	var rows []model.PublishJob
	err := r.DB.
		Where("status = ?", PublishStatusPending).
		Where("attempt_count < max_attempts").
		Where("(next_attempt_at IS NULL OR next_attempt_at <= ?)", now).
		Order("COALESCE(next_attempt_at, created_at) ASC, id ASC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (r *PublishJobRepository) TryMarkProcessing(id uint, now time.Time) (bool, error) {
	tx := r.DB.Model(&model.PublishJob{}).
		Where("id = ? AND status = ? AND attempt_count < max_attempts", id, PublishStatusPending).
		Updates(map[string]any{
			"status":          PublishStatusProcessing,
			"attempt_count":   gorm.Expr("attempt_count + 1"),
			"next_attempt_at": nil,
			"updated_at":      now,
		})
	return tx.RowsAffected == 1, tx.Error
}

func (r *PublishJobRepository) GetByID(id uint) (*model.PublishJob, error) {
	var row model.PublishJob
	if err := r.DB.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *PublishJobRepository) GetByUserAndID(userID, id uint) (*model.PublishJob, error) {
	var row model.PublishJob
	if err := r.DB.Where("user_id = ? AND id = ?", userID, id).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *PublishJobRepository) ListBySources(userID uint, sourceType string, sourceIDs []uint) ([]model.PublishJob, error) {
	if len(sourceIDs) == 0 {
		return nil, nil
	}
	var rows []model.PublishJob
	err := r.DB.Where("user_id = ? AND source_type = ? AND source_id IN ?", userID, sourceType, sourceIDs).Find(&rows).Error
	return rows, err
}

func (r *PublishJobRepository) Save(job *model.PublishJob) error {
	return r.DB.Save(job).Error
}

func (r *PublishJobRepository) DeleteNonPublishedBySource(userID uint, sourceType string, sourceID uint) error {
	return r.DB.
		Where("user_id = ? AND source_type = ? AND source_id = ?", userID, sourceType, sourceID).
		Where("status <> ?", PublishStatusPublished).
		Delete(&model.PublishJob{}).Error
}

func (r *PublishJobRepository) RecordXPublishCost(job *model.PublishJob, occurredAt time.Time) error {
	if job == nil || strings.TrimSpace(job.ExternalID) == "" {
		return nil
	}
	details, _ := json.Marshal(map[string]any{
		"source_type":  job.SourceType,
		"source_id":    job.SourceID,
		"publish_mode": job.PublishMode,
		"external_url": job.ExternalURL,
	})
	row := model.CostUsageLedger{
		UserID:              job.UserID,
		BotID:               job.BotID,
		SourceType:          job.SourceType,
		SourceID:            job.SourceID,
		Provider:            "x",
		Metric:              "write_post",
		Quantity:            1,
		EstimatedCostCents:  2,
		Currency:            "USD",
		OccurredAt:          occurredAt.UTC(),
		ExternalReferenceID: "x_publish:" + strings.TrimSpace(job.ExternalID),
		Details:             string(details),
	}
	return r.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error
}

func (r *PublishJobRepository) ResetForRetry(job *model.PublishJob, now time.Time) error {
	return r.DB.Model(job).Updates(map[string]any{
		"status":          PublishStatusPending,
		"next_attempt_at": now,
		"last_error":      "",
		"published_at":    nil,
	}).Error
}

func (r *PublishJobRepository) UpsertPending(job *model.PublishJob) error {
	if job.MaxAttempts <= 0 {
		job.MaxAttempts = 3
	}
	if job.Status == "" {
		job.Status = PublishStatusPending
	}
	if job.PublishMode == "" {
		job.PublishMode = PublishModeSimulated
	}
	return r.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "source_type"}, {Name: "source_id"}},
		DoNothing: true,
	}).Create(job).Error
}

func (r *PublishJobRepository) CountManualPublishedByAccount(accountID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.PublishJob{}).
		Where("twitter_account_id = ? AND status = ?", accountID, PublishStatusPublished).
		Where("publish_mode IN ?", []string{PublishModeDryRun, PublishModeReal}).
		Where("published_at >= ? AND published_at < ?", from, to).
		Count(&n).Error
	return n, err
}

func (r *PublishJobRepository) CountRealPublishedByUser(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.PublishJob{}).
		Where("user_id = ? AND status = ? AND publish_mode = ?", userID, PublishStatusPublished, PublishModeReal).
		Where("published_at >= ? AND published_at < ?", from, to).
		Count(&n).Error
	return n, err
}

func (r *PublishJobRepository) LastManualPublishedByAccount(accountID uint) (*model.PublishJob, error) {
	var row model.PublishJob
	err := r.DB.
		Where("twitter_account_id = ? AND status = ?", accountID, PublishStatusPublished).
		Where("publish_mode IN ?", []string{PublishModeDryRun, PublishModeReal}).
		Where("published_at IS NOT NULL").
		Order("published_at DESC, id DESC").
		First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}
