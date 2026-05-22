package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"octo-agent/backend/internal/billingevm"
	"octo-agent/backend/internal/billingtron"
	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/billingamount"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"github.com/ethereum/go-ethereum/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type BillingService struct {
	userRepo    *repository.UserRepository
	orderRepo   *repository.BillingOrderRepository
	accountRepo *repository.TwitterAccountRepository
	oafBotRepo  *repository.OAFBotRepository
	usageRepo   *repository.AIGenerationUsageRepository
	cfg         *config.Config
}

const (
	billingReconUnchecked   = "unchecked"
	billingReconMatched     = "matched"
	billingReconMismatch    = "mismatch"
	billingReconNeedsReview = "needs_review"

	billingReviewUnreviewed = "unreviewed"
	billingReviewNeeded     = "review_needed"
	billingReviewReviewed   = "reviewed"
)

type billingQuoteCalc struct {
	dto                dto.BillingUpgradeQuote
	targetPlan         subscription.PlanDefinition
	currentPlan        subscription.PlanDefinition
	hasCurrentPlan     bool
	originalCents      int64
	creditCents        int64
	payableCents       int64
	targetCycle        string
	currentCycle       string
	currentPeriodStart time.Time
	currentPeriodEnd   time.Time
}

func NewBillingService(userRepo *repository.UserRepository, orderRepo *repository.BillingOrderRepository, accountRepo *repository.TwitterAccountRepository, oafBotRepo *repository.OAFBotRepository, usageRepo *repository.AIGenerationUsageRepository, cfg *config.Config) *BillingService {
	return &BillingService{userRepo: userRepo, orderRepo: orderRepo, accountRepo: accountRepo, oafBotRepo: oafBotRepo, usageRepo: usageRepo, cfg: cfg}
}

func (s *BillingService) Subscription(userID uint) (*dto.BillingSubscriptionData, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	st := subscription.EffectiveStatus(user, now)
	pc := strings.TrimSpace(user.SubscriptionPlanCode)
	if pc == "" {
		pc = subscription.PlanFreeTrial
	}
	normPlan := subscription.NormalizePlanCode(pc)
	cycle := subscription.NormalizeBillingCycle(user.SubscriptionBillingCycle)
	if strings.TrimSpace(user.SubscriptionBillingCycle) == "" {
		cycle = deriveBillingCycleFromPlanCode(pc)
	}
	var expStr string
	if user.SubscriptionExpiresAt != nil {
		expStr = user.SubscriptionExpiresAt.In(time.UTC).Format("2006-01-02")
	}
	trialLeft := subscription.TrialDaysLeft(user, now)
	hint := ""
	if st == "expired" {
		hint = "Renew your subscription to restore automation and posting."
	} else if strings.EqualFold(normPlan, subscription.PlanFreeTrial) {
		hint = "Basic plan starts at 8 USDT / month"
	}
	limits := subscription.LimitsForUser(user)
	usage := s.subscriptionUsage(userID)
	return &dto.BillingSubscriptionData{
		Plan:           normPlan,
		BillingCycle:   cycle,
		Status:         st,
		ExpirationDate: expStr,
		TrialDaysLeft:  trialLeft,
		BillingHint:    hint,
		Limits:         planLimitsToDTO(limits),
		Usage:          usage,
	}, nil
}

func (s *BillingService) Plans() *dto.BillingPlansResponse {
	catalog := subscription.Catalog()
	items := make([]dto.BillingPlanData, 0, len(catalog))
	for _, p := range catalog {
		if full, ok := subscription.FindPlan(p.Code); ok {
			p = full
		}
		items = append(items, dto.BillingPlanData{
			Code:         p.Code,
			Name:         p.Name,
			Price:        fmt.Sprintf("%d %s", p.MonthlyPrice, p.Currency),
			Period:       "month",
			MonthlyPrice: p.MonthlyPrice,
			YearlyPrice:  p.YearlyPrice,
			Currency:     p.Currency,
			Audience:     p.Audience,
			Badge:        p.Badge,
			Description:  p.Description,
			Features:     p.Benefits,
			FeatureFlags: planFeaturesToDTO(p.Features),
			Limits:       planLimitsToDTO(p.Limits),
			Highlight:    p.Code == subscription.PlanPlus,
		})
	}
	return &dto.BillingPlansResponse{Items: items}
}

func (s *BillingService) PaymentMethods(_ uint) *dto.BillingPaymentMethodsResponse {
	out := make([]dto.BillingPaymentMethodItem, 0, len(s.cfg.Billing.PaymentMethods))
	for _, pm := range s.cfg.Billing.PaymentMethods {
		out = append(out, dto.BillingPaymentMethodItem{
			Method:          pm.Method,
			Network:         strings.ToUpper(strings.TrimSpace(pm.Network)),
			TokenAddress:    pm.TokenAddress,
			ReceiverAddress: pm.ReceiverAddress,
			Decimals:        pm.Decimals,
			ChainID:         pm.ChainID,
			IsDefault:       pm.IsDefault,
			Note:            pm.Note,
		})
	}
	return &dto.BillingPaymentMethodsResponse{Items: out}
}

