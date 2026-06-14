package jobs

import (
	"context"
	"time"

	"octo-agent/backend/internal/alert"
	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/service"

	"go.uber.org/zap"
)

func RunTrendSyncOnce(ctx context.Context, svc *service.TrendService) {
	if svc == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	result, err := svc.RunTick(requestid.NewContext(ctx, "scheduler"), time.Now().UTC())
	if err != nil {
		zap.L().Error("x trends sync failed", zap.Error(err))
		alert.Notify(ctx, alert.Event{
			Level:    alert.LevelError,
			Category: alert.CategoryScheduler,
			Title:    "X trends sync failed",
			Message:  "The scheduler failed to refresh cached X trend topics.",
			Error:    err,
		})
		return
	}
	if result != nil && result.SyncedTopics > 0 {
		zap.L().Info("x trends sync completed",
			zap.Int("synced_regions", result.SyncedRegions),
			zap.Int("synced_topics", result.SyncedTopics))
	}
}

func RunExposureRefreshOnce(ctx context.Context, svc *service.TrendService) {
	if svc == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	now := time.Now().UTC()
	startedAt := time.Now()
	ctx = requestid.NewContext(ctx, "scheduler-exposure")
	englishErr := svc.RefreshEnglishExposureSignals(ctx, now)
	chineseErr := svc.RefreshChineseExposureSignals(ctx, now)
	fields := []zap.Field{
		zap.Duration("duration", time.Since(startedAt)),
		zap.Time("refreshed_at", now),
	}
	if englishErr != nil {
		zap.L().Warn("english exposure refresh failed", append(fields, zap.Error(englishErr))...)
	}
	if chineseErr != nil {
		zap.L().Warn("chinese exposure refresh failed", append(fields, zap.Error(chineseErr))...)
	}
	if englishErr == nil && chineseErr == nil {
		zap.L().Info("exposure radar refresh completed", fields...)
	}
}
