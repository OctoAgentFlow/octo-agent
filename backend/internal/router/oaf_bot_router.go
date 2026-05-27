package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterOAFBot(rg *gin.RouterGroup, c *controller.OAFBotController) {
	group := rg.Group("/oaf-bots")
	group.Use(middleware.Auth())
	group.GET("", c.List)
	group.POST("", c.Create)
	group.POST("/complete-profile", c.CompleteProfile)
	group.GET("/:id", c.Get)
	group.PUT("/:id", c.Update)
	group.POST("/:id/test-generate", c.TestGenerate)
	group.GET("/:id/generation-usages", c.GenerationUsages)
	group.GET("/:id/generation-feedback", c.GenerationFeedback)
	group.POST("/:id/generation-feedback", c.CreateGenerationFeedback)
}
