package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterActivity(rg *gin.RouterGroup, c *controller.ActivityController) {
	group := rg.Group("/activities")
	group.Use(middleware.Auth())
	group.GET("", c.List)
}
