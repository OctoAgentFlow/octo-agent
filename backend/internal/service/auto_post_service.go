package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

var ErrAutoPostDailyLimitExceeded = errors.New("daily auto post quota exceeded")
var ErrAutoPostDuplicateContent = errors.New("auto_post_duplicate_content")

const autoPostPreviewRunes = 280

type AutoPostService struct {
	accountRepo  *repository.TwitterAccountRepository
	planRepo     *repository.AutoPostPlanRepository
	draftRepo    *repository.AutoPostDraftRepository
	contentRepo  *repository.ContentLibraryRepository
	activityRepo *repository.ActivityRepository
	userRepo     *repository.UserRepository
	oafBotRepo   *repository.OAFBotRepository
	usageRepo    *repository.AIGenerationUsageRepository
	ai           *AIService
}

func NewAutoPostService(accountRepo *repository.TwitterAccountRepository, planRepo *repository.AutoPostPlanRepository, draftRepo *repository.AutoPostDraftRepository, contentRepo *repository.ContentLibraryRepository, activityRepo *repository.ActivityRepository, userRepo *repository.UserRepository, oafBotRepo *repository.OAFBotRepository, usageRepo *repository.AIGenerationUsageRepository, ai *AIService) *AutoPostService {
	return &AutoPostService{
		accountRepo:  accountRepo,
		planRepo:     planRepo,
		draftRepo:    draftRepo,
		contentRepo:  contentRepo,
		activityRepo: activityRepo,
		userRepo:     userRepo,
		oafBotRepo:   oafBotRepo,
		usageRepo:    usageRepo,
		ai:           ai,
	}
}

func (s *AutoPostService) ListPlans(userID uint) (*dto.AutoPostPlansResponse, error) {
	rows, err := s.planRepo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoPostPlanItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, s.toPlanItem(row))
	}
	return &dto.AutoPostPlansResponse{Items: items}, nil
}

func (s *AutoPostService) GetPlan(userID, id uint) (*dto.AutoPostPlanItem, error) {
	plan, err := s.planRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	item := s.toPlanItem(*plan)
	return &item, nil
}

func (s *AutoPostService) CreatePlan(userID uint, req dto.AutoPostPlanRequest) (*dto.AutoPostPlanItem, error) {
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	bot, err := s.botForAccount(userID, acc.ID)
	if err != nil {
		return nil, err
	}
	plan, err := s.planRepo.GetByUserAndAccount(userID, acc.ID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if plan == nil || plan.ID == 0 {
		plan = &model.AutoPostPlan{UserID: userID, XAccountID: acc.ID}
		applyAutoPostPlanRequest(plan, req, botIDForUsage(bot), s.defaultDailyLimit(userID))
		if err := s.planRepo.Create(plan); err != nil {
			return nil, err
		}
		item := s.toPlanItem(*plan)
		return &item, nil
	}
	applyAutoPostPlanRequest(plan, req, botIDForUsage(bot), s.defaultDailyLimit(userID))
	if err := s.planRepo.Save(plan); err != nil {
		return nil, err
	}
	item := s.toPlanItem(*plan)
	return &item, nil
}

func (s *AutoPostService) UpdatePlan(userID, id uint, req dto.AutoPostPlanRequest) (*dto.AutoPostPlanItem, error) {
	plan, err := s.planRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, req.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	bot, err := s.botForAccount(userID, acc.ID)
	if err != nil {
		return nil, err
	}
	plan.XAccountID = acc.ID
	applyAutoPostPlanRequest(plan, req, botIDForUsage(bot), s.defaultDailyLimit(userID))
	if err := s.planRepo.Save(plan); err != nil {
		return nil, err
	}
	item := s.toPlanItem(*plan)
	return &item, nil
}

func (s *AutoPostService) ListDrafts(userID uint) (*dto.AutoPostDraftsResponse, error) {
	rows, err := s.draftRepo.ListByUser(userID, 50)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutoPostDraftItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, s.toDraftItem(row))
	}
	return &dto.AutoPostDraftsResponse{Items: items}, nil
}

