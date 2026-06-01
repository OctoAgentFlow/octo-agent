package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterDashboard(rg *gin.RouterGroup, c *controller.DashboardController) {
	group := rg.Group("/dashboard")
	group.Use(middleware.Auth())
	group.GET("/overview", c.Overview)
	group.GET("/workbench", c.Workbench)
}
