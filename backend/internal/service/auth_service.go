package service

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
	"time"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/email"
	"octo-agent/backend/internal/model"
	appjwt "octo-agent/backend/internal/pkg/jwt"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/pkg/utils"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

type AuthService struct {
	userRepo         *repository.UserRepository
	walletRepo       *repository.WalletRepository
	verificationRepo *repository.EmailVerificationRepository
	notificationRepo *repository.UserNotificationSettingRepository
	emailService     *email.Service
	exposeEmailCode  bool
	adminAuth        config.AdminAuthConfig
}

var (
	ErrInvalidEmailCodePurpose = errors.New("invalid email code purpose")
	ErrEmailCodeRateLimited    = errors.New("please retry after cooldown")
	ErrSendVerificationEmail   = errors.New("failed to send verification email")
	ErrPersistVerificationCode = errors.New("failed to persist verification code")
	ErrAdminLoginForbidden     = errors.New("admin access forbidden")
)

func NewAuthService(
	userRepo *repository.UserRepository,
	walletRepo *repository.WalletRepository,
	verificationRepo *repository.EmailVerificationRepository,
	notificationRepo *repository.UserNotificationSettingRepository,
	emailService *email.Service,
	exposeEmailCode bool,
	adminAuth config.AdminAuthConfig,
) *AuthService {
	return &AuthService{
		userRepo:         userRepo,
		walletRepo:       walletRepo,
		verificationRepo: verificationRepo,
		notificationRepo: notificationRepo,
		emailService:     emailService,
		exposeEmailCode:  exposeEmailCode,
		adminAuth:        adminAuth,
	}
}

func (s *AuthService) Register(req dto.RegisterRequest) (*dto.AuthResponse, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))

	if err := s.verifyRegisterCode(email, req.VerificationCode); err != nil {
		return nil, err
	}

	if _, err := s.userRepo.GetByEmail(email); err == nil {
		return nil, errors.New("email already exists")
	}

	hash, err := utils.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "user"
	}

	now := time.Now().UTC()
	trialEnd := now.AddDate(0, 0, subscription.DefaultTrialDays)
	role := "user"
	if count, err := s.userRepo.Count(); err != nil {
		return nil, err
	} else if count == 0 {
		role = "owner"
	}
	user := &model.User{
		Email:                 email,
		Password:              hash,
		Name:                  name,
		Status:                "active",
		Role:                  role,
		SubscriptionPlanCode:  "free_trial",
		SubscriptionStatus:    "active",
		SubscriptionExpiresAt: &trialEnd,
	}
	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	return s.issueAuth(user)
}

func (s *AuthService) SendEmailCode(req dto.SendEmailCodeRequest) (*dto.SendEmailCodeResponse, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))
	purpose := strings.TrimSpace(strings.ToLower(req.Purpose))
	if purpose == "" {
		purpose = "register"
	}
	if !isAllowedEmailCodePurpose(purpose) {
		return nil, ErrInvalidEmailCodePurpose
	}
	if purpose == "admin_login" && !s.isAllowedAdminEmail(email) {
		return nil, ErrAdminLoginForbidden
	}

	latest, err := s.verificationRepo.GetLatestUnexpiredByEmailPurpose(email, purpose)
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}
	if latest != nil {
		if wait := latest.CreatedAt.Add(60 * time.Second).Sub(time.Now()); wait > 0 {
			return nil, fmt.Errorf("%w: %d seconds", ErrEmailCodeRateLimited, int(wait.Seconds())+1)
		}
	}

	code, err := generateSixDigitCode()
	if err != nil {
		return nil, err
	}
	expiresIn := s.emailCodeTTLSeconds(purpose)

	if err := s.emailService.SendVerificationCode(context.Background(), email, code); err != nil {
		zap.L().Error("send email code failed", zap.String("email", email), zap.String("purpose", purpose), zap.Error(err))
		return nil, ErrSendVerificationEmail
	}

	record := &model.EmailVerificationCode{
		Email:     email,
		Purpose:   purpose,
		Code:      code,
		ExpiredAt: time.Now().Add(time.Duration(expiresIn) * time.Second),
	}
	if err := s.verificationRepo.Create(record); err != nil {
		zap.L().Error("persist email code failed after send", zap.String("email", email), zap.String("purpose", purpose), zap.Error(err))
		return nil, ErrPersistVerificationCode
	}
	zap.L().Info("send email code success", zap.String("email", email), zap.String("purpose", purpose))

	resp := &dto.SendEmailCodeResponse{
		Email:     email,
		Purpose:   purpose,
		ExpiresIn: expiresIn,
	}
	if s.exposeEmailCode {
		resp.Code = code
	}
	return resp, nil
}

