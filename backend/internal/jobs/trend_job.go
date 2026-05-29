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
