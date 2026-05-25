package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"octo-agent/backend/internal/alert"
	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

var (
	ErrAdminForbidden       = errors.New("admin access forbidden")
	ErrAdminUserNotFound    = errors.New("admin user not found")
	ErrAdminInvalidUserRole = errors.New("invalid user role")
	ErrAdminInvalidStatus   = errors.New("invalid user status")
	ErrAdminLastOwner       = errors.New("cannot remove the last owner")
	ErrAdminSelfSuspend     = errors.New("cannot suspend your own account")
)

type AdminService struct {
	db               *gorm.DB
	cfg              *config.Config
	userRepo         *repository.UserRepository
	billingOrderRepo *repository.BillingOrderRepository
	pointRepo        *repository.PointRepository
}

func NewAdminService(db *gorm.DB, cfg *config.Config, userRepo *repository.UserRepository, billingOrderRepo *repository.BillingOrderRepository) *AdminService {
	return &AdminService{
		db:               db,
		cfg:              cfg,
		userRepo:         userRepo,
		billingOrderRepo: billingOrderRepo,
		pointRepo:        repository.NewPointRepository(db),
	}
}

func (s *AdminService) Overview(operatorID uint) (*dto.AdminOverviewResponse, error) {
	operator, err := s.requireOperator(operatorID)
	if err != nil {
		return nil, err
	}

	billingSummary, err := s.billingOrderRepo.OpsSummary(0, true)
	if err != nil {
		return nil, err
	}
	recentUsers, _, err := s.listUsers(dto.AdminUserListQuery{Page: 1, PageSize: 5})
	if err != nil {
		return nil, err
	}
	recentOrders, _, err := s.billingOrderRepo.List(0, repository.BillingOrderListQuery{Limit: 8, AllUsers: true})
	if err != nil {
		return nil, err
	}
	recentEvents, err := s.recentActivity(8)
	if err != nil {
		return nil, err
	}

	return &dto.AdminOverviewResponse{
		Operator:     adminOperatorDTO(operator),
		Users:        s.userSummary(),
		Billing:      billingOpsSummaryDTO(billingSummary),
		Activity:     s.activitySummary(),
		Content:      s.contentSummary(),
		Config:       s.configSummary(),
		RecentUsers:  recentUsers,
		RecentOrders: adminBillingOrdersDTO(recentOrders),
		RecentEvents: recentEvents,
	}, nil
}

func (s *AdminService) ListUsers(operatorID uint, query dto.AdminUserListQuery) (*dto.AdminUserListResponse, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	items, total, err := s.listUsers(query)
	if err != nil {
		return nil, err
	}
	page, pageSize := adminPagination(query.Page, query.PageSize)
	return &dto.AdminUserListResponse{
		Items: items,
		Pagination: dto.ActivityPagination{
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		},
	}, nil
}

func (s *AdminService) ListBillingOrders(operatorID uint, query dto.BillingOrderListQuery) (*dto.BillingOrderListResponse, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	orders, total, err := s.billingOrderRepo.List(operatorID, repository.BillingOrderListQuery{
		Status:               query.Status,
		ReconciliationStatus: query.ReconciliationStatus,
		ReviewStatus:         query.ReviewStatus,
		AutoScanStatus:       query.AutoScanStatus,
		AutoScanSkipReason:   query.AutoScanSkipReason,
		Limit:                query.Limit,
		AllUsers:             true,
	})
	if err != nil {
		return nil, err
	}
	summary, err := s.billingOrderRepo.OpsSummary(0, true)
	if err != nil {
		return nil, err
	}
	return &dto.BillingOrderListResponse{
		Items:             adminBillingOrdersDTO(orders),
		Total:             total,
		OpsSummary:        billingOpsSummaryDTO(summary),
		Scope:             "all",
		CanOperateBilling: true,
	}, nil
}

