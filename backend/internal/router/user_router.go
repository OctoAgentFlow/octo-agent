package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterUser(rg *gin.RouterGroup, c *controller.UserController) {
	user := rg.Group("/users")
	user.Use(middleware.Auth())
	user.GET("/me", c.Me)
}