func (s *AuthService) VerifyEmailCode(req dto.VerifyEmailCodeRequest) (*dto.VerifyEmailCodeResponse, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))
	purpose := strings.TrimSpace(strings.ToLower(req.Purpose))
	if purpose == "" {
		purpose = "register"
	}
	if !isAllowedEmailCodePurpose(purpose) {
		return nil, errors.New("invalid email code purpose")
	}
	if purpose == "admin_login" && !s.isAllowedAdminEmail(email) {
		return nil, ErrAdminLoginForbidden
	}
	if err := s.verifyEmailCode(email, purpose, req.Code); err != nil {
		zap.L().Warn("verify email code failed", zap.String("email", email), zap.String("purpose", purpose), zap.Error(err))
		return nil, errors.New("invalid or expired verification code")
	}
	zap.L().Info("verify email code success", zap.String("email", email), zap.String("purpose", purpose))
	return &dto.VerifyEmailCodeResponse{
		Email:    email,
		Purpose:  purpose,
		Verified: true,
	}, nil
}

func (s *AuthService) Login(req dto.LoginRequest) (*dto.AuthResponse, error) {
	user, err := s.authenticateUser(req)
	if err != nil {
		return nil, err
	}
	return s.issueAuth(user)
}

func (s *AuthService) AdminLogin(req dto.AdminLoginRequest) (*dto.AuthResponse, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if !s.isAllowedAdminEmail(email) {
		return nil, ErrAdminLoginForbidden
	}
	if err := s.verifyEmailCode(email, "admin_login", req.VerificationCode); err != nil {
		zap.L().Warn("admin login code verification failed", zap.String("email", email), zap.Error(err))
		return nil, errors.New("invalid or expired verification code")
	}
	user, err := s.getOrCreateAdminUser(email)
	if err != nil {
		return nil, err
	}
	return s.issueAuth(user)
}

func (s *AuthService) Refresh(req dto.RefreshRequest) (*dto.TokenData, error) {
	claims, err := appjwt.ParseRefreshToken(req.RefreshToken)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}
	accessToken, exp, err := appjwt.SignAccessToken(claims.UserID)
	if err != nil {
		return nil, err
	}
	refreshToken, err := appjwt.SignRefreshToken(claims.UserID)
	if err != nil {
		return nil, err
	}
	return &dto.TokenData{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    exp,
	}, nil
}

func (s *AuthService) AdminRefresh(req dto.RefreshRequest) (*dto.TokenData, error) {
	claims, err := appjwt.ParseRefreshToken(req.RefreshToken)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}
	user, err := s.userRepo.GetByID(claims.UserID)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}
	if !canAccessAdminFrontend(user) {
		return nil, ErrAdminLoginForbidden
	}
	accessToken, exp, err := appjwt.SignAccessToken(claims.UserID)
	if err != nil {
		return nil, err
	}
	refreshToken, err := appjwt.SignRefreshToken(claims.UserID)
	if err != nil {
		return nil, err
	}
	return &dto.TokenData{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    exp,
	}, nil
}

func (s *AuthService) Me(userID uint) (*dto.MeResponse, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}

	me := &dto.MeResponse{
		ID:     user.ID,
		Email:  user.Email,
		Name:   user.Name,
		Status: user.Status,
		Role:   user.Role,
	}

	if wallet, err := s.walletRepo.GetPrimaryWallet(userID); err == nil {
		me.WalletAddress = wallet.Address
	}
	return me, nil
}

func (s *AuthService) AdminMe(userID uint) (*dto.MeResponse, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	if !canAccessAdminFrontend(user) {
		return nil, ErrAdminLoginForbidden
	}
	return userToMeResponse(user), nil
}

