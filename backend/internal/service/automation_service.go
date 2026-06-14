package service

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"
)

const (
	ExecutionModeManual    = "manual"
	ExecutionModeReview    = "review"
	ExecutionModeAutopilot = "autopilot"
)

type AutomationService struct {
	repo                 *repository.AutomationRepository
	userRepo             *repository.UserRepository
	activityRepo         *repository.ActivityRepository
	postRepo             *repository.PostRepository
	contentDraftPlanRepo *repository.ContentDraftPlanRepository
	commentTaskRepo      *repository.AutoCommentTaskRepository
	replyDraftRepo       *repository.AutoReplyDraftRepository
	contentDraftRepo     *repository.ContentDraftRepository
}

func NewAutomationService(
	repo *repository.AutomationRepository,
	userRepo *repository.UserRepository,
	activityRepo *repository.ActivityRepository,
	postRepo *repository.PostRepository,
	contentDraftPlanRepo *repository.ContentDraftPlanRepository,
	commentTaskRepo *repository.AutoCommentTaskRepository,
	replyDraftRepo *repository.AutoReplyDraftRepository,
	contentDraftRepo *repository.ContentDraftRepository,
) *AutomationService {
	return &AutomationService{
		repo:                 repo,
		userRepo:             userRepo,
		activityRepo:         activityRepo,
		postRepo:             postRepo,
		contentDraftPlanRepo: contentDraftPlanRepo,
		commentTaskRepo:      commentTaskRepo,
		replyDraftRepo:       replyDraftRepo,
		contentDraftRepo:     contentDraftRepo,
	}
}

func (s *AutomationService) List(userID uint) (*dto.AutomationsResponse, error) {
	if err := s.repo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	modules, err := s.repo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutomationModuleData, 0, len(modules))
	for _, m := range modules {
		item := toAutomationModuleData(m)
		if item.Type == repository.AutomationTypePost {
			if err := s.applyAutoPostPlannerState(userID, &item); err != nil {
				return nil, err
			}
		}
		items = append(items, item)
	}
	if s.activityRepo != nil {
		now := time.Now().UTC()
		dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		for i := range items {
			nDayByType, err := s.activityRepo.CountSuccessByTypeBetween(userID, items[i].Type, dayStart, now)
			if err != nil {
				return nil, err
			}
			items[i].ExecutedToday = int(nDayByType)

			if items[i].Type != "reply" {
				continue
			}
			nDay, err := s.activityRepo.CountReplySuccessBetween(userID, dayStart, now)
			if err != nil {
				return nil, err
			}
			last, err := s.activityRepo.LatestReplyExecutedAt(userID)
			if err != nil {
				return nil, err
			}
			lastStr := ""
			if last != nil {
				lastStr = last.UTC().Format(time.RFC3339)
			}
			items[i].ReplyUsage = &dto.AutomationReplyUsage{
				TodayCount:     int(nDay),
				DailyLimit:     0,
				RemainingToday: 0,
				LastExecutedAt: lastStr,
			}
		}
	}
	return &dto.AutomationsResponse{Modules: items}, nil
}

