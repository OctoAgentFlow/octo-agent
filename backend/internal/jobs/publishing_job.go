package jobs

import (
	"context"

	"octo-agent/backend/internal/service"
)

func RunPublishingOnce(ctx context.Context, publishing *service.PublishingService) {
	if publishing == nil {
		return
	}
	publishing.RunOnce(ctx)
}
