package service

import (
	"sort"
	"strings"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"
)

type ReviewQueueService struct {
	commentTaskRepo *repository.AutoCommentTaskRepository
	replyDraftRepo  *repository.AutoReplyDraftRepository
	publishJobRepo  *repository.PublishJobRepository
	botRepo         *repository.OAFBotRepository
	accountRepo     *repository.TwitterAccountRepository
}

func NewReviewQueueService(commentTaskRepo *repository.AutoCommentTaskRepository, replyDraftRepo *repository.AutoReplyDraftRepository, publishJobRepo *repository.PublishJobRepository, botRepo *repository.OAFBotRepository, accountRepo *repository.TwitterAccountRepository) *ReviewQueueService {
	return &ReviewQueueService{
		commentTaskRepo: commentTaskRepo,
		replyDraftRepo:  replyDraftRepo,
		publishJobRepo:  publishJobRepo,
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
	replyDrafts, err := s.replyDraftRepo.ListByUser(userID, 500)
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
	commentJobs := map[uint]model.PublishJob{}
	replyJobs := map[uint]model.PublishJob{}
	if s.publishJobRepo != nil {
		commentIDs := make([]uint, 0, len(tasks))
		for _, task := range tasks {
			commentIDs = append(commentIDs, task.ID)
		}
		jobs, err := s.publishJobRepo.ListBySources(userID, repository.PublishSourceComment, commentIDs)
		if err != nil {
			return nil, err
		}
		for _, job := range jobs {
			commentJobs[job.SourceID] = job
		}
		replyIDs := make([]uint, 0, len(replyDrafts))
		for _, draft := range replyDrafts {
			replyIDs = append(replyIDs, draft.ID)
		}
		jobs, err = s.publishJobRepo.ListBySources(userID, repository.PublishSourceReply, replyIDs)
		if err != nil {
			return nil, err
		}
		for _, job := range jobs {
			replyJobs[job.SourceID] = job
		}
	}

	typeFilter := normalizeReviewQueueFilter(query.Type)
	statusFilter := normalizeReviewQueueFilter(query.Status)
	modeFilter := normalizeReviewQueueFilter(query.ExecutionMode)

	allItems := make([]dto.ReviewQueueItem, 0, len(tasks)+len(replyDrafts))
	stats := dto.ReviewQueueStats{}
	for _, task := range tasks {
		item := autoCommentTaskToReviewQueueItem(task, botNames[task.BotID], accountNames[task.XAccountID])
		applyPublishJobToReviewQueueItem(&item, commentJobs[task.ID])
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
	for _, draft := range replyDrafts {
		item := autoReplyDraftToReviewQueueItem(draft, botNames[draft.BotID], accountNames[draft.XAccountID])
		applyPublishJobToReviewQueueItem(&item, replyJobs[draft.ID])
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
	sort.SliceStable(allItems, func(i, j int) bool {
		return allItems[i].CreatedAt > allItems[j].CreatedAt
	})

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

func applyPublishJobToReviewQueueItem(item *dto.ReviewQueueItem, job model.PublishJob) {
	if item == nil || job.ID == 0 {
		return
	}
	item.PublishJobID = job.ID
	item.PublishStatus = job.Status
	item.PublishMode = job.PublishMode
	item.PublishLastError = job.LastError
	item.PublishExternalURL = job.ExternalURL
	switch job.Status {
	case repository.PublishStatusProcessing:
		item.Status = repository.PublishStatusProcessing
	case repository.PublishStatusPublished:
		item.Status = "published"
	case repository.PublishStatusFailed:
		item.Status = "failed"
		if strings.TrimSpace(job.LastError) != "" {
			item.RiskReasons = append(item.RiskReasons, job.LastError)
		}
	}
}

func autoCommentTaskToReviewQueueItem(task model.AutoCommentTask, botName string, accountName string) dto.ReviewQueueItem {
	status := normalizeReviewQueueStatus(task.Status)
	mode := inferReviewQueueExecutionMode(task.CapabilityStatus)
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

func autoReplyDraftToReviewQueueItem(draft model.AutoReplyDraft, botName string, accountName string) dto.ReviewQueueItem {
	status := normalizeReviewQueueStatus(draft.Status)
	mode := inferReviewQueueExecutionMode(draft.CapabilityStatus)
	reasons := make([]string, 0, 2)
	if strings.TrimSpace(draft.FailureCategory) != "" {
		reasons = append(reasons, draft.FailureCategory)
	}
	if strings.TrimSpace(draft.FailureReason) != "" {
		reasons = append(reasons, draft.FailureReason)
	}
	target := strings.TrimSpace(replyAuthorDisplay(draft.CommentAuthorHandle))
	if draft.CommentText != "" {
		target = target + ": " + truncateRunes(draft.CommentText, 120)
	}
	return dto.ReviewQueueItem{
		ID:                 draft.ID,
		Type:               "reply",
		Content:            draft.GeneratedReply,
		Status:             status,
		ExecutionMode:      mode,
		BotID:              draft.BotID,
		BotName:            botName,
		TwitterAccountID:   draft.XAccountID,
		TwitterAccountName: accountName,
		TargetSummary:      strings.TrimSpace(target),
		RiskLevel:          draft.RiskLevel,
		RiskReasons:        reasons,
		CreatedAt:          draft.CreatedAt.UTC().Format(timeRFC3339),
		SourceStatus:       draft.Status,
		SourceID:           draft.ID,
	}
}

func inferReviewQueueExecutionMode(capabilityStatus string) string {
	switch capabilityStatus {
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
	case "processing":
		return "processing"
	case "ready_to_publish":
		return "ready_to_publish"
	case "draft", "approved", "rejected", "failed", "published":
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
	case "approved", "published":
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
