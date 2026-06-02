package controller

import (
	"errors"
	"net/http"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type DailyXQueueController struct {
	service *service.DailyXQueueService
}

func NewDailyXQueueController(s *service.DailyXQueueService) *DailyXQueueController {
	return &DailyXQueueController{service: s}
}

func (ctl *DailyXQueueController) Overview(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.service.Overview(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *DailyXQueueController) Setup(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.DailyXQueueSetupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.service.Setup(c.Request.Context(), userID, req)
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

func (ctl *DailyXQueueController) SaveSourceMaterial(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.DailyXQueueSourceMaterialRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.service.SaveSourceMaterial(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *DailyXQueueController) Generate(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.service.Generate(c.Request.Context(), userID)
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

func (ctl *DailyXQueueController) UpdateDraft(c *gin.Context) {
	userID, draftID, ok := userAndDraftID(c)
	if !ok {
		return
	}
	var req dto.DailyXQueueDraftUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.service.UpdateDraft(userID, draftID, req.GeneratedContent)
	respondDailyDraftAction(c, data, err)
}

func (ctl *DailyXQueueController) ApproveDraft(c *gin.Context) {
	userID, draftID, ok := userAndDraftID(c)
	if !ok {
		return
	}
	data, err := ctl.service.ApproveDraft(userID, draftID)
	respondDailyDraftAction(c, data, err)
}

func (ctl *DailyXQueueController) RejectDraft(c *gin.Context) {
	userID, draftID, ok := userAndDraftID(c)
	if !ok {
		return
	}
	var req dto.DailyXQueueDraftRejectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.service.RejectDraft(userID, draftID, req.Reason)
	respondDailyDraftAction(c, data, err)
}

func (ctl *DailyXQueueController) RewriteDraft(c *gin.Context) {
	userID, draftID, ok := userAndDraftID(c)
	if !ok {
		return
	}
	var req dto.DailyXQueueDraftRewriteRequest
	_ = c.ShouldBindJSON(&req)
	data, err := ctl.service.RewriteDraft(c.Request.Context(), userID, draftID, req)
	respondDailyDraftAction(c, data, err)
}

func (ctl *DailyXQueueController) CopyDraft(c *gin.Context) {
	userID, draftID, ok := userAndDraftID(c)
	if !ok {
		return
	}
	data, err := ctl.service.CopyDraft(userID, draftID)
	respondDailyDraftAction(c, data, err)
}

func userAndDraftID(c *gin.Context) (uint, uint, bool) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return 0, 0, false
	}
	draftID, ok := getUintParam(c, "id")
	if !ok {
		response.Fail(c, http.StatusBadRequest, "invalid draft id")
		return 0, 0, false
	}
	return userID, draftID, true
}

func respondDailyDraftAction(c *gin.Context, data *dto.DailyXQueueActionResponse, err error) {
	if err != nil {
		status := http.StatusBadRequest
		response.Fail(c, status, err.Error())
		return
	}
	response.OK(c, data)
}