func (s *BillingService) Quote(userID uint, req dto.BillingQuoteRequest) (*dto.BillingUpgradeQuote, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	quote, err := calculateBillingQuote(user, req.PlanCode, req.BillingCycle, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	return &quote.dto, nil
}

func (s *BillingService) subscriptionUsage(userID uint) dto.PlanUsageData {
	var usage dto.PlanUsageData
	if s.oafBotRepo != nil {
		if n, err := s.oafBotRepo.CountByUserID(userID); err == nil {
			usage.OAFBots = n
		}
	}
	if s.accountRepo != nil {
		if n, err := s.accountRepo.CountByUserID(userID); err == nil {
			usage.TwitterAccounts = n
		}
	}
	usage.AIGenerationsMonth = currentAIGenerationUsage(s.usageRepo, userID, time.Now().UTC())
	return usage
}

func calculateBillingQuote(user *model.User, targetPlanCode, targetBillingCycle string, now time.Time) (billingQuoteCalc, error) {
	targetPlan, ok := subscription.FindPlan(targetPlanCode)
	if !ok {
		return billingQuoteCalc{}, fmt.Errorf("unknown plan_code")
	}
	targetCycle := subscription.NormalizeBillingCycle(targetBillingCycle)
	originalCents := int64(subscription.PriceForCycle(targetPlan, targetCycle)) * 100
	out := billingQuoteCalc{
		targetPlan:    targetPlan,
		originalCents: originalCents,
		payableCents:  originalCents,
		targetCycle:   targetCycle,
		currentCycle:  subscription.BillingCycleMonthly,
	}
	quote := dto.BillingUpgradeQuote{
		CurrentPlan:         subscription.PlanFreeTrial,
		CurrentBillingCycle: subscription.BillingCycleMonthly,
		TargetPlan:          targetPlan.Code,
		TargetBillingCycle:  targetCycle,
		OriginalAmount:      centsToAmountString(originalCents),
		CreditAmount:        "0",
		PayableAmount:       centsToAmountString(originalCents),
		Currency:            targetPlan.Currency,
		OrderType:           "new",
		IsUpgrade:           false,
		QuoteExpiresAt:      now.Add(5 * time.Minute).UTC().Format(time.RFC3339),
	}
	if user == nil {
		out.dto = quote
		return out, nil
	}
	currentStatus := subscription.EffectiveStatus(user, now)
	currentPlanCode := subscription.NormalizePlanCode(user.SubscriptionPlanCode)
	if strings.TrimSpace(currentPlanCode) == "" {
		currentPlanCode = subscription.PlanFreeTrial
	}
	currentCycle := subscription.NormalizeBillingCycle(user.SubscriptionBillingCycle)
	if strings.TrimSpace(user.SubscriptionBillingCycle) == "" {
		currentCycle = deriveBillingCycleFromPlanCode(user.SubscriptionPlanCode)
	}
	out.currentCycle = currentCycle
	quote.CurrentPlan = currentPlanCode
	quote.CurrentBillingCycle = currentCycle
	if user.SubscriptionExpiresAt != nil {
		quote.CurrentExpiresAt = user.SubscriptionExpiresAt.UTC().Format(time.RFC3339)
	}

	if currentStatus != "active" || user.SubscriptionExpiresAt == nil || !now.Before(*user.SubscriptionExpiresAt) || currentPlanCode == subscription.PlanFreeTrial {
		out.dto = quote
		return out, nil
	}

	currentPlan, ok := subscription.FindPlan(currentPlanCode)
	if !ok {
		out.dto = quote
		return out, nil
	}
	out.currentPlan = currentPlan
	out.hasCurrentPlan = true

	currentRank := billingPlanRank(currentPlan.Code)
	targetRank := billingPlanRank(targetPlan.Code)
	if targetRank < currentRank {
		return billingQuoteCalc{}, fmt.Errorf("downgrade_not_supported")
	}
	if currentCycle == subscription.BillingCycleYearly && targetCycle == subscription.BillingCycleMonthly && targetRank > currentRank {
		return billingQuoteCalc{}, fmt.Errorf("yearly_subscription_can_only_upgrade_to_yearly")
	}
	if targetRank == currentRank {
		quote.OrderType = "renew"
		out.dto = quote
		return out, nil
	}

	start, end := subscriptionPeriodBounds(user, currentCycle)
	if !now.Before(end) || !start.Before(end) {
		out.dto = quote
		return out, nil
	}
	totalSeconds := int64(end.Sub(start).Seconds())
	remainingSeconds := int64(end.Sub(now).Seconds())
	if totalSeconds <= 0 || remainingSeconds <= 0 {
		out.dto = quote
		return out, nil
	}
	currentCents := int64(subscription.PriceForCycle(currentPlan, currentCycle)) * 100
	creditCents := (currentCents*remainingSeconds + totalSeconds/2) / totalSeconds
	if creditCents < 0 {
		creditCents = 0
	}
	if creditCents >= originalCents {
		creditCents = originalCents - 1
	}
	payableCents := originalCents - creditCents
	quote.OrderType = "upgrade"
	quote.IsUpgrade = true
	quote.CreditAmount = centsToAmountString(creditCents)
	quote.PayableAmount = centsToAmountString(payableCents)
	out.creditCents = creditCents
	out.payableCents = payableCents
	out.currentPeriodStart = start
	out.currentPeriodEnd = end
	out.dto = quote
	return out, nil
}

func billingPlanRank(plan string) int {
	switch subscription.NormalizePlanCode(plan) {
	case subscription.PlanBasic:
		return 1
	case subscription.PlanPlus:
		return 2
	case subscription.PlanPro:
		return 3
	case subscription.PlanProPlus:
		return 4
	default:
		return 0
	}
}

func subscriptionPeriodBounds(user *model.User, cycle string) (time.Time, time.Time) {
	if user == nil || user.SubscriptionExpiresAt == nil {
		now := time.Now().UTC()
		return now, now
	}
	end := user.SubscriptionExpiresAt.UTC()
	if user.SubscriptionStartedAt != nil && user.SubscriptionStartedAt.Before(end) {
		return user.SubscriptionStartedAt.UTC(), end
	}
	if subscription.NormalizeBillingCycle(cycle) == subscription.BillingCycleYearly {
		return end.AddDate(-1, 0, 0), end
	}
	return end.AddDate(0, -1, 0), end
}

func centsToAmountString(cents int64) string {
	if cents <= 0 {
		return "0"
	}
	whole := cents / 100
	frac := cents % 100
	if frac == 0 {
		return strconv.FormatInt(whole, 10)
	}
	return fmt.Sprintf("%d.%02d", whole, frac)
}

func amountStringFromMinUnits(units *big.Int, decimals int) string {
	if units == nil || units.Sign() <= 0 {
		return "0"
	}
	if decimals <= 0 {
		return units.String()
	}
	scale := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil)
	whole := new(big.Int)
	frac := new(big.Int)
	whole.QuoRem(units, scale, frac)
	fracStr := frac.String()
	if len(fracStr) < decimals {
		fracStr = strings.Repeat("0", decimals-len(fracStr)) + fracStr
	}
	fracStr = strings.TrimRight(fracStr, "0")
	if fracStr == "" {
		return whole.String()
	}
	return whole.String() + "." + fracStr
}