func (s *AutoPostService) GenerateDraft(ctx context.Context, userID, planID uint, req dto.AutoPostGenerateRequest) (*dto.AutoPostDraftItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	plan, err := s.planRepo.GetByUserAndID(userID, planID)
	if err != nil {
		return nil, err
	}
	acc, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, plan.XAccountID)
	if err != nil {
		return nil, fmt.Errorf("x account not found")
	}
	bot, err := s.botForAccount(userID, acc.ID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if err := assertAIGenerationQuota(s.userRepo, s.usageRepo, userID, now); err != nil {
		return nil, err
	}
	if err := s.assertDailyQuota(userID, acc.ID, plan, now); err != nil {
		return nil, err
	}
	recentDrafts, err := s.draftRepo.RecentByAccount(userID, acc.ID, 8)
	if err != nil {
		return nil, err
	}
	recent := make([]string, 0, len(recentDrafts))
	for _, draft := range recentDrafts {
		if strings.TrimSpace(draft.GeneratedContent) != "" {
			recent = append(recent, draft.GeneratedContent)
		}
	}
	var contentItem *model.ContentLibraryItem
	if req.ContentLibraryItemID > 0 {
		if s.contentRepo == nil {
			return nil, fmt.Errorf("content library is not available")
		}
		contentItem, err = s.contentRepo.GetByUserAndID(userID, req.ContentLibraryItemID)
		if err != nil {
			return nil, err
		}
		if !s.contentItemAllowedForPlan(contentItem, acc.ID, botIDForUsage(bot)) {
			return nil, fmt.Errorf("content item is not available for this account")
		}
		if contentItem.Status != "active" {
			return nil, fmt.Errorf("content item is not active")
		}
	}
	input := autoPostInputFromBot(acc, bot, "")
	input.ContentDirection = strings.TrimSpace(req.ContentDirection)
	input.RecentPosts = recent
	if contentItem != nil {
		input.ContentItemTitle = contentItem.Title
		input.ContentItemType = contentItem.ItemType
		input.ContentItemBody = contentItem.Body
		input.ContentItemURL = contentItem.SourceURL
		input.ContentItemTopics = decodeStringList(contentItem.Topics)
		input.ContentItemGoal = contentItem.GrowthGoal
		input.ContentItemCTA = contentItem.CTAPreference
	}
	contentDirection := strings.TrimSpace(req.ContentDirection)
	if contentDirection == "" && contentItem != nil {
		contentDirection = contentItem.Title
	}
	content, contentHash, err := s.generateUniqueAutoPost(ctx, userID, acc.ID, input)
	if err != nil {
		return nil, err
	}
	risk := evaluateAutoCommentRisk(content, bot, nil)
	mode := effectiveExecutionMode(plan.ExecutionMode)
	status, capability, approvalRequired, approvedAt := autoCommentInitialState(mode, risk, now)
	draft := &model.AutoPostDraft{
		UserID:           userID,
		PlanID:           plan.ID,
		BotID:            botIDForUsage(bot),
		XAccountID:       acc.ID,
		ContentLibraryID: req.ContentLibraryItemID,
		ContentDirection: truncateRunes(contentDirection, 512),
		ContentHash:      contentHash,
		GeneratedContent: truncateRunes(content, autoPostPreviewRunes),
		Status:           status,
		RiskLevel:        risk.Level,
		CapabilityStatus: capability,
		FailureCategory:  risk.Category,
		FailureReason:    risk.Reason,
		ApprovalRequired: approvalRequired,
		GeneratedAt:      &now,
		ApprovedAt:       approvedAt,
	}
	if err := s.draftRepo.Create(draft); err != nil {
		return nil, err
	}
	if err := s.usageRepo.Increment(userID, draft.BotID, repository.AIGenerationSceneAutoPost, now, 1); err != nil {
		return nil, err
	}
	if contentItem != nil {
		if err := s.contentRepo.MarkUsed(contentItem, now); err != nil {
			return nil, err
		}
	}
	plan.BotID = draft.BotID
	_ = s.planRepo.TouchRun(plan, now)
	if err := s.createGeneratedActivity(draft, acc.Username, now); err != nil {
		return nil, err
	}
	item := s.toDraftItem(*draft)
	return &item, nil
}

func (s *AutoPostService) UpdateDraft(userID, id uint, content string) (*dto.AutoPostDraftItem, error) {
	draft, err := s.draftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if draft.Status != "review" && draft.Status != "pending_review" && draft.Status != "draft" && draft.Status != "approved" {
		return nil, fmt.Errorf("draft cannot be edited from status %s", draft.Status)
	}
	draft.GeneratedContent = truncateRunes(content, autoPostPreviewRunes)
	if draft.Status == "approved" {
		draft.Status = "pending_review"
		draft.ApprovedAt = nil
	}
	if err := s.draftRepo.Save(draft); err != nil {
		return nil, err
	}
	item := s.toDraftItem(*draft)
	return &item, nil
}

func (s *AutoPostService) ApproveDraft(userID, id uint) (*dto.AutoPostDraftItem, error) {
	draft, err := s.draftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if draft.Status != "review" && draft.Status != "pending_review" && draft.Status != "draft" && draft.Status != "approved" {
		return nil, fmt.Errorf("draft cannot be approved from status %s", draft.Status)
	}
	now := time.Now().UTC()
	draft.Status = "approved"
	draft.ApprovedAt = &now
	draft.ApprovalRequired = false
	if err := s.draftRepo.Save(draft); err != nil {
		return nil, err
	}
	item := s.toDraftItem(*draft)
	return &item, nil
}

