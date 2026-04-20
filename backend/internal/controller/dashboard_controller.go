package controller

import (
	"net/http"

	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type DashboardController struct {
	dashboardService *service.DashboardService
}

func NewDashboardController(dashboardService *service.DashboardService) *DashboardController {
	return &DashboardController{dashboardService: dashboardService}
}

func (ctl *DashboardController) Overview(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.dashboardService.Overview(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}
