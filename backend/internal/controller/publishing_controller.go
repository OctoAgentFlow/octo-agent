package controller

import (
	"errors"
	"net/http"

	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type PublishingController struct {
	service *service.PublishingService
}

func NewPublishingController(service *service.PublishingService) *PublishingController {
	return &PublishingController{service: service}
}

func (ctl *PublishingController) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.service.ListJobs(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *PublishingController) Status(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.service.Status(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *PublishingController) Retry(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid publish job id")
		return
	}
	data, err := ctl.service.RetryJob(userID, id)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *PublishingController) Cancel(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid publish job id")
		return
	}
	data, err := ctl.service.CancelJob(userID, id)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *PublishingController) PublishNow(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid publish job id")
		return
	}
	data, err := ctl.service.PublishNow(c.Request.Context(), userID, id)
	if err != nil {
		var publishingErr *service.PublishingError
		if errors.As(err, &publishingErr) && publishingErr.Code != "" {
			response.FailWithCode(c, http.StatusForbidden, publishingErr.Message, publishingErr.Code)
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}