func (s *AuthService) UpdateMe(userID uint, req dto.UpdateMeRequest) (*dto.MeResponse, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("name is required")
	}
	if len([]rune(name)) > 64 {
		return nil, errors.New("name must be 64 characters or less")
	}
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	user.Name = name
	if err := s.userRepo.Save(user); err != nil {
		return nil, err
	}
	return s.Me(userID)
}

func (s *AuthService) ChangePassword(userID uint, req dto.ChangePasswordRequest) (*dto.ChangePasswordResponse, error) {
	if len([]rune(req.NewPassword)) < 8 {
		return nil, errors.New("new password must be at least 8 characters")
	}
	if len([]rune(req.NewPassword)) > 128 {
		return nil, errors.New("new password must be 128 characters or less")
	}
	if req.CurrentPassword == req.NewPassword {
		return nil, errors.New("new password must be different from current password")
	}

	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	if !utils.CheckPassword(user.Password, req.CurrentPassword) {
		return nil, errors.New("current password is incorrect")
	}

	hash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		return nil, err
	}
	user.Password = hash
	if err := s.userRepo.Save(user); err != nil {
		return nil, err
	}
	return &dto.ChangePasswordResponse{Changed: true}, nil
}

func (s *AuthService) NotificationSettings(userID uint) (*dto.NotificationSettingsResponse, error) {
	setting, err := s.getOrCreateNotificationSettings(userID)
	if err != nil {
		return nil, err
	}
	return notificationSettingsToDTO(setting), nil
}

func (s *AuthService) UpdateNotificationSettings(userID uint, req dto.UpdateNotificationSettingsRequest) (*dto.NotificationSettingsResponse, error) {
	setting, err := s.getOrCreateNotificationSettings(userID)
	if err != nil {
		return nil, err
	}
	if req.EmailEnabled != nil {
		setting.EmailEnabled = *req.EmailEnabled
	}
	if req.InAppEnabled != nil {
		setting.InAppEnabled = *req.InAppEnabled
	}
	if req.AutomationFailure != nil {
		setting.AutomationFailure = *req.AutomationFailure
	}
	if req.BillingAlerts != nil {
		setting.BillingAlerts = *req.BillingAlerts
	}
	if req.ReviewRequired != nil {
		setting.ReviewRequired = *req.ReviewRequired
	}
	if req.SubscriptionAlerts != nil {
		setting.SubscriptionAlerts = *req.SubscriptionAlerts
	}
	if req.WeeklySummary != nil {
		setting.WeeklySummary = *req.WeeklySummary
	}
	if err := s.notificationRepo.Save(setting); err != nil {
		return nil, err
	}
	return notificationSettingsToDTO(setting), nil
}

func (s *AuthService) getOrCreateNotificationSettings(userID uint) (*model.UserNotificationSetting, error) {
	setting, err := s.notificationRepo.GetByUserID(userID)
	if err == nil {
		return setting, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	setting = defaultNotificationSettings(userID)
	if err := s.notificationRepo.Create(setting); err != nil {
		if existing, getErr := s.notificationRepo.GetByUserID(userID); getErr == nil {
			return existing, nil
		}
		return nil, err
	}
	return setting, nil
}

func defaultNotificationSettings(userID uint) *model.UserNotificationSetting {
	return &model.UserNotificationSetting{
		UserID:             userID,
		EmailEnabled:       true,
		InAppEnabled:       true,
		AutomationFailure:  true,
		BillingAlerts:      true,
		ReviewRequired:     true,
		SubscriptionAlerts: true,
		WeeklySummary:      false,
	}
}

func notificationSettingsToDTO(setting *model.UserNotificationSetting) *dto.NotificationSettingsResponse {
	return &dto.NotificationSettingsResponse{
		EmailEnabled:       setting.EmailEnabled,
		InAppEnabled:       setting.InAppEnabled,
		AutomationFailure:  setting.AutomationFailure,
		BillingAlerts:      setting.BillingAlerts,
		ReviewRequired:     setting.ReviewRequired,
		SubscriptionAlerts: setting.SubscriptionAlerts,
		WeeklySummary:      setting.WeeklySummary,
	}
}

func (s *AuthService) issueAuth(user *model.User) (*dto.AuthResponse, error) {
	accessToken, exp, err := appjwt.SignAccessToken(user.ID)
	if err != nil {
		return nil, err
	}
	refreshToken, err := appjwt.SignRefreshToken(user.ID)
	if err != nil {
		return nil, err
	}

	return &dto.AuthResponse{
		User: dto.AuthUserData{
			ID:    user.ID,
			Email: user.Email,
			Name:  user.Name,
			Role:  user.Role,
		},
		Tokens: dto.TokenData{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			ExpiresIn:    exp,
		},
	}, nil
}

func (s *AuthService) authenticateUser(req dto.LoginRequest) (*model.User, error) {
	user, err := s.userRepo.GetByEmail(strings.ToLower(strings.TrimSpace(req.Email)))
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errors.New("invalid email or password")
		}
		return nil, err
	}
	if !utils.CheckPassword(user.Password, req.Password) {
		return nil, errors.New("invalid email or password")
	}
	return user, nil
}

