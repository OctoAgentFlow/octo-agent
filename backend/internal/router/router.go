package router

import (
	"fmt"
	"strings"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/email"
	"octo-agent/backend/internal/jobs"
	"octo-agent/backend/internal/middleware"
	"octo-agent/backend/internal/repository"
	"octo-agent/backend/internal/service"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func newBaseRouter() *gin.Engine {
	r := gin.New()
	r.Use(middleware.RequestID(), middleware.Logger(), middleware.Recovery(), middleware.CORS())
	return r
}

func NewAPI(db *gorm.DB, cfg *config.Config) *gin.Engine {
	r := newBaseRouter()

	h := controller.NewHealthController()
	userRepo := repository.NewUserRepository(db)
	walletRepo := repository.NewWalletRepository(db)
	twitterAccountRepo := repository.NewTwitterAccountRepository(db)
	postRepo := repository.NewPostRepository(db)
	automationRepo := repository.NewAutomationRepository(db)
	activityRepo := repository.NewActivityRepository(db)
	replyReservationRepo := repository.NewReplyReservationRepository(db)
	autoDMRecipientRuleRepo := repository.NewAutoDMRecipientRuleRepository(db)
	autoDMRecipientImportRepo := repository.NewAutoDMRecipientImportRepository(db)
	autoDMTaskRepo := repository.NewAutoDMTaskRepository(db)
	verificationRepo := repository.NewEmailVerificationRepository(db)
	notificationSettingRepo := repository.NewUserNotificationSettingRepository(db)
	emailSender, err := newEmailSender(cfg)
	if err != nil {
		zap.L().Fatal("init email sender failed", zap.String("provider", cfg.Email.Provider), zap.Error(err))
	}
	emailService := email.NewService(emailSender)
	authService := service.NewAuthService(userRepo, walletRepo, verificationRepo, notificationSettingRepo, emailService, cfg.Email.Local.ExposeCode, cfg.AdminAuth)
	walletService := service.NewWalletService(walletRepo)
	accountService := service.NewAccountService(twitterAccountRepo, userRepo, cfg.XOAuth)
	dashboardService := service.NewDashboardService(userRepo, walletRepo, twitterAccountRepo, activityRepo)
	automationService := service.NewAutomationService(automationRepo, userRepo, activityRepo, postRepo)
	activityService := service.NewActivityService(activityRepo, twitterAccountRepo)
	analyticsService := service.NewAnalyticsService(activityRepo, postRepo, twitterAccountRepo, autoDMRecipientRuleRepo, autoDMRecipientImportRepo, autoDMTaskRepo)
	agentService := service.NewAgentService(automationRepo)
	billingOrderRepo := repository.NewBillingOrderRepository(db)
	billingService := service.NewBillingService(userRepo, billingOrderRepo, cfg)
	postService := service.NewPostService(postRepo, twitterAccountRepo, automationRepo, activityRepo, userRepo)
	autoReplyService := service.NewAutoReplyService(twitterAccountRepo, automationRepo, activityRepo, replyReservationRepo, userRepo)
	autoDMService := service.NewAutoDMService(twitterAccountRepo, automationRepo, activityRepo, autoDMTaskRepo, autoDMRecipientRuleRepo, autoDMRecipientImportRepo, userRepo, cfg.App.FrontendBaseURL)
	a := controller.NewAuthController(authService)
	wc := controller.NewWalletController(walletService)
	dc := controller.NewDashboardController(dashboardService)
	acc := controller.NewAccountController(accountService, cfg.App.FrontendBaseURL)
	auto := controller.NewAutomationController(automationService, autoDMService)
	act := controller.NewActivityController(activityService)
	an := controller.NewAnalyticsController(analyticsService)
	bill := controller.NewBillingController(billingService)
	p := controller.NewPostController(postService)
	ag := controller.NewAgentController(agentService)
	pub := controller.NewPublicController(cfg.App)

	r.GET("/health", h.Ping)

	v1 := r.Group("/api/v1")
	RegisterPublic(v1, pub)
	RegisterAuth(v1, a)
	RegisterWallet(v1, wc)
	RegisterDashboard(v1, dc)
	RegisterAccount(v1, acc)
	RegisterAutomation(v1, auto)
	RegisterActivity(v1, act)
	RegisterAnalytics(v1, an)
	RegisterBilling(v1, bill)
	RegisterPost(v1, p)
	RegisterAgent(v1, ag)
	jobs.Start(authService, postService, postRepo, autoReplyService, autoDMService)

	return r
}

func newEmailSender(cfg *config.Config) (email.EmailSender, error) {
	switch strings.ToLower(strings.TrimSpace(cfg.Email.Provider)) {
	case "local":
		return email.NewLocalSender(), nil
	case "resend":
		return email.NewResendSender(cfg.Email.Resend)
	case "ses":
		return email.NewSESSender(cfg.Email.SES)
	default:
		return nil, fmt.Errorf("unsupported email provider: %s", cfg.Email.Provider)
	}
}

func NewAdmin(db *gorm.DB, cfg *config.Config) *gin.Engine {
	r := newBaseRouter()
	h := controller.NewHealthController()
	userRepo := repository.NewUserRepository(db)
	walletRepo := repository.NewWalletRepository(db)
	verificationRepo := repository.NewEmailVerificationRepository(db)
	notificationSettingRepo := repository.NewUserNotificationSettingRepository(db)
	emailSender, err := newEmailSender(cfg)
	if err != nil {
		zap.L().Fatal("init admin email sender failed", zap.String("provider", cfg.Email.Provider), zap.Error(err))
	}
	emailService := email.NewService(emailSender)
	authService := service.NewAuthService(userRepo, walletRepo, verificationRepo, notificationSettingRepo, emailService, cfg.Email.Local.ExposeCode, cfg.AdminAuth)
	billingOrderRepo := repository.NewBillingOrderRepository(db)
	adminService := service.NewAdminService(db, cfg, userRepo, billingOrderRepo)
	auth := controller.NewAuthController(authService)
	admin := controller.NewAdminController(adminService)

	r.GET("/health", h.Ping)
	r.GET("/admin/health", h.Ping)
	v1 := r.Group("/api/v1")
	RegisterAdminAuth(v1, auth)
	RegisterAdmin(v1, admin)
	return r
}
