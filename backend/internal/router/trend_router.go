package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterTrend(rg *gin.RouterGroup, c *controller.TrendController) {
	group := rg.Group("/trends")
	group.Use(middleware.Auth())
	group.GET("/topics", c.ListTopics)
	group.GET("/selected", c.SelectForBot)
	group.GET("/feedback", c.ListFeedback)
	group.POST("/feedback", c.CreateFeedback)
	group.DELETE("/feedback/:id", c.DeleteFeedback)
}
