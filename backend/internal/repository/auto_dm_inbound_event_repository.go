package repository

import (
	"strings"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AutoDMInboundEventRepository struct{ DB *gorm.DB }

func NewAutoDMInboundEventRepository(db *gorm.DB) *AutoDMInboundEventRepository {
	return &AutoDMInboundEventRepository{DB: db}
}

func (r *AutoDMInboundEventRepository) CreateIgnore(event *model.AutoDMInboundEvent) error {
	if event == nil || strings.TrimSpace(event.DMEventID) == "" {
		return nil
	}
	return r.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(event).Error
}