func (s *AutomationService) Update(userID uint, typ string, req dto.AutomationConfigPayload) (*dto.AutomationModuleData, error) {
	if !isValidAutomationType(typ) {
		return nil, errors.New("invalid automation type")
	}
	if strings.TrimSpace(req.Tone) == "" {
		return nil, errors.New("tone is required")
	}
	if err := s.repo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	cfg, err := s.repo.GetByUserAndType(userID, typ)
	if err != nil {
		return nil, err
	}
	keywords, _ := json.Marshal(req.Safety.BlockedKeywords)
	wasEnabled := cfg.Enabled

	if req.Enabled {
		if err := s.assertSubscriptionForAutomation(userID); err != nil {
			return nil, err
		}
	}
	cfg.Enabled = req.Enabled
	cfg.FrequencyIntervalMinutes = req.Frequency.IntervalMinutes
	cfg.FrequencyDailyLimit = 0
	cfg.Tone = req.Tone
	if mode := normalizeExecutionMode(req.ExecutionMode); mode != "" {
		if mode == ExecutionModeAutopilot {
			if err := s.assertAutopilotEntitlement(userID); err != nil {
				return nil, err
			}
		}
		cfg.ExecutionMode = mode
	} else if strings.TrimSpace(cfg.ExecutionMode) == "" {
		cfg.ExecutionMode = ExecutionModeReview
	}
	cfg.SafetyRequireApproval = req.Safety.RequireApproval
	cfg.SafetyMaxPerHour = 0
	cfg.SafetyBlockedKeywords = string(keywords)
	if err := s.syncAutoPostPlannerEnabled(userID, typ, req.Enabled, cfg.FrequencyIntervalMinutes); err != nil {
		return nil, err
	}

	now := time.Now()
	if cfg.Enabled {
		if cfg.State == "Paused" {
			cfg.State = "Queued"
		}
		next := now.Add(time.Duration(cfg.FrequencyIntervalMinutes) * time.Minute)
		cfg.NextRunAt = &next
	} else {
		cfg.State = "Paused"
		cfg.NextRunAt = nil
	}
	if err := s.repo.Save(cfg); err != nil {
		return nil, err
	}
	if wasEnabled != cfg.Enabled {
		previewKey := "activity.preview.automationModuleDisabled"
		status := "review"
		if cfg.Enabled {
			previewKey = "activity.preview.automationModuleEnabled"
			status = "success"
		}
		_ = recordAutomationActivity(s.activityRepo, userID, typ, status, previewKey, "")
	}
	data := toAutomationModuleData(*cfg)
	if typ == repository.AutomationTypePost {
		if err := s.applyAutoPostPlannerState(userID, &data); err != nil {
			return nil, err
		}
	}
	return &data, nil
}

func (s *AutomationService) UpdateExecutionMode(userID uint, typ string, mode string) (*dto.AutomationModuleData, error) {
	if !isValidAutomationType(typ) {
		return nil, errors.New("invalid automation type")
	}
	normalized := normalizeExecutionMode(mode)
	if normalized == "" {
		return nil, errors.New("invalid execution mode")
	}
	if normalized == ExecutionModeAutopilot {
		if err := s.assertAutopilotEntitlement(userID); err != nil {
			return nil, err
		}
	}
	if err := s.repo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	cfg, err := s.repo.GetByUserAndType(userID, typ)
	if err != nil {
		return nil, err
	}
	cfg.ExecutionMode = normalized
	if err := s.repo.Save(cfg); err != nil {
		return nil, err
	}
	data := toAutomationModuleData(*cfg)
	return &data, nil
}

func (s *AutomationService) Toggle(userID uint, typ string, enabled bool) (*dto.AutomationModuleData, error) {
	if !isValidAutomationType(typ) {
		return nil, errors.New("invalid automation type")
	}
	if err := s.repo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	cfg, err := s.repo.GetByUserAndType(userID, typ)
	if err != nil {
		return nil, err
	}
	wasEnabled := cfg.Enabled
	if enabled {
		if err := s.assertSubscriptionForAutomation(userID); err != nil {
			return nil, err
		}
	}
	cfg.Enabled = enabled
	if err := s.syncAutoPostPlannerEnabled(userID, typ, enabled, cfg.FrequencyIntervalMinutes); err != nil {
		return nil, err
	}
	now := time.Now()
	if enabled {
		if cfg.State == "Paused" {
			cfg.State = "Queued"
		}
		next := now.Add(time.Duration(cfg.FrequencyIntervalMinutes) * time.Minute)
		cfg.NextRunAt = &next
	} else {
		cfg.State = "Paused"
		cfg.NextRunAt = nil
	}
	if err := s.repo.Save(cfg); err != nil {
		return nil, err
	}
	if wasEnabled != cfg.Enabled {
		previewKey := "activity.preview.automationModuleDisabled"
		status := "review"
		if cfg.Enabled {
			previewKey = "activity.preview.automationModuleEnabled"
			status = "success"
		}
		_ = recordAutomationActivity(s.activityRepo, userID, typ, status, previewKey, "")
	}
	data := toAutomationModuleData(*cfg)
	if typ == repository.AutomationTypePost {
		if err := s.applyAutoPostPlannerState(userID, &data); err != nil {
			return nil, err
		}
	}
	return &data, nil
}

