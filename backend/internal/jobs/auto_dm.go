package jobs

import (
	"context"

	"octo-agent/backend/internal/service"
)

// RunAutoDMOnce runs one scheduler pass for Auto DM dry-run/capability checks.
func RunAutoDMOnce(ctx context.Context, svc *service.AutoDMService) {
	if svc == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	svc.RunTick(ctx)
}
