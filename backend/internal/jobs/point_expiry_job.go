package jobs

import (
	"context"
	"time"

	"octo-agent/backend/internal/alert"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
)

func RunPointExpiryOnce(ctx context.Context, pointRepo *repository.PointRepository) {
	if pointRepo == nil {
		return
	}
	expired, err := pointRepo.ExpirePointGrants(time.Now().UTC(), 500)
	if err != nil {
		zap.L().Error("expire point grants failed", zap.Error(err))
		alert.Notify(ctx, alert.Event{
			Level:    alert.LevelError,
			Category: alert.CategoryBilling,
			Title:    "Point expiry job failed",
			Message:  "The scheduler failed to expire overdue point grants.",
			Error:    err,
		})
		return
	}
	if expired > 0 {
		zap.L().Info("expired point grants", zap.Int64("points", expired))
	}
}
