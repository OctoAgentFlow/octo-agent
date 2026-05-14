package service

import (
	"strings"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"
)

type ReviewQueueService struct {
	commentTaskRepo *repository.AutoCommentTaskRepository
	botRepo         *repository.OAFBotRepository
	accountRepo     *repository.TwitterAccountRepository
}

func NewReviewQueueService(commentTaskRepo *repository.AutoCommentTaskRepository, botRepo *repository.OAFBotRepository, accountRepo *repository.TwitterAccountRepository) *ReviewQueueService {
	return &ReviewQueueService{
		commentTaskRepo: commentTaskRepo,
		botRepo:         botRepo,
		accountRepo:     accountRepo,
	}
}

func (s *ReviewQueueService) List(userID uint, query dto.ReviewQueueQuery) (*dto.ReviewQueueResponse, error) {
	page := query.Page
	if page <= 0 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	tasks, err := s.commentTaskRepo.ListQueueByUser(userID, 500)
	if err != nil {
		return nil, err
	}
	bots, err := s.botRepo.ListByUserID(userID)
	if err != nil {
		return nil, err
	}
	accounts, err := s.accountRepo.ListByUserID(userID)
	if err != nil {
		return nil, err
	}
	botNames := make(map[uint]string, len(bots))
	for _, bot := range bots {
		botNames[bot.ID] = bot.Name
	}
	accountNames := make(map[uint]string, len(accounts))
	for _, account := range accounts {
		accountNames[account.ID] = displayAccountName(account)
	}

	typeFilter := normalizeReviewQueueFilter(query.Type)
	statusFilter := normalizeReviewQueueFilter(query.Status)
	modeFilter := normalizeReviewQueueFilter(query.ExecutionMode)

	allItems := make([]dto.ReviewQueueItem, 0, len(tasks))
	stats := dto.ReviewQueueStats{}
	for _, task := range tasks {
		item := autoCommentTaskToReviewQueueItem(task, botNames[task.BotID], accountNames[task.XAccountID])
		incrementReviewQueueStats(&stats, item.Status)
		if typeFilter != "" && typeFilter != "all" && item.Type != typeFilter {
			continue
		}
		if statusFilter != "" && statusFilter != "all" && item.Status != statusFilter {
			continue
		}
		if modeFilter != "" && modeFilter != "all" && item.ExecutionMode != modeFilter {
			continue
		}
		allItems = append(allItems, item)
	}

	total := len(allItems)
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}

	return &dto.ReviewQueueResponse{
		Items:    allItems[start:end],
		Total:    total,
		Page:     page,
		PageSize: pageSize,
		Stats:    stats,
	}, nil
}

func autoCommentTaskToReviewQueueItem(task model.AutoCommentTask, botName string, accountName string) dto.ReviewQueueItem {
	status := normalizeReviewQueueStatus(task.Status)
	mode := inferReviewQueueExecutionMode(task)
	reasons := make([]string, 0, 2)
	if strings.TrimSpace(task.FailureCategory) != "" {
		reasons = append(reasons, task.FailureCategory)
	}
	if strings.TrimSpace(task.FailureReason) != "" {
		reasons = append(reasons, task.FailureReason)
	}
	target := strings.TrimSpace(firstNonEmpty(task.TargetTweetAuthor, task.TargetUsername))
	if task.TargetTweetText != "" {
		target = target + ": " + truncateRunes(task.TargetTweetText, 120)
	}
	return dto.ReviewQueueItem{
		ID:                 task.ID,
		Type:               "comment",
		Content:            task.GeneratedComment,
		Status:             status,
		ExecutionMode:      mode,
		BotID:              task.BotID,
		BotName:            botName,
		TwitterAccountID:   task.XAccountID,
		TwitterAccountName: accountName,
		TargetSummary:      strings.TrimSpace(target),
		RiskLevel:          task.RiskLevel,
		RiskReasons:        reasons,
		CreatedAt:          task.CreatedAt.UTC().Format(timeRFC3339),
		SourceStatus:       task.Status,
		SourceID:           task.ID,
	}
}

const timeRFC3339 = "2006-01-02T15:04:05Z07:00"

func inferReviewQueueExecutionMode(task model.AutoCommentTask) string {
	switch task.CapabilityStatus {
	case "manual_suggestion":
		return ExecutionModeManual
	case "autopilot_prepared":
		return ExecutionModeAutopilot
	default:
		return ExecutionModeReview
	}
}

func normalizeReviewQueueStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "review", "pending_review":
		return "pending_review"
	case "sent":
		return "published"
	case "ready_to_publish":
		return "ready_to_publish"
	case "draft", "approved", "rejected", "failed":
		return strings.ToLower(strings.TrimSpace(status))
	default:
		return strings.ToLower(strings.TrimSpace(status))
	}
}

func normalizeReviewQueueFilter(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "sent" {
		return "published"
	}
	if value == "review" {
		return "pending_review"
	}
	return value
}

func incrementReviewQueueStats(stats *dto.ReviewQueueStats, status string) {
	switch status {
	case "pending_review", "draft":
		stats.PendingReview++
	case "ready_to_publish":
		stats.ReadyToPublish++
	case "approved":
		stats.Approved++
	case "rejected":
		stats.Rejected++
	case "failed":
		stats.Failed++
	}
}

func displayAccountName(account model.TwitterAccount) string {
	name := strings.TrimSpace(account.Username)
	if name == "" {
		name = strings.TrimSpace(account.DisplayName)
	}
	if name == "" {
		return ""
	}
	return formatXAccountHandle(name)
}
