package service

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"octo-agent/backend/internal/alert"
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
	userRepo            *repository.UserRepository
	orderRepo           *repository.BillingOrderRepository
	pointRepo           *repository.PointRepository
	referralService     *ReferralService
	accountRepo         *repository.TwitterAccountRepository
	oafBotRepo          *repository.OAFBotRepository
	usageRepo           *repository.AIGenerationUsageRepository
	autoPostDraftRepo   *repository.AutoPostDraftRepository
	autoReplyDraftRepo  *repository.AutoReplyDraftRepository
	autoCommentTaskRepo *repository.AutoCommentTaskRepository
	activityRepo        *repository.ActivityRepository
	cfg                 *config.Config
}

type BillingAutoConfirmStats struct {
	ScannedOrders int
	ScannedEvents int
	Confirmed     int
	Skipped       int
	Failed        int
}

type GrossMarginHealth struct {
	PeriodStart         time.Time
	PeriodEnd           time.Time
	RevenueCents        int64
	TotalCostCents      int64
	GrossProfitCents    int64
	GrossMarginBps      int64
	TargetBps           int64
	Status              string
	OpenAICostCents     int64
	XCostCents          int64
	PointDiscountCents  int64
	OpenAIQuantity      int64
	XQuantity           int64
	PointDiscountPoints int64
	Config              GrossMarginAlertSettings
	Reasons             []string
}

type GrossMarginAlertSettings struct {
	Enabled                     bool
	TargetMarginBps             int64
	OpenAICostShareThresholdBps int64
	XCostShareThresholdBps      int64
	PointCostShareThresholdBps  int64
	CheckIntervalHours          int
}

const (
	billingReconUnchecked   = "unchecked"
	billingReconMatched     = "matched"
	billingReconMismatch    = "mismatch"
	billingReconNeedsReview = "needs_review"

	billingReviewUnreviewed = "unreviewed"
	billingReviewNeeded     = "review_needed"
	billingReviewReviewed   = "reviewed"

	billingAutoScanPending   = "pending"
	billingAutoScanScanned   = "scanned"
	billingAutoScanConfirmed = "confirmed"
	billingAutoScanSkipped   = "skipped"
	billingAutoScanFailed    = "failed"
)

type billingScanGroupKey struct {
	Network  string
	ChainID  int64
	Token    string
	Receiver string
}

type billingAmountMatchKey struct {
	Network  string
	ChainID  int64
	Token    string
	Receiver string
	Amount   string
}

type billingTransferCandidate struct {
	TxHash    string
	Amount    *big.Int
	BlockTime time.Time
}

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
	pointsUsed         int64
	pointDiscountCents int64
}

