package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterAuth(rg *gin.RouterGroup, c *controller.AuthController) {
	rg.POST("/auth/email-code/send", c.SendEmailCode)
	rg.POST("/auth/email-code/verify", c.VerifyEmailCode)
	rg.POST("/auth/register", c.Register)
	rg.POST("/auth/login", c.Login)
	rg.POST("/auth/refresh", c.Refresh)

	user := rg.Group("/users")
	user.Use(middleware.Auth())
	user.GET("/me", c.Me)
	user.PATCH("/me", c.UpdateMe)
	user.PATCH("/me/password", c.ChangePassword)
	user.GET("/me/notification-settings", c.NotificationSettings)
	user.PATCH("/me/notification-settings", c.UpdateNotificationSettings)
}