func (s *AutoPostService) RejectDraft(userID, id uint, reason string) (*dto.AutoPostDraftItem, error) {
	draft, err := s.draftRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	draft.Status = "rejected"
	draft.RejectedAt = &now
	draft.FailureReason = truncateErrMsg(strings.TrimSpace(reason))
	if draft.FailureReason == "" {
		draft.FailureReason = "Rejected by user."
	}
	if err := s.draftRepo.Save(draft); err != nil {
		return nil, err
	}
	item := s.toDraftItem(*draft)
	return &item, nil
}

func (s *AutoPostService) assertDailyQuota(userID, xAccountID uint, plan *model.AutoPostPlan, now time.Time) error {
	limit := plan.DailyLimit
	if limit <= 0 {
		limit = s.defaultDailyLimit(userID)
	}
	if s.userRepo != nil {
		if u, err := s.userRepo.GetByID(userID); err == nil {
			planLimit := int(subscription.LimitsForUser(u).DailyAutoPosts)
			if planLimit > 0 && (limit <= 0 || planLimit < limit) {
				limit = planLimit
			}
		}
	}
	if limit <= 0 {
		return ErrAutoPostDailyLimitExceeded
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	used, err := s.draftRepo.CountCreatedBetweenForAccount(userID, xAccountID, dayStart, now)
	if err != nil {
		return err
	}
	if int(used) >= limit {
		return ErrAutoPostDailyLimitExceeded
	}
	return nil
}

func (s *AutoPostService) generateUniqueAutoPost(ctx context.Context, userID, xAccountID uint, input GenerateAutoPostInput) (string, string, error) {
	since := time.Now().UTC().AddDate(0, 0, -30)
	var lastContent string
	var lastHash string
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			input.RecentPosts = append(input.RecentPosts, lastContent)
			if strings.TrimSpace(input.ContentDirection) == "" {
				input.ContentDirection = "Generate a different angle from the same content source."
			} else {
				input.ContentDirection += "\nGenerate a different angle from the same content source."
			}
		}
		content, err := s.ai.GenerateAutoPost(ctx, input)
		if err != nil {
			return "", "", err
		}
		hash := autoPostContentHash(content)
		exists, err := s.draftRepo.ExistsContentHashForAccountSince(userID, xAccountID, hash, since)
		if err != nil {
			return "", "", err
		}
		lastContent = content
		lastHash = hash
		if !exists {
			return content, hash, nil
		}
	}
	return "", lastHash, ErrAutoPostDuplicateContent
}

func autoPostContentHash(content string) string {
	normalized := strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(content)), " "))
	sum := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(sum[:])
}

func (s *AutoPostService) contentItemAllowedForPlan(item *model.ContentLibraryItem, xAccountID, botID uint) bool {
	if item == nil {
		return false
	}
	if item.TwitterAccountID != nil && *item.TwitterAccountID != xAccountID {
		return false
	}
	if item.BotID != nil && botID > 0 && *item.BotID != botID {
		return false
	}
	if item.BotID != nil && botID == 0 {
		return false
	}
	return true
}

func (s *AutoPostService) defaultDailyLimit(userID uint) int {
	if s.userRepo != nil {
		if u, err := s.userRepo.GetByID(userID); err == nil {
			if v := subscription.LimitsForUser(u).DailyAutoPosts; v > 0 {
				return int(v)
			}
		}
	}
	return 3
}

