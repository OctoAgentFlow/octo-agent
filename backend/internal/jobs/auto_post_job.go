package jobs

import (
	"context"

	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/service"
)

// RunAutoPostOnce runs one scheduler pass for Auto Post Planner due jobs.
func RunAutoPostOnce(ctx context.Context, svc *service.AutoPostService) {
	if svc == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	svc.RunTick(requestid.NewContext(ctx, "scheduler"))
}
