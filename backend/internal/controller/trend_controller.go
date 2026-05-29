package controller

import (
	"net/http"
	"strconv"
	"strings"
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

func (ctl *TrendController) SelectForBot(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.TrendSelectionQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	query.ExcludedTrendNames = append(query.ExcludedTrendNames, c.QueryArray("excluded_trend_names")...)
	query.ExcludedTrendNames = append(query.ExcludedTrendNames, c.QueryArray("excluded_trend_names[]")...)
	if raw := strings.TrimSpace(c.Query("excluded_trend_names")); raw != "" {
		query.ExcludedTrendNames = append(query.ExcludedTrendNames, strings.Split(raw, ",")...)
	}
	data, err := ctl.service.SelectForBot(userID, query, time.Now().UTC())
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *TrendController) CreateFeedback(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.TrendFeedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.service.CreateFeedback(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *TrendController) ListFeedback(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.TrendFeedbackQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.service.ListFeedback(userID, query)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *TrendController) DeleteFeedback(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id64 == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid feedback id")
		return
	}
	if err := ctl.service.DeleteFeedback(userID, uint(id64)); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, gin.H{"deleted": true})
}