func (s *AutoPostService) botForAccount(userID, xAccountID uint) (*model.OAFBot, error) {
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

func (s *AutoPostService) createGeneratedActivity(draft *model.AutoPostDraft, accountUsername string, now time.Time) error {
	if s.activityRepo == nil || draft == nil {
		return nil
	}
	key := "activity.preview.autoPostDraftGenerated"
	status := "review"
	if draft.Status == "ready_to_publish" {
		key = "activity.preview.autoPostAutopilotPrepared"
	} else if draft.RiskLevel == "high" {
		key = "activity.preview.autoPostRiskReview"
	}
	log := &model.ActivityLog{
		UserID:             draft.UserID,
		XAccountID:         draft.XAccountID,
		Type:               "post",
		Status:             status,
		PreviewKey:         key,
		AccountHandle:      formatXAccountHandle(accountUsername),
		ExecutedAt:         now,
		ReplyTextPreview:   truncateReplyPreview(draft.GeneratedContent, autoPostPreviewRunes),
		ReplyToTextPreview: truncateReplyPreview(draft.ContentDirection, autoReplyPreviewRunes),
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		return err
	}
	draft.ActivityLogID = log.ID
	return s.draftRepo.Save(draft)
}

func (s *AutoPostService) toPlanItem(row model.AutoPostPlan) dto.AutoPostPlanItem {
	accountHandle := ""
	if s.accountRepo != nil && row.XAccountID != 0 {
		if acc, err := s.accountRepo.GetConnectedByUserAndAccountID(row.UserID, row.XAccountID); err == nil {
			accountHandle = formatXAccountHandle(acc.Username)
		}
	}
	botName := ""
	if s.oafBotRepo != nil && row.BotID != 0 {
		if bot, err := s.oafBotRepo.GetByUserAndID(row.UserID, row.BotID); err == nil {
			botName = bot.Name
		}
	}
	return dto.AutoPostPlanItem{
		ID:                 row.ID,
		UserID:             row.UserID,
		XAccountID:         row.XAccountID,
		BotID:              row.BotID,
		AccountHandle:      accountHandle,
		BotName:            botName,
		Enabled:            row.Enabled,
		ExecutionMode:      effectiveExecutionMode(row.ExecutionMode),
		DailyLimit:         row.DailyLimit,
		MinIntervalMinutes: row.MinIntervalMinutes,
		PostingWindows:     row.PostingWindows,
		Timezone:           row.Timezone,
		LastRunAt:          formatOptionalTime(row.LastRunAt),
		NextRunAt:          formatOptionalTime(row.NextRunAt),
		CreatedAt:          row.CreatedAt.UTC().Format(timeRFC3339),
		UpdatedAt:          row.UpdatedAt.UTC().Format(timeRFC3339),
	}
}

func (s *AutoPostService) toDraftItem(row model.AutoPostDraft) dto.AutoPostDraftItem {
	accountHandle := ""
	if s.accountRepo != nil && row.XAccountID != 0 {
		if acc, err := s.accountRepo.GetConnectedByUserAndAccountID(row.UserID, row.XAccountID); err == nil {
			accountHandle = formatXAccountHandle(acc.Username)
		}
	}
	botName := ""
	if s.oafBotRepo != nil && row.BotID != 0 {
		if bot, err := s.oafBotRepo.GetByUserAndID(row.UserID, row.BotID); err == nil {
			botName = bot.Name
		}
	}
	return dto.AutoPostDraftItem{
		ID:               row.ID,
		UserID:           row.UserID,
		PlanID:           row.PlanID,
		BotID:            row.BotID,
		XAccountID:       row.XAccountID,
		ActivityLogID:    row.ActivityLogID,
		BotName:          botName,
		AccountHandle:    accountHandle,
		ContentLibraryID: row.ContentLibraryID,
		ContentTitle:     s.contentTitle(row.UserID, row.ContentLibraryID),
		ContentDirection: row.ContentDirection,
		ContentHash:      row.ContentHash,
		GeneratedContent: row.GeneratedContent,
		Status:           row.Status,
		RiskLevel:        row.RiskLevel,
		CapabilityStatus: row.CapabilityStatus,
		FailureCategory:  row.FailureCategory,
		FailureReason:    row.FailureReason,
		ApprovalRequired: row.ApprovalRequired,
		CreatedAt:        row.CreatedAt.UTC().Format(timeRFC3339),
		GeneratedAt:      formatOptionalTime(row.GeneratedAt),
		ApprovedAt:       formatOptionalTime(row.ApprovedAt),
		RejectedAt:       formatOptionalTime(row.RejectedAt),
		PublishedAt:      formatOptionalTime(row.PublishedAt),
	}
}

func (s *AutoPostService) contentTitle(userID, contentID uint) string {
	if s.contentRepo == nil || contentID == 0 {
		return ""
	}
	item, err := s.contentRepo.GetByUserAndID(userID, contentID)
	if err != nil {
		return ""
	}
	return item.Title
}

func applyAutoPostPlanRequest(plan *model.AutoPostPlan, req dto.AutoPostPlanRequest, botID uint, defaultDailyLimit int) {
	plan.BotID = botID
	plan.Enabled = req.Enabled
	plan.ExecutionMode = effectiveExecutionMode(req.ExecutionMode)
	if plan.ExecutionMode == "" {
		plan.ExecutionMode = ExecutionModeReview
	}
	plan.DailyLimit = req.DailyLimit
	if plan.DailyLimit <= 0 {
		plan.DailyLimit = defaultDailyLimit
	}
	plan.MinIntervalMinutes = req.MinIntervalMinutes
	if plan.MinIntervalMinutes <= 0 {
		plan.MinIntervalMinutes = 120
	}
	plan.PostingWindows = truncateRunes(req.PostingWindows, 512)
	plan.Timezone = strings.TrimSpace(req.Timezone)
	if plan.Timezone == "" {
		plan.Timezone = "UTC"
	}
}

func formatOptionalTime(t *time.Time) string {
	if t == nil || t.IsZero() {
		return ""
	}
	return t.UTC().Format(timeRFC3339)
}
