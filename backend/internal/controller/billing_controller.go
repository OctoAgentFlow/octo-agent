package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/response"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type BillingController struct {
	billingService *service.BillingService
}

func NewBillingController(billingService *service.BillingService) *BillingController {
	return &BillingController{billingService: billingService}
}

func (ctl *BillingController) Subscription(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.billingService.Subscription(userID)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *BillingController) Plans(c *gin.Context) {
	response.OK(c, ctl.billingService.Plans())
}

func (ctl *BillingController) PaymentMethods(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	response.OK(c, ctl.billingService.PaymentMethods(userID))
}

func (ctl *BillingController) CreateOrder(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.BillingCreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.billingService.CreateOrder(userID, req)
	if err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *BillingController) GetOrder(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	idStr := c.Param("id")
	oid, err := strconv.ParseUint(strings.TrimSpace(idStr), 10, 64)
	if err != nil || oid == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid order id")
		return
	}
	data, err := ctl.billingService.GetOrder(userID, uint(oid))
	if err != nil {
		if errors.Is(err, service.ErrBillingOrderNotFound) {
			response.Fail(c, http.StatusNotFound, err.Error())
			return
		}
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *BillingController) ConfirmOrder(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	idStr := c.Param("id")
	oid, err := strconv.ParseUint(strings.TrimSpace(idStr), 10, 64)
	if err != nil || oid == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid order id")
		return
	}
	var req dto.BillingConfirmOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.billingService.ConfirmOrderTx(userID, uint(oid), req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrBillingOrderNotFound):
			response.Fail(c, http.StatusNotFound, err.Error())
		case errors.Is(err, service.ErrBillingTxAlreadyUsed):
			response.Fail(c, http.StatusConflict, err.Error())
		case errors.Is(err, service.ErrBillingOrderExpired):
			response.Fail(c, http.StatusGone, err.Error())
		default:
			response.Fail(c, http.StatusBadRequest, err.Error())
		}
		return
	}
	response.OK(c, data)
}

func (ctl *BillingController) ListOrders(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.BillingOrderListQuery
	if err := c.ShouldBindQuery(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.billingService.ListOrders(userID, req)
	if err != nil {
		if errors.Is(err, service.ErrBillingOpsForbidden) {
			response.Fail(c, http.StatusForbidden, err.Error())
			return
		}
		response.Fail(c, http.StatusInternalServerError, err.Error())
		return
	}
	response.OK(c, data)
}

func (ctl *BillingController) UpdateOrderOpsAction(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	idStr := c.Param("id")
	oid, err := strconv.ParseUint(strings.TrimSpace(idStr), 10, 64)
	if err != nil || oid == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid order id")
		return
	}
	var req dto.BillingOrderOpsActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.billingService.UpdateOrderOpsAction(userID, uint(oid), req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrBillingOrderNotFound):
			response.Fail(c, http.StatusNotFound, err.Error())
		case errors.Is(err, service.ErrBillingOpsForbidden):
			response.Fail(c, http.StatusForbidden, err.Error())
		default:
			response.Fail(c, http.StatusBadRequest, err.Error())
		}
		return
	}
	response.OK(c, data)
}

func (ctl *BillingController) ListOrderAudits(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	idStr := c.Param("id")
	oid, err := strconv.ParseUint(strings.TrimSpace(idStr), 10, 64)
	if err != nil || oid == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid order id")
		return
	}
	data, err := ctl.billingService.ListOrderAudits(userID, uint(oid))
	if err != nil {
		switch {
		case errors.Is(err, service.ErrBillingOrderNotFound):
			response.Fail(c, http.StatusNotFound, err.Error())
		case errors.Is(err, service.ErrBillingOpsForbidden):
			response.Fail(c, http.StatusForbidden, err.Error())
		default:
			response.Fail(c, http.StatusBadRequest, err.Error())
		}
		return
	}
	response.OK(c, data)
}

func (ctl *BillingController) WebhookOnchain(c *gin.Context) {
	var req dto.BillingWebhookOnchainRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	secret := c.GetHeader("X-Billing-Webhook-Secret")
	err := ctl.billingService.WebhookOnchain(secret, req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrBillingWebhookForbidden):
			response.Fail(c, http.StatusUnauthorized, err.Error())
		case errors.Is(err, service.ErrBillingOrderNotFound):
			response.Fail(c, http.StatusNotFound, err.Error())
		case errors.Is(err, service.ErrBillingTxAlreadyUsed):
			response.Fail(c, http.StatusConflict, err.Error())
		case errors.Is(err, service.ErrBillingOrderExpired):
			response.Fail(c, http.StatusGone, err.Error())
		default:
			response.Fail(c, http.StatusBadRequest, err.Error())
		}
		return
	}
	response.OK(c, gin.H{"ok": true})
}
