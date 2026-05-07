package controller

import (
	"net/http"

	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type AgentController struct {
	agentService *service.AgentService
}

func NewAgentController(agentService *service.AgentService) *AgentController {
	return &AgentController{agentService: agentService}
}

func (ctl *AgentController) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.agentService.List(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}
