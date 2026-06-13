package jobs

import (
	"context"
	"fmt"
	"runtime/debug"
	"time"

	"octo-agent/backend/internal/alert"
	"octo-agent/backend/internal/repository"
	"octo-agent/backend/internal/service"

	"go.uber.org/zap"
)

func Start(
	authService *service.AuthService,
	postService *service.PostService,
	postRepo *repository.PostRepository,
	autoPost *service.AutoPostService,
	trends *service.TrendService,
	publishing *service.PublishingService,
	billing *service.BillingService,
	pointRepo *repository.PointRepository,
) {
	go func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				zap.L().Error("scheduler panic recovered",
					zap.Any("panic", recovered),
					zap.String("stacktrace", string(debug.Stack())))
				alert.Notify(context.Background(), alert.Event{
					Level:    alert.LevelCritical,
					Category: alert.CategoryScheduler,
					Title:    "Scheduler panic recovered",
					Message:  "Background scheduler goroutine panicked and stopped.",
					Error:    fmt.Errorf("panic: %v", recovered),
				})
			}
		}()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		var lastBillingScan time.Time
		var lastPointExpiry time.Time
		var lastGrossMarginCheck time.Time
		runEmail := func() {
			if authService != nil {
				if _, err := authService.CleanupExpiredEmailCodes(); err != nil {
					zap.L().Error("cleanup expired email codes failed", zap.Error(err))
					alert.Notify(context.Background(), alert.Event{
						Level:    alert.LevelError,
						Category: alert.CategoryScheduler,
						Title:    "Cleanup expired email codes failed",
						Message:  "The scheduler failed to clean expired email verification codes.",
						Error:    err,
					})
				}
			}
		}
		runBillingScanner := func() {
			interval := time.Duration(0)
			if billing != nil {
				interval = billing.AutoConfirmInterval()
			}
			if interval <= 0 {
				return
			}
			if !lastBillingScan.IsZero() && time.Since(lastBillingScan) < interval {
				return
			}
			lastBillingScan = time.Now()
			RunBillingScannerOnce(context.Background(), billing)
		}
		runPointExpiry := func() {
			if pointRepo == nil {
				return
			}
			if !lastPointExpiry.IsZero() && time.Since(lastPointExpiry) < time.Hour {
				return
			}
			lastPointExpiry = time.Now()
			RunPointExpiryOnce(context.Background(), pointRepo)
		}
		runGrossMarginCheck := func() {
			if billing == nil {
				return
			}
			settings, err := billing.GrossMarginAlertSettings()
			if err != nil {
				zap.L().Error("load gross margin alert settings failed", zap.Error(err))
				settings.CheckIntervalHours = 24
			}
			interval := time.Duration(settings.CheckIntervalHours) * time.Hour
			if interval <= 0 {
				interval = 24 * time.Hour
			}
			if !lastGrossMarginCheck.IsZero() && time.Since(lastGrossMarginCheck) < interval {
				return
			}
			lastGrossMarginCheck = time.Now()
			RunGrossMarginAlertOnce(context.Background(), billing)
		}
		runTrends := func() {
			RunTrendSyncOnce(context.Background(), trends)
		}
		runEmail()
		RunScheduledPostsOnce(context.Background(), postService, postRepo)
		RunAutoPostOnce(context.Background(), autoPost)
		runTrends()
		RunPublishingOnce(context.Background(), publishing)
		runBillingScanner()
		runPointExpiry()
		runGrossMarginCheck()
		for range ticker.C {
			runEmail()
			RunScheduledPostsOnce(context.Background(), postService, postRepo)
			RunAutoPostOnce(context.Background(), autoPost)
			runTrends()
			RunPublishingOnce(context.Background(), publishing)
			runBillingScanner()
			runPointExpiry()
			runGrossMarginCheck()
		}
	}()
}
