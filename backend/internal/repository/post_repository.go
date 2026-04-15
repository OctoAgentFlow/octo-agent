package repository

import "gorm.io/gorm"

type PostRepository struct{ DB *gorm.DB }
