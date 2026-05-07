package service

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"octo-agent/backend/internal/billingevm"
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
	userRepo  *repository.UserRepository
	orderRepo *repository.BillingOrderRepository
	cfg       *config.Config
}

func NewBillingService(userRepo *repository.UserRepository, orderRepo *repository.BillingOrderRepository, cfg *config.Config) *BillingService {
	return &BillingService{userRepo: userRepo, orderRepo: orderRepo, cfg: cfg}
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
		pc = "free_trial"
	}
	var expStr string
	if user.SubscriptionExpiresAt != nil {
		expStr = user.SubscriptionExpiresAt.In(time.UTC).Format("2006-01-02")
	}
	trialLeft := subscription.TrialDaysLeft(user, now)
	hint := ""
	if st == "expired" {
		hint = "Renew your subscription to restore automation and posting."
	} else if strings.EqualFold(pc, "free_trial") {
		hint = "Basic plan starts at 10 USDT / month"
	}
	return &dto.BillingSubscriptionData{
		Plan:           pc,
		Status:         st,
		ExpirationDate: expStr,
		TrialDaysLeft:  trialLeft,
		BillingHint:    hint,
	}, nil
}

func (s *BillingService) Plans() *dto.BillingPlansResponse {
	items := make([]dto.BillingPlanData, 0, len(s.cfg.Billing.Plans))
	for code, p := range s.cfg.Billing.Plans {
		period := "month"
		if p.PeriodDays == 7 {
			period = "7 days"
		} else if p.PeriodDays > 0 && p.PeriodDays != 30 {
			period = fmt.Sprintf("%d days", p.PeriodDays)
		}
		price := p.Amount
		if p.Currency != "" {
			price = p.Amount + " " + p.Currency
		}
		features := p.Features
		if len(features) == 0 {
			features = []string{"Auto Post + Auto Reply + Auto DM", "Priority queue"}
		}
		items = append(items, dto.BillingPlanData{
			Code:        code,
			Name:        p.Name,
			Price:       price,
			Period:      period,
			Description: p.Description,
			Features:    features,
			Highlight:   code == "basic_monthly",
		})
	}
	if len(items) == 0 {
		return &dto.BillingPlansResponse{Items: []dto.BillingPlanData{
			{Code: "free_trial", Name: "Free Trial", Price: "0", Period: "7 days", Description: "Try before upgrade.", Features: []string{"Core automation"}, Highlight: false},
			{Code: "basic_monthly", Name: "Basic", Price: "10 USDT", Period: "month", Description: "Full automation.", Features: []string{"Auto Post", "Auto Reply"}, Highlight: true},
		}}
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

// CreateOrder creates a pending on-chain USDT order for the given plan and network.
func (s *BillingService) CreateOrder(userID uint, req dto.BillingCreateOrderRequest) (*dto.BillingCreateOrderResponse, error) {
	plan, ok := s.cfg.Billing.Plans[req.PlanCode]
	if !ok {
		return nil, fmt.Errorf("unknown plan_code")
	}
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

	ttl := s.cfg.Billing.OrderTTLMinutes
	if ttl <= 0 {
		ttl = 30
	}
	exp := time.Now().UTC().Add(time.Duration(ttl) * time.Minute)

	o := &model.BillingOrder{
		UserID:          userID,
		PlanCode:        req.PlanCode,
		Amount:          plan.Amount,
		Currency:        plan.Currency,
		Method:          strings.ToUpper(strings.TrimSpace(req.Method)),
		Network:         strings.ToUpper(strings.TrimSpace(pm.Network)),
		TokenAddress:    strings.TrimSpace(pm.TokenAddress),
		ReceiverAddress: strings.TrimSpace(pm.ReceiverAddress),
		Status:          "pending",
		ExpiredAt:       exp,
		ChainID:         pm.ChainID,
		TokenDecimals:   pm.Decimals,
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
	}, nil
}

// GetOrder returns one order for the authenticated user (polling).
func (s *BillingService) GetOrder(userID, orderID uint) (*dto.BillingOrderDetailResponse, error) {
	o, err := s.orderRepo.GetByUserAndID(userID, orderID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBillingOrderNotFound
		}
		return nil, err
	}
	return orderToDetailDTO(o), nil
}

func (s *BillingService) ListOrders(userID uint) (*dto.BillingOrderListResponse, error) {
	orders, err := s.orderRepo.ListByUser(userID, 20)
	if err != nil {
		return nil, err
	}
	items := make([]dto.BillingOrderListItem, 0, len(orders))
	for i := range orders {
		items = append(items, orderToListItemDTO(&orders[i]))
	}
	return &dto.BillingOrderListResponse{Items: items}, nil
}

func orderToDetailDTO(o *model.BillingOrder) *dto.BillingOrderDetailResponse {
	out := &dto.BillingOrderDetailResponse{
		OrderID:         strconv.FormatUint(uint64(o.ID), 10),
		Amount:          o.Amount,
		Currency:        o.Currency,
		Network:         o.Network,
		TokenAddress:    o.TokenAddress,
		ReceiverAddress: o.ReceiverAddress,
		ChainID:         o.ChainID,
		ExpiredAt:       o.ExpiredAt.UTC().Format(time.RFC3339),
		Status:          o.Status,
		TxHash:          o.TxHash,
	}
	if o.PaidAt != nil {
		s := o.PaidAt.UTC().Format(time.RFC3339)
		out.PaidAt = s
	}
	return out
}

func orderToListItemDTO(o *model.BillingOrder) dto.BillingOrderListItem {
	out := dto.BillingOrderListItem{
		OrderID:   strconv.FormatUint(uint64(o.ID), 10),
		PlanCode:  o.PlanCode,
		Amount:    o.Amount,
		Currency:  o.Currency,
		Method:    o.Method,
		Network:   o.Network,
		Status:    o.Status,
		TxHash:    o.TxHash,
		CreatedAt: o.CreatedAt.UTC().Format(time.RFC3339),
		ExpiredAt: o.ExpiredAt.UTC().Format(time.RFC3339),
	}
	if o.PaidAt != nil {
		out.PaidAt = o.PaidAt.UTC().Format(time.RFC3339)
	}
	return out
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

// WebhookOnchain confirms payment from chain. Amount and receiver are enforced by VerifyERC20Transfer (ERC20 Transfer log).
func (s *BillingService) WebhookOnchain(webhookSecretHeader string, req dto.BillingWebhookOnchainRequest) error {
	secret := strings.TrimSpace(s.cfg.Billing.WebhookSecret)
	if secret != "" && webhookSecretHeader != secret {
		return ErrBillingWebhookForbidden
	}

	net := strings.ToUpper(strings.TrimSpace(req.Network))
	if net != "BEP20" {
		return fmt.Errorf("only BEP20 is supported in current MVP")
	}

	orderID, err := strconv.ParseUint(strings.TrimSpace(req.OrderID), 10, 64)
	if err != nil || orderID == 0 {
		return fmt.Errorf("invalid order_id")
	}

	normHash, err := normalizeEVMTxHash(req.TxHash)
	if err != nil {
		return err
	}

	order, err := s.orderRepo.GetByID(uint(orderID))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrBillingOrderNotFound
		}
		return err
	}
	if strings.ToUpper(strings.TrimSpace(order.Network)) != net {
		return fmt.Errorf("network does not match order")
	}

	now := time.Now().UTC()
	if order.Status == "paid" {
		return nil
	}
	if order.Status != "pending" {
		return fmt.Errorf("order not pending")
	}
	if now.After(order.ExpiredAt) {
		_ = s.orderRepo.DB.Model(&model.BillingOrder{}).Where("id = ?", order.ID).Update("status", "expired").Error
		return fmt.Errorf("order expired")
	}

	if net != "BEP20" {
		return fmt.Errorf("unsupported network for on-chain confirmation")
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

	txHash := common.HexToHash(strings.TrimSpace(req.TxHash))
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	verifyErr := billingevm.VerifyERC20Transfer(ctx, rpcURL, billingevm.VerifyParams{
		TxHash:          txHash,
		TokenAddress:    order.TokenAddress,
		ReceiverAddress: order.ReceiverAddress,
		ExpectedMinUnit: expected,
		ExpectedChainID: big.NewInt(order.ChainID),
	})
	if verifyErr != nil {
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
		if ord.Status != "pending" {
			return fmt.Errorf("order not pending")
		}
		tnow := time.Now().UTC()
		if tnow.After(ord.ExpiredAt) {
			_ = tx.Model(&model.BillingOrder{}).Where("id = ?", ord.ID).Update("status", "expired")
			return fmt.Errorf("order expired")
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
		res := tx.Model(&model.BillingOrder{}).Where("id = ? AND status = ?", ord.ID, "pending").Updates(map[string]any{
			"status":  "paid",
			"tx_hash": normHash,
			"paid_at": paidAt,
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

		plan, ok := s.cfg.Billing.Plans[ord.PlanCode]
		if !ok {
			return fmt.Errorf("plan config missing for %s", ord.PlanCode)
		}
		period := plan.PeriodDays
		if period <= 0 {
			period = 30
		}
		expires := paidAt.AddDate(0, 0, period)
		return tx.Model(&model.User{}).Where("id = ?", ord.UserID).Updates(map[string]any{
			"subscription_plan_code":  ord.PlanCode,
			"subscription_status":     "active",
			"subscription_expires_at": expires,
		}).Error
	})
}

func normalizeEVMTxHash(hex string) (string, error) {
	h := strings.TrimSpace(hex)
	txHash := common.HexToHash(h)
	if txHash == (common.Hash{}) {
		return "", fmt.Errorf("invalid tx_hash")
	}
	return strings.ToLower(txHash.Hex()), nil
}

// Exported for HTTP mapping in controllers.
var (
	ErrBillingWebhookForbidden = errors.New("invalid billing webhook secret")
	ErrBillingOrderNotFound    = errors.New("order not found")
	ErrBillingTxAlreadyUsed    = errors.New("transaction already used for another order")
)
