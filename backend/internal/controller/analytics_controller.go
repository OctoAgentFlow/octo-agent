package controller

import (
	"errors"
	"net/http"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type AnalyticsController struct {
	analyticsService *service.AnalyticsService
}

func NewAnalyticsController(analyticsService *service.AnalyticsService) *AnalyticsController {
	return &AnalyticsController{analyticsService: analyticsService}
}

func (ctl *AnalyticsController) Overview(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.AnalyticsOverviewQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.analyticsService.Overview(userID, query)
	if err != nil {
		if errors.Is(err, service.ErrInvalidAnalyticsRange) {
			response.Fail(c, http.StatusBadRequest, err.Error())
			return
		}
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}
