package controller

import (
	"octo-agent/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

type AccountController struct{}

func NewAccountController() *AccountController { return &AccountController{} }

func (ctl *AccountController) List(c *gin.Context) {
	response.OK(c, []gin.H{{"id": 1, "username": "demo_account"}})
}
