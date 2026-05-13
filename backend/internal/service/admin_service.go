package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

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
}

func NewAdminService(db *gorm.DB, cfg *config.Config, userRepo *repository.UserRepository, billingOrderRepo *repository.BillingOrderRepository) *AdminService {
	return &AdminService{
		db:               db,
		cfg:              cfg,
		userRepo:         userRepo,
		billingOrderRepo: billingOrderRepo,
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

func adminBillingOrdersDTO(orders []model.BillingOrder) []dto.BillingOrderListItem {
	items := make([]dto.BillingOrderListItem, 0, len(orders))
	for _, order := range orders {
		item := dto.BillingOrderListItem{
			OrderID:              fmt.Sprintf("%d", order.ID),
			UserID:               order.UserID,
			PlanCode:             order.PlanCode,
			Amount:               order.Amount,
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
