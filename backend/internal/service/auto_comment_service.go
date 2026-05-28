package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

const autoCommentPreviewRunes = 220

const (
	autoCommentDeliveryAutoComment   = "auto_comment"
	autoCommentDeliveryManualComment = "manual_comment"
	autoCommentDeliveryQuotePost     = "quote_post"
	autoCommentDeliverySkip          = "skip"
	autoCommentDeliveryInbound       = "inbound_handoff"
)

type autoCommentDeliveryDecision struct {
	Mode           string
	Reason         string
	Eligible       bool
	BlockReason    string
	ManualURL      string
	QuoteCandidate string
}

type AutoCommentService struct {
	accountRepo    *repository.TwitterAccountRepository
	automationRepo *repository.AutomationRepository
	targetRepo     *repository.AutoCommentTargetRepository
	taskRepo       *repository.AutoCommentTaskRepository
	activityRepo   *repository.ActivityRepository
	userRepo       *repository.UserRepository
	oafBotRepo     *repository.OAFBotRepository
	contentRepo    *repository.ContentLibraryRepository
	usageRepo      *repository.AIGenerationUsageRepository
	feedbackRepo   *repository.OAFBotGenerationFeedbackRepository
	ai             *AIService
	publishing     *PublishingService
}

func NewAutoCommentService(
	accountRepo *repository.TwitterAccountRepository,
	automationRepo *repository.AutomationRepository,
	targetRepo *repository.AutoCommentTargetRepository,
	taskRepo *repository.AutoCommentTaskRepository,
	activityRepo *repository.ActivityRepository,
	userRepo *repository.UserRepository,
	oafBotRepo *repository.OAFBotRepository,
	contentRepo *repository.ContentLibraryRepository,
	usageRepo *repository.AIGenerationUsageRepository,
	feedbackRepo *repository.OAFBotGenerationFeedbackRepository,
	ai *AIService,
	publishing *PublishingService,
) *AutoCommentService {
	return &AutoCommentService{
		accountRepo:    accountRepo,
		automationRepo: automationRepo,
		targetRepo:     targetRepo,
		taskRepo:       taskRepo,
		activityRepo:   activityRepo,
		userRepo:       userRepo,
		oafBotRepo:     oafBotRepo,
		contentRepo:    contentRepo,
		usageRepo:      usageRepo,
		feedbackRepo:   feedbackRepo,
		ai:             ai,
		publishing:     publishing,
	}
}

func (s *AutoCommentService) ListTargets(userID uint) (*dto.AutoCommentTargetsResponse, error) {
	rows, err := s.targetRepo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoCommentTargetItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, toAutoCommentTargetItem(row))
	}
	return &dto.AutoCommentTargetsResponse{Items: items}, nil
}

func (s *AutoCommentService) CreateTarget(userID uint, req dto.AutoCommentTargetRequest) (*dto.AutoCommentTargetItem, error) {
	username := normalizeHandle(firstNonEmpty(req.TargetUsername, req.TargetAuthorHandle))
	if username == "" {
		return nil, fmt.Errorf("target author handle is required")
	}
	xAccountID, err := s.resolveExecutorAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, err
	}
	tweetID := strings.TrimSpace(req.TargetTweetID)
	if tweetID == "" {
		tweetID = extractTweetID(req.TargetTweetURL)
	}
	targetText := strings.TrimSpace(req.TargetText)
	if targetText != "" && tweetID == "" {
		return nil, fmt.Errorf("target tweet URL or tweet ID is required")
	}
	if tweetID != "" {
		if existing, err := s.targetRepo.GetByUserAccountAndTweet(userID, xAccountID, tweetID); err == nil {
			applyManualCommentTarget(existing, req, username, tweetID, targetText)
			if err := s.targetRepo.Save(existing); err != nil {
				return nil, err
			}
			item := toAutoCommentTargetItem(*existing)
			return &item, nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		if existing, err := s.targetRepo.GetByUserAccountAndUsername(userID, xAccountID, username); err == nil && strings.TrimSpace(existing.TargetTweetID) == "" {
			applyManualCommentTarget(existing, req, username, tweetID, targetText)
			if err := s.targetRepo.Save(existing); err != nil {
				return nil, err
			}
			item := toAutoCommentTargetItem(*existing)
			return &item, nil
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	target := &model.AutoCommentTarget{
		UserID:             userID,
		XAccountID:         xAccountID,
		TargetUsername:     username,
		TargetAuthorHandle: username,
		TargetTweetID:      tweetID,
		TargetTweetURL:     strings.TrimSpace(req.TargetTweetURL),
		TargetText:         truncateRunes(targetText, 1000),
		TargetCategory:     normalizeAutoCommentTargetCategory(req.TargetCategory),
		Priority:           normalizeAutoCommentTargetPriority(req.Priority),
		Notes:              truncateRunes(strings.TrimSpace(req.Notes), 512),
		Status:             "active",
	}
	if tweetID != "" || targetText != "" {
		target.Status = "paused"
	}
	if err := s.targetRepo.Create(target); err != nil {
		return nil, err
	}
	item := toAutoCommentTargetItem(*target)
	return &item, nil
}

func (s *AutoCommentService) BulkImportTargets(userID uint, req dto.AutoCommentTargetBulkImportRequest) (*dto.AutoCommentTargetBulkImportResponse, error) {
	xAccountID, err := s.resolveExecutorAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, err
	}
	handles := normalizeAutoCommentBulkHandles(req.Handles, req.RawHandles)
	if len(handles) == 0 {
		return nil, fmt.Errorf("at least one target handle is required")
	}
	category := normalizeAutoCommentTargetCategory(req.TargetCategory)
	priority := normalizeAutoCommentTargetPriority(req.Priority)
	notes := truncateRunes(strings.TrimSpace(req.Notes), 512)
	resp := &dto.AutoCommentTargetBulkImportResponse{Items: []dto.AutoCommentTargetItem{}, Errors: []string{}}
	for _, handle := range handles {
		existing, err := s.targetRepo.GetByUserAccountAndUsername(userID, xAccountID, handle)
		if err == nil {
			existing.TargetCategory = category
			existing.Priority = priority
			existing.Notes = notes
			if existing.Status == "" {
				existing.Status = "active"
			}
			if err := s.targetRepo.Save(existing); err != nil {
				resp.Errors = append(resp.Errors, fmt.Sprintf("@%s: %s", handle, err.Error()))
				resp.Skipped++
				continue
			}
			item := toAutoCommentTargetItem(*existing)
			resp.Items = append(resp.Items, item)
			resp.Updated++
			continue
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			resp.Errors = append(resp.Errors, fmt.Sprintf("@%s: %s", handle, err.Error()))
			resp.Skipped++
			continue
		}
		target := &model.AutoCommentTarget{
			UserID:             userID,
			XAccountID:         xAccountID,
			TargetUsername:     handle,
			TargetAuthorHandle: handle,
			TargetCategory:     category,
			Priority:           priority,
			Notes:              notes,
			Status:             "active",
		}
		if err := s.targetRepo.Create(target); err != nil {
			resp.Errors = append(resp.Errors, fmt.Sprintf("@%s: %s", handle, err.Error()))
			resp.Skipped++
			continue
		}
		item := toAutoCommentTargetItem(*target)
		resp.Items = append(resp.Items, item)
		resp.Imported++
	}
	return resp, nil
}

func (s *AutoCommentService) SuggestTargets(ctx context.Context, userID uint, req dto.AutoCommentTargetSuggestionRequest) (*dto.AutoCommentTargetSuggestionResponse, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	xAccountID, err := s.resolveExecutorAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, err
	}
	bot, err := s.botForAccount(userID, xAccountID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	targets, err := s.targetRepo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	contentRows, _ := s.contentRepo.ListActiveForGenerationContext(userID, xAccountID, botIDForUsage(bot), 12)
	input := autoCommentTargetSuggestionInput(bot, targets, contentRows)
	generated, err := s.ai.GenerateAutoCommentTargetSuggestions(ctx, input)
	if err != nil {
		return nil, err
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, botIDForUsage(bot), repository.AIGenerationSceneAutoComment, now, generated.Usage); err != nil {
		return nil, err
	}
	items := make([]dto.AutoCommentTargetSuggestionItem, 0, len(generated.Items))
	for _, item := range generated.Items {
		items = append(items, dto.AutoCommentTargetSuggestionItem{
			Handle:      item.Handle,
			DisplayName: item.DisplayName,
			Category:    normalizeAutoCommentTargetCategory(item.Category),
			Priority:    normalizeAutoCommentTargetPriority(item.Priority),
			Reason:      item.Reason,
			SearchQuery: item.SearchQuery,
			NeedsVerify: true,
		})
	}
	return &dto.AutoCommentTargetSuggestionResponse{Items: items}, nil
}

func (s *AutoCommentService) UpdateTargetStatus(userID, id uint, status string) (*dto.AutoCommentTargetItem, error) {
	status = strings.ToLower(strings.TrimSpace(status))
	if status != "active" && status != "paused" {
		return nil, fmt.Errorf("invalid target status")
	}
	target, err := s.targetRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	target.Status = status
	if err := s.targetRepo.Save(target); err != nil {
		return nil, err
	}
	item := toAutoCommentTargetItem(*target)
	return &item, nil
}

func (s *AutoCommentService) DeleteTarget(userID, id uint) error {
	return s.targetRepo.DeleteByUserAndID(userID, id)
}

func (s *AutoCommentService) ListTasks(userID uint) (*dto.AutoCommentTasksResponse, error) {
	rows, err := s.taskRepo.ListByUser(userID, 50)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoCommentTaskItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, toAutoCommentTaskItem(row))
	}
	return &dto.AutoCommentTasksResponse{Items: items}, nil
}

