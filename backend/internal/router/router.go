package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func newBaseRouter() *gin.Engine {
	r := gin.New()
	r.Use(middleware.Logger(), middleware.Recovery(), middleware.CORS())
	return r
}

func NewAPI(_ *gorm.DB) *gin.Engine {
	r := newBaseRouter()

	h := controller.NewHealthController()
	a := controller.NewAuthController()
	u := controller.NewUserController()
	acc := controller.NewAccountController()
	p := controller.NewPostController()
	ag := controller.NewAgentController()

	r.GET("/health", h.Ping)

	v1 := r.Group("/api/v1")
	RegisterAuth(v1, a)
	RegisterUser(v1, u)
	RegisterAccount(v1, acc)
	RegisterPost(v1, p)
	RegisterAgent(v1, ag)

	return r
}

func NewAdmin(_ *gorm.DB) *gin.Engine {
	r := newBaseRouter()
	h := controller.NewHealthController()
	r.GET("/health", h.Ping)
	r.GET("/admin/health", h.Ping)
	return r
}
