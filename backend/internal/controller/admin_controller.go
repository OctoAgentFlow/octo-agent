package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type AdminController struct {
	adminService *service.AdminService
}

func NewAdminController(adminService *service.AdminService) *AdminController {
	return &AdminController{adminService: adminService}
}

func (ctl *AdminController) Overview(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.Overview(userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) ListUsers(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.AdminUserListQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.ListUsers(userID, query)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) UpdateUser(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetIDValue, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || targetIDValue == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid user id")
		return
	}
	var req dto.AdminUpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.UpdateUser(userID, uint(targetIDValue), req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func adminError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrAdminForbidden):
		response.Fail(c, http.StatusForbidden, err.Error())
	case errors.Is(err, service.ErrAdminUserNotFound):
		response.Fail(c, http.StatusNotFound, err.Error())
	case errors.Is(err, service.ErrAdminInvalidUserRole),
		errors.Is(err, service.ErrAdminInvalidStatus),
		errors.Is(err, service.ErrAdminLastOwner),
		errors.Is(err, service.ErrAdminSelfSuspend):
		response.Fail(c, http.StatusBadRequest, err.Error())
	default:
		response.Fail(c, http.StatusInternalServerError, err.Error())
	}
}
