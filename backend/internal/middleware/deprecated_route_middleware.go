package middleware

import (
	"net/http"
	"os"
	"strings"
	"time"

	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func DeprecatedRoute(feature, replacement string) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Header("Deprecation", "true")
		c.Header("X-Octo-Deprecated-Route", feature)
		if replacement != "" {
			c.Header("X-Octo-Replacement-Route", replacement)
		}

		c.Next()

		zap.L().Warn("deprecated api route used",
			zap.String("request_id", requestid.FromContext(c.Request.Context())),
			zap.String("feature", feature),
			zap.String("replacement", replacement),
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.String("full_path", c.FullPath()),
			zap.String("user_id", c.GetString("user_id")),
			zap.Int("status", c.Writer.Status()),
			zap.String("client_ip", c.ClientIP()),
			zap.String("user_agent", c.Request.UserAgent()),
			zap.Duration("latency", time.Since(start)),
		)
	}
}

func ProtectedLegacyAutomationRoute(feature, replacement string) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Header("Deprecation", "true")
		c.Header("X-Octo-Deprecated-Route", feature)
		if replacement != "" {
			c.Header("X-Octo-Replacement-Route", replacement)
		}

		if legacyAutomationRoutesAllowed() {
			c.Next()
			logLegacyAutomationRoute(c, feature, replacement, false, start)
			return
		}

		c.Header("X-Octo-Legacy-Route-Blocked", "true")
		response.FailWithCode(
			c,
			http.StatusGone,
			"This legacy automation API is disabled. Use the manual Exposure Radar, Content Draft, and Handling List workflow instead.",
			"legacy_automation_route_disabled",
		)
		c.Abort()
		logLegacyAutomationRoute(c, feature, replacement, true, start)
	}
}

func legacyAutomationRoutesAllowed() bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv("OCTO_ALLOW_LEGACY_AUTOMATION_ROUTES")))
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func logLegacyAutomationRoute(c *gin.Context, feature, replacement string, blocked bool, start time.Time) {
	zap.L().Warn("legacy automation api route used",
		zap.String("request_id", requestid.FromContext(c.Request.Context())),
		zap.String("feature", feature),
		zap.String("replacement", replacement),
		zap.Bool("blocked", blocked),
		zap.String("method", c.Request.Method),
		zap.String("path", c.Request.URL.Path),
		zap.String("full_path", c.FullPath()),
		zap.String("user_id", c.GetString("user_id")),
		zap.Int("status", c.Writer.Status()),
		zap.String("client_ip", c.ClientIP()),
		zap.String("user_agent", c.Request.UserAgent()),
		zap.Duration("latency", time.Since(start)),
	)
}
