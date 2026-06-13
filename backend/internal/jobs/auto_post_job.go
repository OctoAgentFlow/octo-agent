package jobs

import (
	"context"

	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/service"
)

// RunContentDraftOnce runs one scheduler pass for due Content Draft Planner jobs.
func RunContentDraftOnce(ctx context.Context, svc *service.ContentDraftService) {
	if svc == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	svc.RunTick(requestid.NewContext(ctx, "scheduler"))
}

// RunAutoPostOnce is the legacy scheduler entrypoint retained for compatibility.
func RunAutoPostOnce(ctx context.Context, svc *service.AutoPostService) {
	RunContentDraftOnce(ctx, svc)
}
