package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterWallet(rg *gin.RouterGroup, c *controller.WalletController) {
	w := rg.Group("/wallet")
	w.Use(middleware.Auth())
	w.POST("/challenge", c.Challenge)
	w.POST("/bind", c.Bind)
	w.DELETE("/bind", c.Unbind)
}