func billingUniqueAmountPrecision(decimals int) int {
	if decimals <= 0 {
		return 0
	}
	if decimals < 6 {
		return decimals
	}
	return 6
}

func (s *BillingService) uniquePendingOrderAmount(baseAmount string, pm *config.PaymentMethodConfig, now time.Time) (string, error) {
	if s == nil || s.orderRepo == nil || s.orderRepo.DB == nil || pm == nil {
		return baseAmount, nil
	}
	precision := billingUniqueAmountPrecision(pm.Decimals)
	if precision <= 0 {
		return baseAmount, nil
	}
	baseUnits, err := billingamount.ToMinUnits(baseAmount, pm.Decimals)
	if err != nil {
		return "", err
	}
	unitStep := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(pm.Decimals-precision)), nil)
	maxSuffix := int64(999999)
	if precision < 6 {
		maxSuffix = 1
		for i := 0; i < precision; i++ {
			maxSuffix *= 10
		}
		maxSuffix--
	}
	statuses := []string{"pending", "failed"}
	network := strings.ToUpper(strings.TrimSpace(pm.Network))
	receiver := strings.TrimSpace(pm.ReceiverAddress)
	token := strings.TrimSpace(pm.TokenAddress)
	for suffix := int64(1); suffix <= maxSuffix; suffix++ {
		offset := new(big.Int).Mul(big.NewInt(suffix), unitStep)
		candidateUnits := new(big.Int).Add(baseUnits, offset)
		candidate := amountStringFromMinUnits(candidateUnits, pm.Decimals)
		var count int64
		err := s.orderRepo.DB.Model(&model.BillingOrder{}).
			Where("status IN ? AND expired_at > ? AND network = ? AND receiver_address = ? AND token_address = ? AND amount = ?", statuses, now, network, receiver, token, candidate).
			Count(&count).Error
		if err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("no unique payment amount available")
}

