package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AutomationController struct {
	automationService          *service.AutomationService
	autoReplyService           *service.AutoReplyService
	autoDMService              *service.AutoDMService
	autoCommentService         *service.AutoCommentService
	exposureRadarManualService *service.ExposureRadarManualService
}

func getUintParam(c *gin.Context, name string) (uint, bool) {
	raw := strings.TrimSpace(c.Param(name))
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || value == 0 {
		return 0, false
	}
	return uint(value), true
}

func NewAutomationController(automationService *service.AutomationService, autoReplyService *service.AutoReplyService, autoDMService *service.AutoDMService, autoCommentService *service.AutoCommentService, exposureRadarManualService *service.ExposureRadarManualService) *AutomationController {
	return &AutomationController{
		automationService:          automationService,
		autoReplyService:           autoReplyService,
		autoDMService:              autoDMService,
		autoCommentService:         autoCommentService,
		exposureRadarManualService: exposureRadarManualService,
	}
}

func automationActionError(c *gin.Context, err error) bool {
	if errors.Is(err, service.ErrAutomationModulePaused) {
		response.FailWithCode(c, http.StatusForbidden, err.Error(), "automation_module_paused")
		return true
	}
	return false
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

func (ctl *AutomationController) UpdateExecutionMode(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	typ := strings.TrimSpace(strings.ToLower(c.Param("type")))
	var req dto.AutomationExecutionModeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.automationService.UpdateExecutionMode(userID, typ, req.ExecutionMode)
	if err != nil {
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

func (ctl *AutomationController) ListReplyDrafts(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	pageSize := 50
	if raw := strings.TrimSpace(c.Query("page_size")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			pageSize = parsed
		}
	}
	data, err := ctl.autoReplyService.ListDrafts(userID, pageSize)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) GenerateReplyDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.AutoReplyDraftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoReplyService.GenerateDraft(c.Request.Context(), userID, req)
	if err != nil {
		if strings.Contains(err.Error(), "ai_generation_quota_exceeded") {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
		if strings.Contains(err.Error(), "monthly auto reply quota exceeded") {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "auto_reply_monthly_limit_exceeded")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) UpdateReplyDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	draftID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return
	}
	var req dto.AutoReplyDraftUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoReplyService.UpdateDraft(userID, draftID, req.GeneratedReply)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) RewriteReplyDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	draftID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return
	}
	var req dto.SocialDraftRewriteRequest
	_ = c.ShouldBindJSON(&req)
	data, err := ctl.autoReplyService.RewriteDraft(c.Request.Context(), userID, draftID, req)
	if err != nil {
		if strings.Contains(err.Error(), "monthly AI generation quota exceeded") {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ApproveReplyDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	draftID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return
	}
	data, err := ctl.autoReplyService.ApproveDraft(userID, draftID)
	if err != nil {
		if automationActionError(c, err) {
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) RejectReplyDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	draftID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return
	}
	var req dto.AutoCommentTaskBlockRequest
	_ = c.ShouldBindJSON(&req)
	data, err := ctl.autoReplyService.RejectDraft(userID, draftID, req.Reason)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) RetryReplyDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	draftID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return
	}
	data, err := ctl.autoReplyService.RetryDraft(c.Request.Context(), userID, draftID)
	if err != nil {
		if automationActionError(c, err) {
			return
		}
		if strings.Contains(err.Error(), "monthly AI generation quota exceeded") {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
		if strings.Contains(err.Error(), "monthly auto reply quota exceeded") {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "auto_reply_monthly_limit_exceeded")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
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

func (ctl *AutomationController) DMOverview(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.autoDMService.Overview(userID, time.Now().UTC())
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

func (ctl *AutomationController) PreviewDMRecipientRulesImport(c *gin.Context) {
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
	data, err := ctl.autoDMService.PreviewRecipientImport(userID, req)
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
	data, err := ctl.autoDMService.UpdateRecipientRule(userID, ruleID, req.Status, req.RecipientSegment, req.Reason)
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
		if automationActionError(c, err) {
			return
		}
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

func (ctl *AutomationController) UpdateDMTask(c *gin.Context) {
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
	var req dto.AutoDMTaskUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoDMService.UpdateTaskMessage(userID, taskID, req.MessagePreview)
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
		if automationActionError(c, err) {
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) DeleteDMTask(c *gin.Context) {
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
	if err := ctl.autoDMService.DeleteTask(userID, taskID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "auto dm task not found")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, gin.H{"deleted": true})
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
	data, err := ctl.autoDMService.SetRecipientRuleFromTask(userID, taskID, req.Status, req.RecipientSegment, req.Reason)
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
		if errors.Is(err, service.ErrAutoCommentTargetLimitExceeded) {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "auto_comment_target_limit_exceeded")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) BulkImportCommentTargets(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.AutoCommentTargetBulkImportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoCommentService.BulkImportTargets(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) SuggestCommentTargets(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.AutoCommentTargetSuggestionRequest
	_ = c.ShouldBindJSON(&req)
	data, err := ctl.autoCommentService.SuggestTargets(c.Request.Context(), userID, req)
	if err != nil {
		if errors.Is(err, service.ErrAIGenerationQuotaExceeded) {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
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
	pageSize := 200
	if raw := strings.TrimSpace(c.Query("page_size")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			pageSize = parsed
		}
	}
	data, err := ctl.autoCommentService.ListTasks(userID, pageSize)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) CommentAnalytics(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.autoCommentService.Analytics(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) GenerateCommentDraft(c *gin.Context) {
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
	data, err := ctl.autoCommentService.GenerateDraft(c.Request.Context(), userID, targetID)
	if err != nil {
		if errors.Is(err, service.ErrAIGenerationQuotaExceeded) {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
		if errors.Is(err, service.ErrAutoCommentOpportunityTooLow) {
			response.FailWithCode(c, http.StatusBadRequest, err.Error(), "auto_comment_opportunity_too_low")
			return
		}
		if errors.Is(err, service.ErrAutoCommentAlreadyCompleted) {
			response.FailWithCode(c, http.StatusConflict, err.Error(), "auto_comment_already_completed")
			return
		}
		if strings.Contains(err.Error(), "monthly auto comment quota exceeded") {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "auto_comment_monthly_limit_exceeded")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) CreateExposureRadarCommentDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.ExposureRadarCommentDraftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoCommentService.CreateDraftFromExposureRadar(c.Request.Context(), userID, req)
	if err != nil {
		if errors.Is(err, service.ErrAIGenerationQuotaExceeded) {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
		if errors.Is(err, service.ErrAutoCommentAlreadyCompleted) {
			response.FailWithCode(c, http.StatusConflict, err.Error(), "auto_comment_already_completed")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
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
		if automationActionError(c, err) {
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) QueueCommentQuotePost(c *gin.Context) {
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
	data, err := ctl.autoCommentService.QueueQuotePost(c.Request.Context(), userID, taskID)
	if err != nil {
		if automationActionError(c, err) {
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) RejectCommentDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return
	}
	var req dto.AutoCommentTaskBlockRequest
	_ = c.ShouldBindJSON(&req)
	data, err := ctl.autoCommentService.RejectTask(userID, taskID, req.Reason)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) MarkCommentTaskHandled(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return
	}
	var req dto.ExposureRadarManualHandleRequest
	_ = c.ShouldBindJSON(&req)
	data, err := ctl.autoCommentService.MarkTaskHandled(userID, taskID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) UpsertExposureRadarManualRecord(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.ExposureRadarManualRecordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.exposureRadarManualService.Upsert(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ResolveExposureRadarPublishingResult(c *gin.Context) {
	if _, ok := getUserID(c); !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.ExposureRadarResultLookupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.exposureRadarManualService.ResolvePublishingResult(c.Request.Context(), req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) RefreshExposureRadarPublishingResults(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.ExposureRadarResultRefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.exposureRadarManualService.RefreshPublishingResults(c.Request.Context(), userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ListExposureRadarManualRecords(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	raw := strings.TrimSpace(c.Query("signal_ids"))
	var signalIDs []string
	if raw != "" {
		signalIDs = strings.Split(raw, ",")
	}
	data, err := ctl.exposureRadarManualService.ListBySignalIDs(userID, signalIDs)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ListRecentExposureRadarManualRecords(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	days := 7
	if raw := strings.TrimSpace(c.Query("days")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			days = parsed
		}
	}
	limit := 100
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	data, err := ctl.exposureRadarManualService.ListRecentRecords(userID, c.Query("region"), days, limit)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ListExposureRadarPeople(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	days := 30
	if raw := strings.TrimSpace(c.Query("days")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			days = parsed
		}
	}
	limit := 20
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	data, err := ctl.exposureRadarManualService.ListPeople(userID, c.Query("region"), days, limit)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) GetExposureRadarGrowthStrategy(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	botID := parseUintQuery(c.Query("bot_id"))
	xAccountID := parseUintQuery(c.Query("x_account_id"))
	data, err := ctl.exposureRadarManualService.GetGrowthStrategy(userID, c.Query("region"), botID, xAccountID)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) UpsertExposureRadarGrowthStrategy(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.ExposureRadarGrowthStrategyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.exposureRadarManualService.UpsertGrowthStrategy(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) UpsertExposureRadarPeopleNote(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.ExposureRadarPeopleNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(req.AuthorHandle) == "" {
		req.AuthorHandle = c.Param("handle")
	}
	data, err := ctl.exposureRadarManualService.UpsertPeopleNote(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ExposureRadarWeeklyReview(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	days := 7
	if raw := strings.TrimSpace(c.Query("days")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			days = parsed
		}
	}
	data, err := ctl.exposureRadarManualService.WeeklyReview(userID, c.Query("region"), days)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) ExposureRadarSafetyCenter(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	days := 7
	if raw := strings.TrimSpace(c.Query("days")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			days = parsed
		}
	}
	data, err := ctl.exposureRadarManualService.SafetyCenter(userID, c.Query("region"), days)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func parseUintQuery(raw string) uint {
	value, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	if err != nil {
		return 0
	}
	return uint(value)
}

func (ctl *AutomationController) DeleteCommentDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return
	}
	if err := ctl.autoCommentService.DeleteTask(userID, taskID); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, gin.H{"deleted": true})
}

func (ctl *AutomationController) UpdateCommentDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return
	}
	var req dto.AutoCommentDraftUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoCommentService.UpdateDraft(userID, taskID, req.GeneratedComment)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) RewriteCommentDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return
	}
	var req dto.SocialDraftRewriteRequest
	_ = c.ShouldBindJSON(&req)
	data, err := ctl.autoCommentService.RewriteDraft(c.Request.Context(), userID, taskID, req)
	if err != nil {
		if strings.Contains(err.Error(), "monthly AI generation quota exceeded") {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AutomationController) CreateCommentFeedback(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	taskID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return
	}
	var req dto.AutoCommentFeedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.autoCommentService.CreateFeedback(userID, taskID, req)
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
		if automationActionError(c, err) {
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}