func (s *AdminService) GrossMarginSummary(operatorID uint) (*dto.AdminGrossMarginSummaryResponse, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := periodStart.AddDate(0, 1, 0)

	revenueCents, revenueByPlan, err := s.monthlyPaidRevenue(periodStart, periodEnd)
	if err != nil {
		return nil, err
	}
	openAICents, openAIQuantity, err := s.monthlyProviderCost("openai", periodStart, periodEnd)
	if err != nil {
		return nil, err
	}
	xCents, xQuantity, err := s.monthlyProviderCost("x", periodStart, periodEnd)
	if err != nil {
		return nil, err
	}
	pointDiscountPoints, err := s.sumPointLedger("created_at >= ? AND created_at < ? AND event_type = ?", periodStart, periodEnd, "consume")
	if err != nil {
		return nil, err
	}
	pointDiscountCents := pointDiscountPoints * 10
	totalCostCents := openAICents + xCents + pointDiscountCents
	grossProfitCents := revenueCents - totalCostCents
	var grossMarginBps int64
	if revenueCents > 0 {
		grossMarginBps = grossProfitCents * 10000 / revenueCents
	}
	status := "no_revenue"
	if revenueCents > 0 && grossMarginBps >= 5000 {
		status = "healthy"
	} else if revenueCents > 0 {
		status = "below_target"
	}
	costs := []dto.AdminGrossMarginCostItem{
		adminGrossMarginCostItem("openai", openAICents, revenueCents, openAIQuantity, "requests"),
		adminGrossMarginCostItem("x", xCents, revenueCents, xQuantity, "writes"),
		adminGrossMarginCostItem("point_discount", pointDiscountCents, revenueCents, pointDiscountPoints, "points"),
	}
	return &dto.AdminGrossMarginSummaryResponse{
		PeriodStart:      periodStart.Format(time.RFC3339),
		PeriodEnd:        periodEnd.Format(time.RFC3339),
		RevenueAmount:    adminCentsAmountString(revenueCents),
		RevenueCents:     revenueCents,
		TotalCost:        adminCentsAmountString(totalCostCents),
		TotalCostCents:   totalCostCents,
		GrossProfit:      adminCentsAmountString(grossProfitCents),
		GrossProfitCents: grossProfitCents,
		GrossMarginBps:   grossMarginBps,
		TargetBps:        5000,
		Status:           status,
		Costs:            costs,
		RevenueByPlan:    revenueByPlan,
	}, nil
}

func (s *AdminService) monthlyPaidRevenue(periodStart, periodEnd time.Time) (int64, []dto.AdminGrossMarginRevenueItem, error) {
	var orders []model.BillingOrder
	if err := s.db.
		Where("status = ? AND paid_at IS NOT NULL AND paid_at >= ? AND paid_at < ?", "paid", periodStart, periodEnd).
		Find(&orders).Error; err != nil {
		return 0, nil, err
	}
	type planAgg struct {
		orders int64
		cents  int64
	}
	total := int64(0)
	byPlan := make(map[string]planAgg)
	for _, order := range orders {
		cents, err := referralAmountToCents(firstNonEmpty(order.PayableAmount, order.Amount))
		if err != nil {
			return 0, nil, err
		}
		total += cents
		planCode := strings.TrimSpace(order.PlanCode)
		if planCode == "" {
			planCode = "unknown"
		}
		agg := byPlan[planCode]
		agg.orders++
		agg.cents += cents
		byPlan[planCode] = agg
	}
	items := make([]dto.AdminGrossMarginRevenueItem, 0, len(byPlan))
	for planCode, agg := range byPlan {
		items = append(items, dto.AdminGrossMarginRevenueItem{
			PlanCode: planCode,
			Orders:   agg.orders,
			Amount:   adminCentsAmountString(agg.cents),
			Cents:    agg.cents,
		})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Cents == items[j].Cents {
			return items[i].PlanCode < items[j].PlanCode
		}
		return items[i].Cents > items[j].Cents
	})
	return total, items, nil
}

func (s *AdminService) monthlyProviderCost(provider string, periodStart, periodEnd time.Time) (int64, int64, error) {
	type rowData struct {
		Cents    int64
		Quantity int64
	}
	var row rowData
	err := s.db.Model(&model.CostUsageLedger{}).
		Select("COALESCE(SUM(CASE WHEN actual_cost_cents > 0 THEN actual_cost_cents ELSE estimated_cost_cents END), 0) AS cents, COALESCE(SUM(quantity), 0) AS quantity").
		Where("provider = ? AND occurred_at >= ? AND occurred_at < ?", provider, periodStart, periodEnd).
		Scan(&row).Error
	return row.Cents, row.Quantity, err
}

func adminGrossMarginCostItem(key string, cents, revenueCents, quantity int64, unitLabel string) dto.AdminGrossMarginCostItem {
	shareBps := int64(0)
	if revenueCents > 0 {
		shareBps = cents * 10000 / revenueCents
	}
	return dto.AdminGrossMarginCostItem{
		Key:       key,
		Amount:    adminCentsAmountString(cents),
		Cents:     cents,
		ShareBps:  shareBps,
		Quantity:  quantity,
		UnitLabel: unitLabel,
	}
}

func (s *AdminService) UpdateBillingOrderOpsAction(operatorID, orderID uint, req dto.BillingOrderOpsActionRequest) (*dto.BillingOrderDetailResponse, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	action := strings.ToLower(strings.TrimSpace(req.Action))
	note := sanitizeBillingOpsNote(req.OpsNote)
	now := time.Now().UTC()
	updates := map[string]any{}
	if note != "" {
		updates["ops_note"] = note
	}

	switch action {
	case "mark_reviewed":
		updates["review_status"] = billingReviewReviewed
		updates["reviewed_at"] = now
		updates["reconciliation_status"] = billingReconMatched
	case "mark_review_needed":
		updates["review_status"] = billingReviewNeeded
		updates["reconciliation_status"] = billingReconNeedsReview
	default:
		return nil, fmt.Errorf("unsupported billing ops action")
	}

	updated, err := s.billingOrderRepo.UpdateOpsState(operatorID, orderID, action, updates)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBillingOrderNotFound
		}
		return nil, err
	}
	out := orderToDetailDTO(updated)
	if audits, err := s.billingOrderRepo.ListAuditsByOrder(updated.ID, 20); err == nil {
		out.AuditTrail = billingAuditItemsToDTO(audits)
	}
	return out, nil
}

