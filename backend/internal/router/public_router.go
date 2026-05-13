package router

import (
	"octo-agent/backend/internal/controller"

	"github.com/gin-gonic/gin"
)

func RegisterPublic(rg *gin.RouterGroup, c *controller.PublicController) {
	group := rg.Group("/public")
	group.GET("/site-links", c.SiteLinks)
}
