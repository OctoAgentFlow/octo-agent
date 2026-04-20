package controller

import (
	"net/http"
	"strconv"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type WalletController struct {
	walletService *service.WalletService
}

func NewWalletController(walletService *service.WalletService) *WalletController {
	return &WalletController{walletService: walletService}
}

func (ctl *WalletController) Challenge(c *gin.Context) {
	var req dto.WalletChallengeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}

	data, err := ctl.walletService.CreateChallenge(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *WalletController) Bind(c *gin.Context) {
	var req dto.WalletBindRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.walletService.Bind(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *WalletController) Unbind(c *gin.Context) {
	var req dto.WalletUnbindRequest
	_ = c.ShouldBindJSON(&req)
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err := ctl.walletService.Unbind(userID, req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, gin.H{})
}

func getUserID(c *gin.Context) (uint, bool) {
	rawUserID := c.GetString("user_id")
	value, err := strconv.ParseUint(rawUserID, 10, 64)
	if err != nil || value == 0 {
		return 0, false
	}
	return uint(value), true
}
