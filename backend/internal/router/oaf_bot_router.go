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
	group.GET("/dashboard-summary", c.DashboardSummary)
	group.GET("/matrix-signals", c.MatrixSignals)
	group.GET("/feedback-summary", c.FeedbackSummary)
	group.GET("/:id", c.Get)
	group.PUT("/:id", c.Update)
	group.GET("/:id/learning-rule-preferences", c.LearningRulePreferences)
	group.POST("/:id/learning-rule-preferences", c.UpsertLearningRulePreference)
	group.POST("/:id/feedback-profile-suggestion", c.SuggestProfileFromFeedback)
	group.POST("/:id/test-generate", c.TestGenerate)
	group.POST("/:id/rewrite-safety", c.RewriteSampleForSafety)
	group.GET("/:id/generation-usages", c.GenerationUsages)
	group.GET("/:id/generation-feedback", c.GenerationFeedback)
	group.POST("/:id/generation-feedback", c.CreateGenerationFeedback)
	group.DELETE("/:id/generation-feedback/:feedbackID", c.DeleteGenerationFeedback)
}
