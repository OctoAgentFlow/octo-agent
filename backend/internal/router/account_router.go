package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterAccount(rg *gin.RouterGroup, c *controller.AccountController) {
	group := rg.Group("/accounts")
	group.Use(middleware.Auth())
	group.GET("", c.List)
}
