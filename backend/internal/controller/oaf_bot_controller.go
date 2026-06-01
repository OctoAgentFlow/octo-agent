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
	"gorm.io/gorm"
)

type OAFBotController struct {
	oafBotService *service.OAFBotService
}

func NewOAFBotController(oafBotService *service.OAFBotService) *OAFBotController {
	return &OAFBotController{oafBotService: oafBotService}
}

func (ctl *OAFBotController) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.oafBotService.List(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) FeedbackSummary(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	data, err := ctl.oafBotService.FeedbackSummary(userID, days)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) DashboardSummary(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	data, err := ctl.oafBotService.DashboardSummary(userID, days)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) Get(c *gin.Context) {
	userID, id, ok := ctl.userAndBotID(c)
	if !ok {
		return
	}
	data, err := ctl.oafBotService.Get(userID, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "oaf bot not found")
			return
		}
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) LearningRulePreferences(c *gin.Context) {
	userID, id, ok := ctl.userAndBotID(c)
	if !ok {
		return
	}
	data, err := ctl.oafBotService.LearningRulePreferences(userID, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "oaf bot not found")
			return
		}
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) UpsertLearningRulePreference(c *gin.Context) {
	userID, id, ok := ctl.userAndBotID(c)
	if !ok {
		return
	}
	var req dto.OAFBotLearningRulePreferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.oafBotService.UpsertLearningRulePreference(userID, id, req)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "oaf bot not found")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) Create(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.OAFBotUpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.oafBotService.Create(userID, req)
	if err != nil {
		if errors.Is(err, service.ErrOAFBotLimitExceeded) {
			response.Fail(c, http.StatusForbidden, err.Error())
			return
		}
		if errors.Is(err, service.ErrOAFBotTwitterAccountAlreadyBound) {
			response.FailWithCode(c, http.StatusConflict, err.Error(), "oaf_bot_twitter_account_already_bound")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) Update(c *gin.Context) {
	userID, id, ok := ctl.userAndBotID(c)
	if !ok {
		return
	}
	var req dto.OAFBotUpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.oafBotService.Update(userID, id, req)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "oaf bot not found")
			return
		}
		if errors.Is(err, service.ErrOAFBotTwitterAccountAlreadyBound) {
			response.FailWithCode(c, http.StatusConflict, err.Error(), "oaf_bot_twitter_account_already_bound")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) CompleteProfile(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.OAFBotCompleteProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.oafBotService.CompleteProfile(c.Request.Context(), userID, req)
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

func (ctl *OAFBotController) SuggestProfileFromFeedback(c *gin.Context) {
	userID, id, ok := ctl.userAndBotID(c)
	if !ok {
		return
	}
	data, err := ctl.oafBotService.SuggestProfileFromFeedback(c.Request.Context(), userID, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "oaf bot not found")
			return
		}
		if errors.Is(err, service.ErrAIGenerationQuotaExceeded) {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) TestGenerate(c *gin.Context) {
	userID, id, ok := ctl.userAndBotID(c)
	if !ok {
		return
	}
	var req dto.OAFBotTestGenerateRequest
	if c.Request.ContentLength != 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			response.Fail(c, http.StatusBadRequest, err.Error())
			return
		}
	}
	data, err := ctl.oafBotService.TestGenerate(c.Request.Context(), userID, id, req)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "oaf bot not found")
			return
		}
		if errors.Is(err, service.ErrAIGenerationQuotaExceeded) {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) RewriteSampleForSafety(c *gin.Context) {
	userID, id, ok := ctl.userAndBotID(c)
	if !ok {
		return
	}
	var req dto.OAFBotRewriteSafetyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.oafBotService.RewriteSampleForSafety(c.Request.Context(), userID, id, req)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "oaf bot not found")
			return
		}
		if errors.Is(err, service.ErrAIGenerationQuotaExceeded) {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) GenerationUsages(c *gin.Context) {
	userID, id, ok := ctl.userAndBotID(c)
	if !ok {
		return
	}
	data, err := ctl.oafBotService.GenerationUsages(userID, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "oaf bot not found")
			return
		}
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) MatrixSignals(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.oafBotService.MatrixSignals(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) CreateGenerationFeedback(c *gin.Context) {
	userID, id, ok := ctl.userAndBotID(c)
	if !ok {
		return
	}
	var req dto.OAFBotGenerationFeedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.oafBotService.CreateGenerationFeedback(userID, id, req)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "oaf bot not found")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) GenerationFeedback(c *gin.Context) {
	userID, id, ok := ctl.userAndBotID(c)
	if !ok {
		return
	}
	data, err := ctl.oafBotService.GenerationFeedback(userID, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "oaf bot not found")
			return
		}
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *OAFBotController) DeleteGenerationFeedback(c *gin.Context) {
	userID, id, ok := ctl.userAndBotID(c)
	if !ok {
		return
	}
	feedbackID64, err := strconv.ParseUint(strings.TrimSpace(c.Param("feedbackID")), 10, 64)
	if err != nil || feedbackID64 == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid feedback id")
		return
	}
	if err := ctl.oafBotService.DeleteGenerationFeedback(userID, id, uint(feedbackID64)); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "oaf bot not found")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, gin.H{"deleted": true})
}

func (ctl *OAFBotController) userAndBotID(c *gin.Context) (uint, uint, bool) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return 0, 0, false
	}
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid oaf bot id")
		return 0, 0, false
	}
	return userID, uint(id), true
}
