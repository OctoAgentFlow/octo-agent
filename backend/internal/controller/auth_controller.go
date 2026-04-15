package controller

import (
	"octo-agent/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

type AuthController struct{}

func NewAuthController() *AuthController { return &AuthController{} }

func (ctl *AuthController) Login(c *gin.Context) {
	response.OK(c, gin.H{"token": "demo-token"})
}
