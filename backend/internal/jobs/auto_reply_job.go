package jobs

import (
	"context"

	"octo-agent/backend/internal/service"
)

// RunAutoReplyOnce runs one scheduler pass for auto-reply (reply automation enabled, subscription, limits).
func RunAutoReplyOnce(ctx context.Context, svc *service.AutoReplyService) {
	if svc == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	svc.RunTick(ctx)
}
