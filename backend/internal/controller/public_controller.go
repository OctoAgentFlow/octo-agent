package controller

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type PublicController struct {
	app               config.AppConfig
	launchPlanService *service.OAFBotLaunchPlanService
	launchPlanLimiter *publicLaunchPlanLimiter
}

func NewPublicController(app config.AppConfig, launchPlanService *service.OAFBotLaunchPlanService) *PublicController {
	return &PublicController{
		app:               app,
		launchPlanService: launchPlanService,
		launchPlanLimiter: newPublicLaunchPlanLimiter(20, time.Hour),
	}
}

func (ctl *PublicController) SiteLinks(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data": dto.SiteLinksResponse{
			OfficialXURL: strings.TrimSpace(ctl.app.OfficialXURL),
			TelegramURL:  strings.TrimSpace(ctl.app.TelegramURL),
		},
	})
}

func (ctl *PublicController) GenerateOAFBotLaunchPlan(c *gin.Context) {
	if ctl.launchPlanService == nil {
		response.FailWithCode(c, http.StatusServiceUnavailable, "launch plan service is not configured", "launch_plan_unavailable")
		return
	}
	var req dto.OAFBotLaunchPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.FailWithCode(c, http.StatusBadRequest, err.Error(), "invalid_launch_plan_request")
		return
	}
	if ctl.launchPlanLimiter != nil && !ctl.launchPlanLimiter.Allow(c.ClientIP()) {
		response.FailWithCode(c, http.StatusTooManyRequests, "too many launch plan requests; please retry later", "launch_plan_rate_limited")
		return
	}
	out, err := ctl.launchPlanService.Generate(c.Request.Context(), req)
	if err != nil {
		response.FailWithCode(c, http.StatusBadGateway, err.Error(), "launch_plan_generation_failed")
		return
	}
	response.OK(c, out)
}

type publicLaunchPlanLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	limit  int
	window time.Duration
}

func newPublicLaunchPlanLimiter(limit int, window time.Duration) *publicLaunchPlanLimiter {
	return &publicLaunchPlanLimiter{
		hits:   map[string][]time.Time{},
		limit:  limit,
		window: window,
	}
}

func (l *publicLaunchPlanLimiter) Allow(key string) bool {
	if l == nil {
		return true
	}
	key = strings.TrimSpace(key)
	if key == "" {
		key = "unknown"
	}
	now := time.Now()
	cutoff := now.Add(-l.window)
	l.mu.Lock()
	defer l.mu.Unlock()
	recent := make([]time.Time, 0, len(l.hits[key])+1)
	for _, hit := range l.hits[key] {
		if hit.After(cutoff) {
			recent = append(recent, hit)
		}
	}
	if len(recent) >= l.limit {
		l.hits[key] = recent
		return false
	}
	recent = append(recent, now)
	l.hits[key] = recent
	return true
}
