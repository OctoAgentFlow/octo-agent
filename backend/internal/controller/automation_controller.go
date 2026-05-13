package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type AutomationController struct {
	automationService  *service.AutomationService
	autoDMService      *service.AutoDMService
	autoCommentService *service.AutoCommentService
}

func getUintParam(c *gin.Context, name string) (uint, bool) {
	raw := strings.TrimSpace(c.Param(name))
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || value == 0 {
		return 0, false
	}
	return uint(value), true
}

func NewAutomationController(automationService *service.AutomationService, autoDMService *service.AutoDMService, autoCommentService *service.AutoCommentService) *AutomationController {
	return &AutomationController{automationService: automationService, autoDMService: autoDMService, autoCommentService: autoCommentService}
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

func (ctl *AutomationController) ListDMTasks(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.autoDMService.ListTasks(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ListDMRecipientRules(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.AutoDMRecipientRuleQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoDMService.ListRecipientRules(userID, query)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ListDMRecipientImports(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.autoDMService.ListRecipientImports(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ImportDMRecipientRules(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.AutoDMRecipientImportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoDMService.ImportRecipientRules(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) UpdateDMRecipientRule(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	ruleID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid recipient rule id")
		return
	}
	var req dto.AutoDMRecipientRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoDMService.UpdateRecipientRule(userID, ruleID, req.Status, req.Reason)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) BulkUpdateDMRecipientRules(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.AutoDMRecipientRuleBulkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoDMService.BulkUpdateRecipientRules(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ApproveDMTask(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid task id")
		return
	}
	data, err := ctl.autoDMService.ApproveTask(userID, taskID)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) BlockDMTask(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid task id")
		return
	}
	var req dto.AutoDMTaskBlockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoDMService.BlockTask(userID, taskID, req.Reason)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) RetryDMTask(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid task id")
		return
	}
	data, err := ctl.autoDMService.RetryTask(userID, taskID)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) SetDMRecipientRule(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid task id")
		return
	}
	var req dto.AutoDMRecipientRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoDMService.SetRecipientRuleFromTask(userID, taskID, req.Status, req.Reason)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) GetDMPreference(c *gin.Context) {
	token := strings.TrimSpace(c.Param("token"))
	data, err := ctl.autoDMService.GetPreference(token)
	if err != nil {
		response.Fail(c, http.StatusNotFound, "unsubscribe preference not found")
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) PublicUnsubscribeDM(c *gin.Context) {
	token := strings.TrimSpace(c.Param("token"))
	data, err := ctl.autoDMService.PublicUnsubscribe(token)
	if err != nil {
		response.Fail(c, http.StatusNotFound, "unsubscribe preference not found")
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ListCommentTargets(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.autoCommentService.ListTargets(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) CreateCommentTarget(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.AutoCommentTargetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoCommentService.CreateTarget(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) UpdateCommentTargetStatus(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid target id")
		return
	}
	var req dto.AutoCommentTargetStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoCommentService.UpdateTargetStatus(userID, targetID, req.Status)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) DeleteCommentTarget(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid target id")
		return
	}
	if err := ctl.autoCommentService.DeleteTarget(userID, targetID); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, gin.H{"deleted": true})
}

func (ctl *AutomationController) ListCommentTasks(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.autoCommentService.ListTasks(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ApproveCommentTask(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid task id")
		return
	}
	data, err := ctl.autoCommentService.ApproveTask(c.Request.Context(), userID, taskID)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) BlockCommentTask(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid task id")
		return
	}
	var req dto.AutoCommentTaskBlockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoCommentService.BlockTask(userID, taskID, req.Reason)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) RetryCommentTask(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid task id")
		return
	}
	data, err := ctl.autoCommentService.RetryTask(c.Request.Context(), userID, taskID)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}
