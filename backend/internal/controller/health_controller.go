package controller

import (
	"octo-agent/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

type HealthController struct{}

func NewHealthController() *HealthController { return &HealthController{} }

func (h *HealthController) Ping(c *gin.Context) {
	response.OK(c, gin.H{"status": "ok"})
}
