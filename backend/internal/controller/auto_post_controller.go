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

type ContentDraftController struct {
	contentDraftService *service.ContentDraftService
}

type AutoPostController = ContentDraftController

func NewContentDraftController(contentDraftService *service.ContentDraftService) *ContentDraftController {
	return &ContentDraftController{contentDraftService: contentDraftService}
}

func NewAutoPostController(autoPostService *service.AutoPostService) *AutoPostController {
	return NewContentDraftController(autoPostService)
}

func (ctl *ContentDraftController) ListPlans(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.contentDraftService.ListPlans(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentDraftController) CreatePlan(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.ContentDraftPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.contentDraftService.CreatePlan(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentDraftController) GetPlan(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	planID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid plan id")
		return
	}
	data, err := ctl.contentDraftService.GetPlan(userID, planID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "auto post plan not found")
			return
		}
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentDraftController) UpdatePlan(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	planID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid plan id")
		return
	}
	var req dto.ContentDraftPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.contentDraftService.UpdatePlan(userID, planID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentDraftController) ListDrafts(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.contentDraftService.ListDrafts(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentDraftController) ListRuns(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.ContentDraftGenerationRunQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.contentDraftService.ListRuns(userID, query)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentDraftController) GenerateDraft(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	planID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid plan id")
		return
	}
	var req dto.ContentDraftGenerateRequest
	_ = c.ShouldBindJSON(&req)
	data, err := ctl.contentDraftService.GenerateDraft(c.Request.Context(), userID, planID, req)
	if err != nil {
		if errors.Is(err, service.ErrAIGenerationQuotaExceeded) {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
		if errors.Is(err, service.ErrAutoPostMonthlyLimitExceeded) {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "auto_post_monthly_limit_exceeded")
			return
		}
		if errors.Is(err, service.ErrAutoPostDuplicateContent) {
			response.FailWithCode(c, http.StatusConflict, err.Error(), "auto_post_duplicate_content")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentDraftController) RunPlanNow(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	planID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid plan id")
		return
	}
	data, err := ctl.contentDraftService.RunPlanNow(c.Request.Context(), userID, planID)
	if err != nil {
		if automationActionError(c, err) {
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "auto post plan not found")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentDraftController) UpdateDraft(c *gin.Context) {
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
	var req dto.ContentDraftUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.contentDraftService.UpdateDraft(userID, draftID, req.GeneratedContent)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentDraftController) RewriteDraft(c *gin.Context) {
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
	var req dto.ContentDraftRewriteRequest
	_ = c.ShouldBindJSON(&req)
	data, err := ctl.contentDraftService.RewriteDraft(c.Request.Context(), userID, draftID, req)
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

func (ctl *ContentDraftController) ApproveDraft(c *gin.Context) {
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
	data, err := ctl.contentDraftService.ApproveDraft(userID, draftID)
	if err != nil {
		if automationActionError(c, err) {
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentDraftController) PrepareDraftPublish(c *gin.Context) {
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
	data, err := ctl.contentDraftService.PreparePublish(userID, draftID)
	if err != nil {
		if automationActionError(c, err) {
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *ContentDraftController) RejectDraft(c *gin.Context) {
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
	var req dto.ContentDraftRejectRequest
	_ = c.ShouldBindJSON(&req)
	data, err := ctl.contentDraftService.RejectDraft(userID, draftID, req.Reason)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}
