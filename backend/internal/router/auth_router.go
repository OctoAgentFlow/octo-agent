package router

import (
	"octo-agent/backend/internal/controller"

	"github.com/gin-gonic/gin"
)

func RegisterAuth(rg *gin.RouterGroup, c *controller.AuthController) {
	rg.POST("/auth/login", c.Login)
}