func billingProrationSnapshot(q billingQuoteCalc) string {
	payload := map[string]any{
		"current_plan":          q.dto.CurrentPlan,
		"current_billing_cycle": q.dto.CurrentBillingCycle,
		"target_plan":           q.dto.TargetPlan,
		"target_billing_cycle":  q.dto.TargetBillingCycle,
		"original_amount":       q.dto.OriginalAmount,
		"credit_amount":         q.dto.CreditAmount,
		"payable_amount":        q.dto.PayableAmount,
		"order_type":            q.dto.OrderType,
		"is_upgrade":            q.dto.IsUpgrade,
		"current_expires_at":    q.dto.CurrentExpiresAt,
	}
	if !q.currentPeriodStart.IsZero() {
		payload["current_period_start"] = q.currentPeriodStart.UTC().Format(time.RFC3339)
	}
	if !q.currentPeriodEnd.IsZero() {
		payload["current_period_end"] = q.currentPeriodEnd.UTC().Format(time.RFC3339)
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	return string(b)
}

// CreateOrder creates a pending on-chain USDT order for the given plan and network.
func (s *BillingService) CreateOrder(userID uint, req dto.BillingCreateOrderRequest) (*dto.BillingCreateOrderResponse, error) {
	now := time.Now().UTC()
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	quote, err := calculateBillingQuote(user, req.PlanCode, req.BillingCycle, now)
	if err != nil {
		return nil, err
	}
	plan := quote.targetPlan
	cycle := quote.targetCycle
	if !strings.EqualFold(strings.TrimSpace(req.Method), "USDT") {
		return nil, fmt.Errorf("unsupported method")
	}
	pm := s.findPaymentMethod(req.Method, req.Network)
	if pm == nil {
		return nil, fmt.Errorf("unsupported network or payment method combination")
	}
	if pm.Decimals <= 0 {
		return nil, fmt.Errorf("invalid payment method decimals in config")
	}
	basePayableAmount := centsToAmountString(quote.payableCents)
	exactPayableAmount, err := s.uniquePendingOrderAmount(basePayableAmount, pm, now)
	if err != nil {
		return nil, err
	}
	quote.dto.PayableAmount = exactPayableAmount

	ttl := s.cfg.Billing.OrderTTLMinutes
	if ttl <= 0 {
		ttl = 30
	}
	exp := now.Add(time.Duration(ttl) * time.Minute)

	o := &model.BillingOrder{
		UserID:               userID,
		PlanCode:             plan.Code,
		BillingCycle:         cycle,
		Amount:               exactPayableAmount,
		OriginalAmount:       centsToAmountString(quote.originalCents),
		CreditAmount:         centsToAmountString(quote.creditCents),
		PayableAmount:        exactPayableAmount,
		OrderType:            quote.dto.OrderType,
		FromPlanCode:         quote.dto.CurrentPlan,
		FromBillingCycle:     quote.dto.CurrentBillingCycle,
		ProrationSnapshot:    billingProrationSnapshot(quote),
		Currency:             plan.Currency,
		Method:               strings.ToUpper(strings.TrimSpace(req.Method)),
		Network:              strings.ToUpper(strings.TrimSpace(pm.Network)),
		TokenAddress:         strings.TrimSpace(pm.TokenAddress),
		ReceiverAddress:      strings.TrimSpace(pm.ReceiverAddress),
		Status:               "pending",
		ExpiredAt:            exp,
		ChainID:              pm.ChainID,
		TokenDecimals:        pm.Decimals,
		ReconciliationStatus: billingReconUnchecked,
		ReviewStatus:         billingReviewUnreviewed,
	}
	if o.Currency == "" {
		o.Currency = "USDT"
	}
	if err := s.orderRepo.Create(o); err != nil {
		return nil, err
	}
	return &dto.BillingCreateOrderResponse{
		OrderID:         strconv.FormatUint(uint64(o.ID), 10),
		Amount:          o.Amount,
		Currency:        o.Currency,
		Network:         o.Network,
		TokenAddress:    o.TokenAddress,
		ReceiverAddress: o.ReceiverAddress,
		ExpiredAt:       o.ExpiredAt.UTC().Format(time.RFC3339),
		Status:          o.Status,
		Quote:           &quote.dto,
	}, nil
}

// GetOrder returns one order for the authenticated user (polling).
func (s *BillingService) GetOrder(userID, orderID uint) (*dto.BillingOrderDetailResponse, error) {
	now := time.Now().UTC()
	if err := s.orderRepo.ExpireStaleByUserAndID(userID, orderID, now); err != nil {
		return nil, err
	}
	o, err := s.orderRepo.GetByUserAndID(userID, orderID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBillingOrderNotFound
		}
		return nil, err
	}
	return orderToDetailDTO(o), nil
}

func (s *BillingService) ListOrders(userID uint, req dto.BillingOrderListQuery) (*dto.BillingOrderListResponse, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	canOperate := canOperateBilling(user)
	scope := "own"
	allUsers := strings.EqualFold(strings.TrimSpace(req.Scope), "all")
	if allUsers {
		if !canOperate {
			return nil, ErrBillingOpsForbidden
		}
		scope = "all"
	}
	now := time.Now().UTC()
	if allUsers {
		if err := s.orderRepo.ExpireStale(now); err != nil {
			return nil, err
		}
	} else if err := s.orderRepo.ExpireStaleByUser(userID, now); err != nil {
		return nil, err
	}
	orders, total, err := s.orderRepo.List(userID, repository.BillingOrderListQuery{
		Status:               req.Status,
		ReconciliationStatus: req.ReconciliationStatus,
		ReviewStatus:         req.ReviewStatus,
		Limit:                req.Limit,
		AllUsers:             allUsers,
	})
	if err != nil {
		return nil, err
	}
	summary, err := s.orderRepo.OpsSummary(userID, allUsers)
	if err != nil {
		return nil, err
	}
	items := make([]dto.BillingOrderListItem, 0, len(orders))
	for i := range orders {
		item := orderToListItemDTO(&orders[i])
		if canOperate {
			if audits, err := s.orderRepo.ListAuditsByOrder(orders[i].ID, 1); err == nil && len(audits) > 0 {
				item.LastAuditAction = audits[0].Action
				item.LastAuditAt = audits[0].CreatedAt.UTC().Format(time.RFC3339)
				item.LastAuditOperatorID = audits[0].OperatorUserID
			}
		}
		items = append(items, item)
	}
	return &dto.BillingOrderListResponse{
		Items:             items,
		Total:             total,
		OpsSummary:        orderOpsSummaryToDTO(summary),
		Scope:             scope,
		CanOperateBilling: canOperate,
	}, nil
}

