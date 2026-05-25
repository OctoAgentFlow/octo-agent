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
	group.POST("/generate", c.Generate)
	group.POST("", c.Create)
	group.POST("/:id/execute", c.Execute)
	group.GET("/:id", c.Get)
	group.PUT("/:id", c.Update)
	group.DELETE("/:id", c.Delete)
}