func (s *AutoCommentService) Analytics(userID uint) (*dto.AutoCommentAnalyticsResponse, error) {
	tasks, err := s.taskRepo.ListQueueByUser(userID, 500)
	if err != nil {
		return nil, err
	}
	targets, err := s.targetRepo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	targetByID := map[uint]model.AutoCommentTarget{}
	for _, target := range targets {
		targetByID[target.ID] = target
	}
	resp := &dto.AutoCommentAnalyticsResponse{
		ByCategory:      []dto.AutoCommentAnalyticsGroup{},
		ByTarget:        []dto.AutoCommentAnalyticsGroup{},
		RecentPublished: []dto.AutoCommentPublishedItem{},
		RecentFailures:  []dto.AutoCommentFailureItem{},
		Health:          []dto.AutoCommentHealthItem{},
	}
	categoryGroups := map[string]*dto.AutoCommentAnalyticsGroup{}
	targetGroups := map[string]*dto.AutoCommentAnalyticsGroup{}
	targetStats := map[uint]*autoCommentTargetHealthStats{}
	totalOpportunity := 0
	for _, task := range tasks {
		target := targetByID[task.TargetID]
		category := firstNonEmpty(target.TargetCategory, "other")
		targetName := firstNonEmpty(task.TargetUsername, target.TargetUsername, task.TargetTweetAuthor, "unknown")
		resp.Summary.TotalTasks++
		totalOpportunity += task.OpportunityScore
		if isAutoCommentPublishedStatus(task.Status) {
			resp.Summary.Published++
		} else if task.Status == "failed" || task.Status == "blocked" {
			resp.Summary.Failed++
		} else {
			resp.Summary.Pending++
		}
		switch firstNonEmpty(task.DeliveryMode, autoCommentDeliveryManualComment) {
		case autoCommentDeliveryAutoComment:
			resp.Summary.AutoCommentable++
		case autoCommentDeliveryQuotePost:
			resp.Summary.QuotePostReady++
		default:
			resp.Summary.ManualSuggestions++
		}
		if task.Status == "failed" || task.Status == "blocked" || task.FailureCategory == "x_reply_restricted" || task.APIReplyBlockReason == "x_reply_restricted" {
			resp.Summary.Restricted++
		}
		updateAutoCommentAnalyticsGroup(categoryGroups, category, category, task)
		updateAutoCommentAnalyticsGroup(targetGroups, targetName, "@"+strings.TrimPrefix(targetName, "@"), task)
		updateAutoCommentTargetHealthStats(targetStats, task)
		if isAutoCommentPublishedStatus(task.Status) && strings.TrimSpace(task.CommentTweetID) != "" && len(resp.RecentPublished) < 8 {
			item := dto.AutoCommentPublishedItem{
				ID:               task.ID,
				TargetUsername:   targetName,
				TargetCategory:   category,
				CommentTweetID:   task.CommentTweetID,
				CommentURL:       "https://x.com/i/web/status/" + task.CommentTweetID,
				GeneratedComment: task.GeneratedComment,
			}
			if task.SentAt != nil {
				item.SentAt = task.SentAt.UTC().Format(time.RFC3339)
			}
			resp.RecentPublished = append(resp.RecentPublished, item)
		}
		if (task.Status == "failed" || task.Status == "blocked") && len(resp.RecentFailures) < 8 {
			resp.RecentFailures = append(resp.RecentFailures, dto.AutoCommentFailureItem{
				ID:              task.ID,
				TargetUsername:  targetName,
				TargetCategory:  category,
				FailureCategory: task.FailureCategory,
				FailureReason:   task.FailureReason,
				UpdatedAt:       task.UpdatedAt.UTC().Format(time.RFC3339),
			})
		}
	}
	if resp.Summary.TotalTasks > 0 {
		resp.Summary.AverageOpportunity = totalOpportunity / resp.Summary.TotalTasks
	}
	resp.ByCategory = sortedAutoCommentAnalyticsGroups(categoryGroups, 8)
	resp.ByTarget = sortedAutoCommentAnalyticsGroups(targetGroups, 10)
	resp.Health = buildAutoCommentHealthItems(targets, targetStats, time.Now().UTC())
	return resp, nil
}

