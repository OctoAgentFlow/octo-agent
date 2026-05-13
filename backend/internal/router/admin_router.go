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
}