func userToMeResponse(user *model.User) *dto.MeResponse {
	return &dto.MeResponse{
		ID:     user.ID,
		Email:  user.Email,
		Name:   user.Name,
		Status: user.Status,
		Role:   user.Role,
	}
}

func canAccessAdminFrontend(user *model.User) bool {
	if user == nil || strings.ToLower(strings.TrimSpace(user.Status)) != "active" {
		return false
	}
	role := strings.ToLower(strings.TrimSpace(user.Role))
	return role == "owner" || role == "admin"
}

func (s *AuthService) getOrCreateAdminUser(email string) (*model.User, error) {
	user, err := s.userRepo.GetByEmail(email)
	if err == nil {
		changed := false
		if strings.ToLower(strings.TrimSpace(user.Status)) != "active" {
			user.Status = "active"
			changed = true
		}
		if !canAccessAdminFrontend(user) {
			user.Role = "admin"
			changed = true
		}
		if strings.TrimSpace(user.Name) == "" {
			user.Name = "admin"
			changed = true
		}
		if changed {
			if err := s.userRepo.Save(user); err != nil {
				return nil, err
			}
		}
		return user, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	rawPassword, err := randomHexString(32)
	if err != nil {
		return nil, err
	}
	hash, err := utils.HashPassword(rawPassword)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	user = &model.User{
		Email:                 email,
		Password:              hash,
		Name:                  "admin",
		Status:                "active",
		Role:                  "admin",
		SubscriptionPlanCode:  "free_trial",
		SubscriptionStatus:    "active",
		SubscriptionExpiresAt: ptrTime(now.AddDate(0, 0, subscription.DefaultTrialDays)),
	}
	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}
	return user, nil
}

func (s *AuthService) isAllowedAdminEmail(email string) bool {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return false
	}
	for _, item := range s.adminAuth.Emails {
		if strings.TrimSpace(strings.ToLower(item)) == email {
			return true
		}
	}
	return false
}

func (s *AuthService) emailCodeTTLSeconds(purpose string) int64 {
	if strings.TrimSpace(strings.ToLower(purpose)) == "admin_login" {
		if s.adminAuth.CodeTTLSeconds > 0 {
			return int64(s.adminAuth.CodeTTLSeconds)
		}
		return 300
	}
	return 600
}

func ptrTime(v time.Time) *time.Time {
	return &v
}

func (s *AuthService) verifyRegisterCode(email, code string) error {
	return s.verifyEmailCode(email, "register", code)
}

func (s *AuthService) verifyEmailCode(email, purpose, code string) error {
	rec, err := s.verificationRepo.GetLatestValid(email, purpose, code)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("invalid or expired verification code")
		}
		return err
	}
	if err := s.verificationRepo.DeleteByID(rec.ID); err != nil {
		return err
	}
	return nil
}

func (s *AuthService) CleanupExpiredEmailCodes() (int64, error) {
	rows, err := s.verificationRepo.CleanupExpired(500)
	if err != nil {
		return 0, err
	}
	if rows > 0 {
		zap.L().Info("cleanup expired email codes", zap.Int64("deleted", rows))
	}
	return rows, nil
}

func isAllowedEmailCodePurpose(purpose string) bool {
	return purpose == "register" || purpose == "admin_login"
}

func generateSixDigitCode() (string, error) {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	v := binary.BigEndian.Uint64(b[:]) % 1000000
	return fmt.Sprintf("%06d", v), nil
}
