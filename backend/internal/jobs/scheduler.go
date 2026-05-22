package jobs

import (
	"context"
	"time"

	"octo-agent/backend/internal/repository"
	"octo-agent/backend/internal/service"

	"go.uber.org/zap"
)

func Start(
	authService *service.AuthService,
	postService *service.PostService,
	postRepo *repository.PostRepository,
	autoReply *service.AutoReplyService,
	autoDM *service.AutoDMService,
	autoComment *service.AutoCommentService,
	autoPost *service.AutoPostService,
	publishing *service.PublishingService,
	billing *service.BillingService,
) {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		var lastBillingScan time.Time
		runEmail := func() {
			if authService != nil {
				if _, err := authService.CleanupExpiredEmailCodes(); err != nil {
					zap.L().Error("cleanup expired email codes failed", zap.Error(err))
				}
			}
		}
		runBillingScanner := func() {
			interval := time.Duration(0)
			if billing != nil {
				interval = billing.AutoConfirmInterval()
			}
			if interval <= 0 {
				return
			}
			if !lastBillingScan.IsZero() && time.Since(lastBillingScan) < interval {
				return
			}
			lastBillingScan = time.Now()
			RunBillingScannerOnce(context.Background(), billing)
		}
		runEmail()
		RunScheduledPostsOnce(context.Background(), postService, postRepo)
		RunAutoReplyOnce(context.Background(), autoReply)
		RunAutoDMOnce(context.Background(), autoDM)
		RunAutoCommentOnce(context.Background(), autoComment)
		RunAutoPostOnce(context.Background(), autoPost)
		RunPublishingOnce(context.Background(), publishing)
		runBillingScanner()
		for range ticker.C {
			runEmail()
			RunScheduledPostsOnce(context.Background(), postService, postRepo)
			RunAutoReplyOnce(context.Background(), autoReply)
			RunAutoDMOnce(context.Background(), autoDM)
			RunAutoCommentOnce(context.Background(), autoComment)
			RunAutoPostOnce(context.Background(), autoPost)
			RunPublishingOnce(context.Background(), publishing)
			runBillingScanner()
		}
	}()
}