func (s *AdminService) ListPointActivities(operatorID uint) ([]dto.AdminPointActivityItem, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	var rows []model.PointActivity
	if err := s.db.Order("sort_order ASC, id ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]dto.AdminPointActivityItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, adminPointActivityDTO(row))
	}
	return items, nil
}

func (s *AdminService) UpdatePointActivity(operatorID, activityID uint, req dto.AdminUpdatePointActivityRequest) (*dto.AdminPointActivityItem, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	var activity model.PointActivity
	if err := s.db.First(&activity, activityID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAdminUserNotFound
		}
		return nil, err
	}
	if req.Title != nil {
		activity.Title = strings.TrimSpace(*req.Title)
	}
	if req.Description != nil {
		activity.Description = strings.TrimSpace(*req.Description)
	}
	if req.Points != nil {
		if *req.Points <= 0 || *req.Points > 10000 {
			return nil, ErrAdminInvalidStatus
		}
		activity.Points = *req.Points
	}
	if req.ClaimPeriod != nil {
		period := strings.ToLower(strings.TrimSpace(*req.ClaimPeriod))
		if period != "once" && period != "daily" && period != "monthly" {
			return nil, ErrAdminInvalidStatus
		}
		activity.ClaimPeriod = period
	}
	if req.Enabled != nil {
		activity.Enabled = *req.Enabled
	}
	if req.SortOrder != nil {
		activity.SortOrder = *req.SortOrder
	}
	if req.StartsAt != nil {
		startsAt, err := parseOptionalAdminTime(*req.StartsAt)
		if err != nil {
			return nil, ErrAdminInvalidStatus
		}
		activity.StartsAt = startsAt
	}
	if req.EndsAt != nil {
		endsAt, err := parseOptionalAdminTime(*req.EndsAt)
		if err != nil {
			return nil, ErrAdminInvalidStatus
		}
		activity.EndsAt = endsAt
	}
	if err := s.db.Save(&activity).Error; err != nil {
		return nil, err
	}
	item := adminPointActivityDTO(activity)
	return &item, nil
}

func (s *AdminService) ListPointUsers(operatorID uint, query dto.AdminPointUserQuery) (*dto.AdminPointUsersResponse, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	page, pageSize := adminPagination(query.Page, query.PageSize)
	q := s.db.Table("user_point_accounts").
		Select("user_point_accounts.user_id, users.email, users.display_name AS name, user_point_accounts.balance, user_point_accounts.frozen, user_point_accounts.lifetime_earned, user_point_accounts.lifetime_spent, user_point_accounts.updated_at").
		Joins("LEFT JOIN users ON users.id = user_point_accounts.user_id")
	search := strings.TrimSpace(query.Query)
	if search != "" {
		like := "%" + strings.ToLower(search) + "%"
		q = q.Where("LOWER(users.email) LIKE ? OR LOWER(users.display_name) LIKE ? OR CAST(user_point_accounts.user_id AS CHAR) = ?", like, like, search)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}
	type adminPointUserRow struct {
		UserID         uint
		Email          string
		Name           string
		Balance        int64
		Frozen         int64
		LifetimeEarned int64
		LifetimeSpent  int64
		UpdatedAt      time.Time
	}
	var rows []adminPointUserRow
	if err := q.Order("user_point_accounts.updated_at DESC").Limit(pageSize).Offset((page - 1) * pageSize).Scan(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]dto.AdminPointUserItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, dto.AdminPointUserItem{
			UserID:         row.UserID,
			Email:          row.Email,
			Name:           row.Name,
			Balance:        row.Balance,
			Frozen:         row.Frozen,
			LifetimeEarned: row.LifetimeEarned,
			LifetimeSpent:  row.LifetimeSpent,
			UpdatedAt:      row.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}
	return &dto.AdminPointUsersResponse{
		Items: items,
		Pagination: dto.ActivityPagination{
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		},
	}, nil
}

