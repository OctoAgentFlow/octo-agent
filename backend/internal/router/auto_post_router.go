package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

// RegisterAutoPost keeps the legacy /auto-post API available for old clients
// and rollback safety. New clients should use RegisterContentDrafts.
func RegisterAutoPost(rg *gin.RouterGroup, c *controller.ContentDraftController) {
	registerAutoPostRoutes(rg.Group("/auto-post"), c)
}

func RegisterContentDrafts(rg *gin.RouterGroup, c *controller.ContentDraftController) {
	registerAutoPostRoutes(rg.Group("/content-drafts"), c)
}

func registerAutoPostRoutes(group *gin.RouterGroup, c *controller.ContentDraftController) {
	group.Use(middleware.Auth())
	group.GET("/plans", c.ListPlans)
	group.POST("/plans", c.CreatePlan)
	group.GET("/plans/:id", c.GetPlan)
	group.PUT("/plans/:id", c.UpdatePlan)
	group.POST("/plans/:id/generate", c.GenerateDraft)
	group.POST("/plans/:id/run-now", c.RunPlanNow)
	group.GET("/runs", c.ListRuns)
	group.GET("/drafts", c.ListDrafts)
	group.PATCH("/drafts/:id", c.UpdateDraft)
	group.POST("/drafts/:id/rewrite", c.RewriteDraft)
	group.POST("/drafts/:id/approve", c.ApproveDraft)
	group.POST("/drafts/:id/prepare-publish", c.PrepareDraftPublish)
	group.POST("/drafts/:id/reject", c.RejectDraft)
}
