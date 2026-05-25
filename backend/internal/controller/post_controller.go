package controller

import (
	"errors"
	"net/http"
	"strconv"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type PostController struct {
	postService *service.PostService
}

func NewPostController(postService *service.PostService) *PostController {
	return &PostController{postService: postService}
}

func (ctl *PostController) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var q dto.PostListQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.postService.List(userID, q)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *PostController) Create(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.PostCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.postService.Create(userID, req)
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

func (ctl *PostController) Generate(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.PostGenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.postService.Generate(c.Request.Context(), userID, req)
	if err != nil {
		if errors.Is(err, service.ErrAIGenerationQuotaExceeded) {
			response.FailWithCode(c, http.StatusForbidden, err.Error(), "ai_generation_quota_exceeded")
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "x account not found")
			return
		}
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *PostController) Get(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseUintParam(c.Param("id"))
	if err != nil || id == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid post id")
		return
	}
	data, err := ctl.postService.Get(userID, id)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			response.Fail(c, http.StatusNotFound, "post not found")
			return
		}
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *PostController) Update(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseUintParam(c.Param("id"))
	if err != nil || id == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid post id")
		return
	}
	var req dto.PostUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.postService.Update(userID, id, req)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			response.Fail(c, http.StatusNotFound, "post not found")
			return
		}
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

func (ctl *PostController) Execute(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseUintParam(c.Param("id"))
	if err != nil || id == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid post id")
		return
	}
	data, err := ctl.postService.Execute(c.Request.Context(), userID, id)
	if err != nil {
		if errors.Is(err, subscription.ErrSubscriptionExpired) {
			response.FailWithCode(c, http.StatusForbidden, "Your subscription has expired. Renew to continue.", "subscription_expired")
			return
		}
		if errors.Is(err, subscription.ErrSubscriptionRequired) {
			response.FailWithCode(c, http.StatusForbidden, "An active subscription is required for this action.", "subscription_required")
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, http.StatusNotFound, "post or x account not found")
			return
		}
		var rateLimited service.ErrExecuteRateLimited
		if errors.As(err, &rateLimited) {
			response.Fail(c, http.StatusTooManyRequests, rateLimited.Error())
			return
		}
		var upstream service.ErrExecuteUpstream
		if errors.As(err, &upstream) {
			response.Fail(c, http.StatusBadGateway, upstream.Error())
			return
		}
		msg := err.Error()
		if msg == "post cannot be executed in current status" ||
			msg == "x account has no access token; reconnect the account" {
			response.Fail(c, http.StatusBadRequest, msg)
			return
		}
		response.Fail(c, http.StatusInternalServerError, msg)
		return
	}
	response.OK(c, data)
}

func (ctl *PostController) Delete(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseUintParam(c.Param("id"))
	if err != nil || id == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid post id")
		return
	}
	if err := ctl.postService.Delete(userID, id); err != nil {
		if err == gorm.ErrRecordNotFound {
			response.Fail(c, http.StatusNotFound, "post not found")
			return
		}
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, gin.H{})
}

func parseUintParam(s string) (uint, error) {
	v, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(v), nil
}
