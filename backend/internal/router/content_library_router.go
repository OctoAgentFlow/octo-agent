package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterContentLibrary(rg *gin.RouterGroup, c *controller.ContentLibraryController) {
	group := rg.Group("/content-library")
	group.Use(middleware.Auth())
	group.GET("/items", c.List)
	group.POST("/items", c.Create)
	group.GET("/items/:id", c.Get)
	group.PUT("/items/:id", c.Update)
	group.DELETE("/items/:id", c.Delete)
}
