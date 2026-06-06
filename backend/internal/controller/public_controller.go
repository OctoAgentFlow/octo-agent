package controller

import (
	"net/http"
	"strings"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/dto"

	"github.com/gin-gonic/gin"
)

type PublicController struct {
	app config.AppConfig
}

func NewPublicController(app config.AppConfig) *PublicController {
	return &PublicController{app: app}
}

func (ctl *PublicController) SiteLinks(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data": dto.SiteLinksResponse{
			OfficialXURL: strings.TrimSpace(ctl.app.OfficialXURL),
			TelegramURL:  strings.TrimSpace(ctl.app.TelegramURL),
		},
	})
}
