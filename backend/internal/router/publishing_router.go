package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterPublishing(rg *gin.RouterGroup, c *controller.PublishingController) {
	group := rg.Group("/publishing")
	group.Use(middleware.Auth())
	group.GET("/jobs", c.List)
	group.POST("/jobs/:id/retry", c.Retry)
	group.POST("/jobs/:id/cancel", c.Cancel)
	group.POST("/jobs/:id/publish-now", c.PublishNow)
}
