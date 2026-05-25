package service

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"
)

type PointService struct {
	pointRepo   *repository.PointRepository
	oafBotRepo  *repository.OAFBotRepository
	accountRepo *repository.TwitterAccountRepository
}

type pointActivityDefinition struct {
	Code        string
	Title       string
	Description string
	Points      int64
	ClaimPeriod string
	Claimable   func(*PointService, uint) bool
}

const pointDailyEarnLimit = int64(100)

func NewPointService(pointRepo *repository.PointRepository, oafBotRepo *repository.OAFBotRepository, accountRepo *repository.TwitterAccountRepository) *PointService {
	return &PointService{pointRepo: pointRepo, oafBotRepo: oafBotRepo, accountRepo: accountRepo}
}

func (s *PointService) Center(userID uint) (*dto.PointCenterResponse, error) {
	account, err := s.pointRepo.Account(userID)
	if err != nil {
		return nil, err
	}
	claims, err := s.pointRepo.Claims(userID)
	if err != nil {
		return nil, err
	}
	claimed := map[string]bool{}
	for _, claim := range claims {
		claimed[claim.ActivityCode+":"+claim.ClaimKey] = true
	}
	now := time.Now().UTC()
	defs, err := s.activities(now)
	if err != nil {
		return nil, err
	}
	activities := make([]dto.PointActivityData, 0, len(defs))
	for _, activity := range defs {
		key := pointClaimKey(activity.ClaimPeriod, now)
		activities = append(activities, dto.PointActivityData{
			Code:        activity.Code,
			Title:       activity.Title,
			Description: activity.Description,
			Points:      activity.Points,
			Claimed:     claimed[activity.Code+":"+key],
			Claimable:   !claimed[activity.Code+":"+key] && activity.Claimable(s, userID),
		})
	}
	ledgerRows, err := s.pointRepo.Ledger(userID, 50)
	if err != nil {
		return nil, err
	}
	return &dto.PointCenterResponse{
		Account: dto.PointAccountData{
			Balance:        account.Balance,
			Frozen:         account.Frozen,
			LifetimeEarned: account.LifetimeEarned,
			LifetimeSpent:  account.LifetimeSpent,
			ExchangeRate:   "10 points = 1 USDT",
		},
		Activities: activities,
		Ledger:     pointLedgerItems(ledgerRows),
	}, nil
}

func (s *PointService) Claim(userID uint, req dto.PointClaimRequest) (*dto.PointCenterResponse, error) {
	var selected *pointActivityDefinition
	now := time.Now().UTC()
	defs, err := s.activities(now)
	if err != nil {
		return nil, err
	}
	for _, activity := range defs {
		if activity.Code == req.ActivityCode {
			a := activity
			selected = &a
			break
		}
	}
	if selected == nil {
		return nil, fmt.Errorf("unknown point activity")
	}
	if !selected.Claimable(s, userID) {
		return nil, fmt.Errorf("activity is not claimable")
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	earnedToday, err := s.pointRepo.EarnedPointsInPeriod(userID, dayStart, dayStart.AddDate(0, 0, 1))
	if err != nil {
		return nil, err
	}
	if earnedToday+selected.Points > pointDailyEarnLimit {
		return nil, fmt.Errorf("daily point earning limit reached")
	}
	details, _ := json.Marshal(map[string]any{"activity": selected.Code, "title": selected.Title})
	if err := s.pointRepo.EarnActivity(userID, selected.Code, pointClaimKey(selected.ClaimPeriod, now), selected.Points, now, string(details)); err != nil {
		return nil, err
	}
	return s.Center(userID)
}

func (s *PointService) activities(now time.Time) ([]pointActivityDefinition, error) {
	rows, err := s.pointRepo.Activities(now)
	if err != nil {
		return nil, err
	}
	out := make([]pointActivityDefinition, 0, len(rows))
	for _, row := range rows {
		out = append(out, pointActivityDefinition{
			Code:        row.Code,
			Title:       row.Title,
			Description: row.Description,
			Points:      row.Points,
			ClaimPeriod: normalizePointClaimPeriod(row.ClaimPeriod),
			Claimable:   pointActivityClaimable(row.Code),
		})
	}
	if len(out) > 0 {
		return out, nil
	}
	return defaultPointActivities(), nil
}

func defaultPointActivities() []pointActivityDefinition {
	return []pointActivityDefinition{
		{
			Code:        "daily_check_in",
			Title:       "Daily check-in",
			Description: "Claim once per day after signing in.",
			Points:      5,
			ClaimPeriod: "daily",
			Claimable:   pointActivityClaimable("daily_check_in"),
		},
		{
			Code:        "bind_x_account",
			Title:       "Bind an X account",
			Description: "Claim after connecting at least one X account.",
			Points:      30,
			ClaimPeriod: "once",
			Claimable:   pointActivityClaimable("bind_x_account"),
		},
		{
			Code:        "create_oaf_bot",
			Title:       "Create an OAF Bot",
			Description: "Claim after creating at least one OAF Bot.",
			Points:      50,
			ClaimPeriod: "once",
			Claimable:   pointActivityClaimable("create_oaf_bot"),
		},
	}
}

func pointActivityClaimable(code string) func(*PointService, uint) bool {
	switch code {
	case "daily_check_in":
		return func(_ *PointService, _ uint) bool { return true }
	case "bind_x_account":
		return func(s *PointService, userID uint) bool {
			if s == nil || s.accountRepo == nil {
				return false
			}
			n, err := s.accountRepo.CountByUserID(userID)
			return err == nil && n > 0
		}
	case "create_oaf_bot":
		return func(s *PointService, userID uint) bool {
			if s == nil || s.oafBotRepo == nil {
				return false
			}
			n, err := s.oafBotRepo.CountByUserID(userID)
			return err == nil && n > 0
		}
	default:
		return func(_ *PointService, _ uint) bool { return false }
	}
}

func normalizePointClaimPeriod(v string) string {
	switch v {
	case "daily", "monthly", "once":
		return v
	default:
		return "once"
	}
}

func pointClaimKey(period string, now time.Time) string {
	now = now.UTC()
	switch normalizePointClaimPeriod(period) {
	case "daily":
		return now.Format("2006-01-02")
	case "monthly":
		return now.Format("2006-01")
	default:
		return "once"
	}
}

func pointLedgerItems(rows []model.PointLedgerEntry) []dto.PointLedgerItem {
	items := make([]dto.PointLedgerItem, 0, len(rows))
	for _, row := range rows {
		orderID := ""
		if row.OrderID > 0 {
			orderID = strconv.FormatUint(uint64(row.OrderID), 10)
		}
		items = append(items, dto.PointLedgerItem{
			ID:           strconv.FormatUint(uint64(row.ID), 10),
			EventType:    row.EventType,
			ActivityCode: row.ActivityCode,
			OrderID:      orderID,
			Points:       row.Points,
			BalanceAfter: row.BalanceAfter,
			FrozenAfter:  row.FrozenAfter,
			CreatedAt:    row.CreatedAt.UTC().Format(time.RFC3339),
			Details:      row.Details,
		})
	}
	return items
}