func (s *AdminService) AdjustUserPoints(operatorID, targetID uint, req dto.AdminAdjustUserPointsRequest) (*dto.AdminPointUserItem, error) {
	operator, err := s.requireOperator(operatorID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Reason) == "" || req.Points == 0 {
		return nil, ErrAdminInvalidStatus
	}
	if _, err := s.userRepo.GetByID(targetID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAdminUserNotFound
		}
		return nil, err
	}
	details, _ := json.Marshal(map[string]any{"reason": strings.TrimSpace(req.Reason), "operator_id": operator.ID, "operator_email": operator.Email})
	uniqueKey := fmt.Sprintf("admin_adjust:%d:%d:%d", targetID, operator.ID, time.Now().UTC().UnixNano())
	if err := s.pointRepo.AdjustUserPoints(targetID, req.Points, uniqueKey, string(details)); err != nil {
		return nil, err
	}
	if limits, err := s.pointRepo.RiskLimits(); err == nil && limits.Enabled && limits.LargeAdjustmentAlertThreshold > 0 && absInt64(req.Points) >= limits.LargeAdjustmentAlertThreshold {
		alert.Notify(context.Background(), alert.Event{
			Level:    alert.LevelWarning,
			Category: alert.CategoryBilling,
			Title:    "Large manual point adjustment",
			Message:  "An admin manually adjusted user points beyond the configured alert threshold.",
			UserID:   targetID,
			Fields: map[string]any{
				"operator_id":       operator.ID,
				"operator_email":    operator.Email,
				"adjust_points":     req.Points,
				"threshold":         limits.LargeAdjustmentAlertThreshold,
				"adjustment_reason": strings.TrimSpace(req.Reason),
			},
		})
	}
	users, err := s.ListPointUsers(operatorID, dto.AdminPointUserQuery{Query: fmt.Sprintf("%d", targetID), Page: 1, PageSize: 1})
	if err != nil {
		return nil, err
	}
	for _, item := range users.Items {
		if item.UserID == targetID {
			return &item, nil
		}
	}
	return &dto.AdminPointUserItem{UserID: targetID}, nil
}

func (s *AdminService) PointRiskConfig(operatorID uint) (*dto.AdminPointRiskConfigData, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	cfg, err := s.getOrCreatePointRiskConfig()
	if err != nil {
		return nil, err
	}
	out := adminPointRiskConfigDTO(*cfg)
	return &out, nil
}

func (s *AdminService) UpdatePointRiskConfig(operatorID uint, req dto.AdminUpdatePointRiskConfigRequest) (*dto.AdminPointRiskConfigData, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	cfg, err := s.getOrCreatePointRiskConfig()
	if err != nil {
		return nil, err
	}
	if req.Enabled != nil {
		cfg.Enabled = *req.Enabled
	}
	if req.DailyEarnLimit != nil {
		if *req.DailyEarnLimit < 0 || *req.DailyEarnLimit > 1000000 {
			return nil, ErrAdminInvalidStatus
		}
		cfg.DailyEarnLimit = *req.DailyEarnLimit
	}
	if req.MonthlyDiscountLimit != nil {
		if *req.MonthlyDiscountLimit < 0 || *req.MonthlyDiscountLimit > 1000000 {
			return nil, ErrAdminInvalidStatus
		}
		cfg.MonthlyDiscountLimit = *req.MonthlyDiscountLimit
	}
	if req.LargeAdjustmentAlertThreshold != nil {
		if *req.LargeAdjustmentAlertThreshold < 0 || *req.LargeAdjustmentAlertThreshold > 1000000 {
			return nil, ErrAdminInvalidStatus
		}
		cfg.LargeAdjustmentAlertThreshold = *req.LargeAdjustmentAlertThreshold
	}
	if req.PointExpiryDays != nil {
		if *req.PointExpiryDays < 0 || *req.PointExpiryDays > 3650 {
			return nil, ErrAdminInvalidStatus
		}
		cfg.PointExpiryDays = *req.PointExpiryDays
	}
	if err := s.db.Save(cfg).Error; err != nil {
		return nil, err
	}
	out := adminPointRiskConfigDTO(*cfg)
	return &out, nil
}

func (s *AdminService) ListPointRedemptionCodes(operatorID uint) ([]dto.AdminPointRedemptionCodeItem, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	rows, err := s.pointRepo.RedemptionCodes()
	if err != nil {
		return nil, err
	}
	items := make([]dto.AdminPointRedemptionCodeItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, adminPointRedemptionCodeDTO(row))
	}
	return items, nil
}

func (s *AdminService) CreatePointRedemptionCode(operatorID uint, req dto.AdminCreatePointRedemptionCodeRequest) (*dto.AdminPointRedemptionCodeItem, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" || strings.TrimSpace(req.Title) == "" || req.Points <= 0 || req.Points > 10000 || req.MaxUses < 0 {
		return nil, ErrAdminInvalidStatus
	}
	startsAt, err := parseOptionalAdminTime(req.StartsAt)
	if err != nil {
		return nil, ErrAdminInvalidStatus
	}
	endsAt, err := parseOptionalAdminTime(req.EndsAt)
	if err != nil {
		return nil, ErrAdminInvalidStatus
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	perUserUses := req.PerUserUses
	if perUserUses <= 0 {
		perUserUses = 1
	}
	row := &model.PointRedemptionCode{
		Code:        code,
		Title:       strings.TrimSpace(req.Title),
		Points:      req.Points,
		MaxUses:     req.MaxUses,
		PerUserUses: perUserUses,
		Enabled:     enabled,
		StartsAt:    startsAt,
		EndsAt:      endsAt,
	}
	if err := s.pointRepo.CreateRedemptionCode(row); err != nil {
		return nil, err
	}
	item := adminPointRedemptionCodeDTO(*row)
	return &item, nil
}

