package middleware

import (
	"net/http"
	"strconv"
	"strings"

	appjwt "octo-agent/backend/internal/pkg/jwt"
	"octo-agent/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authorization := c.GetHeader("Authorization")
		if !strings.HasPrefix(strings.ToLower(authorization), "bearer ") {
			response.Fail(c, http.StatusUnauthorized, "missing bearer token")
			c.Abort()
			return
		}
		token := strings.TrimSpace(authorization[len("Bearer "):])
		claims, err := appjwt.ParseAccessToken(token)
		if err != nil {
			response.Fail(c, http.StatusUnauthorized, "invalid token")
			c.Abort()
			return
		}
		c.Set("user_id", strconv.FormatUint(uint64(claims.UserID), 10))
		c.Next()
	}
}
