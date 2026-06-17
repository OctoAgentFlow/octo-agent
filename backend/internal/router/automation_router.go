package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterAutomation(rg *gin.RouterGroup, c *controller.AutomationController) {
	publicDM := rg.Group("/auto-dm")
	publicDM.GET("/unsubscribe/:token", c.GetDMPreference)
	publicDM.POST("/unsubscribe/:token", c.PublicUnsubscribeDM)

	group := rg.Group("/automations")
	group.Use(middleware.Auth())
	group.GET("", c.List)
	group.PUT("/:type", c.Update)
	group.POST("/:type/toggle", c.Toggle)
	group.PATCH("/:type/execution-mode", c.UpdateExecutionMode)
	group.GET("/runtime-status", c.RuntimeStatus)

	radar := rg.Group("/exposure-radar")
	radar.Use(middleware.Auth())
	radar.POST("/drafts", c.CreateExposureRadarCommentDraft)
	radar.PATCH("/drafts/:id", c.UpdateCommentDraft)
	radar.POST("/drafts/:id/rewrite", c.RewriteCommentDraft)
	radar.POST("/drafts/:id/feedback", c.CreateCommentFeedback)
	radar.POST("/drafts/:id/approve", c.ApproveCommentTask)
	radar.POST("/drafts/:id/reject", c.RejectCommentDraft)
	radar.POST("/drafts/:id/handled", c.MarkCommentTaskHandled)
	radar.GET("/strategy", c.GetExposureRadarGrowthStrategy)
	radar.PUT("/strategy", c.UpsertExposureRadarGrowthStrategy)
	radar.GET("/weekly-review", c.ExposureRadarWeeklyReview)
	radar.GET("/safety-center", c.ExposureRadarSafetyCenter)
	radar.GET("/manual-records/recent", c.ListRecentExposureRadarManualRecords)
	radar.GET("/manual-records", c.ListExposureRadarManualRecords)
	radar.POST("/manual-records/resolve-result", c.ResolveExposureRadarPublishingResult)
	radar.POST("/manual-records/refresh-results", c.RefreshExposureRadarPublishingResults)
	radar.POST("/manual-records", c.UpsertExposureRadarManualRecord)
	radar.GET("/people", c.ListExposureRadarPeople)
	radar.PUT("/people/:handle/note", c.UpsertExposureRadarPeopleNote)
}