func (s *AdminService) ReferralSummary(operatorID uint) (*dto.AdminReferralSummaryResponse, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	var out dto.AdminReferralSummaryResponse
	if err := s.db.Model(&model.ReferralInvite{}).Count(&out.InviteCodes).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&model.ReferralRecord{}).Count(&out.ReferralSignups).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&model.ReferralRecord{}).Where("first_purchase_rewarded_at IS NOT NULL").Count(&out.FirstPurchaseRewards).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&model.PointLedgerEntry{}).
		Select("COALESCE(SUM(points), 0)").
		Where("event_type = ? AND activity_code IN ?", "earn", []string{"referral_signup_inviter", "referral_signup_invitee"}).
		Scan(&out.SignupRewardPoints).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&model.PointLedgerEntry{}).
		Select("COALESCE(SUM(points), 0)").
		Where("event_type = ? AND activity_code = ?", "earn", "referral_first_purchase").
		Scan(&out.PurchaseRewardPoints).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *AdminService) PointCostSummary(operatorID uint) (*dto.AdminPointCostSummaryResponse, error) {
	if _, err := s.requireOperator(operatorID); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := periodStart.AddDate(0, 1, 0)

	earned, err := s.sumPointLedger("created_at >= ? AND created_at < ? AND ((event_type = ?) OR (event_type = ? AND points > 0))", periodStart, periodEnd, "earn", "adjust")
	if err != nil {
		return nil, err
	}
	discounted, err := s.sumPointLedger("created_at >= ? AND created_at < ? AND event_type = ?", periodStart, periodEnd, "consume")
	if err != nil {
		return nil, err
	}
	expired, err := s.sumPointLedger("created_at >= ? AND created_at < ? AND event_type = ?", periodStart, periodEnd, "expire")
	if err != nil {
		return nil, err
	}
	var outstanding int64
	if err := s.db.Model(&model.UserPointAccount{}).
		Select("COALESCE(SUM(balance + frozen), 0)").
		Scan(&outstanding).Error; err != nil {
		return nil, err
	}
	sources, err := s.monthlyPointSources(periodStart, periodEnd)
	if err != nil {
		return nil, err
	}
	return &dto.AdminPointCostSummaryResponse{
		PeriodStart:           periodStart.Format(time.RFC3339),
		PeriodEnd:             periodEnd.Format(time.RFC3339),
		PointsPerUSDT:         referralRewardPointsPerUSDT,
		EarnedPoints:          earned,
		EarnedUSDT:            pointUSDTAmount(earned),
		DiscountedPoints:      discounted,
		DiscountedUSDT:        pointUSDTAmount(discounted),
		ExpiredPoints:         expired,
		ExpiredUSDT:           pointUSDTAmount(expired),
		OutstandingPoints:     outstanding,
		OutstandingUSDT:       pointUSDTAmount(outstanding),
		MonthlyEarnedBySource: sources,
	}, nil
}

func (s *AdminService) sumPointLedger(where string, args ...any) (int64, error) {
	var total int64
	err := s.db.Model(&model.PointLedgerEntry{}).
		Select("COALESCE(SUM(points), 0)").
		Where(where, args...).
		Scan(&total).Error
	return total, err
}

func (s *AdminService) monthlyPointSources(periodStart, periodEnd time.Time) ([]dto.AdminPointCostSourceItem, error) {
	type sourceRow struct {
		ActivityCode string
		Points       int64
	}
	var rows []sourceRow
	if err := s.db.Model(&model.PointLedgerEntry{}).
		Select("COALESCE(NULLIF(activity_code, ''), 'activity') AS activity_code, COALESCE(SUM(points), 0) AS points").
		Where("created_at >= ? AND created_at < ? AND event_type = ?", periodStart, periodEnd, "earn").
		Group("COALESCE(NULLIF(activity_code, ''), 'activity')").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	sourcePoints := make(map[string]int64)
	for _, row := range rows {
		sourcePoints[adminPointCostSource(row.ActivityCode)] += row.Points
	}
	var adjustments int64
	if err := s.db.Model(&model.PointLedgerEntry{}).
		Select("COALESCE(SUM(points), 0)").
		Where("created_at >= ? AND created_at < ? AND event_type = ? AND points > 0", periodStart, periodEnd, "adjust").
		Scan(&adjustments).Error; err != nil {
		return nil, err
	}
	if adjustments > 0 {
		sourcePoints["manual_adjustment"] += adjustments
	}
	order := []string{"referral", "redemption", "activity", "manual_adjustment", "other"}
	items := make([]dto.AdminPointCostSourceItem, 0, len(sourcePoints))
	for _, source := range order {
		points := sourcePoints[source]
		if points <= 0 {
			continue
		}
		items = append(items, dto.AdminPointCostSourceItem{Source: source, Points: points, USDTAmount: pointUSDTAmount(points)})
	}
	return items, nil
}

func adminPointCostSource(activityCode string) string {
	code := strings.ToLower(strings.TrimSpace(activityCode))
	switch {
	case strings.HasPrefix(code, "referral_"):
		return "referral"
	case code == "redemption_code":
		return "redemption"
	default:
		return "activity"
	}
}

