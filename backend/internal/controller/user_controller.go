package controller

import (
	"octo-agent/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

type UserController struct{}

func NewUserController() *UserController { return &UserController{} }

func (ctl *UserController) Me(c *gin.Context) {
	response.OK(c, gin.H{"id": 1, "name": "demo"})
}
