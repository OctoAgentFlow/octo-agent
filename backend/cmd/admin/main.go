package main

import (
	"log"

	"octo-agent/backend/internal/alert"
	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/database"
	appLogger "octo-agent/backend/internal/pkg/logger"
	"octo-agent/backend/internal/router"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config failed: %v", err)
	}
	logCfg := cfg.Log
	logCfg.OutputPath = cfg.Log.AdminOutputPath
	if _, err := appLogger.Init(logCfg, "logs/admin.log"); err != nil {
		log.Fatalf("init logger failed: %v", err)
	}
	defer appLogger.Sync()
	alert.Configure(cfg.Alert)

	db, err := database.NewMySQL(cfg)
	if err != nil {
		alert.NotifySync(nil, alert.Event{
			Level:    alert.LevelCritical,
			Category: alert.CategoryDB,
			Title:    "Admin database connection failed",
			Message:  "Backend admin API failed to connect to MySQL during startup.",
			Error:    err,
		})
		log.Fatalf("connect db failed: %v", err)
	}

	if err := database.AutoMigrate(db); err != nil {
		alert.NotifySync(nil, alert.Event{
			Level:    alert.LevelCritical,
			Category: alert.CategoryDB,
			Title:    "Admin auto migration failed",
			Message:  "Backend admin API failed during database auto migration.",
			Error:    err,
		})
		log.Fatalf("auto migrate failed: %v", err)
	}

	r := router.NewAdmin(db, cfg)
	if err := r.Run(cfg.Admin.Address()); err != nil {
		alert.NotifySync(nil, alert.Event{
			Level:    alert.LevelCritical,
			Category: alert.CategorySystem,
			Title:    "Admin server run failed",
			Message:  "Backend admin HTTP server failed to run.",
			Error:    err,
		})
		log.Fatalf("admin server run failed: %v", err)
	}
}
