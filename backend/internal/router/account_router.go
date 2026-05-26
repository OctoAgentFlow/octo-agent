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
	group.POST("/oauth/x/start", c.StartXOAuth)
	group.PUT("/:id/settings", c.UpdateSettings)
	group.DELETE("/:id", c.Delete)

	rg.GET("/accounts/oauth/x/callback", c.XOAuthCallback)
}
