package jobs

import (
	"context"
	"time"

	"octo-agent/backend/internal/repository"
	"octo-agent/backend/internal/service"

	"go.uber.org/zap"
)

func Start(authService *service.AuthService, postService *service.PostService, postRepo *repository.PostRepository, autoReply *service.AutoReplyService) {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		runEmail := func() {
			if authService != nil {
				if _, err := authService.CleanupExpiredEmailCodes(); err != nil {
					zap.L().Error("cleanup expired email codes failed", zap.Error(err))
				}
			}
		}
		runEmail()
		RunScheduledPostsOnce(context.Background(), postService, postRepo)
		RunAutoReplyOnce(context.Background(), autoReply)
		for range ticker.C {
			runEmail()
			RunScheduledPostsOnce(context.Background(), postService, postRepo)
			RunAutoReplyOnce(context.Background(), autoReply)
		}
	}()
}
