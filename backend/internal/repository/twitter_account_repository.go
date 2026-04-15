package repository

import "gorm.io/gorm"

type TwitterAccountRepository struct{ DB *gorm.DB }
