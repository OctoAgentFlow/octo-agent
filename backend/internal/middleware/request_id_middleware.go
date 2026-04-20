package middleware

import (
	"crypto/rand"
	"encoding/hex"

	"octo-agent/backend/internal/pkg/requestid"

	"github.com/gin-gonic/gin"
)

const RequestIDKey = "request_id"
const RequestIDHeader = "X-Request-ID"

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader(RequestIDHeader)
		if requestID == "" {
			requestID = generateRequestID()
		}

		c.Set(RequestIDKey, requestID)
		c.Request = c.Request.WithContext(requestid.NewContext(c.Request.Context(), requestID))
		c.Header(RequestIDHeader, requestID)
		c.Next()
	}
}

func generateRequestID() string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return "req_fallback"
	}
	return "req_" + hex.EncodeToString(buf)
}
