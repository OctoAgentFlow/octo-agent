package controller

import (
	"errors"
	"net/http"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ContentLibraryController struct {
	service *service.ContentLibraryService
}

func NewContentLibraryController(s *service.ContentLibraryService) *ContentLibraryController {
	return &ContentLibraryController{service: s}
}

func (ctl *ContentLibraryController) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.ContentLibraryItemQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.service.List(userID, query)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentLibraryController) Create(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.ContentLibraryItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.service.Create(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentLibraryController) Get(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid content item id")
		return
	}
	data, err := ctl.service.Get(userID, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "content item not found")
			return
		}
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentLibraryController) Update(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid content item id")
		return
	}
	var req dto.ContentLibraryItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.service.Update(userID, id, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentLibraryController) Delete(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid content item id")
		return
	}
	if err := ctl.service.Delete(userID, id); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, gin.H{"deleted": true})
}
