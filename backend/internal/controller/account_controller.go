package controller

import (
	"net/http"
	"strconv"
	"strings"

	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type AccountController struct {
	accountService  *service.AccountService
	frontendBaseURL string
}

func NewAccountController(accountService *service.AccountService, frontendBaseURL string) *AccountController {
	return &AccountController{
		accountService:  accountService,
		frontendBaseURL: strings.TrimSpace(frontendBaseURL),
	}
}

func (ctl *AccountController) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.accountService.List(userID)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *AccountController) StartXOAuth(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	reqID := requestid.FromContext(c.Request.Context())
	zap.L().Info("x oauth: start endpoint",
		zap.String("request_id", reqID),
		zap.Uint("user_id", userID),
	)
	data, err := ctl.accountService.StartXOAuth(c.Request.Context(), userID)
	if err != nil {
		zap.L().Warn("x oauth: start failed",
			zap.String("request_id", reqID),
			zap.Uint("user_id", userID),
			zap.Error(err),
		)
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	zap.L().Info("x oauth: start ok",
		zap.String("request_id", reqID),
		zap.Uint("user_id", userID),
		zap.Int("auth_url_len", len(data.AuthURL)),
	)
	response.OK(c, data)
}

func (ctl *AccountController) XOAuthCallback(c *gin.Context) {
	code := strings.TrimSpace(c.Query("code"))
	state := strings.TrimSpace(c.Query("state"))
	reqID := requestid.FromContext(c.Request.Context())
	if code == "" || state == "" {
		zap.L().Warn("x oauth: callback missing query params",
			zap.String("request_id", reqID),
			zap.Bool("has_code", code != ""),
			zap.Bool("has_state", state != ""),
		)
		response.Fail(c, http.StatusBadRequest, "code and state are required")
		return
	}
	zap.L().Info("x oauth: callback received",
		zap.String("request_id", reqID),
		zap.Int("code_len", len(code)),
		zap.Int("state_len", len(state)),
	)
	userID, err := ctl.accountService.HandleXOAuthCallback(c.Request.Context(), code, state)
	if err != nil {
		zap.L().Warn("x oauth: callback handler error",
			zap.String("request_id", reqID),
			zap.Error(err),
		)
		c.Redirect(http.StatusFound, ctl.oauthResultRedirect("failed"))
		return
	}
	zap.L().Info("x oauth: callback success, redirecting",
		zap.String("request_id", reqID),
		zap.Uint("user_id", userID),
	)
	c.Redirect(http.StatusFound, ctl.oauthResultRedirect("success"))
}

func (ctl *AccountController) Delete(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	accountID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || accountID == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid account id")
		return
	}
	if err := ctl.accountService.Delete(userID, uint(accountID)); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, gin.H{})
}

func (ctl *AccountController) oauthResultRedirect(status string) string {
	base := strings.TrimRight(ctl.frontendBaseURL, "/")
	if base == "" {
		base = "http://localhost:3000"
	}
	return base + "/accounts?oauth=" + status
}
