package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterAgent(rg *gin.RouterGroup, c *controller.AgentController) {
	group := rg.Group("/agents")
	group.Use(middleware.Auth())
	group.GET("", c.List)
}
