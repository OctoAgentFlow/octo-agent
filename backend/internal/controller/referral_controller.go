package controller

import (
	"net/http"

	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type ReferralController struct {
	referralService *service.ReferralService
	frontendBaseURL string
}

func NewReferralController(referralService *service.ReferralService, frontendBaseURL string) *ReferralController {
	return &ReferralController{referralService: referralService, frontendBaseURL: frontendBaseURL}
}

func (ctl *ReferralController) Info(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.referralService.Info(userID, ctl.frontendBaseURL)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}