func orderToDetailDTO(o *model.BillingOrder) *dto.BillingOrderDetailResponse {
	out := &dto.BillingOrderDetailResponse{
		OrderID:              strconv.FormatUint(uint64(o.ID), 10),
		UserID:               o.UserID,
		Amount:               o.Amount,
		OriginalAmount:       o.OriginalAmount,
		CreditAmount:         o.CreditAmount,
		PayableAmount:        firstNonEmpty(o.PayableAmount, o.Amount),
		OrderType:            firstNonEmpty(o.OrderType, "new"),
		Currency:             o.Currency,
		Network:              o.Network,
		TokenAddress:         o.TokenAddress,
		ReceiverAddress:      o.ReceiverAddress,
		ChainID:              o.ChainID,
		ExpiredAt:            o.ExpiredAt.UTC().Format(time.RFC3339),
		Status:               o.Status,
		TxHash:               o.TxHash,
		FailureReason:        o.FailureReason,
		CanRetry:             canRetryBillingOrder(o, time.Now().UTC()),
		NextAction:           billingOrderNextAction(o, time.Now().UTC()),
		ReconciliationStatus: billingOrderReconStatus(o),
		ReviewStatus:         billingOrderReviewStatus(o),
		OpsNote:              o.OpsNote,
	}
	if o.PaidAt != nil {
		s := o.PaidAt.UTC().Format(time.RFC3339)
		out.PaidAt = s
	}
	if o.LastCheckedAt != nil {
		out.LastCheckedAt = o.LastCheckedAt.UTC().Format(time.RFC3339)
	}
	if o.ReviewedAt != nil {
		out.ReviewedAt = o.ReviewedAt.UTC().Format(time.RFC3339)
	}
	return out
}

func orderToListItemDTO(o *model.BillingOrder) dto.BillingOrderListItem {
	out := dto.BillingOrderListItem{
		OrderID:              strconv.FormatUint(uint64(o.ID), 10),
		UserID:               o.UserID,
		PlanCode:             subscription.NormalizePlanCode(o.PlanCode),
		BillingCycle:         normalizeOrderBillingCycle(o),
		Amount:               o.Amount,
		OriginalAmount:       o.OriginalAmount,
		CreditAmount:         o.CreditAmount,
		PayableAmount:        firstNonEmpty(o.PayableAmount, o.Amount),
		OrderType:            firstNonEmpty(o.OrderType, "new"),
		Currency:             o.Currency,
		Method:               o.Method,
		Network:              o.Network,
		Status:               o.Status,
		TxHash:               o.TxHash,
		CreatedAt:            o.CreatedAt.UTC().Format(time.RFC3339),
		ExpiredAt:            o.ExpiredAt.UTC().Format(time.RFC3339),
		FailureReason:        o.FailureReason,
		CanRetry:             canRetryBillingOrder(o, time.Now().UTC()),
		NextAction:           billingOrderNextAction(o, time.Now().UTC()),
		ReconciliationStatus: billingOrderReconStatus(o),
		ReviewStatus:         billingOrderReviewStatus(o),
		OpsNote:              o.OpsNote,
	}
	if o.PaidAt != nil {
		out.PaidAt = o.PaidAt.UTC().Format(time.RFC3339)
	}
	if o.LastCheckedAt != nil {
		out.LastCheckedAt = o.LastCheckedAt.UTC().Format(time.RFC3339)
	}
	if o.ReviewedAt != nil {
		out.ReviewedAt = o.ReviewedAt.UTC().Format(time.RFC3339)
	}
	return out
}

func orderOpsSummaryToDTO(s repository.BillingOrderOpsSummary) dto.BillingOrderOpsSummary {
	return dto.BillingOrderOpsSummary{
		Total:        s.Total,
		Pending:      s.Pending,
		Paid:         s.Paid,
		Failed:       s.Failed,
		Expired:      s.Expired,
		Unchecked:    s.Unchecked,
		Matched:      s.Matched,
		Mismatch:     s.Mismatch,
		NeedsReview:  s.NeedsReview,
		ReviewNeeded: s.ReviewNeeded,
		Reviewed:     s.Reviewed,
	}
}

func billingOrderReconStatus(o *model.BillingOrder) string {
	if o == nil || strings.TrimSpace(o.ReconciliationStatus) == "" {
		return billingReconUnchecked
	}
	return strings.ToLower(strings.TrimSpace(o.ReconciliationStatus))
}

func billingOrderReviewStatus(o *model.BillingOrder) string {
	if o == nil || strings.TrimSpace(o.ReviewStatus) == "" {
		return billingReviewUnreviewed
	}
	return strings.ToLower(strings.TrimSpace(o.ReviewStatus))
}

