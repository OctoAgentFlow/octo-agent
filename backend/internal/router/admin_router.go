package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterAdmin(rg *gin.RouterGroup, c *controller.AdminController) {
	g := rg.Group("/admin")
	g.Use(middleware.Auth())
	g.GET("/overview", c.Overview)
	g.GET("/users", c.ListUsers)
	g.PATCH("/users/:id", c.UpdateUser)
	g.GET("/billing/orders", c.ListBillingOrders)
	g.POST("/billing/orders/:id/ops-action", c.UpdateBillingOrderOpsAction)
	g.GET("/points/activities", c.ListPointActivities)
	g.PATCH("/points/activities/:id", c.UpdatePointActivity)
	g.GET("/points/users", c.ListPointUsers)
	g.POST("/points/users/:id/adjust", c.AdjustUserPoints)
	g.GET("/points/risk-config", c.PointRiskConfig)
	g.PATCH("/points/risk-config", c.UpdatePointRiskConfig)
}
