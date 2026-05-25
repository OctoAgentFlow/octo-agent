package main

import (
	"log"

	"octo-agent/backend/internal/alert"
	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/database"
	appLogger "octo-agent/backend/internal/pkg/logger"
	"octo-agent/backend/internal/router"
)

// Legacy entrypoint kept for compatibility; starts API service.
func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config failed: %v", err)
	}
	logCfg := cfg.Log
	logCfg.OutputPath = cfg.Log.APIOutputPath
	if _, err := appLogger.Init(logCfg, "logs/api.log"); err != nil {
		log.Fatalf("init logger failed: %v", err)
	}
	defer appLogger.Sync()
	alert.Configure(cfg.Alert)

	db, err := database.NewMySQL(cfg)
	if err != nil {
		alert.NotifySync(nil, alert.Event{
			Level:    alert.LevelCritical,
			Category: alert.CategoryDB,
			Title:    "API database connection failed",
			Message:  "Legacy API entrypoint failed to connect to MySQL during startup.",
			Error:    err,
		})
		log.Fatalf("connect db failed: %v", err)
	}

	if err := database.AutoMigrate(db); err != nil {
		alert.NotifySync(nil, alert.Event{
			Level:    alert.LevelCritical,
			Category: alert.CategoryDB,
			Title:    "API auto migration failed",
			Message:  "Legacy API entrypoint failed during database auto migration.",
			Error:    err,
		})
		log.Fatalf("auto migrate failed: %v", err)
	}
	if err := database.BackfillLegacySubscriptions(db); err != nil {
		log.Fatalf("backfill subscriptions failed: %v", err)
	}
	if err := database.BackfillBillingChainTx(db); err != nil {
		log.Fatalf("backfill billing chain tx failed: %v", err)
	}

	r := router.NewAPI(db, cfg)
	if err := r.Run(cfg.API.Address()); err != nil {
		alert.NotifySync(nil, alert.Event{
			Level:    alert.LevelCritical,
			Category: alert.CategorySystem,
			Title:    "API server run failed",
			Message:  "Legacy API HTTP server failed to run.",
			Error:    err,
		})
		log.Fatalf("server run failed: %v", err)
	}
}