func (s *AutomationService) RuntimeStatus(userID uint) (*dto.AutomationRuntimeStatusData, error) {
	if err := s.repo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	modules, err := s.repo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	since24h := now.Add(-24 * time.Hour)

	needsReviewRows, err := s.currentExecutionQueueNeedsReview(userID)
	if err != nil {
		return nil, err
	}
	retries24hRows, err := s.activityRepo.CountByStatusSince(userID, "failed", since24h)
	if err != nil {
		return nil, err
	}
	lastSuccessAt := ""
	if t, err := s.activityRepo.LatestSuccessExecutedAt(userID); err != nil {
		return nil, err
	} else if t != nil {
		lastSuccessAt = t.UTC().Format(time.RFC3339)
	}

	queuedPosts := int64(0)
	if s.postRepo != nil {
		queuedPosts, err = s.postRepo.CountByUserAndStatuses(userID, []string{"scheduled", "processing"})
		if err != nil {
			return nil, err
		}
	}
	enabledCount := 0
	for _, m := range modules {
		if m.Enabled {
			enabledCount++
		}
	}
	// QueueDepth real source:
	// - scheduled/processing posts (actual pending publish tasks)
	// - review activities awaiting manual action
	// - enabled automation modules as lightweight baseline workers
	queueDepth := int(queuedPosts+needsReviewRows) + enabledCount

	return &dto.AutomationRuntimeStatusData{
		QueueDepth:    queueDepth,
		LastSuccessAt: lastSuccessAt,
		RetriesLast24: int(retries24hRows),
		NeedsReview:   int(needsReviewRows),
	}, nil
}

func (s *AutomationService) currentExecutionQueueNeedsReview(userID uint) (int64, error) {
	total := int64(0)
	if s.commentTaskRepo != nil {
		tasks, err := s.commentTaskRepo.ListQueueByUser(userID, 500)
		if err != nil {
			return 0, err
		}
		for _, task := range tasks {
			if isReviewQueueNeedsReviewStatus(task.Status) {
				total++
			}
		}
	}
	if s.replyDraftRepo != nil {
		drafts, err := s.replyDraftRepo.ListByUser(userID, 500)
		if err != nil {
			return 0, err
		}
		for _, draft := range drafts {
			if isReviewQueueNeedsReviewStatus(draft.Status) {
				total++
			}
		}
	}
	if s.contentDraftRepo != nil {
		drafts, err := s.contentDraftRepo.ListByUser(userID, 500)
		if err != nil {
			return 0, err
		}
		for _, draft := range drafts {
			if isDailyXQueueDraft(draft) {
				continue
			}
			if isReviewQueueNeedsReviewStatus(draft.Status) {
				total++
			}
		}
	}
	return total, nil
}

func isReviewQueueNeedsReviewStatus(status string) bool {
	switch normalizeReviewQueueStatus(status) {
	case "draft", "pending_review":
		return true
	default:
		return false
	}
}

