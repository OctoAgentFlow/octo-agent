package repository

import (
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type ExposureRadarManualRecordRepository struct {
	DB *gorm.DB
}

func NewExposureRadarManualRecordRepository(db *gorm.DB) *ExposureRadarManualRecordRepository {
	return &ExposureRadarManualRecordRepository{DB: db}
}

func (r *ExposureRadarManualRecordRepository) GetByUserAndSignal(userID uint, signalID string) (*model.ExposureRadarManualRecord, error) {
	var row model.ExposureRadarManualRecord
	err := r.DB.Where("user_id = ? AND signal_id = ?", userID, strings.TrimSpace(signalID)).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *ExposureRadarManualRecordRepository) Create(record *model.ExposureRadarManualRecord) error {
	return r.DB.Create(record).Error
}

func (r *ExposureRadarManualRecordRepository) Save(record *model.ExposureRadarManualRecord) error {
	return r.DB.Save(record).Error
}

func (r *ExposureRadarManualRecordRepository) ListBySignalIDs(userID uint, signalIDs []string) ([]model.ExposureRadarManualRecord, error) {
	clean := normalizeSignalIDs(signalIDs, 120)
	if userID == 0 || len(clean) == 0 {
		return []model.ExposureRadarManualRecord{}, nil
	}
	var rows []model.ExposureRadarManualRecord
	err := r.DB.Where("user_id = ? AND signal_id IN ?", userID, clean).
		Order("updated_at DESC, id DESC").
		Find(&rows).Error
	return rows, err
}

func (r *ExposureRadarManualRecordRepository) ListRecent(userID uint, region string, since time.Time, limit int) ([]model.ExposureRadarManualRecord, error) {
	if limit <= 0 {
		limit = 300
	}
	if limit > 1000 {
		limit = 1000
	}
	q := r.DB.Where("user_id = ?", userID)
	if strings.TrimSpace(region) != "" && strings.TrimSpace(region) != "all" {
		q = q.Where("region = ?", strings.TrimSpace(region))
	}
	if !since.IsZero() {
		q = q.Where("updated_at >= ?", since)
	}
	var rows []model.ExposureRadarManualRecord
	err := q.Order("updated_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func normalizeSignalIDs(values []string, limit int) []string {
	if limit <= 0 {
		limit = len(values)
	}
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
		if len(out) >= limit {
			break
		}
	}
	return out
}
