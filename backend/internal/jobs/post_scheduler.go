package jobs

import (
	"context"
	"errors"
	"time"

	"octo-agent/backend/internal/alert"
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
		alert.Notify(ctx, alert.Event{
			Level:    alert.LevelWarning,
			Category: alert.CategoryScheduler,
			Title:    "Scheduled posts stale reset failed",
			Message:  "Failed to reset stale scheduled posts from processing state.",
			Error:    err,
		})
	} else if n > 0 {
		zap.L().Info("scheduled posts: reset stale processing rows", zap.Int64("rows", n))
	}

	now := time.Now().UTC()
	posts, err := pr.ListDueScheduledWithPostAutomationEnabled(10, now)
	if err != nil {
		zap.L().Error("scheduled posts: list due failed", zap.Error(err))
		alert.Notify(ctx, alert.Event{
			Level:    alert.LevelError,
			Category: alert.CategoryScheduler,
			Title:    "Scheduled posts list due failed",
			Message:  "Scheduled post scanner could not list due posts.",
			Error:    err,
		})
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
				alert.Notify(runCtx, alert.Event{
					Level:      alert.LevelError,
					Category:   alert.CategoryPublishing,
					Title:      "Scheduled X publish rejected",
					Message:    "X API rejected a scheduled post publish request.",
					UserID:     p.UserID,
					AccountID:  p.XAccountID,
					ResourceID: p.ID,
					Error:      upstream,
					Fields: map[string]any{
						"source": "scheduled_post",
					},
				})
				continue
			}
			zap.L().Warn("scheduled posts: execute failed",
				zap.Uint("post_id", p.ID),
				zap.Uint("user_id", p.UserID),
				zap.Error(err))
			alert.Notify(runCtx, alert.Event{
				Level:      alert.LevelError,
				Category:   alert.CategoryPublishing,
				Title:      "Scheduled post execute failed",
				Message:    "Scheduled post execution failed before publishing completed.",
				UserID:     p.UserID,
				AccountID:  p.XAccountID,
				ResourceID: p.ID,
				Error:      err,
				Fields: map[string]any{
					"source": "scheduled_post",
				},
			})
		}
	}
}
