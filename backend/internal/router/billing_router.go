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
	g.GET("/orders", c.ListOrders)
	g.GET("/orders/:id", c.GetOrder)
	g.POST("/orders/:id/confirm", c.ConfirmOrder)
	g.POST("/orders/:id/ops-action", c.UpdateOrderOpsAction)
	g.GET("/orders/:id/audits", c.ListOrderAudits)
}
