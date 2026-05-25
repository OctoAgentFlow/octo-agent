package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterPoint(rg *gin.RouterGroup, c *controller.PointController) {
	g := rg.Group("/points")
	g.Use(middleware.Auth())
	g.GET("/center", c.Center)
	g.POST("/claim", c.Claim)
}
