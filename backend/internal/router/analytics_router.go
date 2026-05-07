package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterAnalytics(rg *gin.RouterGroup, c *controller.AnalyticsController) {
	group := rg.Group("/analytics")
	group.Use(middleware.Auth())
	group.GET("/overview", c.Overview)
}