func (s *AutomationService) syncAutoPostPlannerEnabled(userID uint, typ string, enabled bool, intervalMinutes int) error {
	if typ != repository.AutomationTypePost || s.contentDraftPlanRepo == nil {
		return nil
	}
	if !enabled {
		return s.contentDraftPlanRepo.PauseAllByUser(userID)
	}
	plans, err := s.contentDraftPlanRepo.ListByUser(userID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	for i := range plans {
		plans[i].Enabled = true
		if plans[i].MinIntervalMinutes <= 0 {
			plans[i].MinIntervalMinutes = intervalMinutes
		}
		if plans[i].MinIntervalMinutes <= 0 {
			plans[i].MinIntervalMinutes = 120
		}
		if strings.TrimSpace(plans[i].Timezone) == "" {
			plans[i].Timezone = "UTC"
		}
		if plans[i].NextRunAt == nil || plans[i].NextRunAt.Before(now) {
			next := computeContentDraftNextRun(plans[i].MinIntervalMinutes, plans[i].PostingWindows, plans[i].Timezone, now)
			plans[i].NextRunAt = &next
		}
		plans[i].ProcessingAt = nil
	}
	return s.contentDraftPlanRepo.SaveAll(plans)
}

func (s *AutomationService) applyAutoPostPlannerState(userID uint, item *dto.AutomationModuleData) error {
	if s.contentDraftPlanRepo == nil || item == nil {
		return nil
	}
	plans, err := s.contentDraftPlanRepo.ListByUser(userID)
	if err != nil {
		return err
	}
	if len(plans) == 0 {
		return nil
	}
	var earliestNext *time.Time
	var latestLast *time.Time
	enabled := false
	for i := range plans {
		plan := plans[i]
		if plan.LastRunAt != nil && (latestLast == nil || plan.LastRunAt.After(*latestLast)) {
			t := *plan.LastRunAt
			latestLast = &t
		}
		if !plan.Enabled {
			continue
		}
		enabled = true
		if plan.NextRunAt != nil && (earliestNext == nil || plan.NextRunAt.Before(*earliestNext)) {
			t := *plan.NextRunAt
			earliestNext = &t
		}
	}
	item.Config.Enabled = enabled
	if enabled {
		item.State = "Queued"
		if earliestNext != nil {
			item.NextRunAt = earliestNext.UTC().Format(time.RFC3339)
		}
	} else {
		item.State = "Paused"
		item.NextRunAt = ""
	}
	if latestLast != nil {
		item.LastRunAt = latestLast.UTC().Format(time.RFC3339)
	}
	return nil
}

func (s *AutomationService) assertSubscriptionForAutomation(userID uint) error {
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	return subscription.AssertUserMayProduceContent(u, time.Now())
}

func (s *AutomationService) assertAutopilotEntitlement(userID uint) error {
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	plan := subscription.NormalizePlanCode(u.SubscriptionPlanCode)
	if plan == subscription.PlanPlus || plan == subscription.PlanPro || plan == subscription.PlanProPlus {
		return nil
	}
	return errors.New("autopilot requires Plus or higher plan")
}

func isValidAutomationType(typ string) bool {
	return typ == "post" || typ == "reply" || typ == "dm" || typ == "comment"
}

func normalizeExecutionMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "":
		return ""
	case ExecutionModeManual:
		return ExecutionModeManual
	case ExecutionModeReview, "pending_review":
		return ExecutionModeReview
	case ExecutionModeAutopilot, "auto":
		return ExecutionModeAutopilot
	default:
		return ""
	}
}

func toAutomationModuleData(m model.AutomationConfig) dto.AutomationModuleData {
	var blocked []string
	_ = json.Unmarshal([]byte(m.SafetyBlockedKeywords), &blocked)
	data := dto.AutomationModuleData{
		Type:  m.Type,
		Name:  automationDisplayName(m.Type),
		State: m.State,
		Config: dto.AutomationConfigPayload{
			Enabled: m.Enabled,
			Frequency: dto.AutomationFrequency{
				IntervalMinutes: m.FrequencyIntervalMinutes,
				DailyLimit:      m.FrequencyDailyLimit,
			},
			Tone:          m.Tone,
			ExecutionMode: effectiveExecutionMode(m.ExecutionMode),
			Safety: dto.AutomationSafety{
				RequireApproval: m.SafetyRequireApproval,
				MaxPerHour:      m.SafetyMaxPerHour,
				BlockedKeywords: blocked,
			},
		},
	}
	if m.LastRunAt != nil {
		data.LastRunAt = m.LastRunAt.UTC().Format(time.RFC3339)
	}
	if m.NextRunAt != nil {
		data.NextRunAt = m.NextRunAt.UTC().Format(time.RFC3339)
	}
	data.LastScanStatus = strings.TrimSpace(m.LastScanStatus)
	data.LastScanMessage = strings.TrimSpace(m.LastScanMessage)
	if m.LastScanAt != nil {
		data.LastScanAt = m.LastScanAt.UTC().Format(time.RFC3339)
	}
	return data
}

func effectiveExecutionMode(mode string) string {
	normalized := normalizeExecutionMode(mode)
	if normalized == "" {
		return ExecutionModeReview
	}
	return normalized
}

func automationDisplayName(typ string) string {
	switch typ {
	case "post":
		return "Post"
	case "reply":
		return "Reply"
	case "dm":
		return "DM"
	case "comment":
		return "Comment"
	default:
		if typ == "" {
			return ""
		}
		return strings.ToUpper(typ[:1]) + typ[1:]
	}
}
