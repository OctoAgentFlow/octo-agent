package service

import (
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

const (
	referralSignupInviterPoints   = int64(10)
	referralSignupInviteePoints   = int64(5)
	referralPurchaseRewardRateBps = int64(500)
	referralRewardPointsPerUSDT   = int64(10)
)

type ReferralService struct {
	referralRepo *repository.ReferralRepository
	pointRepo    *repository.PointRepository
}

func NewReferralService(referralRepo *repository.ReferralRepository, pointRepo *repository.PointRepository) *ReferralService {
	return &ReferralService{referralRepo: referralRepo, pointRepo: pointRepo}
}

func (s *ReferralService) InviteCode(userID uint) (*model.ReferralInvite, error) {
	invite, err := s.referralRepo.InviteByUser(userID)
	if err == nil {
		return invite, nil
	}
	if !repository.IsReferralNotFound(err) {
		return nil, err
	}
	for i := 0; i < 5; i++ {
		code, err := randomReferralCode()
		if err != nil {
			return nil, err
		}
		invite = &model.ReferralInvite{UserID: userID, Code: code, Enabled: true}
		if err := s.referralRepo.CreateInvite(invite); err == nil {
			return invite, nil
		}
	}
	return nil, fmt.Errorf("failed to create referral code")
}

func (s *ReferralService) Info(userID uint, frontendBaseURL string) (dto.ReferralInfoResponse, error) {
	invite, err := s.InviteCode(userID)
	if err != nil {
		return dto.ReferralInfoResponse{}, err
	}
	return referralInfoDTO(invite, frontendBaseURL), nil
}

func (s *ReferralService) ApplySignupReferral(tx *gorm.DB, inviteeUserID uint, inviteCode string) error {
	inviteCode = strings.ToUpper(strings.TrimSpace(inviteCode))
	if inviteCode == "" {
		return nil
	}
	invite, err := s.referralRepo.InviteByCode(inviteCode)
	if err != nil {
		if repository.IsReferralNotFound(err) {
			return nil
		}
		return err
	}
	if invite.UserID == inviteeUserID {
		return nil
	}
	now := time.Now().UTC()
	details, _ := json.Marshal(map[string]any{"invite_code": invite.Code, "invitee_user_id": inviteeUserID, "inviter_user_id": invite.UserID})
	record := &model.ReferralRecord{
		InviterUserID:    invite.UserID,
		InviteeUserID:    inviteeUserID,
		InviteCode:       invite.Code,
		SignupRewardedAt: &now,
		Details:          string(details),
	}
	if err := s.referralRepo.CreateRecord(tx, record); err != nil {
		return err
	}
	if err := s.referralRepo.IncrementUseCount(tx, invite.ID); err != nil {
		return err
	}
	if err := s.pointRepo.AwardSystemPointsInTx(tx, invite.UserID, "referral", fmt.Sprintf("signup_inviter:%d", inviteeUserID), "referral_signup_inviter", referralSignupInviterPoints, fmt.Sprintf("referral_signup_inviter:%d", inviteeUserID), string(details)); err != nil {
		return err
	}
	return s.pointRepo.AwardSystemPointsInTx(tx, inviteeUserID, "referral", fmt.Sprintf("signup_invitee:%d", invite.UserID), "referral_signup_invitee", referralSignupInviteePoints, fmt.Sprintf("referral_signup_invitee:%d", inviteeUserID), string(details))
}

func (s *ReferralService) RewardFirstPurchase(inviteeUserID uint, orderID uint, paidAmount string) error {
	record, err := s.referralRepo.RecordByInvitee(inviteeUserID)
	if err != nil {
		if repository.IsReferralNotFound(err) {
			return nil
		}
		return err
	}
	if record.FirstPurchaseRewardedAt != nil {
		return nil
	}
	rewardPoints, err := referralPurchaseRewardPoints(paidAmount)
	if err != nil {
		return err
	}
	if rewardPoints <= 0 {
		return nil
	}
	now := time.Now().UTC()
	details, _ := json.Marshal(map[string]any{
		"invite_code":       record.InviteCode,
		"invitee_user_id":   inviteeUserID,
		"inviter_user_id":   record.InviterUserID,
		"order_id":          orderID,
		"paid_amount":       paidAmount,
		"reward_rate_bps":   referralPurchaseRewardRateBps,
		"reward_points":     rewardPoints,
		"points_per_usdt":   referralRewardPointsPerUSDT,
		"reward_basis":      "actual_paid_amount",
		"reward_percentage": "5%",
	})
	return s.referralRepo.DB.Transaction(func(tx *gorm.DB) error {
		if err := s.referralRepo.MarkFirstPurchaseRewarded(tx, record.ID, now); err != nil {
			return err
		}
		return s.pointRepo.AwardSystemPointsInTx(tx, record.InviterUserID, "referral", fmt.Sprintf("first_purchase:%d", inviteeUserID), "referral_first_purchase", rewardPoints, fmt.Sprintf("referral_first_purchase:%d", inviteeUserID), string(details))
	})
}

func referralPurchaseRewardPoints(amount string) (int64, error) {
	cents, err := referralAmountToCents(amount)
	if err != nil {
		return 0, err
	}
	rewardCents := ceilDivInt64(cents*referralPurchaseRewardRateBps, 10000)
	return ceilDivInt64(rewardCents*referralRewardPointsPerUSDT, 100), nil
}

func referralAmountToCents(amount string) (int64, error) {
	value := strings.TrimSpace(amount)
	if value == "" {
		return 0, fmt.Errorf("invalid referral reward amount")
	}
	parts := strings.SplitN(value, ".", 3)
	if len(parts) > 2 {
		return 0, fmt.Errorf("invalid referral reward amount")
	}
	wholeText := strings.TrimSpace(parts[0])
	if wholeText == "" {
		wholeText = "0"
	}
	whole, err := strconv.ParseInt(wholeText, 10, 64)
	if err != nil || whole < 0 {
		return 0, fmt.Errorf("invalid referral reward amount")
	}
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	if len(fraction) > 2 {
		fraction = fraction[:2]
	}
	for len(fraction) < 2 {
		fraction += "0"
	}
	cents := int64(0)
	if fraction != "" {
		cents, err = strconv.ParseInt(fraction, 10, 64)
		if err != nil || cents < 0 {
			return 0, fmt.Errorf("invalid referral reward amount")
		}
	}
	return whole*100 + cents, nil
}

func ceilDivInt64(value, divisor int64) int64 {
	if value <= 0 || divisor <= 0 {
		return 0
	}
	return (value + divisor - 1) / divisor
}

func randomReferralCode() (string, error) {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return strings.TrimRight(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b[:]), "=")[:10], nil
}

func referralInfoDTO(invite *model.ReferralInvite, frontendBaseURL string) dto.ReferralInfoResponse {
	code := ""
	uses := int64(0)
	if invite != nil {
		code = invite.Code
		uses = invite.UseCount
	}
	link := ""
	if strings.TrimSpace(frontendBaseURL) != "" && code != "" {
		link = strings.TrimRight(frontendBaseURL, "/") + "/login?ref=" + code
	}
	return dto.ReferralInfoResponse{
		Code:                 code,
		InviteLink:           link,
		UseCount:             uses,
		SignupInviterPoints:  referralSignupInviterPoints,
		SignupInviteePoints:  referralSignupInviteePoints,
		FirstPurchaseRateBps: referralPurchaseRewardRateBps,
	}
}
