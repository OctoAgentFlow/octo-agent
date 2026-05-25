package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterReferral(rg *gin.RouterGroup, c *controller.ReferralController) {
	g := rg.Group("/referrals")
	g.Use(middleware.Auth())
	g.GET("/me", c.Info)
}
