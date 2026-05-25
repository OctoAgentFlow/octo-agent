package middleware

import (
	"net/http"
	"runtime/debug"

	"octo-agent/backend/internal/alert"
	"octo-agent/backend/internal/pkg/requestid"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if recovered := recover(); recovered != nil {
				stack := string(debug.Stack())
				requestID := requestid.FromContext(c.Request.Context())
				zap.L().Error("http panic recovered",
					zap.Any("panic", recovered),
					zap.String("request_id", requestID),
					zap.String("method", c.Request.Method),
					zap.String("path", c.Request.URL.Path),
					zap.String("client_ip", c.ClientIP()),
					zap.String("stacktrace", stack))
				alert.Notify(c.Request.Context(), alert.Event{
					Level:     alert.LevelCritical,
					Category:  alert.CategoryHTTP,
					Title:     "HTTP panic recovered",
					Message:   "API request panicked and was recovered.",
					RequestID: requestID,
					Fields: map[string]any{
						"method":    c.Request.Method,
						"path":      c.Request.URL.Path,
						"client_ip": c.ClientIP(),
						"panic":     recovered,
					},
				})
				c.AbortWithStatus(http.StatusInternalServerError)
			}
		}()
		c.Next()
	}
}
