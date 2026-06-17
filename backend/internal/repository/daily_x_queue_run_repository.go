package repository

import (
	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type DailyXQueueRunRepository struct{ DB *gorm.DB }

func NewDailyXQueueRunRepository(db *gorm.DB) *DailyXQueueRunRepository {
	return &DailyXQueueRunRepository{DB: db}
}

func (r *DailyXQueueRunRepository) CreateRun(row *model.DailyXQueueRun) error {
	return r.DB.Create(row).Error
}

func (r *DailyXQueueRunRepository) SaveRun(row *model.DailyXQueueRun) error {
	return r.DB.Save(row).Error
}

func (r *DailyXQueueRunRepository) CreateRunItem(row *model.DailyXQueueRunItem) error {
	return r.DB.Create(row).Error
}

func (r *DailyXQueueRunRepository) UpdateRunItemStatusByDraftID(draftID uint, status string) error {
	if draftID == 0 || status == "" {
		return nil
	}
	return r.DB.Model(&model.DailyXQueueRunItem{}).Where("draft_id = ?", draftID).Update("status", status).Error
}

func (r *DailyXQueueRunRepository) LatestByUser(userID uint) (*model.DailyXQueueRun, error) {
	var row model.DailyXQueueRun
	err := r.DB.Where("user_id = ?", userID).Order("started_at DESC, id DESC").First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *DailyXQueueRunRepository) ListItems(runID uint) ([]model.DailyXQueueRunItem, error) {
	var rows []model.DailyXQueueRunItem
	err := r.DB.Where("run_id = ?", runID).Order("id ASC").Find(&rows).Error
	return rows, err
}
