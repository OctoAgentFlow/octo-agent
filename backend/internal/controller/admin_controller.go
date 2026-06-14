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

type AdminController struct {
	adminService *service.AdminService
}

func NewAdminController(adminService *service.AdminService) *AdminController {
	return &AdminController{adminService: adminService}
}

func (ctl *AdminController) Overview(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.Overview(userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) ListUsers(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.AdminUserListQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.ListUsers(userID, query)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) UpdateUser(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetIDValue, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || targetIDValue == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid user id")
		return
	}
	var req dto.AdminUpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.UpdateUser(userID, uint(targetIDValue), req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) ListBillingOrders(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.BillingOrderListQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.ListBillingOrders(userID, query)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) GrossMarginSummary(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.GrossMarginSummary(userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) GrossMarginAlertConfig(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.GrossMarginAlertConfig(userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) UpdateGrossMarginAlertConfig(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.AdminUpdateGrossMarginAlertConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.UpdateGrossMarginAlertConfig(userID, req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) ListGrossMarginAlertEvents(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.AdminGrossMarginAlertEventQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.ListGrossMarginAlertEvents(userID, query)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) AcknowledgeGrossMarginAlertEvent(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	alertIDValue, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || alertIDValue == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid alert id")
		return
	}
	var req dto.AdminAcknowledgeGrossMarginAlertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.AcknowledgeGrossMarginAlertEvent(userID, uint(alertIDValue), req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) UpdateBillingOrderOpsAction(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	orderIDValue, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || orderIDValue == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid order id")
		return
	}
	var req dto.BillingOrderOpsActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.UpdateBillingOrderOpsAction(userID, uint(orderIDValue), req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) TrendFeedbackSummary(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.AdminTrendFeedbackQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.TrendFeedbackSummary(userID, query)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) ApplyTrendRule(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.AdminApplyTrendRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.ApplyTrendRule(userID, req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) ListTrendRules(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.ListTrendRules(userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) UpdateTrendRule(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	ruleIDValue, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || ruleIDValue == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid trend rule id")
		return
	}
	var req dto.AdminUpdateTrendOperationRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.UpdateTrendRule(userID, uint(ruleIDValue), req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) SyncTrendsNow(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.SyncTrendsNow(c.Request.Context(), userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) RefreshExposureNow(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	req := dto.ExposureRefreshNowRequest{Region: c.Query("region")}
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			response.Fail(c, http.StatusBadRequest, err.Error())
			return
		}
	}
	data, err := ctl.adminService.RefreshExposureNow(c.Request.Context(), userID, req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) TrendCacheStatus(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.TrendCacheStatus(userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) TrendTopics(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.TrendTopicQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.TrendTopics(userID, query)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) ListPointActivities(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.ListPointActivities(userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) UpdatePointActivity(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	activityIDValue, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || activityIDValue == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid activity id")
		return
	}
	var req dto.AdminUpdatePointActivityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.UpdatePointActivity(userID, uint(activityIDValue), req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) ListPointUsers(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var query dto.AdminPointUserQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.ListPointUsers(userID, query)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) AdjustUserPoints(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetIDValue, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || targetIDValue == 0 {
		response.Fail(c, http.StatusBadRequest, "invalid user id")
		return
	}
	var req dto.AdminAdjustUserPointsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.AdjustUserPoints(userID, uint(targetIDValue), req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) PointRiskConfig(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.PointRiskConfig(userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) UpdatePointRiskConfig(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.AdminUpdatePointRiskConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.UpdatePointRiskConfig(userID, req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) ListPointRedemptionCodes(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.ListPointRedemptionCodes(userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) CreatePointRedemptionCode(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.AdminCreatePointRedemptionCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	data, err := ctl.adminService.CreatePointRedemptionCode(userID, req)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) ReferralSummary(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.ReferralSummary(userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func (ctl *AdminController) PointCostSummary(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	data, err := ctl.adminService.PointCostSummary(userID)
	if err != nil {
		adminError(c, err)
		return
	}
	response.OK(c, data)
}

func adminError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrAdminForbidden):
		response.Fail(c, http.StatusForbidden, err.Error())
	case errors.Is(err, service.ErrAdminUserNotFound),
		errors.Is(err, service.ErrBillingOrderNotFound):
		response.Fail(c, http.StatusNotFound, err.Error())
	case errors.Is(err, service.ErrAdminInvalidUserRole),
		errors.Is(err, service.ErrAdminInvalidStatus),
		errors.Is(err, service.ErrAdminLastOwner),
		errors.Is(err, service.ErrAdminSelfSuspend):
		response.Fail(c, http.StatusBadRequest, err.Error())
	default:
		response.Fail(c, http.StatusInternalServerError, err.Error())
	}
}