func NewBillingService(userRepo *repository.UserRepository, orderRepo *repository.BillingOrderRepository, pointRepo *repository.PointRepository, referralService *ReferralService, accountRepo *repository.TwitterAccountRepository, oafBotRepo *repository.OAFBotRepository, usageRepo *repository.AIGenerationUsageRepository, autoPostDraftRepo *repository.AutoPostDraftRepository, autoReplyDraftRepo *repository.AutoReplyDraftRepository, autoCommentTaskRepo *repository.AutoCommentTaskRepository, activityRepo *repository.ActivityRepository, cfg *config.Config) *BillingService {
	return &BillingService{userRepo: userRepo, orderRepo: orderRepo, pointRepo: pointRepo, referralService: referralService, accountRepo: accountRepo, oafBotRepo: oafBotRepo, usageRepo: usageRepo, autoPostDraftRepo: autoPostDraftRepo, autoReplyDraftRepo: autoReplyDraftRepo, autoCommentTaskRepo: autoCommentTaskRepo, activityRepo: activityRepo, cfg: cfg}
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
	items := make([]dto.BillingPlanData, 0, len(catalog)+1)
	items = append(items, dto.BillingPlanData{
		Code:         subscription.PlanFreeTrial,
		Name:         "Free Trial",
		Price:        "0 USDT",
		Period:       "14 days",
		MonthlyPrice: 0,
		YearlyPrice:  0,
		Currency:     "USDT",
		Audience:     "14-day trial for new users",
		Description:  "Try core automation with lower trial quotas before upgrading to Basic.",
		Features: []string{
			"14-day free trial",
			"1 OAF Bot",
			"1 X account",
			"100 AI generations / month",
			"10 real X writes / month",
			"Auto Comment target authors 2, scans 20 / month",
		},
		FeatureFlags: []dto.PlanFeatureData{},
		Limits:       planLimitsToDTO(subscription.FreeTrialLimits()),
		Highlight:    false,
	})
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

func (s *BillingService) AutoConfirmInterval() time.Duration {
	if s == nil || s.cfg == nil || !s.cfg.Billing.Scanner.Enabled {
		return 0
	}
	seconds := s.cfg.Billing.Scanner.IntervalSeconds
	if seconds <= 0 {
		seconds = 60
	}
	return time.Duration(seconds) * time.Second
}

func (s *BillingService) GrossMarginHealth(now time.Time) (GrossMarginHealth, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	now = now.UTC()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := periodStart.AddDate(0, 1, 0)
	settings, err := s.GrossMarginAlertSettings()
	if err != nil {
		return GrossMarginHealth{}, err
	}
	revenueCents, err := s.monthlyPaidRevenueCents(periodStart, periodEnd)
	if err != nil {
		return GrossMarginHealth{}, err
	}
	openAICents, openAIQuantity, err := s.monthlyProviderCost("openai", periodStart, periodEnd)
	if err != nil {
		return GrossMarginHealth{}, err
	}
	xCents, xQuantity, err := s.monthlyProviderCost("x", periodStart, periodEnd)
	if err != nil {
		return GrossMarginHealth{}, err
	}
	pointDiscountPoints, err := s.monthlyPointDiscountPoints(periodStart, periodEnd)
	if err != nil {
		return GrossMarginHealth{}, err
	}
	pointDiscountCents := pointDiscountPoints * 10
	totalCostCents := openAICents + xCents + pointDiscountCents
	grossProfitCents := revenueCents - totalCostCents
	grossMarginBps := int64(0)
	if revenueCents > 0 {
		grossMarginBps = grossProfitCents * 10000 / revenueCents
	}
	status := "no_revenue"
	if revenueCents > 0 && grossMarginBps >= settings.TargetMarginBps {
		status = "healthy"
	} else if revenueCents > 0 {
		status = "below_target"
	}
	health := GrossMarginHealth{
		PeriodStart:         periodStart,
		PeriodEnd:           periodEnd,
		RevenueCents:        revenueCents,
		TotalCostCents:      totalCostCents,
		GrossProfitCents:    grossProfitCents,
		GrossMarginBps:      grossMarginBps,
		TargetBps:           settings.TargetMarginBps,
		Status:              status,
		OpenAICostCents:     openAICents,
		XCostCents:          xCents,
		PointDiscountCents:  pointDiscountCents,
		OpenAIQuantity:      openAIQuantity,
		XQuantity:           xQuantity,
		PointDiscountPoints: pointDiscountPoints,
		Config:              settings,
	}
	health.Reasons = grossMarginAlertReasons(health)
	return health, nil
}

func (s *BillingService) GrossMarginAlertSettings() (GrossMarginAlertSettings, error) {
	defaults := defaultGrossMarginAlertSettings()
	if s == nil || s.orderRepo == nil || s.orderRepo.DB == nil {
		return defaults, nil
	}
	var cfg model.GrossMarginAlertConfig
	err := s.orderRepo.DB.Where("code = ?", "default").First(&cfg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return defaults, nil
	}
	if err != nil {
		return GrossMarginAlertSettings{}, err
	}
	out := GrossMarginAlertSettings{
		Enabled:                     cfg.Enabled,
		TargetMarginBps:             cfg.TargetMarginBps,
		OpenAICostShareThresholdBps: cfg.OpenAICostShareThresholdBps,
		XCostShareThresholdBps:      cfg.XCostShareThresholdBps,
		PointCostShareThresholdBps:  cfg.PointCostShareThresholdBps,
		CheckIntervalHours:          cfg.CheckIntervalHours,
	}
	return normalizeGrossMarginAlertSettings(out), nil
}

func defaultGrossMarginAlertSettings() GrossMarginAlertSettings {
	return GrossMarginAlertSettings{
		Enabled:                     true,
		TargetMarginBps:             5000,
		OpenAICostShareThresholdBps: 2000,
		XCostShareThresholdBps:      2000,
		PointCostShareThresholdBps:  2000,
		CheckIntervalHours:          24,
	}
}

func normalizeGrossMarginAlertSettings(settings GrossMarginAlertSettings) GrossMarginAlertSettings {
	defaults := defaultGrossMarginAlertSettings()
	if settings.TargetMarginBps <= 0 {
		settings.TargetMarginBps = defaults.TargetMarginBps
	}
	if settings.OpenAICostShareThresholdBps <= 0 {
		settings.OpenAICostShareThresholdBps = defaults.OpenAICostShareThresholdBps
	}
	if settings.XCostShareThresholdBps <= 0 {
		settings.XCostShareThresholdBps = defaults.XCostShareThresholdBps
	}
	if settings.PointCostShareThresholdBps <= 0 {
		settings.PointCostShareThresholdBps = defaults.PointCostShareThresholdBps
	}
	if settings.CheckIntervalHours <= 0 {
		settings.CheckIntervalHours = defaults.CheckIntervalHours
	}
	return settings
}

func (s *BillingService) CheckGrossMarginAndAlert(ctx context.Context, now time.Time) error {
	health, err := s.GrossMarginHealth(now)
	if err != nil {
		return err
	}
	if health.RevenueCents <= 0 {
		return nil
	}
	if !health.Config.Enabled {
		return nil
	}
	reasons := health.Reasons
	if len(reasons) == 0 {
		return nil
	}
	event, err := s.createGrossMarginAlertEvent(health, reasons)
	if err != nil {
		return err
	}
	notifyErr := alert.NotifySync(ctx, alert.Event{
		Level:    alert.LevelWarning,
		Category: alert.CategoryBilling,
		Title:    "Gross margin risk detected",
		Message:  "Monthly gross margin or cost share breached the configured billing threshold.",
		Fields: map[string]any{
			"period":                health.PeriodStart.Format("2006-01"),
			"status":                health.Status,
			"reasons":               strings.Join(reasons, ", "),
			"revenue_usdt":          centsToAmountString(health.RevenueCents),
			"total_cost_usdt":       centsToAmountString(health.TotalCostCents),
			"gross_profit_usdt":     signedCentsToAmountString(health.GrossProfitCents),
			"gross_margin":          formatBps(health.GrossMarginBps),
			"target_margin":         formatBps(health.TargetBps),
			"openai_cost_usdt":      centsToAmountString(health.OpenAICostCents),
			"x_cost_usdt":           centsToAmountString(health.XCostCents),
			"point_discount_usdt":   centsToAmountString(health.PointDiscountCents),
			"openai_usage":          health.OpenAIQuantity,
			"x_writes":              health.XQuantity,
			"point_discount_points": health.PointDiscountPoints,
		},
	})
	if event != nil {
		status := "sent"
		errMsg := ""
		if notifyErr != nil {
			status = "failed"
			errMsg = truncateErrMsg(notifyErr.Error())
		}
		if err := s.orderRepo.DB.Model(&model.GrossMarginAlertEvent{}).Where("id = ?", event.ID).Updates(map[string]any{
			"lark_status": status,
			"lark_error":  errMsg,
		}).Error; err != nil {
			return err
		}
	}
	return notifyErr
}

func (s *BillingService) createGrossMarginAlertEvent(health GrossMarginHealth, reasons []string) (*model.GrossMarginAlertEvent, error) {
	if s == nil || s.orderRepo == nil || s.orderRepo.DB == nil {
		return nil, nil
	}
	reasonJSON, _ := json.Marshal(reasons)
	cfgJSON, _ := json.Marshal(health.Config)
	row := &model.GrossMarginAlertEvent{
		PeriodStart:        health.PeriodStart,
		PeriodEnd:          health.PeriodEnd,
		Level:              alert.LevelWarning,
		Status:             "open",
		Reasons:            string(reasonJSON),
		RevenueCents:       health.RevenueCents,
		TotalCostCents:     health.TotalCostCents,
		GrossProfitCents:   health.GrossProfitCents,
		GrossMarginBps:     health.GrossMarginBps,
		TargetMarginBps:    health.TargetBps,
		OpenAICostCents:    health.OpenAICostCents,
		XCostCents:         health.XCostCents,
		PointDiscountCents: health.PointDiscountCents,
		LarkStatus:         "pending",
		ConfigSnapshot:     string(cfgJSON),
	}
	if err := s.orderRepo.DB.Create(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func (s *BillingService) monthlyPaidRevenueCents(periodStart, periodEnd time.Time) (int64, error) {
	var orders []model.BillingOrder
	if err := s.orderRepo.DB.
		Where("status = ? AND paid_at IS NOT NULL AND paid_at >= ? AND paid_at < ?", "paid", periodStart, periodEnd).
		Find(&orders).Error; err != nil {
		return 0, err
	}
	total := int64(0)
	for _, order := range orders {
		cents, err := referralAmountToCents(firstNonEmpty(order.PayableAmount, order.Amount))
		if err != nil {
			return 0, err
		}
		total += cents
	}
	return total, nil
}

func (s *BillingService) monthlyProviderCost(provider string, periodStart, periodEnd time.Time) (int64, int64, error) {
	type rowData struct {
		Cents    int64
		Quantity int64
	}
	var row rowData
	err := s.orderRepo.DB.Model(&model.CostUsageLedger{}).
		Select("COALESCE(SUM(CASE WHEN actual_cost_cents > 0 THEN actual_cost_cents ELSE estimated_cost_cents END), 0) AS cents, COALESCE(SUM(quantity), 0) AS quantity").
		Where("provider = ? AND occurred_at >= ? AND occurred_at < ?", provider, periodStart, periodEnd).
		Scan(&row).Error
	return row.Cents, row.Quantity, err
}

func (s *BillingService) monthlyPointDiscountPoints(periodStart, periodEnd time.Time) (int64, error) {
	var points int64
	err := s.orderRepo.DB.Model(&model.PointLedgerEntry{}).
		Select("COALESCE(SUM(points), 0)").
		Where("created_at >= ? AND created_at < ? AND event_type = ?", periodStart, periodEnd, "consume").
		Scan(&points).Error
	return points, err
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
	if err := s.applyPointDiscount(userID, &quote, req.PointsToUse); err != nil {
		return nil, err
	}
	return &quote.dto, nil
}

func (s *BillingService) applyPointDiscount(userID uint, quote *billingQuoteCalc, requestedPoints int64) error {
	if quote == nil {
		return nil
	}
	var balance int64
	if s.pointRepo != nil {
		account, err := s.pointRepo.Account(userID)
		if err != nil {
			return err
		}
		balance = account.Balance
	}
	maxByAmount := (quote.payableCents / 2) / 10
	monthlyRemaining := balance
	if s.pointRepo != nil {
		limits, err := s.pointRepo.RiskLimits()
		if err != nil {
			return err
		}
		monthlyRemaining = 0
		if !limits.Enabled || limits.MonthlyDiscountLimit <= 0 {
			monthlyRemaining = balance
		} else {
			monthlyRemaining = limits.MonthlyDiscountLimit
		}
		now := time.Now().UTC()
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		usedThisMonth, err := s.pointRepo.DiscountPointsInPeriod(userID, monthStart, monthStart.AddDate(0, 1, 0))
		if err != nil {
			return err
		}
		monthlyRemaining -= usedThisMonth
		if monthlyRemaining < 0 {
			monthlyRemaining = 0
		}
		if limits.Enabled && requestedPoints > monthlyRemaining && limits.MonthlyDiscountLimit > 0 {
			alert.Notify(context.Background(), alert.Event{
				Level:    alert.LevelWarning,
				Category: alert.CategoryBilling,
				Title:    "Point discount risk limit hit",
				Message:  "A user attempted to use points beyond the configured monthly discount limit.",
				UserID:   userID,
				Fields: map[string]any{
					"requested_points": requestedPoints,
					"used_this_month":  usedThisMonth,
					"monthly_limit":    limits.MonthlyDiscountLimit,
					"remaining":        monthlyRemaining,
				},
			})
		}
	}
	maxPoints := minInt64(balance, minInt64(maxByAmount, monthlyRemaining))
	if requestedPoints < 0 {
		requestedPoints = 0
	}
	pointsUsed := minInt64(requestedPoints, maxPoints)
	discountCents := pointsUsed * 10
	if discountCents > quote.payableCents {
		discountCents = quote.payableCents
	}
	quote.pointsUsed = pointsUsed
	quote.pointDiscountCents = discountCents
	quote.payableCents -= discountCents
	if quote.payableCents < 0 {
		quote.payableCents = 0
	}
	quote.dto.PointBalance = balance
	quote.dto.MaxPointsUsable = maxPoints
	quote.dto.PointsUsed = pointsUsed
	quote.dto.PointDiscountAmount = centsToAmountString(discountCents)
	quote.dto.PayableAmount = centsToAmountString(quote.payableCents)
	return nil
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
	now := time.Now().UTC()
	monthStart := startOfUTCMonth(now)
	usage.AIGenerationsMonth = currentAIGenerationUsage(s.usageRepo, userID, now)
	if s.autoPostDraftRepo != nil {
		if n, err := s.autoPostDraftRepo.CountCreatedBetween(userID, monthStart, now); err == nil {
			usage.AutoPostsMonth = n
		}
	}
	if s.autoReplyDraftRepo != nil {
		if n, err := s.autoReplyDraftRepo.CountCreatedBetween(userID, monthStart, now); err == nil {
			usage.AutoRepliesMonth = n
		}
	}
	if s.autoCommentTaskRepo != nil {
		if n, err := s.autoCommentTaskRepo.CountCreatedBetween(userID, monthStart, now); err == nil {
			usage.AutoCommentsMonth = n
		}
	}
	if s.activityRepo != nil {
		if n, err := s.activityRepo.CountSuccessByTypeBetween(userID, "dm", monthStart, now); err == nil {
			usage.AutoDMsMonth = n
		}
	}
	return usage
}

func startOfUTCMonth(now time.Time) time.Time {
	u := now.UTC()
	return time.Date(u.Year(), u.Month(), 1, 0, 0, 0, 0, time.UTC)
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
		PointDiscountAmount: "0",
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

func signedCentsToAmountString(cents int64) string {
	if cents < 0 {
		return "-" + centsToAmountString(-cents)
	}
	return centsToAmountString(cents)
}

func formatBps(bps int64) string {
	return fmt.Sprintf("%.2f%%", float64(bps)/100)
}

func grossMarginAlertReasons(health GrossMarginHealth) []string {
	settings := normalizeGrossMarginAlertSettings(health.Config)
	reasons := make([]string, 0, 4)
	if health.RevenueCents <= 0 {
		return reasons
	}
	targetBps := health.TargetBps
	if targetBps <= 0 {
		targetBps = settings.TargetMarginBps
	}
	if health.GrossMarginBps < targetBps {
		reasons = append(reasons, "gross_margin_below_50_percent")
	}
	if health.OpenAICostCents*10000/health.RevenueCents >= settings.OpenAICostShareThresholdBps {
		reasons = append(reasons, "openai_cost_share_at_or_above_20_percent")
	}
	if health.XCostCents*10000/health.RevenueCents >= settings.XCostShareThresholdBps {
		reasons = append(reasons, "x_cost_share_at_or_above_20_percent")
	}
	if health.PointDiscountCents*10000/health.RevenueCents >= settings.PointCostShareThresholdBps {
		reasons = append(reasons, "point_discount_share_at_or_above_20_percent")
	}
	return reasons
}

func minInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
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
		"point_discount_amount": q.dto.PointDiscountAmount,
		"points_used":           q.dto.PointsUsed,
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

func billingOrderFingerprint(planCode, cycle, method, network, amount string, pointsUsed int64) string {
	parts := []string{
		subscription.NormalizePlanCode(planCode),
		subscription.NormalizeBillingCycle(cycle),
		strings.ToUpper(strings.TrimSpace(method)),
		strings.ToUpper(strings.TrimSpace(network)),
		strings.TrimSpace(amount),
		strconv.FormatInt(pointsUsed, 10),
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "|")))
	return fmt.Sprintf("%x", sum[:])
}

func sanitizeBillingIdempotencyKey(raw string) string {
	key := strings.TrimSpace(raw)
	if len(key) > 128 {
		key = key[:128]
	}
	return key
}

func billingIdempotencyScope(userID uint, key string) string {
	key = sanitizeBillingIdempotencyKey(key)
	if key == "" {
		return ""
	}
	return fmt.Sprintf("%d:%s", userID, key)
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
	if err := s.applyPointDiscount(userID, &quote, req.PointsToUse); err != nil {
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
	idempotencyKey := sanitizeBillingIdempotencyKey(req.IdempotencyKey)
	idempotencyScope := billingIdempotencyScope(userID, idempotencyKey)
	var idempotencyScopePtr *string
	if idempotencyScope != "" {
		idempotencyScopePtr = &idempotencyScope
	}
	baseFingerprint := billingOrderFingerprint(plan.Code, cycle, req.Method, pm.Network, basePayableAmount, quote.pointsUsed)
	if idempotencyKey != "" {
		if existing, err := s.orderRepo.GetReusableIdempotentOrder(userID, idempotencyKey, now); err == nil {
			if existing.RequestFingerprint != "" && existing.RequestFingerprint != baseFingerprint {
				return nil, fmt.Errorf("idempotency key reused with a different billing request")
			}
			return billingCreateResponseFromOrder(existing, &quote.dto), nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
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
		PointDiscountAmount:  centsToAmountString(quote.pointDiscountCents),
		PointsUsed:           quote.pointsUsed,
		PayableAmount:        exactPayableAmount,
		OrderType:            quote.dto.OrderType,
		IdempotencyKey:       idempotencyKey,
		IdempotencyScope:     idempotencyScopePtr,
		RequestFingerprint:   baseFingerprint,
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
	if err := s.orderRepo.DB.Transaction(func(tx *gorm.DB) error {
		if err := s.orderRepo.CreateInTx(tx, o); err != nil {
			return err
		}
		if s.pointRepo != nil && o.PointsUsed > 0 {
			if err := s.pointRepo.FreezeForOrder(tx, userID, o.ID, o.PointsUsed, billingLedgerDetails(o)); err != nil {
				return err
			}
		}
		return s.orderRepo.CreateLedgerEntry(tx, &model.BillingLedgerEntry{
			UserID:         userID,
			OrderID:        o.ID,
			EventType:      "order_created",
			Amount:         o.Amount,
			Currency:       o.Currency,
			Status:         o.Status,
			IdempotencyKey: o.IdempotencyKey,
			UniqueKey:      fmt.Sprintf("order_created:%d", o.ID),
			Details:        billingLedgerDetails(o),
		})
	}); err != nil {
		if idempotencyKey != "" {
			if existing, getErr := s.orderRepo.GetReusableIdempotentOrder(userID, idempotencyKey, now); getErr == nil {
				if existing.RequestFingerprint != "" && existing.RequestFingerprint != baseFingerprint {
					return nil, fmt.Errorf("idempotency key reused with a different billing request")
				}
				return billingCreateResponseFromOrder(existing, &quote.dto), nil
			}
		}
		return nil, err
	}
	return billingCreateResponseFromOrder(o, &quote.dto), nil
}

func billingCreateResponseFromOrder(o *model.BillingOrder, quote *dto.BillingUpgradeQuote) *dto.BillingCreateOrderResponse {
	return &dto.BillingCreateOrderResponse{
		OrderID:         strconv.FormatUint(uint64(o.ID), 10),
		Amount:          o.Amount,
		Currency:        o.Currency,
		Network:         o.Network,
		TokenAddress:    o.TokenAddress,
		ReceiverAddress: o.ReceiverAddress,
		ExpiredAt:       o.ExpiredAt.UTC().Format(time.RFC3339),
		Status:          o.Status,
		Quote:           quote,
	}
}

func billingLedgerDetails(o *model.BillingOrder) string {
	if o == nil {
		return ""
	}
	payload := map[string]any{
		"plan_code":             o.PlanCode,
		"billing_cycle":         o.BillingCycle,
		"order_type":            o.OrderType,
		"method":                o.Method,
		"network":               o.Network,
		"chain_id":              o.ChainID,
		"token_address":         o.TokenAddress,
		"receiver_address":      o.ReceiverAddress,
		"original_amount":       o.OriginalAmount,
		"credit_amount":         o.CreditAmount,
		"point_discount_amount": o.PointDiscountAmount,
		"points_used":           o.PointsUsed,
		"payable_amount":        o.PayableAmount,
		"request_fingerprint":   o.RequestFingerprint,
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	return string(b)
}

// GetOrder returns one order for the authenticated user (polling).
func (s *BillingService) GetOrder(userID, orderID uint) (*dto.BillingOrderDetailResponse, error) {
	now := time.Now().UTC()
	if err := s.orderRepo.ExpireStaleByUserAndID(userID, orderID, now); err != nil {
		return nil, err
	}
	if s.pointRepo != nil {
		if err := s.pointRepo.ReleaseExpiredOrderPointsByID(userID, orderID); err != nil {
			return nil, err
		}
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
	if s.pointRepo != nil {
		if allUsers {
			if err := s.pointRepo.ReleaseExpiredOrderPoints(0); err != nil {
				return nil, err
			}
		} else if err := s.pointRepo.ReleaseExpiredOrderPoints(userID); err != nil {
			return nil, err
		}
	}
	orders, total, err := s.orderRepo.List(userID, repository.BillingOrderListQuery{
		Status:               req.Status,
		ReconciliationStatus: req.ReconciliationStatus,
		ReviewStatus:         req.ReviewStatus,
		AutoScanStatus:       req.AutoScanStatus,
		AutoScanSkipReason:   req.AutoScanSkipReason,
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
		PointDiscountAmount:  o.PointDiscountAmount,
		PointsUsed:           o.PointsUsed,
		PayableAmount:        firstNonEmpty(o.PayableAmount, o.Amount),
		OrderType:            firstNonEmpty(o.OrderType, "new"),
		IdempotencyKey:       o.IdempotencyKey,
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
	out.AutoScanStatus = firstNonEmpty(o.AutoScanStatus, billingAutoScanPending)
	out.AutoScanSkipReason = o.AutoScanSkipReason
	if o.AutoScannedAt != nil {
		out.AutoScannedAt = o.AutoScannedAt.UTC().Format(time.RFC3339)
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
		PointDiscountAmount:  o.PointDiscountAmount,
		PointsUsed:           o.PointsUsed,
		PayableAmount:        firstNonEmpty(o.PayableAmount, o.Amount),
		OrderType:            firstNonEmpty(o.OrderType, "new"),
		IdempotencyKey:       o.IdempotencyKey,
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
		AutoScanStatus:       firstNonEmpty(o.AutoScanStatus, billingAutoScanPending),
		AutoScanSkipReason:   o.AutoScanSkipReason,
		OpsNote:              o.OpsNote,
	}
	if o.PaidAt != nil {
		out.PaidAt = o.PaidAt.UTC().Format(time.RFC3339)
	}
	if o.LastCheckedAt != nil {
		out.LastCheckedAt = o.LastCheckedAt.UTC().Format(time.RFC3339)
	}
	if o.AutoScannedAt != nil {
		out.AutoScannedAt = o.AutoScannedAt.UTC().Format(time.RFC3339)
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
	if s.pointRepo != nil {
		if err := s.pointRepo.ReleaseExpiredOrderPointsByID(userID, orderID); err != nil {
			return nil, err
		}
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
	if s.pointRepo != nil {
		if err := s.pointRepo.ReleaseExpiredOrderPointsByID(0, uint(orderID)); err != nil {
			return err
		}
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

func (s *BillingService) AutoConfirmPendingOrders(ctx context.Context) (BillingAutoConfirmStats, error) {
	var stats BillingAutoConfirmStats
	if s == nil || s.orderRepo == nil || s.cfg == nil || !s.cfg.Billing.Scanner.Enabled {
		return stats, nil
	}
	now := time.Now().UTC()
	limit := s.cfg.Billing.Scanner.MaxOrdersPerTick
	orders, err := s.orderRepo.ListPendingForAutoConfirm(now, limit)
	if err != nil {
		return stats, err
	}
	stats.ScannedOrders = len(orders)
	if len(orders) == 0 {
		return stats, s.orderRepo.ExpireStale(now)
	}

	byGroup := make(map[billingScanGroupKey][]model.BillingOrder)
	byAmount := make(map[billingAmountMatchKey][]model.BillingOrder)
	for _, order := range orders {
		if strings.TrimSpace(order.Amount) == "" || strings.TrimSpace(order.TokenAddress) == "" || strings.TrimSpace(order.ReceiverAddress) == "" || order.ChainID == 0 {
			stats.Skipped++
			s.markBillingAutoScan(order.ID, billingAutoScanSkipped, "missing_payment_metadata", now)
			continue
		}
		groupKey := billingScanGroupKey{
			Network:  strings.ToUpper(strings.TrimSpace(order.Network)),
			ChainID:  order.ChainID,
			Token:    strings.ToLower(strings.TrimSpace(order.TokenAddress)),
			Receiver: strings.ToLower(strings.TrimSpace(order.ReceiverAddress)),
		}
		amountKey := billingAmountMatchKey{
			Network:  groupKey.Network,
			ChainID:  groupKey.ChainID,
			Token:    groupKey.Token,
			Receiver: groupKey.Receiver,
			Amount:   strings.TrimSpace(order.Amount),
		}
		byGroup[groupKey] = append(byGroup[groupKey], order)
		byAmount[amountKey] = append(byAmount[amountKey], order)
	}
	ambiguousAmountKeys := make(map[billingAmountMatchKey]bool)
	for amountKey, amountOrders := range byAmount {
		if len(amountOrders) <= 1 {
			continue
		}
		ambiguousAmountKeys[amountKey] = true
		for _, order := range amountOrders {
			stats.Skipped++
			s.markBillingAutoScan(order.ID, billingAutoScanSkipped, "ambiguous_payment_amount", now)
		}
	}

	for groupKey, groupOrders := range byGroup {
		if len(groupOrders) == 0 {
			continue
		}
		events, err := s.scanBillingTransfersForGroup(ctx, groupKey, groupOrders[0])
		if err != nil {
			stats.Failed++
			for _, order := range groupOrders {
				s.markBillingAutoScan(order.ID, billingAutoScanFailed, sanitizeBillingFailureReason(err.Error()), now)
			}
			continue
		}
		stats.ScannedEvents += len(events)
		matchedOrderIDs := make(map[uint]bool)
		windowMissOrderIDs := make(map[uint]bool)
		for _, event := range events {
			amount := amountStringFromMinUnits(event.Amount, groupOrders[0].TokenDecimals)
			amountKey := billingAmountMatchKey{
				Network:  groupKey.Network,
				ChainID:  groupKey.ChainID,
				Token:    groupKey.Token,
				Receiver: groupKey.Receiver,
				Amount:   amount,
			}
			matches := byAmount[amountKey]
			if ambiguousAmountKeys[amountKey] {
				continue
			}
			if len(matches) != 1 {
				continue
			}
			order := matches[0]
			if !billingTransferWithinOrderWindow(event.BlockTime, order) {
				windowMissOrderIDs[order.ID] = true
				continue
			}
			normHash, err := normalizeEVMTxHash(event.TxHash)
			if err != nil {
				stats.Failed++
				s.markBillingAutoScan(order.ID, billingAutoScanFailed, "invalid_tx_hash_from_chain", now)
				continue
			}
			if err := s.confirmScannedOnchainOrder(&order, strings.ToUpper(strings.TrimSpace(order.Network)), normHash, event.BlockTime); err != nil {
				switch {
				case errors.Is(err, ErrBillingTxAlreadyUsed):
					stats.Skipped++
					s.markBillingAutoScan(order.ID, billingAutoScanSkipped, "tx_already_used", now)
				case errors.Is(err, ErrBillingOrderExpired):
					stats.Skipped++
					s.markBillingAutoScan(order.ID, billingAutoScanSkipped, "order_expired", now)
				default:
					stats.Failed++
					s.markBillingAutoScan(order.ID, billingAutoScanFailed, sanitizeBillingFailureReason(err.Error()), now)
				}
				continue
			}
			stats.Confirmed++
			matchedOrderIDs[order.ID] = true
			delete(byAmount, amountKey)
		}
		for _, order := range groupOrders {
			if matchedOrderIDs[order.ID] || ambiguousAmountKeys[billingAmountMatchKey{
				Network:  groupKey.Network,
				ChainID:  groupKey.ChainID,
				Token:    groupKey.Token,
				Receiver: groupKey.Receiver,
				Amount:   strings.TrimSpace(order.Amount),
			}] {
				continue
			}
			if windowMissOrderIDs[order.ID] {
				s.markBillingAutoScan(order.ID, billingAutoScanSkipped, "transfer_outside_order_window", now)
			} else {
				s.markBillingAutoScan(order.ID, billingAutoScanScanned, "no_matching_transfer", now)
			}
		}
	}
	if err := s.orderRepo.ExpireStale(now); err != nil {
		return stats, err
	}
	if s.pointRepo != nil {
		if err := s.pointRepo.ReleaseExpiredOrderPoints(0); err != nil {
			return stats, err
		}
	}
	return stats, nil
}

func (s *BillingService) markBillingAutoScan(orderID uint, status, reason string, scannedAt time.Time) {
	if s == nil || s.orderRepo == nil || orderID == 0 {
		return
	}
	_ = s.orderRepo.UpdateAutoScanState(orderID, status, sanitizeBillingFailureReason(reason), scannedAt)
}

func (s *BillingService) scanBillingTransfersForGroup(ctx context.Context, key billingScanGroupKey, sample model.BillingOrder) ([]billingTransferCandidate, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	rpcKey := fmt.Sprintf("%d", key.ChainID)
	rpcURL := s.cfg.Billing.RpcURLs[rpcKey]
	if strings.TrimSpace(rpcURL) == "" {
		return nil, fmt.Errorf("no rpc_urls configured for chain_id %s", rpcKey)
	}
	timeoutCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	lookback := uint64(s.cfg.Billing.Scanner.BlockLookback)
	var out []billingTransferCandidate
	if isTRONPaymentNetwork(sample.Network) {
		events, err := billingtron.ScanTRC20Transfers(timeoutCtx, rpcURL, billingtron.ScanParams{
			TokenAddress:    sample.TokenAddress,
			ReceiverAddress: sample.ReceiverAddress,
			ExpectedChainID: big.NewInt(sample.ChainID),
			BlockLookback:   lookback,
		})
		if err != nil {
			return nil, err
		}
		out = make([]billingTransferCandidate, 0, len(events))
		for _, event := range events {
			out = append(out, billingTransferCandidate{TxHash: event.TxHash, Amount: event.Amount, BlockTime: event.BlockTime})
		}
		return out, nil
	}
	events, err := billingevm.ScanERC20Transfers(timeoutCtx, rpcURL, billingevm.ScanParams{
		TokenAddress:    sample.TokenAddress,
		ReceiverAddress: sample.ReceiverAddress,
		ExpectedChainID: big.NewInt(sample.ChainID),
		BlockLookback:   lookback,
	})
	if err != nil {
		return nil, err
	}
	out = make([]billingTransferCandidate, 0, len(events))
	for _, event := range events {
		out = append(out, billingTransferCandidate{TxHash: event.TxHash, Amount: event.Amount, BlockTime: event.BlockTime})
	}
	return out, nil
}

func billingTransferWithinOrderWindow(blockTime time.Time, order model.BillingOrder) bool {
	if blockTime.IsZero() {
		return false
	}
	createdAt := order.CreatedAt.UTC().Add(-2 * time.Minute)
	expiredAt := order.ExpiredAt.UTC().Add(2 * time.Minute)
	bt := blockTime.UTC()
	return !bt.Before(createdAt) && !bt.After(expiredAt)
}

func (s *BillingService) confirmOnchainOrder(order *model.BillingOrder, net, normHash string, markFailure bool) error {
	return s.confirmOnchainOrderWithOptions(order, net, normHash, billingConfirmOptions{MarkFailure: markFailure})
}

type billingConfirmOptions struct {
	MarkFailure  bool
	AllowExpired bool
	PaidAt       time.Time
}

func (s *BillingService) confirmScannedOnchainOrder(order *model.BillingOrder, net, normHash string, paidAt time.Time) error {
	return s.confirmOnchainOrderWithOptions(order, net, normHash, billingConfirmOptions{
		AllowExpired: true,
		PaidAt:       paidAt,
	})
}

func (s *BillingService) confirmOnchainOrderWithOptions(order *model.BillingOrder, net, normHash string, opts billingConfirmOptions) error {
	if strings.ToUpper(strings.TrimSpace(order.Network)) != net {
		return fmt.Errorf("network does not match order")
	}

	now := time.Now().UTC()
	if order.Status == "paid" {
		return nil
	}
	if order.Status == "expired" && !opts.AllowExpired {
		return ErrBillingOrderExpired
	}
	if order.Status != "pending" && order.Status != "failed" && !(opts.AllowExpired && order.Status == "expired") {
		return fmt.Errorf("order not pending")
	}
	if now.After(order.ExpiredAt) && !opts.AllowExpired {
		_ = s.orderRepo.ExpireStaleByID(order.ID, now)
		if s.pointRepo != nil {
			_ = s.pointRepo.ReleaseExpiredOrderPointsByID(0, order.ID)
		}
		return ErrBillingOrderExpired
	}
	if opts.AllowExpired && !opts.PaidAt.IsZero() && !billingTransferWithinOrderWindow(opts.PaidAt, *order) {
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
		if opts.MarkFailure {
			_ = s.orderRepo.MarkFailed(order.ID, normHash, sanitizeBillingFailureReason(fmt.Sprintf("transfer verification failed: %v", verifyErr)), time.Now().UTC())
		}
		return fmt.Errorf("transfer verification failed: %w", verifyErr)
	}

	err = s.orderRepo.DB.Transaction(func(tx *gorm.DB) error {
		var ord model.BillingOrder
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&ord, order.ID).Error; err != nil {
			return err
		}
		if ord.Status == "paid" {
			return nil
		}
		if ord.Status != "pending" && ord.Status != "failed" && !(opts.AllowExpired && ord.Status == "expired") {
			return fmt.Errorf("order not pending")
		}
		tnow := time.Now().UTC()
		if tnow.After(ord.ExpiredAt) && !opts.AllowExpired {
			_ = tx.Model(&model.BillingOrder{}).Where("id = ?", ord.ID).Updates(map[string]any{
				"status":                "expired",
				"failure_reason":        "order expired before payment confirmation",
				"last_checked_at":       tnow,
				"reconciliation_status": billingReconNeedsReview,
				"review_status":         billingReviewNeeded,
				"ops_note":              "Order expired before payment confirmation.",
			})
			if s.pointRepo != nil && ord.PointsUsed > 0 {
				_ = s.pointRepo.ReleaseFrozenForOrder(tx, ord.UserID, ord.ID, ord.PointsUsed, billingLedgerDetails(&ord))
			}
			return ErrBillingOrderExpired
		}
		if opts.AllowExpired && !opts.PaidAt.IsZero() && !billingTransferWithinOrderWindow(opts.PaidAt, ord) {
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
		if !opts.PaidAt.IsZero() {
			paidAt = opts.PaidAt.UTC()
		}
		allowedStatuses := []string{"pending", "failed"}
		if opts.AllowExpired {
			allowedStatuses = append(allowedStatuses, "expired")
		}
		res := tx.Model(&model.BillingOrder{}).Where("id = ? AND status IN ?", ord.ID, allowedStatuses).Updates(map[string]any{
			"status":                "paid",
			"tx_hash":               normHash,
			"paid_at":               paidAt,
			"failure_reason":        "",
			"last_checked_at":       paidAt,
			"auto_scan_status":      billingAutoScanConfirmed,
			"auto_scan_skip_reason": "",
			"auto_scanned_at":       paidAt,
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
		var before model.User
		_ = tx.Select("subscription_plan_code", "subscription_billing_cycle", "subscription_expires_at").First(&before, ord.UserID).Error
		if err := s.orderRepo.CreateLedgerEntry(tx, &model.BillingLedgerEntry{
			UserID:         ord.UserID,
			OrderID:        ord.ID,
			EventType:      "payment_confirmed",
			Amount:         ord.Amount,
			Currency:       ord.Currency,
			Status:         "paid",
			TxHash:         normHash,
			IdempotencyKey: ord.IdempotencyKey,
			UniqueKey:      fmt.Sprintf("payment_confirmed:%d:%s", ord.ChainID, normHash),
			Details:        billingLedgerDetails(&ord),
		}); err != nil {
			return err
		}
		if s.pointRepo != nil && ord.PointsUsed > 0 {
			if err := s.pointRepo.ConsumeFrozenForOrder(tx, ord.UserID, ord.ID, ord.PointsUsed, billingLedgerDetails(&ord)); err != nil {
				return err
			}
		}
		if err := s.orderRepo.CreateSubscriptionChange(tx, &model.SubscriptionChangeEvent{
			UserID:           ord.UserID,
			OrderID:          ord.ID,
			ChangeType:       firstNonEmpty(ord.OrderType, "new"),
			FromPlanCode:     before.SubscriptionPlanCode,
			FromBillingCycle: before.SubscriptionBillingCycle,
			FromExpiresAt:    before.SubscriptionExpiresAt,
			ToPlanCode:       plan.Code,
			ToBillingCycle:   cycle,
			StartedAt:        paidAt,
			ExpiresAt:        expires,
			Details:          billingLedgerDetails(&ord),
		}); err != nil {
			return err
		}
		if err := s.orderRepo.CreateLedgerEntry(tx, &model.BillingLedgerEntry{
			UserID:         ord.UserID,
			OrderID:        ord.ID,
			EventType:      "subscription_changed",
			Amount:         ord.Amount,
			Currency:       ord.Currency,
			Status:         "active",
			TxHash:         normHash,
			IdempotencyKey: ord.IdempotencyKey,
			UniqueKey:      fmt.Sprintf("subscription_changed:%d", ord.ID),
			Details:        billingLedgerDetails(&ord),
		}); err != nil {
			return err
		}
		return tx.Model(&model.User{}).Where("id = ?", ord.UserID).Updates(map[string]any{
			"subscription_plan_code":     plan.Code,
			"subscription_status":        "active",
			"subscription_billing_cycle": cycle,
			"subscription_started_at":    paidAt,
			"subscription_expires_at":    expires,
		}).Error
	})
	if err != nil {
		return err
	}
	if s.referralService != nil {
		if err := s.referralService.RewardFirstPurchase(order.UserID, order.ID, firstNonEmpty(order.PayableAmount, order.Amount)); err != nil {
			return err
		}
	}
	return nil
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