func canRetryBillingOrder(o *model.BillingOrder, now time.Time) bool {
	if o == nil {
		return false
	}
	st := strings.ToLower(strings.TrimSpace(o.Status))
	if st == "pending" && billingOrderReviewStatus(o) == billingReviewNeeded && strings.TrimSpace(o.TxHash) != "" {
		return false
	}
	return (st == "pending" || st == "failed") && now.Before(o.ExpiredAt)
}

func billingOrderNextAction(o *model.BillingOrder, now time.Time) string {
	if o == nil {
		return ""
	}
	st := strings.ToLower(strings.TrimSpace(o.Status))
	switch {
	case st == "paid":
		return "subscription_active"
	case st == "expired" || now.After(o.ExpiredAt):
		return "create_new_order"
	case st == "failed":
		return "submit_correct_tx_hash"
	case st == "pending" && billingOrderReviewStatus(o) == billingReviewNeeded && strings.TrimSpace(o.TxHash) != "":
		return "manual_review_pending"
	case st == "pending":
		return "submit_tx_hash_or_wait"
	default:
		return "contact_support"
	}
}

func (s *BillingService) findPaymentMethod(method, network string) *config.PaymentMethodConfig {
	m := strings.ToUpper(strings.TrimSpace(method))
	n := strings.ToUpper(strings.TrimSpace(network))
	for i := range s.cfg.Billing.PaymentMethods {
		pm := &s.cfg.Billing.PaymentMethods[i]
		if strings.ToUpper(strings.TrimSpace(pm.Method)) != m {
			continue
		}
		if strings.ToUpper(strings.TrimSpace(pm.Network)) != n {
			continue
		}
		return pm
	}
	return nil
}

// ConfirmOrderTx lets the authenticated user recover a pending/failed order when webhook delivery is missed.
func (s *BillingService) ConfirmOrderTx(userID, orderID uint, req dto.BillingConfirmOrderRequest) (*dto.BillingOrderDetailResponse, error) {
	if err := s.orderRepo.ExpireStaleByUserAndID(userID, orderID, time.Now().UTC()); err != nil {
		return nil, err
	}
	order, err := s.orderRepo.GetByUserAndID(userID, orderID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBillingOrderNotFound
		}
		return nil, err
	}

	normHash, err := normalizeEVMTxHash(req.TxHash)
	if err != nil {
		return nil, err
	}
	if err := s.confirmOnchainOrder(order, order.Network, normHash, true); err != nil {
		return nil, err
	}
	if err := s.orderRepo.ExpireStaleByUserAndID(userID, orderID, time.Now().UTC()); err != nil {
		return nil, err
	}
	updated, err := s.orderRepo.GetByUserAndID(userID, orderID)
	if err != nil {
		return nil, err
	}
	return orderToDetailDTO(updated), nil
}

func (s *BillingService) UpdateOrderOpsAction(userID, orderID uint, req dto.BillingOrderOpsActionRequest) (*dto.BillingOrderDetailResponse, error) {
	operator, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	if !canOperateBilling(operator) {
		return nil, ErrBillingOpsForbidden
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

	updated, err := s.orderRepo.UpdateOpsState(userID, orderID, action, updates)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBillingOrderNotFound
		}
		return nil, err
	}
	out := orderToDetailDTO(updated)
	if audits, err := s.orderRepo.ListAuditsByOrder(updated.ID, 20); err == nil {
		out.AuditTrail = billingAuditItemsToDTO(audits)
	}
	return out, nil
}

func (s *BillingService) ListOrderAudits(userID, orderID uint) (*dto.BillingOrderAuditListResponse, error) {
	operator, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	if !canOperateBilling(operator) {
		return nil, ErrBillingOpsForbidden
	}
	if _, err := s.orderRepo.GetByID(orderID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBillingOrderNotFound
		}
		return nil, err
	}
	rows, err := s.orderRepo.ListAuditsByOrder(orderID, 50)
	if err != nil {
		return nil, err
	}
	return &dto.BillingOrderAuditListResponse{Items: billingAuditItemsToDTO(rows)}, nil
}

// WebhookOnchain confirms payment from chain. Amount and receiver are enforced by VerifyERC20Transfer (ERC20 Transfer log).
func (s *BillingService) WebhookOnchain(webhookSecretHeader string, req dto.BillingWebhookOnchainRequest) error {
	secret := strings.TrimSpace(s.cfg.Billing.WebhookSecret)
	if secret != "" && webhookSecretHeader != secret {
		return ErrBillingWebhookForbidden
	}

	net := strings.ToUpper(strings.TrimSpace(req.Network))
	if net == "" {
		return fmt.Errorf("network is required")
	}

	orderID, err := strconv.ParseUint(strings.TrimSpace(req.OrderID), 10, 64)
	if err != nil || orderID == 0 {
		return fmt.Errorf("invalid order_id")
	}

	normHash, err := normalizeEVMTxHash(req.TxHash)
	if err != nil {
		return err
	}

	if err := s.orderRepo.ExpireStaleByID(uint(orderID), time.Now().UTC()); err != nil {
		return err
	}
	order, err := s.orderRepo.GetByID(uint(orderID))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrBillingOrderNotFound
		}
		return err
	}
	return s.confirmOnchainOrder(order, net, normHash, false)
}

