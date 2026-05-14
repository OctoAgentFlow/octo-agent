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

	dm := rg.Group("/auto-dm")
	dm.Use(middleware.Auth())
	dm.GET("/tasks", c.ListDMTasks)
	dm.GET("/recipients", c.ListDMRecipientRules)
	dm.GET("/recipients/imports", c.ListDMRecipientImports)
	dm.POST("/recipients/import", c.ImportDMRecipientRules)
	dm.PATCH("/recipient-rules/:id", c.UpdateDMRecipientRule)
	dm.POST("/recipient-rules/bulk", c.BulkUpdateDMRecipientRules)
	dm.POST("/tasks/:id/approve", c.ApproveDMTask)
	dm.POST("/tasks/:id/block", c.BlockDMTask)
	dm.POST("/tasks/:id/retry", c.RetryDMTask)
	dm.POST("/tasks/:id/recipient-rule", c.SetDMRecipientRule)

	comment := rg.Group("/auto-comment")
	comment.Use(middleware.Auth())
	comment.GET("/targets", c.ListCommentTargets)
	comment.POST("/targets", c.CreateCommentTarget)
	comment.POST("/targets/:id/generate", c.GenerateCommentDraft)
	comment.PATCH("/targets/:id", c.UpdateCommentTargetStatus)
	comment.DELETE("/targets/:id", c.DeleteCommentTarget)
	comment.GET("/tasks", c.ListCommentTasks)
	comment.POST("/tasks/:id/approve", c.ApproveCommentTask)
	comment.PATCH("/tasks/:id", c.UpdateCommentDraft)
	comment.POST("/tasks/:id/block", c.BlockCommentTask)
	comment.POST("/tasks/:id/retry", c.RetryCommentTask)

	comments := rg.Group("/auto-comments")
	comments.Use(middleware.Auth())
	comments.GET("/targets", c.ListCommentTargets)
	comments.POST("/targets", c.CreateCommentTarget)
	comments.POST("/targets/:id/generate", c.GenerateCommentDraft)
	comments.GET("/drafts", c.ListCommentTasks)
	comments.PATCH("/drafts/:id", c.UpdateCommentDraft)
	comments.POST("/drafts/:id/approve", c.ApproveCommentTask)
	comments.POST("/drafts/:id/reject", c.RejectCommentDraft)
}
