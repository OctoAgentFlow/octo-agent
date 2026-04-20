package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterBilling(rg *gin.RouterGroup, c *controller.BillingController) {
	rg.POST("/billing/webhooks/onchain", c.WebhookOnchain)

	g := rg.Group("/billing")
	g.Use(middleware.Auth())
	g.GET("/subscription", c.Subscription)
	g.GET("/plans", c.Plans)
	g.GET("/payment-methods", c.PaymentMethods)
	g.POST("/orders", c.CreateOrder)
	g.GET("/orders/:id", c.GetOrder)
}
