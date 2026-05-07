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
	group.GET("/runtime-status", c.RuntimeStatus)

	dm := rg.Group("/auto-dm")
	dm.Use(middleware.Auth())
	dm.GET("/tasks", c.ListDMTasks)
	dm.GET("/recipients", c.ListDMRecipientRules)
	dm.POST("/recipients/import", c.ImportDMRecipientRules)
	dm.POST("/tasks/:id/approve", c.ApproveDMTask)
	dm.POST("/tasks/:id/block", c.BlockDMTask)
	dm.POST("/tasks/:id/retry", c.RetryDMTask)
	dm.POST("/tasks/:id/recipient-rule", c.SetDMRecipientRule)
}
