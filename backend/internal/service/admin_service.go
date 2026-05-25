package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	if err := s.db.Save(cfg).Error; err != nil {
		return nil, err
	}
	out := adminPointRiskConfigDTO(*cfg)
	return &out, nil
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
		UpdatedAt:                     cfg.UpdatedAt.UTC().Format(time.RFC3339),
	}
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
