package repository

import (
	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type ReviewQueueFeedbackIssueVerdictRepository struct {
	DB *gorm.DB
}

func NewReviewQueueFeedbackIssueVerdictRepository(db *gorm.DB) *ReviewQueueFeedbackIssueVerdictRepository {
	return &ReviewQueueFeedbackIssueVerdictRepository{DB: db}
}

func (r *ReviewQueueFeedbackIssueVerdictRepository) Create(row *model.ReviewQueueFeedbackIssueVerdict) error {
	return r.DB.Create(row).Error
}

func (r *ReviewQueueFeedbackIssueVerdictRepository) ListRecentByUser(userID uint, limit int) ([]model.ReviewQueueFeedbackIssueVerdict, error) {
	if limit <= 0 {
		limit = 500
	}
	var rows []model.ReviewQueueFeedbackIssueVerdict
	err := r.DB.Where("user_id = ?", userID).Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}
