package middleware

import (
	ginzap "github.com/gin-contrib/zap"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func Recovery() gin.HandlerFunc {
	return ginzap.RecoveryWithZap(zap.L(), true)
}
