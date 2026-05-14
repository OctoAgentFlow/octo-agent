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
}
