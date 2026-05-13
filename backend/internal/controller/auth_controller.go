package controller

import (
	"errors"
	"net/http"
	"strconv"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type AuthController struct {
	authService *service.AuthService
}

func NewAuthController(authService *service.AuthService) *AuthController {
	return &AuthController{authService: authService}
}

func (ctl *AuthController) Login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.authService.Login(req)
	if err != nil {
		response.Fail(c, http.StatusUnauthorized, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) AdminLogin(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.authService.AdminLogin(req)
	if err != nil {
		if errors.Is(err, service.ErrAdminLoginForbidden) {
			response.Fail(c, http.StatusForbidden, err.Error())
			return
		}
		response.Fail(c, http.StatusUnauthorized, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) Register(c *gin.Context) {
	var req dto.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.authService.Register(req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) SendEmailCode(c *gin.Context) {
	var req dto.SendEmailCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.authService.SendEmailCode(req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidEmailCodePurpose):
			response.Fail(c, http.StatusBadRequest, service.ErrInvalidEmailCodePurpose.Error())
		case errors.Is(err, service.ErrEmailCodeRateLimited):
			response.Fail(c, http.StatusTooManyRequests, err.Error())
		case errors.Is(err, service.ErrSendVerificationEmail):
			response.Fail(c, http.StatusBadGateway, service.ErrSendVerificationEmail.Error())
		case errors.Is(err, service.ErrPersistVerificationCode):
			response.Fail(c, http.StatusInternalServerError, service.ErrPersistVerificationCode.Error())
		default:
			response.Fail(c, http.StatusBadRequest, err.Error())
		}
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) VerifyEmailCode(c *gin.Context) {
	var req dto.VerifyEmailCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.authService.VerifyEmailCode(req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) Refresh(c *gin.Context) {
	var req dto.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.authService.Refresh(req)
	if err != nil {
		response.Fail(c, http.StatusUnauthorized, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) AdminRefresh(c *gin.Context) {
	var req dto.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.authService.AdminRefresh(req)
	if err != nil {
		if errors.Is(err, service.ErrAdminLoginForbidden) {
			response.Fail(c, http.StatusForbidden, err.Error())
			return
		}
		response.Fail(c, http.StatusUnauthorized, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) Me(c *gin.Context) {
	rawUserID := c.GetString("user_id")
	userIDValue, _ := strconv.ParseUint(rawUserID, 10, 64)
	if userIDValue == 0 {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}

	data, err := ctl.authService.Me(uint(userIDValue))
	if err != nil {
		response.Fail(c, http.StatusUnauthorized, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) AdminMe(c *gin.Context) {
	rawUserID := c.GetString("user_id")
	userIDValue, _ := strconv.ParseUint(rawUserID, 10, 64)
	if userIDValue == 0 {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}

	data, err := ctl.authService.AdminMe(uint(userIDValue))
	if err != nil {
		if errors.Is(err, service.ErrAdminLoginForbidden) {
			response.Fail(c, http.StatusForbidden, err.Error())
			return
		}
		response.Fail(c, http.StatusUnauthorized, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) UpdateMe(c *gin.Context) {
	rawUserID := c.GetString("user_id")
	userIDValue, _ := strconv.ParseUint(rawUserID, 10, 64)
	if userIDValue == 0 {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.UpdateMeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.authService.UpdateMe(uint(userIDValue), req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) ChangePassword(c *gin.Context) {
	rawUserID := c.GetString("user_id")
	userIDValue, _ := strconv.ParseUint(rawUserID, 10, 64)
	if userIDValue == 0 {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.authService.ChangePassword(uint(userIDValue), req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) NotificationSettings(c *gin.Context) {
	rawUserID := c.GetString("user_id")
	userIDValue, _ := strconv.ParseUint(rawUserID, 10, 64)
	if userIDValue == 0 {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.authService.NotificationSettings(uint(userIDValue))
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AuthController) UpdateNotificationSettings(c *gin.Context) {
	rawUserID := c.GetString("user_id")
	userIDValue, _ := strconv.ParseUint(rawUserID, 10, 64)
	if userIDValue == 0 {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.UpdateNotificationSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.authService.UpdateNotificationSettings(uint(userIDValue), req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}