func (s *BillingService) confirmOnchainOrder(order *model.BillingOrder, net, normHash string, markFailure bool) error {
	if strings.ToUpper(strings.TrimSpace(order.Network)) != net {
		return fmt.Errorf("network does not match order")
	}

	now := time.Now().UTC()
	if order.Status == "paid" {
		return nil
	}
	if order.Status == "expired" {
		return ErrBillingOrderExpired
	}
	if order.Status != "pending" && order.Status != "failed" {
		return fmt.Errorf("order not pending")
	}
	if now.After(order.ExpiredAt) {
		_ = s.orderRepo.ExpireStaleByID(order.ID, now)
		return ErrBillingOrderExpired
	}

	var conflict int64
	s.orderRepo.DB.Model(&model.BillingChainTx{}).
		Where("chain_id = ? AND tx_hash = ? AND order_id <> ?", order.ChainID, normHash, order.ID).
		Count(&conflict)
	if conflict > 0 {
		return ErrBillingTxAlreadyUsed
	}

	rpcKey := fmt.Sprintf("%d", order.ChainID)
	rpcURL := s.cfg.Billing.RpcURLs[rpcKey]
	if rpcURL == "" {
		return fmt.Errorf("no rpc_urls configured for chain_id %s", rpcKey)
	}

	expected, err := billingamount.ToMinUnits(order.Amount, order.TokenDecimals)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	var verifyErr error
	if isTRONPaymentNetwork(order.Network) {
		verifyErr = billingtron.VerifyTRC20Transfer(ctx, rpcURL, billingtron.VerifyParams{
			TxHash:          normHash,
			TokenAddress:    order.TokenAddress,
			ReceiverAddress: order.ReceiverAddress,
			ExpectedMinUnit: expected,
			ExpectedChainID: big.NewInt(order.ChainID),
		})
	} else {
		txHash := common.HexToHash(normHash)
		verifyErr = billingevm.VerifyERC20Transfer(ctx, rpcURL, billingevm.VerifyParams{
			TxHash:          txHash,
			TokenAddress:    order.TokenAddress,
			ReceiverAddress: order.ReceiverAddress,
			ExpectedMinUnit: expected,
			ExpectedChainID: big.NewInt(order.ChainID),
		})
	}
	if verifyErr != nil {
		if markFailure {
			_ = s.orderRepo.MarkFailed(order.ID, normHash, sanitizeBillingFailureReason(fmt.Sprintf("transfer verification failed: %v", verifyErr)), time.Now().UTC())
		}
		return fmt.Errorf("transfer verification failed: %w", verifyErr)
	}

	return s.orderRepo.DB.Transaction(func(tx *gorm.DB) error {
		var ord model.BillingOrder
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&ord, order.ID).Error; err != nil {
			return err
		}
		if ord.Status == "paid" {
			return nil
		}
		if ord.Status != "pending" && ord.Status != "failed" {
			return fmt.Errorf("order not pending")
		}
		tnow := time.Now().UTC()
		if tnow.After(ord.ExpiredAt) {
			_ = tx.Model(&model.BillingOrder{}).Where("id = ?", ord.ID).Updates(map[string]any{
				"status":                "expired",
				"failure_reason":        "order expired before payment confirmation",
				"last_checked_at":       tnow,
				"reconciliation_status": billingReconNeedsReview,
				"review_status":         billingReviewNeeded,
				"ops_note":              "Order expired before payment confirmation.",
			})
			return ErrBillingOrderExpired
		}

		var other int64
		tx.Model(&model.BillingChainTx{}).Where("chain_id = ? AND tx_hash = ? AND order_id <> ?", ord.ChainID, normHash, ord.ID).Count(&other)
		if other > 0 {
			return ErrBillingTxAlreadyUsed
		}

		rec := model.BillingChainTx{ChainID: ord.ChainID, TxHash: normHash, OrderID: ord.ID}
		if err := tx.Create(&rec).Error; err != nil {
			var ex model.BillingChainTx
			if err2 := tx.Where("chain_id = ? AND tx_hash = ?", ord.ChainID, normHash).First(&ex).Error; err2 != nil {
				return err
			}
			if ex.OrderID != ord.ID {
				return ErrBillingTxAlreadyUsed
			}
		}

		paidAt := time.Now().UTC()
		res := tx.Model(&model.BillingOrder{}).Where("id = ? AND status IN ?", ord.ID, []string{"pending", "failed"}).Updates(map[string]any{
			"status":                "paid",
			"tx_hash":               normHash,
			"paid_at":               paidAt,
			"failure_reason":        "",
			"last_checked_at":       paidAt,
			"reconciliation_status": billingReconMatched,
			"review_status":         billingReviewReviewed,
			"reviewed_at":           paidAt,
		})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			var o2 model.BillingOrder
			if err := tx.First(&o2, ord.ID).Error; err != nil {
				return err
			}
			if o2.Status == "paid" {
				return nil
			}
			return fmt.Errorf("order could not be marked paid")
		}

		plan, ok := subscription.FindPlan(ord.PlanCode)
		if !ok {
			return fmt.Errorf("plan config missing for %s", ord.PlanCode)
		}
		cycle := normalizeOrderBillingCycle(&ord)
		expires := billingNextSubscriptionExpiry(tx, ord, paidAt, cycle)
		return tx.Model(&model.User{}).Where("id = ?", ord.UserID).Updates(map[string]any{
			"subscription_plan_code":     plan.Code,
			"subscription_status":        "active",
			"subscription_billing_cycle": cycle,
			"subscription_started_at":    paidAt,
			"subscription_expires_at":    expires,
		}).Error
	})
}

