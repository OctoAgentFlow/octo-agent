package middleware

import (
	"time"

	"octo-agent/backend/internal/pkg/requestid"

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
