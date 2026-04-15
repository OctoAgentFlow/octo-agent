package controller

import (
	"octo-agent/backend/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

type PostController struct{}

func NewPostController() *PostController { return &PostController{} }

func (ctl *PostController) List(c *gin.Context) {
	response.OK(c, []gin.H{{"id": 1, "content": "hello"}})
}
