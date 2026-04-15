package repository

import "gorm.io/gorm"

type AgentRepository struct{ DB *gorm.DB }
