package jobs

import (
	"context"

	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/service"

	"go.uber.org/zap"
)

func RunBillingScannerOnce(ctx context.Context, svc *service.BillingService) {
	if svc == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	stats, err := svc.AutoConfirmPendingOrders(requestid.NewContext(ctx, "scheduler"))
	if err != nil {
		zap.L().Warn("billing scanner failed", zap.Error(err))
		return
	}
	if stats.Confirmed > 0 || stats.Failed > 0 {
		zap.L().Info("billing scanner completed",
			zap.Int("scanned_orders", stats.ScannedOrders),
			zap.Int("scanned_events", stats.ScannedEvents),
			zap.Int("confirmed", stats.Confirmed),
			zap.Int("skipped", stats.Skipped),
			zap.Int("failed", stats.Failed),
		)
	}
}
