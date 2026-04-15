package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterPost(rg *gin.RouterGroup, c *controller.PostController) {
	group := rg.Group("/posts")
	group.Use(middleware.Auth())
	group.GET("", c.List)
}