func billingNextSubscriptionExpiry(tx *gorm.DB, ord model.BillingOrder, paidAt time.Time, cycle string) time.Time {
	base := paidAt
	orderType := strings.ToLower(strings.TrimSpace(ord.OrderType))
	if orderType == "renew" {
		var u model.User
		if err := tx.Select("subscription_expires_at").First(&u, ord.UserID).Error; err == nil && u.SubscriptionExpiresAt != nil && u.SubscriptionExpiresAt.After(base) {
			base = u.SubscriptionExpiresAt.UTC()
		}
	}
	if subscription.NormalizeBillingCycle(cycle) == subscription.BillingCycleYearly {
		return base.AddDate(1, 0, 0)
	}
	return base.AddDate(0, 1, 0)
}

func isTRONPaymentNetwork(network string) bool {
	switch strings.ToUpper(strings.TrimSpace(network)) {
	case "TRC20":
		return true
	default:
		return false
	}
}

func sanitizeBillingFailureReason(reason string) string {
	r := strings.TrimSpace(reason)
	if r == "" {
		return "payment confirmation failed"
	}
	if len(r) > 480 {
		return r[:480]
	}
	return r
}

func sanitizeBillingOpsNote(note string) string {
	n := strings.TrimSpace(note)
	if len(n) > 480 {
		return n[:480]
	}
	return n
}

func canOperateBilling(user *model.User) bool {
	if user == nil {
		return false
	}
	role := strings.ToLower(strings.TrimSpace(user.Role))
	return role == "owner" || role == "admin"
}

func billingAuditItemsToDTO(rows []model.BillingOrderAudit) []dto.BillingOrderAuditItem {
	items := make([]dto.BillingOrderAuditItem, 0, len(rows))
	for i := range rows {
		items = append(items, billingAuditItemToDTO(&rows[i]))
	}
	return items
}

func billingAuditItemToDTO(row *model.BillingOrderAudit) dto.BillingOrderAuditItem {
	if row == nil {
		return dto.BillingOrderAuditItem{}
	}
	return dto.BillingOrderAuditItem{
		ID:                           strconv.FormatUint(uint64(row.ID), 10),
		OrderID:                      strconv.FormatUint(uint64(row.OrderID), 10),
		UserID:                       row.UserID,
		OperatorUserID:               row.OperatorUserID,
		Action:                       row.Action,
		PreviousOrderStatus:          row.PreviousOrderStatus,
		NewOrderStatus:               row.NewOrderStatus,
		PreviousReconciliationStatus: row.PreviousReconciliationStatus,
		NewReconciliationStatus:      row.NewReconciliationStatus,
		PreviousReviewStatus:         row.PreviousReviewStatus,
		NewReviewStatus:              row.NewReviewStatus,
		PreviousOpsNote:              row.PreviousOpsNote,
		NewOpsNote:                   row.NewOpsNote,
		CreatedAt:                    row.CreatedAt.UTC().Format(time.RFC3339),
	}
}

func normalizeEVMTxHash(hex string) (string, error) {
	h := strings.TrimSpace(hex)
	txHash := common.HexToHash(h)
	if txHash == (common.Hash{}) {
		return "", fmt.Errorf("invalid tx_hash")
	}
	return strings.ToLower(txHash.Hex()), nil
}

func deriveBillingCycleFromPlanCode(planCode string) string {
	if strings.Contains(strings.ToLower(strings.TrimSpace(planCode)), "year") {
		return subscription.BillingCycleYearly
	}
	return subscription.BillingCycleMonthly
}

func normalizeOrderBillingCycle(o *model.BillingOrder) string {
	if o == nil {
		return subscription.BillingCycleMonthly
	}
	cycle := subscription.NormalizeBillingCycle(o.BillingCycle)
	if strings.TrimSpace(o.BillingCycle) != "" {
		return cycle
	}
	return deriveBillingCycleFromPlanCode(o.PlanCode)
}

// Exported for HTTP mapping in controllers.
var (
	ErrBillingWebhookForbidden = errors.New("invalid billing webhook secret")
	ErrBillingOrderNotFound    = errors.New("order not found")
	ErrBillingTxAlreadyUsed    = errors.New("transaction already used for another order")
	ErrBillingOrderExpired     = errors.New("order expired")
	ErrBillingOpsForbidden     = errors.New("billing operator permission required")
)
