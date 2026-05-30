package router

import (
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterAdmin(rg *gin.RouterGroup, c *controller.AdminController) {
	g := rg.Group("/admin")
	g.Use(middleware.Auth())
	g.GET("/overview", c.Overview)
	g.GET("/users", c.ListUsers)
	g.PATCH("/users/:id", c.UpdateUser)
	g.GET("/billing/orders", c.ListBillingOrders)
	g.GET("/billing/gross-margin", c.GrossMarginSummary)
	g.GET("/billing/gross-margin/alert-config", c.GrossMarginAlertConfig)
	g.PATCH("/billing/gross-margin/alert-config", c.UpdateGrossMarginAlertConfig)
	g.GET("/billing/gross-margin/alerts", c.ListGrossMarginAlertEvents)
	g.POST("/billing/gross-margin/alerts/:id/acknowledge", c.AcknowledgeGrossMarginAlertEvent)
	g.POST("/billing/orders/:id/ops-action", c.UpdateBillingOrderOpsAction)
	g.GET("/trends/feedback-summary", c.TrendFeedbackSummary)
	g.POST("/trends/rules/apply", c.ApplyTrendRule)
	g.GET("/trends/rules", c.ListTrendRules)
	g.PATCH("/trends/rules/:id", c.UpdateTrendRule)
	g.GET("/trends/cache-status", c.TrendCacheStatus)
	g.GET("/trends/topics", c.TrendTopics)
	g.POST("/trends/sync-now", c.SyncTrendsNow)
	g.GET("/points/activities", c.ListPointActivities)
	g.PATCH("/points/activities/:id", c.UpdatePointActivity)
	g.GET("/points/users", c.ListPointUsers)
	g.POST("/points/users/:id/adjust", c.AdjustUserPoints)
	g.GET("/points/risk-config", c.PointRiskConfig)
	g.PATCH("/points/risk-config", c.UpdatePointRiskConfig)
	g.GET("/points/redemption-codes", c.ListPointRedemptionCodes)
	g.POST("/points/redemption-codes", c.CreatePointRedemptionCode)
	g.GET("/points/referral-summary", c.ReferralSummary)
	g.GET("/points/cost-summary", c.PointCostSummary)
}
