package jobs

import (
	"context"

	"octo-agent/backend/internal/service"
)

func RunAutoCommentOnce(ctx context.Context, svc *service.AutoCommentService) {
	if svc == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	svc.RunTick(ctx)
}
