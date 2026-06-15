package repository

import (
	"strings"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type ExposureRadarPeopleNoteRepository struct {
	DB *gorm.DB
}

func NewExposureRadarPeopleNoteRepository(db *gorm.DB) *ExposureRadarPeopleNoteRepository {
	return &ExposureRadarPeopleNoteRepository{DB: db}
}

func (r *ExposureRadarPeopleNoteRepository) Get(userID uint, region string, handle string) (*model.ExposureRadarPeopleNote, error) {
	var row model.ExposureRadarPeopleNote
	err := r.DB.Where("user_id = ? AND region = ? AND author_handle = ?", userID, strings.TrimSpace(region), normalizePeopleNoteHandle(handle)).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *ExposureRadarPeopleNoteRepository) ListByHandles(userID uint, region string, handles []string) ([]model.ExposureRadarPeopleNote, error) {
	clean := normalizePeopleNoteHandles(handles)
	if userID == 0 || len(clean) == 0 {
		return []model.ExposureRadarPeopleNote{}, nil
	}
	var rows []model.ExposureRadarPeopleNote
	err := r.DB.Where("user_id = ? AND region IN ? AND author_handle IN ?", userID, []string{"all", strings.TrimSpace(region)}, clean).
		Order("updated_at DESC, id DESC").
		Find(&rows).Error
	return rows, err
}

func (r *ExposureRadarPeopleNoteRepository) Save(record *model.ExposureRadarPeopleNote) error {
	return r.DB.Save(record).Error
}

func normalizePeopleNoteHandles(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		clean := normalizePeopleNoteHandle(value)
		if clean == "" || seen[clean] {
			continue
		}
		seen[clean] = true
		out = append(out, clean)
	}
	return out
}

func normalizePeopleNoteHandle(value string) string {
	return strings.ToLower(strings.TrimPrefix(strings.TrimSpace(value), "@"))
}
