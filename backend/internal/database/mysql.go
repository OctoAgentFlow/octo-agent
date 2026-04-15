package database

import (
	"octo-agent/backend/internal/config"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func NewMySQL(cfg *config.Config) (*gorm.DB, error) {
	db, err := gorm.Open(mysql.Open(cfg.MySQL.DSN()), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	if cfg.MySQL.MaxIdleConns > 0 {
		sqlDB.SetMaxIdleConns(cfg.MySQL.MaxIdleConns)
	}
	if cfg.MySQL.MaxOpenConns > 0 {
		sqlDB.SetMaxOpenConns(cfg.MySQL.MaxOpenConns)
	}
	if cfg.MySQL.MaxLifetime > 0 {
		sqlDB.SetConnMaxLifetime(time.Duration(cfg.MySQL.MaxLifetime) * time.Second)
	}
	if cfg.MySQL.MaxIdleTime > 0 {
		sqlDB.SetConnMaxIdleTime(time.Duration(cfg.MySQL.MaxIdleTime) * time.Second)
	}

	return db, nil
}
