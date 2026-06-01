package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterReviewQueue(rg *gin.RouterGroup, c *controller.ReviewQueueController) {
	group := rg.Group("/review-queue")
	group.Use(middleware.Auth())
	group.GET("", c.List)
	group.POST("/bulk-action", c.BulkAction)
	group.GET("/feedback-issue-verdict-stats", c.FeedbackIssueVerdictStats)
	group.GET("/feedback-issue-verdict-details", c.FeedbackIssueVerdictDetails)
	group.POST("/feedback-issue-verdict", c.CreateFeedbackIssueVerdict)
}
