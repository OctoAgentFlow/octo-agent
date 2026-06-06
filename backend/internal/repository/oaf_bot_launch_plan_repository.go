package repository

import (
	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type OAFBotLaunchPlanRepository struct {
	DB *gorm.DB
}

func NewOAFBotLaunchPlanRepository(db *gorm.DB) *OAFBotLaunchPlanRepository {
	return &OAFBotLaunchPlanRepository{DB: db}
}

func (r *OAFBotLaunchPlanRepository) Create(plan *model.OAFBotLaunchPlan) error {
	return r.DB.Create(plan).Error
}

func (r *OAFBotLaunchPlanRepository) GetByToken(token string) (*model.OAFBotLaunchPlan, error) {
	var plan model.OAFBotLaunchPlan
	if err := r.DB.Where("public_token = ?", token).First(&plan).Error; err != nil {
		return nil, err
	}
	return &plan, nil
}
