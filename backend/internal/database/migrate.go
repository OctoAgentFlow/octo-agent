package database

import (
	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&model.User{},
		&model.TwitterAccount{},
		&model.Post{},
		&model.Agent{},
		&model.Task{},
	)
}
