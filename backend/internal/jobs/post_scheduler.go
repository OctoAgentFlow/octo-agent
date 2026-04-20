package jobs

import (
	"context"
	"errors"
	"time"

	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/repository"
	"octo-agent/backend/internal/service"

	"go.uber.org/zap"
)

// RunScheduledPostsOnce loads due scheduled posts (post automation enabled), claims each as processing, and publishes.
func RunScheduledPostsOnce(ctx context.Context, ps *service.PostService, pr *repository.PostRepository) {
	if ps == nil || pr == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	older := time.Now().UTC().Add(-service.StaleProcessingMaxAge())
	if n, err := pr.ResetStaleProcessing(older); err != nil {
		zap.L().Warn("scheduled posts: reset stale processing failed", zap.Error(err))
	} else if n > 0 {
		zap.L().Info("scheduled posts: reset stale processing rows", zap.Int64("rows", n))
	}

	now := time.Now().UTC()
	posts, err := pr.ListDueScheduledWithPostAutomationEnabled(10, now)
	if err != nil {
		zap.L().Error("scheduled posts: list due failed", zap.Error(err))
		return
	}
	for _, p := range posts {
		claimed, err := pr.ClaimScheduledAsProcessing(p.ID, now)
		if err != nil {
			zap.L().Warn("scheduled posts: claim failed", zap.Uint("post_id", p.ID), zap.Error(err))
			continue
		}
		if !claimed {
			continue
		}
		runCtx := requestid.NewContext(ctx, "scheduler")
		if err := ps.ExecuteScheduled(runCtx, p.UserID, p.ID); err != nil {
			var upstream service.ErrExecuteUpstream
			if errors.As(err, &upstream) {
				zap.L().Warn("scheduled posts: x api rejected",
					zap.Uint("post_id", p.ID),
					zap.Uint("user_id", p.UserID),
					zap.String("detail", upstream.Error()))
				continue
			}
			zap.L().Warn("scheduled posts: execute failed",
				zap.Uint("post_id", p.ID),
				zap.Uint("user_id", p.UserID),
				zap.Error(err))
		}
	}
}
