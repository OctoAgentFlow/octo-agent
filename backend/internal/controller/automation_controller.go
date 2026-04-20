package controller

import (
	"errors"
	"net/http"
	"strings"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type AutomationController struct {
	automationService *service.AutomationService
}

func NewAutomationController(automationService *service.AutomationService) *AutomationController {
	return &AutomationController{automationService: automationService}
}

func (ctl *AutomationController) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.automationService.List(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) Update(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	typ := strings.TrimSpace(strings.ToLower(c.Param("type")))
	var req dto.AutomationConfigPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.automationService.Update(userID, typ, req)
	if err != nil {
		if errors.Is(err, subscription.ErrSubscriptionExpired) {
			response.FailWithCode(c, http.StatusForbidden, "Your subscription has expired. Renew to continue.", "subscription_expired")
			return
		}
		if errors.Is(err, subscription.ErrSubscriptionRequired) {
			response.FailWithCode(c, http.StatusForbidden, "An active subscription is required for this action.", "subscription_required")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) Toggle(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	typ := strings.TrimSpace(strings.ToLower(c.Param("type")))
	var req dto.ToggleAutomationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.automationService.Toggle(userID, typ, req.Enabled)
	if err != nil {
		if errors.Is(err, subscription.ErrSubscriptionExpired) {
			response.FailWithCode(c, http.StatusForbidden, "Your subscription has expired. Renew to continue.", "subscription_expired")
			return
		}
		if errors.Is(err, subscription.ErrSubscriptionRequired) {
			response.FailWithCode(c, http.StatusForbidden, "An active subscription is required for this action.", "subscription_required")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) RuntimeStatus(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.automationService.RuntimeStatus(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}
