package controller

import (
	"net/http"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type TrendController struct {
	service *service.TrendService
}

func NewTrendController(s *service.TrendService) *TrendController {
	return &TrendController{service: s}
}

func (ctl *TrendController) ListTopics(c *gin.Context) {
	var query dto.TrendTopicQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.service.ListTopics(query, time.Now().UTC())
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}
