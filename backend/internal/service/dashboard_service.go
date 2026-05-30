package service

import (
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

type DashboardService struct {
	userRepo     *repository.UserRepository
	walletRepo   *repository.WalletRepository
	accountRepo  *repository.TwitterAccountRepository
	activityRepo *repository.ActivityRepository
}

func NewDashboardService(
	userRepo *repository.UserRepository,
	walletRepo *repository.WalletRepository,
	accountRepo *repository.TwitterAccountRepository,
	activityRepo *repository.ActivityRepository,
) *DashboardService {
	return &DashboardService{
		userRepo:     userRepo,
		walletRepo:   walletRepo,
		accountRepo:  accountRepo,
		activityRepo: activityRepo,
	}
}

func (s *DashboardService) Overview(userID uint) (*dto.DashboardOverviewResponse, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}

	walletBound := true
	if _, err := s.walletRepo.GetPrimaryWallet(userID); err != nil {
		if err == gorm.ErrRecordNotFound {
			walletBound = false
		} else {
			return nil, err
		}
	}

	connectedCount, err := s.accountRepo.CountByUserID(userID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	trialLeft := subscription.TrialDaysLeft(user, now)
	plan := subscription.NormalizePlanCode(user.SubscriptionPlanCode)
	subSt := subscription.EffectiveStatus(user, now)
	expiresAt := ""
	if user.SubscriptionExpiresAt != nil {
		expiresAt = user.SubscriptionExpiresAt.UTC().Format(time.RFC3339)
	}

	act24, err := s.activityRepo.CountExecutedBetween(userID, now.Add(-24*time.Hour), now)
	if err != nil {
		return nil, err
	}
	actPrev24, err := s.activityRepo.CountExecutedBetween(userID, now.Add(-48*time.Hour), now.Add(-24*time.Hour))
	if err != nil {
		return nil, err
	}
	since7d := now.Add(-7 * 24 * time.Hour)
	succ, fail, err := s.activityRepo.SuccessVsFailedSince(userID, since7d)
	if err != nil {
		return nil, err
	}
	ratePct := 0
	if denom := succ + fail; denom > 0 {
		ratePct = int((100*succ + denom/2) / denom)
	}
	lastAt, err := s.activityRepo.LatestExecutedAt(userID)
	if err != nil {
		return nil, err
	}

	return &dto.DashboardOverviewResponse{
		Plan:                  plan,
		TrialDaysLeft:         trialLeft,
		SubscriptionStatus:    subSt,
		SubscriptionExpiresAt: expiresAt,
		WalletBound:           walletBound,
		ConnectedXCount:       connectedCount,

		ActivityCount24h:       act24,
		ActivityCountPrev24h:   actPrev24,
		ActivitySuccessRatePct: ratePct,
		LastActivityAt:         lastAt,
	}, nil
}
