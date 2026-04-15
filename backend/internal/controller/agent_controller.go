package controller

import (
	"octo-agent/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

type AgentController struct{}

func NewAgentController() *AgentController { return &AgentController{} }

func (ctl *AgentController) List(c *gin.Context) {
	response.OK(c, []gin.H{{"id": 1, "name": "default-agent"}})
}
