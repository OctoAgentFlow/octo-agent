package jobs

import (
	"context"
	"time"

	"octo-agent/backend/internal/alert"
	"octo-agent/backend/internal/service"

	"go.uber.org/zap"
)

func RunGrossMarginAlertOnce(ctx context.Context, billing *service.BillingService) {
	if billing == nil {
		return
	}
	if err := billing.CheckGrossMarginAndAlert(ctx, time.Now().UTC()); err != nil {
		zap.L().Error("gross margin alert check failed", zap.Error(err))
		alert.Notify(ctx, alert.Event{
			Level:    alert.LevelError,
			Category: alert.CategoryBilling,
			Title:    "Gross margin alert check failed",
			Message:  "The scheduler failed to calculate gross margin health.",
			Error:    err,
		})
	}
}