func pointUSDTAmount(points int64) string {
	if points <= 0 {
		return "0"
	}
	return centsToAmountString(points * 10)
}

func adminCentsAmountString(cents int64) string {
	if cents < 0 {
		return "-" + centsToAmountString(-cents)
	}
	return centsToAmountString(cents)
}

func (s *AdminService) UpdateUser(operatorID, targetID uint, req dto.AdminUpdateUserRequest) (*dto.AdminUserListItem, error) {
	operator, err := s.requireOperator(operatorID)
	if err != nil {
		return nil, err
	}
	target, err := s.userRepo.GetByID(targetID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAdminUserNotFound
	}
	if err != nil {
		return nil, err
	}

	if req.Role != nil {
		if !isOwner(operator.Role) {
			return nil, ErrAdminForbidden
		}
		nextRole := strings.ToLower(strings.TrimSpace(*req.Role))
		if !isAdminRole(nextRole) {
			return nil, ErrAdminInvalidUserRole
		}
		if isOwner(target.Role) && nextRole != "owner" {
			owners, err := s.count(&model.User{}, "role = ?", "owner")
			if err != nil {
				return nil, err
			}
			if owners <= 1 {
				return nil, ErrAdminLastOwner
			}
		}
		target.Role = nextRole
	}

	if req.Status != nil {
		nextStatus := strings.ToLower(strings.TrimSpace(*req.Status))
		if nextStatus != "active" && nextStatus != "suspended" {
			return nil, ErrAdminInvalidStatus
		}
		if target.ID == operator.ID && nextStatus == "suspended" {
			return nil, ErrAdminSelfSuspend
		}
		target.Status = nextStatus
	}

	if err := s.userRepo.Save(target); err != nil {
		return nil, err
	}
	item := adminUserDTO(*target)
	return &item, nil
}

func (s *AdminService) requireOperator(userID uint) (*model.User, error) {
	user, err := s.userRepo.GetByID(userID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAdminForbidden
	}
	if err != nil {
		return nil, err
	}
	if !isOperatorRole(user.Role) || strings.ToLower(strings.TrimSpace(user.Status)) != "active" {
		return nil, ErrAdminForbidden
	}
	return user, nil
}

func (s *AdminService) listUsers(query dto.AdminUserListQuery) ([]dto.AdminUserListItem, int64, error) {
	page, pageSize := adminPagination(query.Page, query.PageSize)
	q := s.db.Model(&model.User{})
	search := strings.TrimSpace(query.Query)
	if search != "" {
		like := "%" + strings.ToLower(search) + "%"
		q = q.Where("LOWER(email) LIKE ? OR LOWER(display_name) LIKE ?", like, like)
	}
	if role := strings.ToLower(strings.TrimSpace(query.Role)); role != "" && role != "all" {
		if !isAdminRole(role) {
			return nil, 0, ErrAdminInvalidUserRole
		}
		q = q.Where("role = ?", role)
	}
	if status := strings.ToLower(strings.TrimSpace(query.Status)); status != "" && status != "all" {
		if status != "active" && status != "suspended" {
			return nil, 0, ErrAdminInvalidStatus
		}
		q = q.Where("status = ?", status)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var users []model.User
	if err := q.Order("id DESC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&users).Error; err != nil {
		return nil, 0, err
	}
	items := make([]dto.AdminUserListItem, 0, len(users))
	for _, user := range users {
		items = append(items, adminUserDTO(user))
	}
	return items, total, nil
}

func (s *AdminService) userSummary() dto.AdminUserSummary {
	return dto.AdminUserSummary{
		Total:                s.mustCount(&model.User{}),
		Active:               s.mustCount(&model.User{}, "status = ?", "active"),
		Suspended:            s.mustCount(&model.User{}, "status = ?", "suspended"),
		Owners:               s.mustCount(&model.User{}, "role = ?", "owner"),
		Admins:               s.mustCount(&model.User{}, "role = ?", "admin"),
		ActiveSubscriptions:  s.mustCount(&model.User{}, "subscription_status = ?", "active"),
		ExpiredSubscriptions: s.mustCount(&model.User{}, "subscription_status = ?", "expired"),
	}
}

func (s *AdminService) activitySummary() dto.AdminActivitySummary {
	since := time.Now().UTC().Add(-24 * time.Hour)
	return dto.AdminActivitySummary{
		Last24h: s.mustCount(&model.ActivityLog{}, "executed_at >= ?", since),
		Success: s.mustCount(&model.ActivityLog{}, "executed_at >= ? AND status = ?", since, "success"),
		Failed:  s.mustCount(&model.ActivityLog{}, "executed_at >= ? AND status = ?", since, "failed"),
		Review:  s.mustCount(&model.ActivityLog{}, "executed_at >= ? AND status = ?", since, "review"),
	}
}

func (s *AdminService) contentSummary() dto.AdminContentSummary {
	return dto.AdminContentSummary{
		ConnectedAccounts:  s.mustCount(&model.TwitterAccount{}, "status = ?", "connected"),
		Posts:              s.mustCount(&model.Post{}),
		ScheduledPosts:     s.mustCount(&model.Post{}, "status = ?", "scheduled"),
		PublishedPosts:     s.mustCount(&model.Post{}, "status = ?", "published"),
		FailedPosts:        s.mustCount(&model.Post{}, "status = ?", "failed"),
		EnabledAutomations: s.mustCount(&model.AutomationConfig{}, "enabled = ?", true),
		PausedAutomations:  s.mustCount(&model.AutomationConfig{}, "enabled = ?", false),
	}
}

func (s *AdminService) configSummary() dto.AdminConfigSummary {
	return dto.AdminConfigSummary{
		EmailProvider:      strings.ToLower(strings.TrimSpace(s.cfg.Email.Provider)),
		ResendConfigured:   strings.TrimSpace(s.cfg.Email.Resend.APIKey) != "",
		XOAuthConfigured:   strings.TrimSpace(s.cfg.XOAuth.ClientID) != "" && strings.TrimSpace(s.cfg.XOAuth.RedirectURI) != "",
		BillingMethodCount: len(s.cfg.Billing.PaymentMethods),
		FrontendBaseURL:    strings.TrimSpace(s.cfg.App.FrontendBaseURL),
	}
}

func (s *AdminService) recentActivity(limit int) ([]dto.AdminActivityListItem, error) {
	if limit <= 0 || limit > 50 {
		limit = 8
	}
	var rows []model.ActivityLog
	if err := s.db.Order("executed_at DESC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]dto.AdminActivityListItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, dto.AdminActivityListItem{
			ID:            row.ID,
			UserID:        row.UserID,
			XAccountID:    row.XAccountID,
			Type:          row.Type,
			Status:        row.Status,
			PreviewKey:    row.PreviewKey,
			AccountHandle: row.AccountHandle,
			ExecutedAt:    row.ExecutedAt.UTC().Format(time.RFC3339),
			ErrorMessage:  row.ErrorMessage,
		})
	}
	return items, nil
}