func (s *AutoCommentService) GenerateDraft(ctx context.Context, userID, targetID uint) (*dto.AutoCommentTaskItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	target, err := s.targetRepo.GetByUserAndID(userID, targetID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(target.TargetTweetID) == "" {
		return nil, fmt.Errorf("target tweet id is required")
	}
	if strings.TrimSpace(target.TargetText) == "" {
		return nil, fmt.Errorf("target tweet text is required")
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, target.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	existing, err := s.taskRepo.GetByTargetTweet(userID, target.XAccountID, target.TargetTweetID)
	if err == nil {
		item := toAutoCommentTaskItem(*existing)
		return &item, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	bot, err := s.botForAccount(userID, target.XAccountID)
	if err != nil {
		return nil, err
	}
	cfg := s.commentConfig(userID)
	mode := s.effectiveCommentExecutionMode(userID, cfg)
	if mode == ExecutionModeAutopilot {
		if err := s.assertAutoCommentMonthlyQuota(userID, now); err != nil {
			return nil, err
		}
	}
	blocked := blockedWordsFromConfig(cfg)
	input := autoCommentInputFromBot(target, bot, blocked)
	contentContext := contentContextForGeneration(s.contentRepo, userID, target.XAccountID, botIDForUsage(bot), target.TargetText, target.TargetUsername, bot)
	input.ContentContext = contentContext
	input.FeedbackSignals = s.autoCommentFeedbackSignals(userID, botIDForUsage(bot))
	opportunity := evaluateAutoCommentOpportunity(target.TargetText, target.TargetUsername, bot, contentContext, blocked)
	generated, err := s.ai.GenerateAutoCommentCandidates(ctx, input)
	if err != nil {
		return nil, err
	}
	comment := generated.Text
	risk := evaluateAutoCommentRisk(comment, bot, blocked)
	status, capability, approvalRequired, approvedAt := autoCommentInitialState(mode, risk, now)
	applyAutoCommentOpportunityGate(mode, opportunity, &status, &capability, &approvalRequired, &approvedAt)
	task := &model.AutoCommentTask{
		UserID:            userID,
		BotID:             botIDForUsage(bot),
		XAccountID:        acc.ID,
		TargetID:          target.ID,
		TargetUserID:      target.TargetUserID,
		TargetUsername:    displayCommentTargetHandle(*target),
		TargetTweetID:     target.TargetTweetID,
		TargetTweetText:   truncateRunes(target.TargetText, 1000),
		TargetTweetAuthor: displayCommentTargetHandle(*target),
		GeneratedComment:  truncateRunes(comment, autoCommentPreviewRunes),
		OpportunityScore:  opportunity.Score,
		GenerationReason:  opportunity.Reason,
		MatchedKeywords:   encodeStringList(opportunity.MatchedKeywords),
		ReferencedContent: encodeStringList(opportunity.ReferencedContent),
		CommentVariants:   encodeAutoCommentVariants(generated.Candidates),
		Status:            status,
		RiskLevel:         risk.Level,
		CapabilityStatus:  capability,
		FailureCategory:   risk.Category,
		FailureReason:     risk.Reason,
		ApprovalRequired:  approvalRequired,
		DetectedAt:        now,
		GeneratedAt:       &now,
		ApprovedAt:        approvedAt,
	}
	applyAutoCommentDelivery(task, decideAutoCommentDelivery(target.TargetText, displayCommentTargetHandle(*target), target.TargetTweetID, *acc, comment))
	if err := s.taskRepo.Create(task); err != nil {
		return nil, err
	}
	if err := recordAIGenerationUsage(s.usageRepo, userID, task.BotID, repository.AIGenerationSceneAutoComment, now, generated.Usage); err != nil {
		return nil, err
	}
	if mode == ExecutionModeAutopilot && task.Status == "ready_to_publish" && task.DeliveryMode == autoCommentDeliveryAutoComment {
		if err := s.createAutopilotPreparedActivity(task, acc.Username, now); err != nil {
			return nil, err
		}
		if s.publishing != nil {
			if _, _, err := s.publishing.EnsureCommentJob(task, now); err != nil {
				return nil, err
			}
		}
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) ApproveTask(ctx context.Context, userID, id uint) (*dto.AutoCommentTaskItem, error) {
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypeComment, "approve comment draft"); err != nil {
		return nil, err
	}
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if task.Status != "review" && task.Status != "pending_review" && task.Status != "draft" && task.Status != "approved" {
		return nil, fmt.Errorf("task cannot be approved from status %s", task.Status)
	}
	now := time.Now().UTC()
	task.Status = "approved"
	task.ApprovedAt = &now
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) QueueQuotePost(ctx context.Context, userID, id uint) (*dto.AutoCommentTaskItem, error) {
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypeComment, "queue quote post"); err != nil {
		return nil, err
	}
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(task.TargetTweetID) == "" {
		return nil, fmt.Errorf("target tweet id is required")
	}
	quote := strings.TrimSpace(task.QuotePostCandidate)
	if quote == "" {
		quote = strings.TrimSpace(task.GeneratedComment)
	}
	if quote == "" {
		return nil, fmt.Errorf("quote post candidate is required")
	}
	now := time.Now().UTC()
	task.DeliveryMode = autoCommentDeliveryQuotePost
	task.DeliveryReason = "User confirmed this Auto Comment opportunity as a Quote Post and queued it for publishing."
	task.APIReplyEligible = false
	task.APIReplyBlockReason = firstNonEmpty(task.APIReplyBlockReason, "not_mentioned_or_engaged")
	task.QuotePostCandidate = truncateRunes(quote, autoCommentPreviewRunes)
	task.Status = "ready_to_publish"
	task.CapabilityStatus = "quote_post_ready"
	task.ApprovalRequired = false
	task.ApprovedAt = &now
	task.FailureCategory = ""
	task.FailureReason = ""
	task.Retryable = false
	task.RetryAfterAt = nil
	if strings.TrimSpace(task.ManualActionURL) == "" {
		task.ManualActionURL = autoCommentManualActionURL(task.TargetUsername, task.TargetTweetID)
	}
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	if s.publishing != nil {
		if _, _, err := s.publishing.EnsureCommentJob(task, now); err != nil {
			return nil, err
		}
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) RejectTask(userID, id uint, reason string) (*dto.AutoCommentTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	task.Status = "rejected"
	task.BlockedAt = &now
	task.FailureReason = truncateErrMsg(strings.TrimSpace(reason))
	task.Retryable = false
	if task.FailureReason == "" {
		task.FailureReason = "Rejected by user."
	}
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) UpdateDraft(userID, id uint, content string) (*dto.AutoCommentTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if task.Status != "review" && task.Status != "pending_review" && task.Status != "draft" && task.Status != "approved" {
		return nil, fmt.Errorf("draft cannot be edited from status %s", task.Status)
	}
	task.GeneratedComment = truncateRunes(content, autoCommentPreviewRunes)
	if task.Status == "approved" {
		task.Status = "pending_review"
		task.ApprovedAt = nil
	}
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) CreateFeedback(userID, id uint, req dto.AutoCommentFeedbackRequest) (*dto.OAFBotGenerationFeedbackItem, error) {
	if s.feedbackRepo == nil {
		return nil, fmt.Errorf("feedback repository is not configured")
	}
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if task.BotID == 0 {
		return nil, fmt.Errorf("feedback requires a bound OAF Bot")
	}
	rating := normalizeAutoCommentFeedbackRating(req.Rating)
	if rating == "" {
		return nil, fmt.Errorf("invalid feedback rating")
	}
	row := &model.OAFBotGenerationFeedback{
		UserID:           userID,
		BotID:            task.BotID,
		Scene:            "auto_comment",
		Rating:           rating,
		IssueTags:        encodeStringList(normalizeAutoCommentFeedbackTags(req.IssueTags)),
		Comment:          truncateRunes(strings.TrimSpace(req.Comment), 500),
		SampleContext:    truncateRunes(task.TargetTweetText, 1200),
		GeneratedContent: truncateRunes(task.GeneratedComment, 1000),
		Provider:         "auto_comment_review",
	}
	if err := s.feedbackRepo.Create(row); err != nil {
		return nil, err
	}
	item := dto.OAFBotGenerationFeedbackItem{
		ID:               row.ID,
		BotID:            row.BotID,
		Scene:            row.Scene,
		Rating:           row.Rating,
		IssueTags:        decodeStringList(row.IssueTags),
		Comment:          row.Comment,
		SampleContext:    row.SampleContext,
		GeneratedContent: row.GeneratedContent,
		Provider:         row.Provider,
		CreatedAt:        row.CreatedAt.UTC().Format(time.RFC3339),
	}
	return &item, nil
}

func (s *AutoCommentService) BlockTask(userID, id uint, reason string) (*dto.AutoCommentTaskItem, error) {
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	task.Status = "blocked"
	task.BlockedAt = &now
	task.FailureReason = truncateErrMsg(strings.TrimSpace(reason))
	task.Retryable = false
	if task.FailureReason == "" {
		task.FailureReason = "Blocked by user."
	}
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) RetryTask(ctx context.Context, userID, id uint) (*dto.AutoCommentTaskItem, error) {
	if err := assertAutomationModuleEnabledForAction(s.automationRepo, s.activityRepo, userID, repository.AutomationTypeComment, "retry comment task"); err != nil {
		return nil, err
	}
	task, err := s.taskRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if task.Status != "failed" || !task.Retryable {
		return nil, fmt.Errorf("task is not retryable")
	}
	if err := s.regenerateTaskComment(ctx, task); err != nil {
		return nil, err
	}
	task.Status = "pending_review"
	task.CapabilityStatus = "draft_generated"
	task.Retryable = false
	if err := s.taskRepo.Save(task); err != nil {
		return nil, err
	}
	item := toAutoCommentTaskItem(*task)
	return &item, nil
}

func (s *AutoCommentService) regenerateTaskComment(ctx context.Context, task *model.AutoCommentTask) error {
	cfg, err := s.automationRepo.GetByUserAndType(task.UserID, repository.AutomationTypeComment)
	if err != nil {
		return err
	}
	var blocked []string
	_ = json.Unmarshal([]byte(cfg.SafetyBlockedKeywords), &blocked)
	bot, err := s.botForAccount(task.UserID, task.XAccountID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, task.UserID, now); err != nil {
		return err
	}
	input := autoCommentInputFromValues(task.TargetUsername, task.TargetTweetText, cfg.Tone, blocked, bot)
	contentContext := contentContextForGeneration(s.contentRepo, task.UserID, task.XAccountID, botIDForUsage(bot), task.TargetTweetText, task.TargetUsername, bot)
	input.ContentContext = contentContext
	input.FeedbackSignals = s.autoCommentFeedbackSignals(task.UserID, botIDForUsage(bot))
	opportunity := evaluateAutoCommentOpportunity(task.TargetTweetText, task.TargetUsername, bot, contentContext, blocked)
	generated, err := s.ai.GenerateAutoCommentCandidates(ctx, input)
	if err != nil {
		task.FailureCategory = "llm_error"
		task.FailureReason = truncateErrMsg(err.Error())
		task.Retryable = true
		_ = s.taskRepo.Save(task)
		return err
	}
	comment := generated.Text
	task.GeneratedComment = truncateRunes(comment, autoCommentPreviewRunes)
	task.OpportunityScore = opportunity.Score
	task.GenerationReason = opportunity.Reason
	task.MatchedKeywords = encodeStringList(opportunity.MatchedKeywords)
	task.ReferencedContent = encodeStringList(opportunity.ReferencedContent)
	task.CommentVariants = encodeAutoCommentVariants(generated.Candidates)
	task.GeneratedAt = &now
	task.BotID = botIDForUsage(bot)
	task.FailureCategory = ""
	task.FailureReason = ""
	if err := s.taskRepo.Save(task); err != nil {
		return err
	}
	return recordAIGenerationUsage(s.usageRepo, task.UserID, task.BotID, repository.AIGenerationSceneAutoComment, now, generated.Usage)
}

func (s *AutoCommentService) RunTick(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	now := time.Now().UTC()
	targets, err := s.targetRepo.ListDueActiveTargets(100, now)
	if err != nil {
		zap.L().Warn("auto comment: list due targets failed", zap.Error(err))
		return
	}
	for _, target := range targets {
		runCtx := requestid.NewContext(ctx, "scheduler")
		if err := s.runOnceForTarget(runCtx, target); err != nil {
			zap.L().Warn("auto comment: target tick failed", zap.Uint("user_id", target.UserID), zap.Uint("target_id", target.ID), zap.Error(err))
		}
	}
}

func (s *AutoCommentService) runOnceForTarget(ctx context.Context, target model.AutoCommentTarget) error {
	now := time.Now().UTC()
	cfg, err := s.automationRepo.GetByUserAndType(target.UserID, repository.AutomationTypeComment)
	if err != nil {
		return err
	}
	if !cfg.Enabled {
		return nil
	}
	u, err := s.userRepo.GetByID(target.UserID)
	if err != nil {
		return err
	}
	if err := subscription.AssertUserMayProduceContent(u, now); err != nil {
		return nil
	}
	if hit, why := s.commentLimitsExceeded(target.UserID, cfg, now); hit {
		return s.markTargetChecked(&target, now, "skip: "+why)
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(target.UserID, target.XAccountID)
	if err != nil {
		return s.markTargetChecked(&target, now, "executor account not found")
	}
	if strings.TrimSpace(acc.AccessToken) == "" {
		return s.markTargetChecked(&target, now, "executor account missing access token")
	}
	if strings.TrimSpace(target.TargetUserID) == "" {
		xu, err := twitter.LookupUserByUsername(ctx, nil, acc.AccessToken, target.TargetUsername)
		if err != nil {
			if isXUnauthorizedError(err) {
				if refreshed, ok := s.refreshXAccountAfterUnauthorized(ctx, *acc,
					zap.Uint("user_id", target.UserID),
					zap.Uint("target_id", target.ID),
					zap.String("operation", "lookup_comment_target")); ok {
					acc = &refreshed
					xu, err = twitter.LookupUserByUsername(ctx, nil, acc.AccessToken, target.TargetUsername)
				}
			}
			if err != nil {
				return s.markTargetChecked(&target, now, truncateErrMsg(err.Error()))
			}
		}
		target.TargetUserID = xu.ID
		target.TargetUsername = normalizeHandle(xu.Username)
		target.TargetDisplayName = xu.DisplayName
		target.ResolvedAt = &now
		if err := s.targetRepo.Save(&target); err != nil {
			return s.markTargetChecked(&target, now, truncateErrMsg(err.Error()))
		}
	}
	tweets, err := twitter.ListUserRootTweets(ctx, nil, acc.AccessToken, target.TargetUserID, 5)
	if err != nil {
		if isXUnauthorizedError(err) {
			if refreshed, ok := s.refreshXAccountAfterUnauthorized(ctx, *acc,
				zap.Uint("user_id", target.UserID),
				zap.Uint("target_id", target.ID),
				zap.String("operation", "list_comment_target_tweets")); ok {
				acc = &refreshed
				tweets, err = twitter.ListUserRootTweets(ctx, nil, acc.AccessToken, target.TargetUserID, 5)
			}
		}
		if err != nil {
			return s.markTargetChecked(&target, now, truncateErrMsg(err.Error()))
		}
	}
	target.LastCheckedAt = &now
	target.LastFailureReason = ""
	bot, err := s.botForAccount(target.UserID, target.XAccountID)
	if err != nil {
		return s.markTargetChecked(&target, now, truncateErrMsg(err.Error()))
	}
	blocked := blockedWordsFromConfig(cfg)
	candidate, ok, err := s.bestAutoCommentTweetCandidate(target, tweets, bot, blocked)
	if err != nil {
		return err
	}
	if !ok {
		return s.targetRepo.Save(&target)
	}
	task, err := s.createTaskFromTweet(ctx, target, *cfg, candidate.Tweet)
	if err != nil {
		target.LastFailureReason = truncateErrMsg(err.Error())
		_ = s.targetRepo.Save(&target)
		return err
	}
	target.LastSeenTweetID = candidate.Tweet.ID
	if !candidate.Tweet.CreatedAt.IsZero() {
		t := candidate.Tweet.CreatedAt
		target.LastSeenTweetAt = &t
	}
	if task.Status == "sent" {
		sent := now
		target.LastCommentedAt = &sent
	}
	return s.targetRepo.Save(&target)
}

type autoCommentTweetCandidate struct {
	Tweet            twitter.UserTweet
	OpportunityScore int
	QueueScore       int
}

func (s *AutoCommentService) bestAutoCommentTweetCandidate(target model.AutoCommentTarget, tweets []twitter.UserTweet, bot *model.OAFBot, blocked []string) (autoCommentTweetCandidate, bool, error) {
	candidates := []autoCommentTweetCandidate{}
	for _, tw := range tweets {
		if tw.ID == "" {
			continue
		}
		if target.LastSeenTweetID == tw.ID {
			break
		}
		exists, err := s.taskRepo.ExistsForTargetTweet(target.UserID, target.XAccountID, tw.ID)
		if err != nil {
			return autoCommentTweetCandidate{}, false, err
		}
		if exists {
			continue
		}
		contentContext := contentContextForGeneration(s.contentRepo, target.UserID, target.XAccountID, botIDForUsage(bot), tw.Text, target.TargetUsername, bot)
		opportunity := evaluateAutoCommentOpportunity(tw.Text, target.TargetUsername, bot, contentContext, blocked)
		candidates = append(candidates, autoCommentTweetCandidate{
			Tweet:            tw,
			OpportunityScore: opportunity.Score,
			QueueScore:       autoCommentQueueScore(target.Priority, opportunity.Score),
		})
	}
	if len(candidates) == 0 {
		return autoCommentTweetCandidate{}, false, nil
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].QueueScore != candidates[j].QueueScore {
			return candidates[i].QueueScore > candidates[j].QueueScore
		}
		if candidates[i].OpportunityScore != candidates[j].OpportunityScore {
			return candidates[i].OpportunityScore > candidates[j].OpportunityScore
		}
		return candidates[i].Tweet.CreatedAt.After(candidates[j].Tweet.CreatedAt)
	})
	return candidates[0], true, nil
}

func autoCommentQueueScore(priority, opportunityScore int) int {
	return normalizeAutoCommentTargetPriority(priority)*20 + clampInt(opportunityScore, 0, 100)
}

func isAutoCommentPublishedStatus(status string) bool {
	return status == "sent" || status == "published"
}

func updateAutoCommentAnalyticsGroup(groups map[string]*dto.AutoCommentAnalyticsGroup, key, label string, task model.AutoCommentTask) {
	key = firstNonEmpty(strings.TrimSpace(key), "unknown")
	label = firstNonEmpty(strings.TrimSpace(label), key)
	group := groups[key]
	if group == nil {
		group = &dto.AutoCommentAnalyticsGroup{Key: key, Label: label}
		groups[key] = group
	}
	group.Total++
	group.AverageOpportunity += task.OpportunityScore
	if isAutoCommentPublishedStatus(task.Status) {
		group.Published++
	}
	if task.Status == "failed" || task.Status == "blocked" {
		group.Failed++
	}
}

func sortedAutoCommentAnalyticsGroups(groups map[string]*dto.AutoCommentAnalyticsGroup, limit int) []dto.AutoCommentAnalyticsGroup {
	out := make([]dto.AutoCommentAnalyticsGroup, 0, len(groups))
	for _, group := range groups {
		if group.Total > 0 {
			group.AverageOpportunity = group.AverageOpportunity / group.Total
		}
		out = append(out, *group)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Published != out[j].Published {
			return out[i].Published > out[j].Published
		}
		if out[i].AverageOpportunity != out[j].AverageOpportunity {
			return out[i].AverageOpportunity > out[j].AverageOpportunity
		}
		return out[i].Total > out[j].Total
	})
	if limit > 0 && len(out) > limit {
		return out[:limit]
	}
	return out
}

type autoCommentTargetHealthStats struct {
	Total            int
	Failed           int
	OpportunityTotal int
}

func updateAutoCommentTargetHealthStats(stats map[uint]*autoCommentTargetHealthStats, task model.AutoCommentTask) {
	if task.TargetID == 0 {
		return
	}
	row := stats[task.TargetID]
	if row == nil {
		row = &autoCommentTargetHealthStats{}
		stats[task.TargetID] = row
	}
	row.Total++
	row.OpportunityTotal += task.OpportunityScore
	if task.Status == "failed" || task.Status == "blocked" {
		row.Failed++
	}
}

func buildAutoCommentHealthItems(targets []model.AutoCommentTarget, stats map[uint]*autoCommentTargetHealthStats, now time.Time) []dto.AutoCommentHealthItem {
	items := []dto.AutoCommentHealthItem{}
	for _, target := range targets {
		base := autoCommentHealthBase(target, stats[target.ID])
		reasonLower := strings.ToLower(strings.TrimSpace(target.LastFailureReason))
		if isAutoCommentAuthFailure(reasonLower) {
			item := base
			item.IssueType = "auth_or_account"
			item.Severity = "high"
			item.Message = "Target scan is failing because the executor account or X authorization looks unhealthy."
			item.SuggestedAction = "Reconnect the X account, then retry scanning this target."
			item.LastFailureReason = target.LastFailureReason
			items = append(items, item)
			continue
		}
		if strings.TrimSpace(target.LastFailureReason) != "" {
			item := base
			item.IssueType = "scan_failure"
			item.Severity = "medium"
			item.Message = "Target scanning has recent failures."
			item.SuggestedAction = "Check the failure reason and verify the target handle is still valid."
			item.LastFailureReason = target.LastFailureReason
			items = append(items, item)
		}
		if target.LastCheckedAt != nil && (target.LastSeenTweetAt == nil || target.LastSeenTweetAt.Before(now.AddDate(0, 0, -14))) {
			item := base
			item.IssueType = "stale_tweets"
			item.Severity = "medium"
			item.Message = "No recent root tweet has been detected for this target."
			item.SuggestedAction = "Lower its priority or replace it with a more active KOL."
			items = append(items, item)
		}
		stat := stats[target.ID]
		if stat != nil && stat.Total >= 3 {
			avg := stat.OpportunityTotal / stat.Total
			if avg < 35 {
				item := base
				item.IssueType = "low_opportunity"
				item.Severity = "low"
				item.Message = "Recent target tweets have low Auto Comment opportunity scores."
				item.SuggestedAction = "Move this target to a lower priority group or refine content keywords."
				item.AverageOpportunity = avg
				items = append(items, item)
			}
			if stat.Failed >= 3 && stat.Failed*2 >= stat.Total {
				item := base
				item.IssueType = "frequent_failures"
				item.Severity = "high"
				item.Message = "This target has repeated failed or blocked comment tasks."
				item.SuggestedAction = "Pause this target and inspect recent failures before enabling it again."
				items = append(items, item)
			}
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		if autoCommentHealthSeverityRank(items[i].Severity) != autoCommentHealthSeverityRank(items[j].Severity) {
			return autoCommentHealthSeverityRank(items[i].Severity) > autoCommentHealthSeverityRank(items[j].Severity)
		}
		if items[i].Priority != items[j].Priority {
			return items[i].Priority > items[j].Priority
		}
		return items[i].TargetUsername < items[j].TargetUsername
	})
	if len(items) > 12 {
		return items[:12]
	}
	return items
}

func autoCommentHealthBase(target model.AutoCommentTarget, stat *autoCommentTargetHealthStats) dto.AutoCommentHealthItem {
	item := dto.AutoCommentHealthItem{
		TargetID:       target.ID,
		TargetUsername: firstNonEmpty(target.TargetUsername, target.TargetAuthorHandle, "unknown"),
		TargetCategory: firstNonEmpty(target.TargetCategory, "other"),
		Priority:       normalizeAutoCommentTargetPriority(target.Priority),
		Status:         target.Status,
	}
	if target.LastCheckedAt != nil {
		item.LastCheckedAt = target.LastCheckedAt.UTC().Format(time.RFC3339)
	}
	if target.LastSeenTweetAt != nil {
		item.LastSeenTweetAt = target.LastSeenTweetAt.UTC().Format(time.RFC3339)
	}
	if stat != nil {
		item.TotalTasks = stat.Total
		item.FailedCount = stat.Failed
		if stat.Total > 0 {
			item.AverageOpportunity = stat.OpportunityTotal / stat.Total
		}
	}
	return item
}

func isAutoCommentAuthFailure(reason string) bool {
	if reason == "" {
		return false
	}
	for _, token := range []string{"unauthorized", "401", "403", "token", "access token", "account not found", "executor account"} {
		if strings.Contains(reason, token) {
			return true
		}
	}
	return false
}

func autoCommentHealthSeverityRank(severity string) int {
	switch severity {
	case "high":
		return 3
	case "medium":
		return 2
	default:
		return 1
	}
}

func (s *AutoCommentService) createTaskFromTweet(ctx context.Context, target model.AutoCommentTarget, cfg model.AutomationConfig, tw twitter.UserTweet) (*model.AutoCommentTask, error) {
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, target.UserID, now); err != nil {
		return nil, err
	}
	bot, err := s.botForAccount(target.UserID, target.XAccountID)
	if err != nil {
		return nil, err
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(target.UserID, target.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	blocked := blockedWordsFromConfig(&cfg)
	mode := s.effectiveCommentExecutionMode(target.UserID, &cfg)
	if mode == ExecutionModeAutopilot {
		if err := s.assertAutoCommentMonthlyQuota(target.UserID, now); err != nil {
			return nil, err
		}
	}
	input := autoCommentInputFromValues(target.TargetUsername, tw.Text, cfg.Tone, blocked, bot)
	contentContext := contentContextForGeneration(s.contentRepo, target.UserID, target.XAccountID, botIDForUsage(bot), tw.Text, target.TargetUsername, bot)
	input.ContentContext = contentContext
	input.FeedbackSignals = s.autoCommentFeedbackSignals(target.UserID, botIDForUsage(bot))
	opportunity := evaluateAutoCommentOpportunity(tw.Text, target.TargetUsername, bot, contentContext, blocked)
	generated, err := s.ai.GenerateAutoCommentCandidates(ctx, input)
	comment := generated.Text
	risk := evaluateAutoCommentRisk(comment, bot, blocked)
	status, capability, approvalRequired, approvedAt := autoCommentInitialState(mode, risk, now)
	applyAutoCommentOpportunityGate(mode, opportunity, &status, &capability, &approvalRequired, &approvedAt)
	task := &model.AutoCommentTask{
		UserID:            target.UserID,
		BotID:             botIDForUsage(bot),
		XAccountID:        target.XAccountID,
		TargetID:          target.ID,
		TargetUserID:      target.TargetUserID,
		TargetUsername:    target.TargetUsername,
		TargetTweetID:     tw.ID,
		TargetTweetText:   truncateRunes(tw.Text, 500),
		TargetTweetAuthor: target.TargetUsername,
		OpportunityScore:  opportunity.Score,
		GenerationReason:  opportunity.Reason,
		MatchedKeywords:   encodeStringList(opportunity.MatchedKeywords),
		ReferencedContent: encodeStringList(opportunity.ReferencedContent),
		CommentVariants:   encodeAutoCommentVariants(generated.Candidates),
		Status:            status,
		RiskLevel:         risk.Level,
		CapabilityStatus:  capability,
		FailureCategory:   risk.Category,
		FailureReason:     risk.Reason,
		ApprovalRequired:  approvalRequired,
		DetectedAt:        now,
		ApprovedAt:        approvedAt,
	}
	applyAutoCommentDelivery(task, decideAutoCommentDelivery(tw.Text, target.TargetUsername, tw.ID, *acc, comment))
	if err != nil {
		task.Status = "failed"
		task.CapabilityStatus = "llm_failed"
		task.FailureCategory = "llm_error"
		task.FailureReason = truncateErrMsg(err.Error())
		task.Retryable = true
		if createErr := s.taskRepo.Create(task); createErr != nil {
			return nil, createErr
		}
		return task, err
	}
	task.GeneratedComment = truncateRunes(comment, autoCommentPreviewRunes)
	task.GeneratedAt = &now
	if err := s.taskRepo.Create(task); err != nil {
		return nil, err
	}
	if err := recordAIGenerationUsage(s.usageRepo, target.UserID, task.BotID, repository.AIGenerationSceneAutoComment, now, generated.Usage); err != nil {
		return nil, err
	}
	if mode == ExecutionModeAutopilot && task.Status == "ready_to_publish" && task.DeliveryMode == autoCommentDeliveryAutoComment {
		if err := s.createAutopilotPreparedActivity(task, target.TargetUsername, now); err != nil {
			return nil, err
		}
		if s.publishing != nil {
			if _, _, err := s.publishing.EnsureCommentJob(task, now); err != nil {
				return nil, err
			}
		}
	}
	return task, nil
}

func (s *AutoCommentService) sendTask(ctx context.Context, task *model.AutoCommentTask) error {
	now := time.Now().UTC()
	task.Status = "sending"
	task.AttemptCount++
	task.LastAttemptAt = &now
	task.Retryable = false
	task.RetryAfterAt = nil
	if err := s.taskRepo.Save(task); err != nil {
		return err
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(task.UserID, task.XAccountID)
	if err != nil {
		return s.failTask(task, "account_error", "executor account not found", false, 0)
	}
	commentID, err := twitter.CreateReplyTweet(ctx, acc.AccessToken, task.GeneratedComment, task.TargetTweetID)
	if err != nil {
		var pub *twitter.PublishError
		retryable := false
		retryAfter := time.Duration(0)
		category := "x_api_error"
		if errors.As(err, &pub) {
			retryable = pub.RateLimited || pub.StatusCode >= 500
			retryAfter = pub.RetryAfter
			if pub.RateLimited {
				category = "rate_limited"
			}
		}
		return s.failTask(task, category, err.Error(), retryable, retryAfter)
	}
	ref := task.TargetTweetID
	log := &model.ActivityLog{
		UserID:              task.UserID,
		XAccountID:          task.XAccountID,
		Type:                "comment",
		Status:              "success",
		PreviewKey:          "activity.preview.commentSuccess",
		AccountHandle:       formatXAccountHandle(acc.Username),
		ExecutedAt:          now,
		RefTweetID:          &ref,
		ReplyCommentTweetID: task.TargetTweetID,
		ReplyToUsername:     replyAuthorDisplay(task.TargetUsername),
		ReplyToTextPreview:  truncateReplyPreview(task.TargetTweetText, autoReplyPreviewRunes),
		ReplyTextPreview:    truncateReplyPreview(task.GeneratedComment, autoReplyPreviewRunes),
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		return err
	}
	task.Status = "sent"
	task.CapabilityStatus = "sent"
	task.ActivityLogID = log.ID
	task.CommentTweetID = commentID
	task.SentAt = &now
	task.FailureCategory = ""
	task.FailureReason = ""
	task.Retryable = false
	return s.taskRepo.Save(task)
}

func (s *AutoCommentService) failTask(task *model.AutoCommentTask, category, reason string, retryable bool, retryAfter time.Duration) error {
	now := time.Now().UTC()
	task.Status = "failed"
	task.CapabilityStatus = "send_failed"
	task.FailureCategory = category
	task.FailureReason = truncateErrMsg(reason)
	task.Retryable = retryable
	if retryAfter > 0 {
		t := now.Add(retryAfter)
		task.RetryAfterAt = &t
	}
	if err := s.taskRepo.Save(task); err != nil {
		return err
	}
	return errors.New(task.FailureReason)
}

func (s *AutoCommentService) refreshXAccountAfterUnauthorized(ctx context.Context, acc model.TwitterAccount, fields ...zap.Field) (model.TwitterAccount, bool) {
	if s == nil || s.publishing == nil {
		zap.L().Warn("auto comment: x token refresh unavailable", fields...)
		return acc, false
	}
	refreshed, err := s.publishing.RefreshXAccessTokenForAccount(ctx, &acc)
	if err != nil {
		zap.L().Warn("auto comment: x token refresh failed; account marked for reauth", append(fields, zap.Error(err))...)
		return acc, false
	}
	if refreshed == nil {
		zap.L().Warn("auto comment: x token refresh returned empty account", fields...)
		return acc, false
	}
	zap.L().Info("auto comment: x token refreshed after unauthorized", fields...)
	return *refreshed, true
}

func (s *AutoCommentService) commentLimitsExceeded(userID uint, cfg *model.AutomationConfig, now time.Time) (bool, string) {
	return false, ""
}

func (s *AutoCommentService) resolveExecutorAccountID(userID, preferred uint) (uint, error) {
	if preferred > 0 {
		if _, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, preferred); err != nil {
			return 0, fmt.Errorf("x account not found")
		}
		return preferred, nil
	}
	accounts, err := s.accountRepo.ListByUserID(userID)
	if err != nil {
		return 0, err
	}
	for _, acc := range accounts {
		if acc.Status == "connected" {
			return acc.ID, nil
		}
	}
	return 0, fmt.Errorf("connect an X account before adding auto comment targets")
}

func (s *AutoCommentService) markTargetChecked(target *model.AutoCommentTarget, at time.Time, reason string) error {
	target.LastCheckedAt = &at
	target.LastFailureReason = truncateErrMsg(reason)
	return s.targetRepo.Save(target)
}

func normalizeHandle(v string) string {
	return strings.ToLower(strings.TrimSpace(strings.TrimPrefix(v, "@")))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

var tweetIDPattern = regexp.MustCompile(`/status(?:es)?/([0-9]+)`)

func extractTweetID(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if match := tweetIDPattern.FindStringSubmatch(raw); len(match) == 2 {
		return match[1]
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	for i, part := range parts {
		if (part == "status" || part == "statuses") && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

func applyManualCommentTarget(target *model.AutoCommentTarget, req dto.AutoCommentTargetRequest, username, tweetID, targetText string) {
	target.TargetUsername = username
	target.TargetAuthorHandle = username
	target.TargetTweetID = tweetID
	target.TargetTweetURL = strings.TrimSpace(req.TargetTweetURL)
	target.TargetText = truncateRunes(targetText, 1000)
	target.TargetCategory = normalizeAutoCommentTargetCategory(req.TargetCategory)
	target.Priority = normalizeAutoCommentTargetPriority(req.Priority)
	target.Notes = truncateRunes(strings.TrimSpace(req.Notes), 512)
	target.Status = "paused"
}

func normalizeAutoCommentTargetCategory(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "kol", "founder", "project", "competitor", "customer", "media", "analyst", "investor", "developer", "community", "ecosystem", "partner", "other":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return "kol"
	}
}

func normalizeAutoCommentTargetPriority(v int) int {
	if v < 1 || v > 5 {
		return 3
	}
	return v
}

func normalizeAutoCommentBulkHandles(handles []string, raw string) []string {
	parts := append([]string{}, handles...)
	if strings.TrimSpace(raw) != "" {
		parts = append(parts, strings.FieldsFunc(raw, func(r rune) bool {
			return r == ',' || r == '\n' || r == '\r' || r == '\t' || r == ' ' || r == ';'
		})...)
	}
	out := []string{}
	for _, part := range parts {
		handle := normalizeHandle(strings.TrimSpace(part))
		handle = strings.TrimPrefix(handle, "https://x.com/")
		handle = strings.TrimPrefix(handle, "https://twitter.com/")
		handle = strings.Trim(handle, "/")
		if handle == "" || strings.Contains(handle, "/") {
			continue
		}
		out = appendUniqueLimited(out, handle, 200)
	}
	return out
}

func autoCommentTargetSuggestionInput(bot *model.OAFBot, targets []model.AutoCommentTarget, contentRows []model.ContentLibraryItem) GenerateAutoCommentTargetSuggestionsInput {
	input := GenerateAutoCommentTargetSuggestionsInput{}
	if bot != nil {
		input.BotName = bot.Name
		input.ProjectOneLiner = bot.ProjectOneLiner
		input.TargetAudience = bot.TargetAudience
		input.CoreValueProps = bot.CoreValueProps
		input.ProductFeatures = bot.ProductFeatures
		input.Differentiators = bot.Differentiators
		input.Topics = decodeStringList(bot.Topics)
		input.Keywords = decodeStringList(bot.Keywords)
	}
	for _, target := range targets {
		handle := strings.TrimPrefix(strings.TrimSpace(target.TargetUsername), "@")
		if handle == "" {
			continue
		}
		input.ExistingTargets = appendUniqueLimited(input.ExistingTargets, handle, 50)
	}
	for _, target := range targets {
		if target.LastFailureReason != "" {
			continue
		}
		handle := strings.TrimPrefix(strings.TrimSpace(target.TargetUsername), "@")
		if handle != "" && target.Priority >= 4 {
			input.HighScoreTargets = appendUniqueLimited(input.HighScoreTargets, handle, 10)
		}
	}
	for _, item := range contentRows {
		if strings.TrimSpace(item.Title) != "" {
			input.ContentTitles = appendUniqueLimited(input.ContentTitles, item.Title, 12)
		}
		for _, topic := range decodeStringList(item.Topics) {
			input.ContentTopics = appendUniqueLimited(input.ContentTopics, topic, 20)
		}
	}
	return input
}

func displayCommentTargetHandle(target model.AutoCommentTarget) string {
	handle := normalizeHandle(firstNonEmpty(target.TargetAuthorHandle, target.TargetUsername))
	if handle == "" {
		return "target"
	}
	return handle
}

func (s *AutoCommentService) botForAccount(userID, xAccountID uint) (*model.OAFBot, error) {
	if s.oafBotRepo == nil {
		return nil, nil
	}
	bot, err := s.oafBotRepo.GetByUserAndTwitterAccountID(userID, xAccountID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return bot, nil
}

func (s *AutoCommentService) commentConfig(userID uint) *model.AutomationConfig {
	if s.automationRepo == nil {
		return nil
	}
	_ = s.automationRepo.EnsureDefaults(userID)
	cfg, err := s.automationRepo.GetByUserAndType(userID, repository.AutomationTypeComment)
	if err != nil {
		return nil
	}
	return cfg
}

func blockedWordsFromConfig(cfg *model.AutomationConfig) []string {
	if cfg == nil {
		return nil
	}
	var blocked []string
	_ = json.Unmarshal([]byte(cfg.SafetyBlockedKeywords), &blocked)
	return blocked
}

func (s *AutoCommentService) effectiveCommentExecutionMode(userID uint, cfg *model.AutomationConfig) string {
	mode := ExecutionModeReview
	if cfg != nil {
		mode = effectiveExecutionMode(cfg.ExecutionMode)
	}
	if mode != ExecutionModeAutopilot {
		return mode
	}
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return ExecutionModeReview
	}
	plan := subscription.NormalizePlanCode(u.SubscriptionPlanCode)
	if plan == subscription.PlanPlus || plan == subscription.PlanPro || plan == subscription.PlanProPlus {
		return ExecutionModeAutopilot
	}
	return ExecutionModeReview
}

func (s *AutoCommentService) assertAutoCommentMonthlyQuota(userID uint, now time.Time) error {
	if s.taskRepo == nil || s.userRepo == nil {
		return nil
	}
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	limit := subscription.LimitsForUser(u).MonthlyAutoComments
	if limit <= 0 {
		return fmt.Errorf("monthly auto comment quota exceeded")
	}
	monthStart := startOfUTCMonth(now)
	used, err := s.taskRepo.CountCreatedBetween(userID, monthStart, now)
	if err != nil {
		return err
	}
	if used >= limit {
		return fmt.Errorf("monthly auto comment quota exceeded")
	}
	return nil
}

type autoCommentRisk struct {
	Level    string
	Category string
	Reason   string
}

type autoCommentOpportunity struct {
	Score             int
	Reason            string
	MatchedKeywords   []string
	ReferencedContent []string
}

func evaluateAutoCommentOpportunity(tweet, targetUsername string, bot *model.OAFBot, contentContext []GenerationContentContextItem, blockedWords []string) autoCommentOpportunity {
	text := strings.ToLower(strings.TrimSpace(tweet))
	score := 45
	reasons := []string{}
	matched := []string{}
	referenced := []string{}

	if text == "" {
		return autoCommentOpportunity{Score: 0, Reason: "No target tweet text is available, so the comment opportunity cannot be evaluated."}
	}
	if len([]rune(text)) < 40 {
		score -= 12
		reasons = append(reasons, "Target tweet is short, so there is less context to comment on.")
	}
	if strings.Contains(text, "?") || strings.Contains(text, "how ") || strings.Contains(text, "why ") || strings.Contains(text, "what ") {
		score += 10
		reasons = append(reasons, "Target tweet includes a question or discussion hook.")
	}

	for _, term := range autoCommentOpportunityTerms(bot, contentContext) {
		if autoCommentTextContainsTerm(text, term) {
			matched = appendUniqueLimited(matched, strings.TrimSpace(term), 8)
		}
	}
	if len(matched) > 0 {
		score += minInt(24, len(matched)*6)
		reasons = append(reasons, "Target tweet matches persona, product, or content-library keywords.")
	}

	for _, item := range contentContext {
		title := strings.TrimSpace(item.Title)
		if title == "" {
			continue
		}
		referenced = appendUniqueLimited(referenced, title, 3)
	}
	if len(referenced) > 0 {
		score += 12
		reasons = append(reasons, "Relevant content-library material is available for a more specific comment.")
	}

	for _, term := range blockedWords {
		if autoCommentTextContainsTerm(text, term) {
			score -= 35
			reasons = append(reasons, "Target tweet contains a blocked keyword or topic.")
			matched = appendUniqueLimited(matched, strings.TrimSpace(term), 8)
		}
	}
	if bot != nil {
		for _, term := range append(decodeStringList(bot.ForbiddenTopics), decodeStringList(bot.AvoidClaims)...) {
			if autoCommentTextContainsTerm(text, term) {
				score -= 30
				reasons = append(reasons, "Target tweet overlaps with the Bot safety boundaries.")
				matched = appendUniqueLimited(matched, strings.TrimSpace(term), 8)
			}
		}
	}

	if strings.TrimSpace(targetUsername) != "" {
		reasons = append(reasons, "Comment will be contextualized for @"+strings.TrimPrefix(strings.TrimSpace(targetUsername), "@")+".")
	}
	if len(reasons) == 0 {
		reasons = append(reasons, "General opportunity: the target tweet has enough context for a natural, non-promotional comment.")
	}

	return autoCommentOpportunity{
		Score:             clampInt(score, 0, 100),
		Reason:            truncateRunes(strings.Join(reasons, " "), 1000),
		MatchedKeywords:   matched,
		ReferencedContent: referenced,
	}
}

func autoCommentOpportunityTerms(bot *model.OAFBot, contentContext []GenerationContentContextItem) []string {
	terms := []string{}
	if bot != nil {
		terms = append(terms, decodeStringList(bot.Keywords)...)
		terms = append(terms, decodeStringList(bot.Topics)...)
		terms = append(terms, decodeStringList(bot.ContentPillars)...)
		for _, field := range []string{bot.ProjectOneLiner, bot.TargetAudience, bot.CoreValueProps, bot.ProductFeatures, bot.Differentiators, bot.ContentObjectives} {
			terms = append(terms, contentContextTokens(field)...)
		}
	}
	for _, item := range contentContext {
		terms = append(terms, item.Topics...)
		terms = append(terms, contentContextTokens(item.Title)...)
		terms = append(terms, contentContextTokens(item.GrowthGoal)...)
	}
	out := []string{}
	for _, term := range terms {
		term = strings.TrimSpace(term)
		if len([]rune(term)) < 3 {
			continue
		}
		out = appendUniqueLimited(out, term, 60)
	}
	return out
}

func autoCommentTextContainsTerm(text, term string) bool {
	term = strings.ToLower(strings.TrimSpace(term))
	if term == "" {
		return false
	}
	return strings.Contains(text, term)
}

func appendUniqueLimited(items []string, value string, limit int) []string {
	value = strings.TrimSpace(value)
	if value == "" || (limit > 0 && len(items) >= limit) {
		return items
	}
	lower := strings.ToLower(value)
	for _, item := range items {
		if strings.ToLower(strings.TrimSpace(item)) == lower {
			return items
		}
	}
	return append(items, value)
}

func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func encodeAutoCommentVariants(items []AutoCommentCandidate) string {
	clean := make([]AutoCommentCandidate, 0, len(items))
	for _, item := range items {
		comment := strings.TrimSpace(item.Comment)
		if comment == "" {
			continue
		}
		typ := normalizeAutoCommentCandidateType(item.Type)
		clean = append(clean, AutoCommentCandidate{
			Type:    typ,
			Label:   firstNonEmpty(strings.TrimSpace(item.Label), defaultAutoCommentCandidateLabel(typ)),
			Comment: truncateRunes(comment, autoCommentPreviewRunes),
		})
		if len(clean) >= 3 {
			break
		}
	}
	if len(clean) == 0 {
		return ""
	}
	raw, _ := json.Marshal(clean)
	return string(raw)
}

func decodeAutoCommentVariants(raw string) []dto.AutoCommentVariantItem {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var rows []AutoCommentCandidate
	if err := json.Unmarshal([]byte(raw), &rows); err != nil {
		return nil
	}
	out := make([]dto.AutoCommentVariantItem, 0, len(rows))
	for _, row := range rows {
		comment := strings.TrimSpace(row.Comment)
		if comment == "" {
			continue
		}
		typ := normalizeAutoCommentCandidateType(row.Type)
		out = append(out, dto.AutoCommentVariantItem{
			Type:    typ,
			Label:   firstNonEmpty(strings.TrimSpace(row.Label), defaultAutoCommentCandidateLabel(typ)),
			Comment: truncateRunes(comment, autoCommentPreviewRunes),
		})
	}
	return out
}

func (s *AutoCommentService) autoCommentFeedbackSignals(userID, botID uint) []string {
	if s == nil || s.feedbackRepo == nil || botID == 0 {
		return nil
	}
	rows, err := s.feedbackRepo.ListRecentNegativeByUserBotScene(userID, botID, "auto_comment", 6)
	if err != nil || len(rows) == 0 {
		return nil
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		parts := []string{}
		tags := decodeStringList(row.IssueTags)
		if len(tags) > 0 {
			parts = append(parts, "issue_tags="+strings.Join(tags, ", "))
		}
		if strings.TrimSpace(row.Comment) != "" {
			parts = append(parts, "comment="+strings.TrimSpace(row.Comment))
		}
		if strings.TrimSpace(row.GeneratedContent) != "" {
			parts = append(parts, "previous_comment="+truncateRunes(row.GeneratedContent, 180))
		}
		if len(parts) > 0 {
			out = append(out, strings.Join(parts, " | "))
		}
	}
	return out
}

func normalizeAutoCommentFeedbackRating(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "positive", "negative":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func normalizeAutoCommentFeedbackTags(items []string) []string {
	allowed := map[string]bool{
		"too_generic": true,
		"too_salesy":  true,
		"irrelevant":  true,
		"wrong_tone":  true,
		"good":        true,
	}
	out := []string{}
	for _, item := range items {
		v := strings.ToLower(strings.TrimSpace(item))
		if allowed[v] {
			out = appendUniqueLimited(out, v, 8)
		}
	}
	return out
}

func evaluateAutoCommentRisk(content string, bot *model.OAFBot, blockedWords []string) autoCommentRisk {
	text := strings.ToLower(strings.TrimSpace(content))
	if text == "" {
		return autoCommentRisk{Level: "high", Category: "empty_content", Reason: "Generated comment is empty."}
	}
	topics := append([]string{}, blockedWords...)
	if bot != nil {
		topics = append(topics, decodeStringList(bot.ForbiddenTopics)...)
		topics = append(topics, decodeStringList(bot.AvoidClaims)...)
	}
	for _, word := range topics {
		w := strings.ToLower(strings.TrimSpace(word))
		if w != "" && strings.Contains(text, w) {
			return autoCommentRisk{Level: "high", Category: "risk_blocked_keyword", Reason: "Generated comment matched a forbidden topic or blocked keyword."}
		}
	}
	highRisk := []string{
		"guaranteed return", "guaranteed profit", "risk-free", "100x", "pump", "airdrop",
		"seed phrase", "private key", "connect wallet", "official support",
		"稳赚", "保本", "收益保证", "私钥", "助记词", "连接钱包", "官方客服",
	}
	for _, word := range highRisk {
		if strings.Contains(text, word) {
			return autoCommentRisk{Level: "high", Category: "risk_policy", Reason: "Generated comment matched a high-risk safety rule."}
		}
	}
	return autoCommentRisk{Level: "low"}
}

func autoCommentInitialState(mode string, risk autoCommentRisk, now time.Time) (status string, capability string, approvalRequired bool, approvedAt *time.Time) {
	if risk.Level == "high" {
		return "pending_review", "risk_review_required", true, nil
	}
	switch mode {
	case ExecutionModeManual:
		return "draft", "manual_suggestion", false, nil
	case ExecutionModeAutopilot:
		t := now
		return "ready_to_publish", "autopilot_prepared", false, &t
	default:
		return "pending_review", "review_required", true, nil
	}
}

func applyAutoCommentOpportunityGate(mode string, opportunity autoCommentOpportunity, status, capability *string, approvalRequired *bool, approvedAt **time.Time) {
	if mode != ExecutionModeAutopilot || opportunity.Score >= 30 {
		return
	}
	if status == nil || capability == nil || approvalRequired == nil || approvedAt == nil {
		return
	}
	*status = "pending_review"
	*capability = "low_opportunity_review"
	*approvalRequired = true
	*approvedAt = nil
}

func decideAutoCommentDelivery(tweetText, targetUsername, targetTweetID string, account model.TwitterAccount, generatedComment string) autoCommentDeliveryDecision {
	username := strings.TrimSpace(strings.TrimPrefix(account.Username, "@"))
	manualURL := autoCommentManualActionURL(targetUsername, targetTweetID)
	if username == "" {
		return autoCommentDeliveryDecision{
			Mode:        autoCommentDeliveryManualComment,
			Reason:      "No executor X username is available, so this opportunity is kept as a manual comment suggestion.",
			Eligible:    false,
			BlockReason: "missing_executor_username",
			ManualURL:   manualURL,
		}
	}
	if tweetMentionsHandle(tweetText, username) {
		return autoCommentDeliveryDecision{
			Mode:           autoCommentDeliveryAutoComment,
			Reason:         "The monitored post mentions the executor X account, so it is eligible for API reply publishing.",
			Eligible:       true,
			ManualURL:      manualURL,
			QuoteCandidate: buildAutoCommentQuoteCandidate(generatedComment),
		}
	}
	return autoCommentDeliveryDecision{
		Mode:           autoCommentDeliveryManualComment,
		Reason:         "X API may reject replies to target-author posts unless the executor account is mentioned or otherwise invited into the conversation. This opportunity is kept as a manual comment suggestion.",
		Eligible:       false,
		BlockReason:    "not_mentioned_or_engaged",
		ManualURL:      manualURL,
		QuoteCandidate: buildAutoCommentQuoteCandidate(generatedComment),
	}
}

func tweetMentionsHandle(tweetText, username string) bool {
	username = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(username, "@")))
	if username == "" {
		return false
	}
	re := regexp.MustCompile(`(?i)(^|[^A-Za-z0-9_])@` + regexp.QuoteMeta(username) + `([^A-Za-z0-9_]|$)`)
	return re.MatchString(tweetText)
}

func autoCommentManualActionURL(username, tweetID string) string {
	username = strings.TrimSpace(strings.TrimPrefix(username, "@"))
	tweetID = strings.TrimSpace(tweetID)
	if username != "" && tweetID != "" {
		return fmt.Sprintf("https://x.com/%s/status/%s", username, tweetID)
	}
	if tweetID != "" {
		return fmt.Sprintf("https://x.com/i/web/status/%s", tweetID)
	}
	if username != "" {
		return fmt.Sprintf("https://x.com/%s", username)
	}
	return "https://x.com"
}

func buildAutoCommentQuoteCandidate(comment string) string {
	comment = strings.TrimSpace(comment)
	if comment == "" {
		return ""
	}
	return truncateRunes(comment, autoCommentPreviewRunes)
}

func applyAutoCommentDelivery(task *model.AutoCommentTask, decision autoCommentDeliveryDecision) {
	if task == nil {
		return
	}
	task.DeliveryMode = firstNonEmpty(decision.Mode, autoCommentDeliveryManualComment)
	task.DeliveryReason = truncateRunes(decision.Reason, 1000)
	task.APIReplyEligible = decision.Eligible
	task.APIReplyBlockReason = truncateRunes(decision.BlockReason, 500)
	task.ManualActionURL = truncateRunes(decision.ManualURL, 500)
	task.QuotePostCandidate = truncateRunes(decision.QuoteCandidate, autoCommentPreviewRunes)
	if task.DeliveryMode == autoCommentDeliveryManualComment && task.Status == "ready_to_publish" {
		task.Status = "pending_review"
		task.CapabilityStatus = "manual_comment_suggested"
		task.ApprovalRequired = true
		task.ApprovedAt = nil
	}
}

func convertRestrictedAutoCommentToManualSuggestion(task *model.AutoCommentTask, reason string) {
	if task == nil {
		return
	}
	task.Status = "pending_review"
	task.CapabilityStatus = "manual_comment_suggested"
	task.FailureCategory = "x_reply_restricted"
	task.FailureReason = truncateErrMsg(reason)
	task.Retryable = false
	task.RetryAfterAt = nil
	task.DeliveryMode = autoCommentDeliveryManualComment
	task.DeliveryReason = "X rejected API reply publishing for this conversation. The generated comment is still available as a manual comment suggestion."
	task.APIReplyEligible = false
	task.APIReplyBlockReason = "x_reply_restricted"
	if strings.TrimSpace(task.ManualActionURL) == "" {
		task.ManualActionURL = autoCommentManualActionURL(task.TargetUsername, task.TargetTweetID)
	}
	if strings.TrimSpace(task.QuotePostCandidate) == "" {
		task.QuotePostCandidate = buildAutoCommentQuoteCandidate(task.GeneratedComment)
	}
}

func (s *AutoCommentService) createAutopilotPreparedActivity(task *model.AutoCommentTask, accountUsername string, now time.Time) error {
	if s.activityRepo == nil || task == nil {
		return nil
	}
	log := &model.ActivityLog{
		UserID:              task.UserID,
		XAccountID:          task.XAccountID,
		Type:                "comment",
		Status:              "review",
		PreviewKey:          "activity.preview.commentAutopilotPrepared",
		AccountHandle:       formatXAccountHandle(accountUsername),
		ExecutedAt:          now,
		ReplyCommentTweetID: task.TargetTweetID,
		ReplyToUsername:     replyAuthorDisplay(task.TargetUsername),
		ReplyToTextPreview:  truncateReplyPreview(task.TargetTweetText, autoReplyPreviewRunes),
		ReplyTextPreview:    truncateReplyPreview(task.GeneratedComment, autoReplyPreviewRunes),
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		return err
	}
	task.ActivityLogID = log.ID
	return s.taskRepo.Save(task)
}

func autoCommentInputFromBot(target *model.AutoCommentTarget, bot *model.OAFBot, blocked []string) GenerateAutoCommentInput {
	if target == nil {
		return GenerateAutoCommentInput{Tone: "Friendly", BlockedWords: blocked}
	}
	return autoCommentInputFromValues(displayCommentTargetHandle(*target), target.TargetText, "Friendly", blocked, bot)
}

func autoCommentInputFromValues(username, tweet, tone string, blocked []string, bot *model.OAFBot) GenerateAutoCommentInput {
	in := GenerateAutoCommentInput{
		TargetUsername: normalizeHandle(username),
		TargetTweet:    tweet,
		Tone:           tone,
		BlockedWords:   blocked,
	}
	if bot == nil {
		return in
	}
	in.HasBot = true
	in.Name = bot.Name
	in.Occupation = bot.Occupation
	in.Industry = bot.Industry
	in.AgeRange = bot.AgeRange
	in.Gender = bot.Gender
	in.Education = bot.Education
	in.MBTI = bot.MBTI
	in.PersonalityTags = decodeStringList(bot.PersonalityTags)
	in.IdentitySummary = bot.IdentitySummary
	in.VoiceTone = bot.VoiceTone
	in.Topics = decodeStringList(bot.Topics)
	in.ForbiddenTopics = decodeStringList(bot.ForbiddenTopics)
	in.GrowthGoal = bot.GrowthGoal
	in.ProjectOneLiner = bot.ProjectOneLiner
	in.TargetAudience = bot.TargetAudience
	in.CoreValueProps = bot.CoreValueProps
	in.ProductFeatures = bot.ProductFeatures
	in.Differentiators = bot.Differentiators
	in.ContentPillars = decodeStringList(bot.ContentPillars)
	in.ContentObjectives = bot.ContentObjectives
	in.PreferredCTA = bot.PreferredCTA
	in.WebsiteURL = bot.WebsiteURL
	in.TelegramURL = bot.TelegramURL
	in.DiscordURL = bot.DiscordURL
	in.DocsURL = bot.DocsURL
	in.CTAPolicy = bot.CTAPolicy
	in.Hashtags = decodeStringList(bot.Hashtags)
	in.Keywords = decodeStringList(bot.Keywords)
	in.ComplianceNotes = bot.ComplianceNotes
	in.AvoidClaims = decodeStringList(bot.AvoidClaims)
	in.SafetyMode = bot.SafetyMode
	in.PrimaryLanguage = bot.PrimaryLanguage
	in.LanguageStrategy = bot.LanguageStrategy
	return in
}

func toAutoCommentTargetItem(row model.AutoCommentTarget) dto.AutoCommentTargetItem {
	item := dto.AutoCommentTargetItem{
		ID:                 row.ID,
		XAccountID:         row.XAccountID,
		TargetUserID:       row.TargetUserID,
		TargetUsername:     row.TargetUsername,
		TargetDisplayName:  row.TargetDisplayName,
		TargetTweetID:      row.TargetTweetID,
		TargetTweetURL:     row.TargetTweetURL,
		TargetAuthorHandle: row.TargetAuthorHandle,
		TargetText:         row.TargetText,
		TargetCategory:     firstNonEmpty(row.TargetCategory, "kol"),
		Priority:           normalizeAutoCommentTargetPriority(row.Priority),
		Notes:              row.Notes,
		Status:             row.Status,
		LastSeenTweetID:    row.LastSeenTweetID,
		LastFailureReason:  row.LastFailureReason,
	}
	if row.LastSeenTweetAt != nil {
		item.LastSeenTweetAt = row.LastSeenTweetAt.UTC().Format(time.RFC3339)
	}
	if row.LastCheckedAt != nil {
		item.LastCheckedAt = row.LastCheckedAt.UTC().Format(time.RFC3339)
	}
	if row.LastCommentedAt != nil {
		item.LastCommentedAt = row.LastCommentedAt.UTC().Format(time.RFC3339)
	}
	if row.ResolvedAt != nil {
		item.ResolvedAt = row.ResolvedAt.UTC().Format(time.RFC3339)
	}
	return item
}

func toAutoCommentTaskItem(row model.AutoCommentTask) dto.AutoCommentTaskItem {
	item := dto.AutoCommentTaskItem{
		ID:                  row.ID,
		BotID:               row.BotID,
		XAccountID:          row.XAccountID,
		TargetID:            row.TargetID,
		TargetUserID:        row.TargetUserID,
		TargetUsername:      row.TargetUsername,
		TargetTweetID:       row.TargetTweetID,
		TargetTweetText:     row.TargetTweetText,
		TargetTweetAuthor:   row.TargetTweetAuthor,
		GeneratedComment:    row.GeneratedComment,
		OpportunityScore:    row.OpportunityScore,
		GenerationReason:    row.GenerationReason,
		MatchedKeywords:     decodeStringList(row.MatchedKeywords),
		ReferencedContent:   decodeStringList(row.ReferencedContent),
		CommentVariants:     decodeAutoCommentVariants(row.CommentVariants),
		DeliveryMode:        firstNonEmpty(row.DeliveryMode, autoCommentDeliveryManualComment),
		DeliveryReason:      row.DeliveryReason,
		APIReplyEligible:    row.APIReplyEligible,
		APIReplyBlockReason: row.APIReplyBlockReason,
		ManualActionURL:     firstNonEmpty(row.ManualActionURL, autoCommentManualActionURL(row.TargetUsername, row.TargetTweetID)),
		QuotePostCandidate:  row.QuotePostCandidate,
		Status:              row.Status,
		RiskLevel:           row.RiskLevel,
		CapabilityStatus:    row.CapabilityStatus,
		FailureCategory:     row.FailureCategory,
		FailureReason:       row.FailureReason,
		Retryable:           row.Retryable,
		AttemptCount:        row.AttemptCount,
		ApprovalRequired:    row.ApprovalRequired,
		ActivityLogID:       row.ActivityLogID,
		CommentTweetID:      row.CommentTweetID,
		DetectedAt:          row.DetectedAt.UTC().Format(time.RFC3339),
	}
	if row.RetryAfterAt != nil {
		item.RetryAfterAt = row.RetryAfterAt.UTC().Format(time.RFC3339)
	}
	if row.LastAttemptAt != nil {
		item.LastAttemptAt = row.LastAttemptAt.UTC().Format(time.RFC3339)
	}
	if row.GeneratedAt != nil {
		item.GeneratedAt = row.GeneratedAt.UTC().Format(time.RFC3339)
	}
	if row.ApprovedAt != nil {
		item.ApprovedAt = row.ApprovedAt.UTC().Format(time.RFC3339)
	}
	if row.BlockedAt != nil {
		item.BlockedAt = row.BlockedAt.UTC().Format(time.RFC3339)
	}
	if row.SentAt != nil {
		item.SentAt = row.SentAt.UTC().Format(time.RFC3339)
	}
	return item
}
