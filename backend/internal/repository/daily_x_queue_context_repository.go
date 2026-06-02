package repository

import (
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type DailyXQueueContextRepository struct{ DB *gorm.DB }

func NewDailyXQueueContextRepository(db *gorm.DB) *DailyXQueueContextRepository {
	return &DailyXQueueContextRepository{DB: db}
}

func (r *DailyXQueueContextRepository) GetByUserAndHandle(userID uint, handle string) (*model.DailyXQueueContext, error) {
	var row model.DailyXQueueContext
	err := r.DB.Where("user_id = ? AND x_handle = ?", userID, normalizeDailyXHandle(handle)).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *DailyXQueueContextRepository) LatestByUser(userID uint) (*model.DailyXQueueContext, error) {
	var row model.DailyXQueueContext
	err := r.DB.Where("user_id = ?", userID).Order("updated_at DESC, id DESC").First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *DailyXQueueContextRepository) Upsert(row *model.DailyXQueueContext) error {
	if row == nil {
		return nil
	}
	row.XHandle = normalizeDailyXHandle(row.XHandle)
	now := time.Now()
	values := map[string]any{
		"website_url":        row.WebsiteURL,
		"product_context":    row.ProductContext,
		"target_audience":    row.TargetAudience,
		"voice_preference":   row.VoicePreference,
		"guardrails":         row.Guardrails,
		"bot_id":             row.BotID,
		"content_library_id": row.ContentLibraryID,
		"updated_at":         now,
	}
	return r.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "x_handle"}},
		DoUpdates: clause.Assignments(values),
	}).Create(row).Error
}

func (r *DailyXQueueContextRepository) Save(row *model.DailyXQueueContext) error {
	return r.DB.Save(row).Error
}

func normalizeDailyXHandle(handle string) string {
	return strings.ToLower(strings.TrimPrefix(strings.TrimSpace(handle), "@"))
}
