package router

import (
	"fmt"
	"strings"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/controller"
	"octo-agent/backend/internal/email"
	openaiint "octo-agent/backend/internal/integration/openai"
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
	autoReplyDraftRepo := repository.NewAutoReplyDraftRepository(db)
	publishJobRepo := repository.NewPublishJobRepository(db)
	autoDMRecipientRuleRepo := repository.NewAutoDMRecipientRuleRepository(db)
	autoDMRecipientImportRepo := repository.NewAutoDMRecipientImportRepository(db)
	autoDMTaskRepo := repository.NewAutoDMTaskRepository(db)
	autoDMInboundEventRepo := repository.NewAutoDMInboundEventRepository(db)
	autoCommentTargetRepo := repository.NewAutoCommentTargetRepository(db)
	autoCommentTaskRepo := repository.NewAutoCommentTaskRepository(db)
	autoCommentScanLedgerRepo := repository.NewAutoCommentScanLedgerRepository(db)
	contentDraftPlanRepo := repository.NewContentDraftPlanRepository(db)
	contentDraftRepo := repository.NewContentDraftRepository(db)
	contentDraftRunRepo := repository.NewContentDraftGenerationRunRepository(db)
	trendTopicRepo := repository.NewTrendTopicRepository(db)
	exposureTweetSignalRepo := repository.NewExposureTweetSignalRepository(db)
	exposureRadarManualRecordRepo := repository.NewExposureRadarManualRecordRepository(db)
	exposureRadarGrowthStrategyRepo := repository.NewExposureRadarGrowthStrategyRepository(db)
	exposureRadarPeopleNoteRepo := repository.NewExposureRadarPeopleNoteRepository(db)
	trendFeedbackRepo := repository.NewTrendFeedbackRepository(db)
	contentLibraryRepo := repository.NewContentLibraryRepository(db)
	oafBotRepo := repository.NewOAFBotRepository(db)
	aiGenerationUsageRepo := repository.NewAIGenerationUsageRepository(db)
	oafBotFeedbackRepo := repository.NewOAFBotGenerationFeedbackRepository(db)
	reviewQueueVerdictRepo := repository.NewReviewQueueFeedbackIssueVerdictRepository(db)
	oafBotLearningRulePrefRepo := repository.NewOAFBotLearningRulePreferenceRepository(db)
	pointRepo := repository.NewPointRepository(db)
	referralRepo := repository.NewReferralRepository(db)
	verificationRepo := repository.NewEmailVerificationRepository(db)
	notificationSettingRepo := repository.NewUserNotificationSettingRepository(db)
	emailSender, err := newEmailSender(cfg)
	if err != nil {
		zap.L().Fatal("init email sender failed", zap.String("provider", cfg.Email.Provider), zap.Error(err))
	}
	emailService := email.NewService(emailSender)
	referralService := service.NewReferralService(referralRepo, pointRepo)
	authService := service.NewAuthService(userRepo, walletRepo, verificationRepo, notificationSettingRepo, emailService, cfg.Email.Local.ExposeCode, cfg.AdminAuth).WithReferralService(referralService)
	walletService := service.NewWalletService(walletRepo)
	accountService := service.NewAccountService(twitterAccountRepo, userRepo, cfg.XOAuth)
	dashboardService := service.NewDashboardService(userRepo, walletRepo, twitterAccountRepo, activityRepo, autoCommentTaskRepo, autoReplyDraftRepo, contentDraftRepo, publishJobRepo)
	automationService := service.NewAutomationService(automationRepo, userRepo, activityRepo, postRepo, contentDraftPlanRepo, autoCommentTaskRepo, autoReplyDraftRepo, contentDraftRepo)
	activityService := service.NewActivityService(activityRepo, twitterAccountRepo)
	analyticsService := service.NewAnalyticsService(activityRepo, postRepo, twitterAccountRepo, autoDMRecipientRuleRepo, autoDMRecipientImportRepo, autoDMTaskRepo)
	agentService := service.NewAgentService(automationRepo)
	openaiClient := openaiint.NewClient(openaiint.Config{
		APIKey:      cfg.LLM.OpenAI.APIKey,
		Model:       cfg.LLM.OpenAI.Model,
		BaseURL:     cfg.LLM.OpenAI.BaseURL,
		TimeoutSec:  cfg.LLM.OpenAI.TimeoutSec,
		MaxTokens:   cfg.LLM.OpenAI.MaxTokens,
		Temperature: cfg.LLM.OpenAI.Temperature,
	})
	aiService := service.NewAIService(openaiClient)
	billingOrderRepo := repository.NewBillingOrderRepository(db)
	billingService := service.NewBillingService(userRepo, billingOrderRepo, pointRepo, referralService, twitterAccountRepo, oafBotRepo, aiGenerationUsageRepo, contentDraftRepo, autoReplyDraftRepo, autoCommentTaskRepo, activityRepo, cfg)
	pointService := service.NewPointService(pointRepo, oafBotRepo, twitterAccountRepo, contentLibraryRepo, activityRepo)
	oafBotService := service.NewOAFBotService(oafBotRepo, twitterAccountRepo, userRepo, aiGenerationUsageRepo, oafBotFeedbackRepo, contentDraftPlanRepo, contentLibraryRepo, contentDraftRepo, autoReplyDraftRepo, autoCommentTaskRepo, reviewQueueVerdictRepo, oafBotLearningRulePrefRepo, aiService)
	publishingService := service.NewPublishingService(publishJobRepo, autoCommentTaskRepo, autoReplyDraftRepo, contentDraftRepo, twitterAccountRepo, automationRepo, userRepo, activityRepo, cfg.XPublisher, cfg.XOAuth, nil)
	autoReplyService := service.NewAutoReplyService(twitterAccountRepo, automationRepo, activityRepo, replyReservationRepo, userRepo, autoReplyDraftRepo, oafBotRepo, contentLibraryRepo, aiGenerationUsageRepo, oafBotFeedbackRepo, reviewQueueVerdictRepo, oafBotLearningRulePrefRepo, aiService, publishingService)
	autoDMService := service.NewAutoDMService(twitterAccountRepo, automationRepo, activityRepo, autoDMTaskRepo, autoDMInboundEventRepo, autoDMRecipientRuleRepo, autoDMRecipientImportRepo, userRepo, oafBotRepo, contentLibraryRepo, aiGenerationUsageRepo, aiService, cfg.App.FrontendBaseURL)
	autoCommentService := service.NewAutoCommentService(twitterAccountRepo, automationRepo, autoCommentTargetRepo, autoCommentTaskRepo, autoCommentScanLedgerRepo, activityRepo, userRepo, oafBotRepo, contentLibraryRepo, aiGenerationUsageRepo, oafBotFeedbackRepo, reviewQueueVerdictRepo, oafBotLearningRulePrefRepo, aiService, publishingService)
	exposureRadarManualService := service.NewExposureRadarManualService(exposureRadarManualRecordRepo).
		WithGrowthStrategyRepository(exposureRadarGrowthStrategyRepo).
		WithPeopleNoteRepository(exposureRadarPeopleNoteRepo).
		WithXBearerToken(cfg.XTrends.BearerToken)
	contentLibraryService := service.NewContentLibraryService(contentLibraryRepo, twitterAccountRepo, oafBotRepo)
	trendService := service.NewTrendService(trendTopicRepo, exposureTweetSignalRepo, trendFeedbackRepo, oafBotRepo, contentDraftPlanRepo, contentLibraryRepo, cfg.XTrends).
		WithAutoCommentTaskRepository(autoCommentTaskRepo).
		WithOAFBotGenerationFeedbackRepository(oafBotFeedbackRepo)
	postService := service.NewPostService(postRepo, twitterAccountRepo, automationRepo, activityRepo, userRepo, oafBotRepo, aiGenerationUsageRepo, oafBotFeedbackRepo, reviewQueueVerdictRepo, oafBotLearningRulePrefRepo, aiService, trendService, cfg.XPublisher)
	contentDraftService := service.NewContentDraftService(twitterAccountRepo, automationRepo, contentDraftPlanRepo, contentDraftRepo, contentDraftRunRepo, contentLibraryRepo, activityRepo, userRepo, oafBotRepo, aiGenerationUsageRepo, oafBotFeedbackRepo, reviewQueueVerdictRepo, oafBotLearningRulePrefRepo, aiService, publishingService, trendService)
	reviewQueueService := service.NewReviewQueueService(autoCommentTaskRepo, autoReplyDraftRepo, contentDraftRepo, publishJobRepo, oafBotRepo, twitterAccountRepo, contentLibraryRepo, reviewQueueVerdictRepo, activityRepo, autoCommentService, autoReplyService, contentDraftService, publishingService)
	a := controller.NewAuthController(authService)
	wc := controller.NewWalletController(walletService)
	dc := controller.NewDashboardController(dashboardService)
	acc := controller.NewAccountController(accountService, cfg.App.FrontendBaseURL)
	auto := controller.NewAutomationController(automationService, autoReplyService, autoDMService, autoCommentService, exposureRadarManualService)
	contentDraft := controller.NewContentDraftController(contentDraftService)
	trends := controller.NewTrendController(trendService)
	contentLibrary := controller.NewContentLibraryController(contentLibraryService)
	act := controller.NewActivityController(activityService)
	an := controller.NewAnalyticsController(analyticsService)
	bill := controller.NewBillingController(billingService)
	points := controller.NewPointController(pointService)
	referrals := controller.NewReferralController(referralService, cfg.App.FrontendBaseURL)
	oafBot := controller.NewOAFBotController(oafBotService)
	reviewQueue := controller.NewReviewQueueController(reviewQueueService)
	publishing := controller.NewPublishingController(publishingService)
	p := controller.NewPostController(postService)
	ag := controller.NewAgentController(agentService)
	admin := controller.NewAdminController(service.NewAdminService(db, cfg, userRepo, billingOrderRepo, trendService))
	pub := controller.NewPublicController(cfg.App)

	r.GET("/health", h.Ping)

	v1 := r.Group("/api/v1")
	RegisterPublic(v1, pub)
	RegisterAuth(v1, a)
	RegisterWallet(v1, wc)
	RegisterDashboard(v1, dc)
	RegisterAccount(v1, acc)
	RegisterAutomation(v1, auto)
	RegisterContentDrafts(v1, contentDraft)
	RegisterTrend(v1, trends)
	RegisterContentLibrary(v1, contentLibrary)
	RegisterActivity(v1, act)
	RegisterAnalytics(v1, an)
	RegisterBilling(v1, bill)
	RegisterPoint(v1, points)
	RegisterReferral(v1, referrals)
	RegisterOAFBot(v1, oafBot)
	RegisterReviewQueue(v1, reviewQueue)
	RegisterPublishing(v1, publishing)
	RegisterPost(v1, p)
	RegisterAgent(v1, ag)
	RegisterAdmin(v1, admin)
	jobs.Start(authService, postService, postRepo, contentDraftService, trendService, publishingService, billingService, pointRepo)

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
	trendTopicRepo := repository.NewTrendTopicRepository(db)
	exposureTweetSignalRepo := repository.NewExposureTweetSignalRepository(db)
	trendFeedbackRepo := repository.NewTrendFeedbackRepository(db)
	oafBotRepo := repository.NewOAFBotRepository(db)
	contentDraftPlanRepo := repository.NewContentDraftPlanRepository(db)
	contentLibraryRepo := repository.NewContentLibraryRepository(db)
	trendService := service.NewTrendService(trendTopicRepo, exposureTweetSignalRepo, trendFeedbackRepo, oafBotRepo, contentDraftPlanRepo, contentLibraryRepo, cfg.XTrends)
	adminService := service.NewAdminService(db, cfg, userRepo, billingOrderRepo, trendService)
	auth := controller.NewAuthController(authService)
	admin := controller.NewAdminController(adminService)

	r.GET("/health", h.Ping)
	r.GET("/admin/health", h.Ping)
	v1 := r.Group("/api/v1")
	RegisterAdminAuth(v1, auth)
	RegisterAdmin(v1, admin)
	return r
}