func (s *AdminService) count(modelValue any, where ...any) (int64, error) {
	q := s.db.Model(modelValue)
	if len(where) > 0 {
		clause, ok := where[0].(string)
		if !ok {
			return 0, fmt.Errorf("invalid count clause")
		}
		q = q.Where(clause, where[1:]...)
	}
	var n int64
	err := q.Count(&n).Error
	return n, err
}

func (s *AdminService) mustCount(modelValue any, where ...any) int64 {
	n, err := s.count(modelValue, where...)
	if err != nil {
		return 0
	}
	return n
}

func adminPagination(page, pageSize int) (int, int) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

func isOperatorRole(role string) bool {
	role = strings.ToLower(strings.TrimSpace(role))
	return role == "owner" || role == "admin"
}

func isOwner(role string) bool {
	return strings.ToLower(strings.TrimSpace(role)) == "owner"
}

func isAdminRole(role string) bool {
	role = strings.ToLower(strings.TrimSpace(role))
	return role == "user" || role == "admin" || role == "owner"
}

func adminOperatorDTO(user *model.User) dto.AdminOperatorData {
	return dto.AdminOperatorData{
		ID:    user.ID,
		Email: user.Email,
		Name:  user.Name,
		Role:  user.Role,
	}
}

func adminUserDTO(user model.User) dto.AdminUserListItem {
	item := dto.AdminUserListItem{
		ID:                   user.ID,
		Email:                user.Email,
		Name:                 user.Name,
		Status:               user.Status,
		Role:                 user.Role,
		SubscriptionPlanCode: user.SubscriptionPlanCode,
		SubscriptionStatus:   user.SubscriptionStatus,
		CreatedAt:            user.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:            user.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if user.SubscriptionExpiresAt != nil {
		item.SubscriptionExpiresAt = user.SubscriptionExpiresAt.UTC().Format(time.RFC3339)
	}
	return item
}

func billingOpsSummaryDTO(summary repository.BillingOrderOpsSummary) dto.BillingOrderOpsSummary {
	return dto.BillingOrderOpsSummary{
		Total:        summary.Total,
		Pending:      summary.Pending,
		Paid:         summary.Paid,
		Failed:       summary.Failed,
		Expired:      summary.Expired,
		Unchecked:    summary.Unchecked,
		Matched:      summary.Matched,
		Mismatch:     summary.Mismatch,
		NeedsReview:  summary.NeedsReview,
		ReviewNeeded: summary.ReviewNeeded,
		Reviewed:     summary.Reviewed,
	}
}

func adminPointActivityDTO(activity model.PointActivity) dto.AdminPointActivityItem {
	item := dto.AdminPointActivityItem{
		ID:          activity.ID,
		Code:        activity.Code,
		Title:       activity.Title,
		Description: activity.Description,
		Points:      activity.Points,
		ClaimPeriod: activity.ClaimPeriod,
		Enabled:     activity.Enabled,
		SortOrder:   activity.SortOrder,
		UpdatedAt:   activity.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if activity.StartsAt != nil {
		item.StartsAt = activity.StartsAt.UTC().Format(time.RFC3339)
	}
	if activity.EndsAt != nil {
		item.EndsAt = activity.EndsAt.UTC().Format(time.RFC3339)
	}
	return item
}

func adminPointRiskConfigDTO(cfg model.PointRiskConfig) dto.AdminPointRiskConfigData {
	return dto.AdminPointRiskConfigData{
		Enabled:                       cfg.Enabled,
		DailyEarnLimit:                cfg.DailyEarnLimit,
		MonthlyDiscountLimit:          cfg.MonthlyDiscountLimit,
		LargeAdjustmentAlertThreshold: cfg.LargeAdjustmentAlertThreshold,
		PointExpiryDays:               cfg.PointExpiryDays,
		UpdatedAt:                     cfg.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func adminPointRedemptionCodeDTO(row model.PointRedemptionCode) dto.AdminPointRedemptionCodeItem {
	item := dto.AdminPointRedemptionCodeItem{
		ID:          row.ID,
		Code:        row.Code,
		Title:       row.Title,
		Points:      row.Points,
		MaxUses:     row.MaxUses,
		UsedCount:   row.UsedCount,
		PerUserUses: row.PerUserUses,
		Enabled:     row.Enabled,
		UpdatedAt:   row.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if row.StartsAt != nil {
		item.StartsAt = row.StartsAt.UTC().Format(time.RFC3339)
	}
	if row.EndsAt != nil {
		item.EndsAt = row.EndsAt.UTC().Format(time.RFC3339)
	}
	return item
}

func (s *AdminService) getOrCreatePointRiskConfig() (*model.PointRiskConfig, error) {
	var cfg model.PointRiskConfig
	err := s.db.Where("code = ?", "default").First(&cfg).Error
	if err == nil {
		return &cfg, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	cfg = model.PointRiskConfig{
		Code:                          "default",
		DailyEarnLimit:                100,
		MonthlyDiscountLimit:          1000,
		LargeAdjustmentAlertThreshold: 200,
		PointExpiryDays:               365,
		Enabled:                       true,
	}
	if err := s.db.Create(&cfg).Error; err != nil {
		return nil, err
	}
	return &cfg, nil
}

func absInt64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}

func parseOptionalAdminTime(value string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil, err
	}
	t = t.UTC()
	return &t, nil
}

func adminBillingOrdersDTO(orders []model.BillingOrder) []dto.BillingOrderListItem {
	items := make([]dto.BillingOrderListItem, 0, len(orders))
	for _, order := range orders {
		item := dto.BillingOrderListItem{
			OrderID:              fmt.Sprintf("%d", order.ID),
			UserID:               order.UserID,
			PlanCode:             order.PlanCode,
			Amount:               order.Amount,
			OriginalAmount:       order.OriginalAmount,
			CreditAmount:         order.CreditAmount,
			PayableAmount:        firstNonEmpty(order.PayableAmount, order.Amount),
			OrderType:            firstNonEmpty(order.OrderType, "new"),
			Currency:             order.Currency,
			Method:               order.Method,
			Network:              order.Network,
			Status:               order.Status,
			TxHash:               order.TxHash,
			CreatedAt:            order.CreatedAt.UTC().Format(time.RFC3339),
			ExpiredAt:            order.ExpiredAt.UTC().Format(time.RFC3339),
			FailureReason:        order.FailureReason,
			ReconciliationStatus: withDefault(order.ReconciliationStatus, "unchecked"),
			ReviewStatus:         withDefault(order.ReviewStatus, "unreviewed"),
			AutoScanStatus:       firstNonEmpty(order.AutoScanStatus, "pending"),
			AutoScanSkipReason:   order.AutoScanSkipReason,
			OpsNote:              order.OpsNote,
			CanRetry:             order.Status == "failed" && time.Now().UTC().Before(order.ExpiredAt),
			NextAction:           adminBillingNextAction(order),
		}
		if order.PaidAt != nil {
			item.PaidAt = order.PaidAt.UTC().Format(time.RFC3339)
		}
		if order.LastCheckedAt != nil {
			item.LastCheckedAt = order.LastCheckedAt.UTC().Format(time.RFC3339)
		}
		if order.AutoScannedAt != nil {
			item.AutoScannedAt = order.AutoScannedAt.UTC().Format(time.RFC3339)
		}
		if order.ReviewedAt != nil {
			item.ReviewedAt = order.ReviewedAt.UTC().Format(time.RFC3339)
		}
		items = append(items, item)
	}
	return items
}

func adminBillingNextAction(order model.BillingOrder) string {
	if order.Status == "pending" {
		return "wait_for_payment"
	}
	if order.ReviewStatus == "review_needed" || order.ReconciliationStatus == "needs_review" || order.ReconciliationStatus == "mismatch" {
		return "ops_review"
	}
	return ""
}

func withDefault(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}
