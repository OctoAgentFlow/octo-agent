package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterDailyXQueue(rg *gin.RouterGroup, c *controller.DailyXQueueController) {
	group := rg.Group("/daily-x-queue")
	group.Use(middleware.Auth())
	group.GET("/overview", c.Overview)
	group.POST("/setup", c.Setup)
	group.POST("/source-material", c.SaveSourceMaterial)
	group.POST("/source-material/import-url", c.ImportSourceMaterialFromURL)
	group.POST("/source-material/select", c.SelectSourceMaterial)
	group.POST("/generate", c.Generate)
	group.PATCH("/drafts/:id", c.UpdateDraft)
	group.POST("/drafts/:id/approve", c.ApproveDraft)
	group.POST("/drafts/:id/reject", c.RejectDraft)
	group.POST("/drafts/:id/rewrite", c.RewriteDraft)
	group.POST("/drafts/:id/copy", c.CopyDraft)
}
