package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"
)

type ReviewQueueService struct {
	commentTaskRepo *repository.AutoCommentTaskRepository
	replyDraftRepo  *repository.AutoReplyDraftRepository
	postDraftRepo   *repository.AutoPostDraftRepository
	publishJobRepo  *repository.PublishJobRepository
	botRepo         *repository.OAFBotRepository
	accountRepo     *repository.TwitterAccountRepository
	contentRepo     *repository.ContentLibraryRepository
	verdictRepo     *repository.ReviewQueueFeedbackIssueVerdictRepository
	activityRepo    *repository.ActivityRepository
	commentService  *AutoCommentService
	replyService    *AutoReplyService
	postService     *AutoPostService
	publishing      *PublishingService
}

func NewReviewQueueService(commentTaskRepo *repository.AutoCommentTaskRepository, replyDraftRepo *repository.AutoReplyDraftRepository, postDraftRepo *repository.AutoPostDraftRepository, publishJobRepo *repository.PublishJobRepository, botRepo *repository.OAFBotRepository, accountRepo *repository.TwitterAccountRepository, contentRepo *repository.ContentLibraryRepository, verdictRepo *repository.ReviewQueueFeedbackIssueVerdictRepository, activityRepo *repository.ActivityRepository, commentService *AutoCommentService, replyService *AutoReplyService, postService *AutoPostService, publishing *PublishingService) *ReviewQueueService {
	return &ReviewQueueService{
		commentTaskRepo: commentTaskRepo,
		replyDraftRepo:  replyDraftRepo,
		postDraftRepo:   postDraftRepo,
		publishJobRepo:  publishJobRepo,
		botRepo:         botRepo,
		accountRepo:     accountRepo,
		contentRepo:     contentRepo,
		verdictRepo:     verdictRepo,
		activityRepo:    activityRepo,
		commentService:  commentService,
		replyService:    replyService,
		postService:     postService,
		publishing:      publishing,
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
	postDrafts := []model.AutoPostDraft{}
	if s.postDraftRepo != nil {
		postDrafts, err = s.postDraftRepo.ListByUser(userID, 500)
		if err != nil {
			return nil, err
		}
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
	postJobs := map[uint]model.PublishJob{}
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
		postIDs := make([]uint, 0, len(postDrafts))
		for _, draft := range postDrafts {
			if isDailyXQueueDraft(draft) {
				continue
			}
			postIDs = append(postIDs, draft.ID)
		}
		jobs, err = s.publishJobRepo.ListBySources(userID, repository.PublishSourcePost, postIDs)
		if err != nil {
			return nil, err
		}
		for _, job := range jobs {
			postJobs[job.SourceID] = job
		}
	}

	typeFilter := normalizeReviewQueueFilter(query.Type)
	statusFilter := normalizeReviewQueueFilter(query.Status)
	modeFilter := normalizeReviewQueueFilter(query.ExecutionMode)

	allItems := make([]dto.ReviewQueueItem, 0, len(tasks)+len(replyDrafts)+len(postDrafts))
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
	for _, draft := range postDrafts {
		if isDailyXQueueDraft(draft) {
			continue
		}
		item := s.autoPostDraftToReviewQueueItem(draft, botNames[draft.BotID], accountNames[draft.XAccountID])
		applyPublishJobToReviewQueueItem(&item, postJobs[draft.ID])
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

func (s *ReviewQueueService) BulkAction(ctx context.Context, userID uint, req dto.ReviewQueueBulkActionRequest) (*dto.ReviewQueueBulkActionResponse, error) {
	action := strings.ToLower(strings.TrimSpace(req.Action))
	if action != "approve" && action != "reject" && action != "retry" && action != "delete" {
		return nil, errors.New("invalid action")
	}
	if len(req.Items) == 0 {
		return nil, errors.New("items are required")
	}
	if len(req.Items) > 50 {
		return nil, errors.New("bulk action is limited to 50 items")
	}
	reason := strings.TrimSpace(req.RejectReason)
	if reason == "" {
		reason = "Rejected by bulk review action."
	}

	results := make([]dto.ReviewQueueBulkActionResult, 0, len(req.Items))
	succeeded := 0
	failureMessages := make([]string, 0)
	for _, raw := range req.Items {
		item := dto.ReviewQueueBulkActionItemRequest{
			QueueType:    normalizeReviewQueueBulkType(raw.QueueType),
			SourceID:     raw.SourceID,
			PublishJobID: raw.PublishJobID,
		}
		result := dto.ReviewQueueBulkActionResult{
			QueueType:    item.QueueType,
			SourceID:     item.SourceID,
			PublishJobID: item.PublishJobID,
		}
		if err := s.runBulkActionItem(ctx, userID, action, reason, item); err != nil {
			result.Error = err.Error()
			failureMessages = append(failureMessages, fmt.Sprintf("%s#%d: %s", result.QueueType, result.SourceID, result.Error))
		} else {
			result.Success = true
			succeeded++
		}
		results = append(results, result)
	}

	failed := len(results) - succeeded
	auditID, _ := s.recordBulkActionAudit(userID, action, len(results), succeeded, failed, failureMessages)
	return &dto.ReviewQueueBulkActionResponse{
		Action:          action,
		Total:           len(results),
		Succeeded:       succeeded,
		Failed:          failed,
		AuditActivityID: auditID,
		AuditPreviewKey: "activity.preview.reviewQueueBulkAction",
		Results:         results,
	}, nil
}

func (s *ReviewQueueService) recordBulkActionAudit(userID uint, action string, total int, succeeded int, failed int, failureMessages []string) (uint, error) {
	if s.activityRepo == nil || s.activityRepo.DB == nil {
		return 0, nil
	}
	status := "success"
	if failed > 0 {
		status = "failed"
	}
	if succeeded > 0 && failed > 0 {
		status = "review"
	}
	message := fmt.Sprintf("Bulk %s completed: %d succeeded, %d failed, %d total.", action, succeeded, failed, total)
	if len(failureMessages) > 0 {
		message = message + " " + strings.Join(failureMessages, " | ")
	}
	log := &model.ActivityLog{
		UserID:        userID,
		Type:          "system",
		Status:        status,
		PreviewKey:    "activity.preview.reviewQueueBulkAction",
		AccountHandle: "Octo-Agent",
		ExecutedAt:    time.Now().UTC(),
		ErrorMessage:  truncateErrMsg(message),
	}
	if err := s.activityRepo.DB.Create(log).Error; err != nil {
		return 0, err
	}
	return log.ID, nil
}

func (s *ReviewQueueService) runBulkActionItem(ctx context.Context, userID uint, action string, rejectReason string, item dto.ReviewQueueBulkActionItemRequest) error {
	if item.SourceID == 0 {
		return errors.New("source_id is required")
	}
	switch action {
	case "approve":
		switch item.QueueType {
		case "comment":
			if s.commentService == nil {
				return errors.New("auto comment service is not configured")
			}
			_, err := s.commentService.ApproveTask(ctx, userID, item.SourceID)
			return err
		case "reply":
			if s.replyService == nil {
				return errors.New("auto reply service is not configured")
			}
			_, err := s.replyService.ApproveDraft(userID, item.SourceID)
			return err
		case "post":
			if s.postService == nil {
				return errors.New("auto post service is not configured")
			}
			_, err := s.postService.ApproveDraft(userID, item.SourceID)
			return err
		default:
			return fmt.Errorf("%s cannot be approved in bulk", item.QueueType)
		}
	case "reject":
		switch item.QueueType {
		case "comment":
			if s.commentService == nil {
				return errors.New("auto comment service is not configured")
			}
			_, err := s.commentService.RejectTask(userID, item.SourceID, rejectReason)
			return err
		case "reply":
			if s.replyService == nil {
				return errors.New("auto reply service is not configured")
			}
			_, err := s.replyService.RejectDraft(userID, item.SourceID, rejectReason)
			return err
		case "post":
			if s.postService == nil {
				return errors.New("auto post service is not configured")
			}
			_, err := s.postService.RejectDraft(userID, item.SourceID, rejectReason)
			return err
		default:
			return fmt.Errorf("%s cannot be rejected in bulk", item.QueueType)
		}
	case "retry":
		if item.PublishJobID == 0 {
			return errors.New("publish_job_id is required for retry")
		}
		if s.publishing == nil {
			return errors.New("publishing service is not configured")
		}
		_, err := s.publishing.RetryJob(userID, item.PublishJobID)
		return err
	case "delete":
		return s.deleteQueueItem(userID, item)
	default:
		return errors.New("invalid action")
	}
}

func (s *ReviewQueueService) deleteQueueItem(userID uint, item dto.ReviewQueueBulkActionItemRequest) error {
	switch item.QueueType {
	case "comment":
		if s.commentTaskRepo == nil {
			return errors.New("auto comment repository is not configured")
		}
		task, err := s.commentTaskRepo.GetByUserAndID(userID, item.SourceID)
		if err != nil {
			return err
		}
		if err := assertReviewQueueDeleteAllowed("comment", task.Status); err != nil {
			return err
		}
		if err := s.assertPublishJobsDeletable(userID, repository.PublishSourceComment, item.SourceID); err != nil {
			return err
		}
		if err := s.deleteReviewQueuePublishJobs(userID, repository.PublishSourceComment, item.SourceID); err != nil {
			return err
		}
		return s.commentTaskRepo.DeleteByUserAndID(userID, item.SourceID)
	case "reply":
		if s.replyDraftRepo == nil {
			return errors.New("auto reply repository is not configured")
		}
		draft, err := s.replyDraftRepo.GetByUserAndID(userID, item.SourceID)
		if err != nil {
			return err
		}
		if err := assertReviewQueueDeleteAllowed("reply", draft.Status); err != nil {
			return err
		}
		if err := s.assertPublishJobsDeletable(userID, repository.PublishSourceReply, item.SourceID); err != nil {
			return err
		}
		if err := s.deleteReviewQueuePublishJobs(userID, repository.PublishSourceReply, item.SourceID); err != nil {
			return err
		}
		return s.replyDraftRepo.DeleteByUserAndID(userID, item.SourceID)
	case "post":
		if s.postDraftRepo == nil {
			return errors.New("auto post repository is not configured")
		}
		draft, err := s.postDraftRepo.GetByUserAndID(userID, item.SourceID)
		if err != nil {
			return err
		}
		if isDailyXQueueDraft(*draft) {
			return errors.New("daily x queue drafts must be managed from Daily X Queue")
		}
		if err := assertReviewQueueDeleteAllowed("post", draft.Status); err != nil {
			return err
		}
		if err := s.assertPublishJobsDeletable(userID, repository.PublishSourcePost, item.SourceID); err != nil {
			return err
		}
		if err := s.deleteReviewQueuePublishJobs(userID, repository.PublishSourcePost, item.SourceID); err != nil {
			return err
		}
		return s.postDraftRepo.DeleteByUserAndID(userID, item.SourceID)
	default:
		return fmt.Errorf("%s cannot be deleted from the execution queue", item.QueueType)
	}
}

func assertReviewQueueDeleteAllowed(queueType string, status string) error {
	normalized := strings.ToLower(strings.TrimSpace(status))
	switch normalized {
	case "processing", "sending", "sent", "published":
		return fmt.Errorf("%s item cannot be deleted from status %s", queueType, normalized)
	default:
		return nil
	}
}

func (s *ReviewQueueService) assertPublishJobsDeletable(userID uint, sourceType string, sourceID uint) error {
	if s == nil || s.publishJobRepo == nil {
		return nil
	}
	jobs, err := s.publishJobRepo.ListBySources(userID, sourceType, []uint{sourceID})
	if err != nil {
		return err
	}
	for _, job := range jobs {
		if job.Status == repository.PublishStatusProcessing || job.Status == repository.PublishStatusPublished {
			return fmt.Errorf("%s item has a %s publish job and cannot be deleted", sourceType, job.Status)
		}
	}
	return nil
}

func (s *ReviewQueueService) deleteReviewQueuePublishJobs(userID uint, sourceType string, sourceID uint) error {
	if s == nil || s.publishJobRepo == nil {
		return nil
	}
	return s.publishJobRepo.DeleteReviewQueueDeletableBySource(userID, sourceType, sourceID)
}

func (s *ReviewQueueService) CreateFeedbackIssueVerdict(userID uint, req dto.ReviewQueueFeedbackIssueVerdictRequest) (*dto.ReviewQueueFeedbackIssueVerdictResponse, error) {
	if s.verdictRepo == nil {
		return nil, errors.New("feedback issue verdict repository is not configured")
	}
	queueType := strings.ToLower(strings.TrimSpace(req.QueueType))
	if queueType == "auto_post" {
		queueType = "post"
	}
	if queueType == "auto_comment" {
		queueType = "comment"
	}
	if queueType == "auto_reply" {
		queueType = "reply"
	}
	if queueType != "post" && queueType != "comment" && queueType != "reply" && queueType != "dm" {
		return nil, errors.New("invalid queue_type")
	}
	issue := strings.ToLower(strings.TrimSpace(req.FeedbackIssue))
	if issue == "weak_context" {
		issue = "missing_context"
	}
	if issue == "" {
		return nil, errors.New("feedback_issue is required")
	}
	verdict := strings.ToLower(strings.TrimSpace(req.Verdict))
	if verdict != "accurate" && verdict != "irrelevant" {
		return nil, errors.New("invalid verdict")
	}
	botID, err := s.resolveReviewQueueBotID(userID, queueType, req.SourceID, req.BotID)
	if err != nil {
		return nil, err
	}
	row := &model.ReviewQueueFeedbackIssueVerdict{
		UserID:        userID,
		QueueType:     queueType,
		SourceID:      req.SourceID,
		BotID:         botID,
		FeedbackIssue: issue,
		Verdict:       verdict,
		Reasons:       encodeStringList(req.Reasons),
	}
	if err := s.verdictRepo.Create(row); err != nil {
		return nil, err
	}
	return &dto.ReviewQueueFeedbackIssueVerdictResponse{ID: row.ID, Saved: true}, nil
}

func (s *ReviewQueueService) FeedbackIssueVerdictStats(userID uint) (*dto.ReviewQueueFeedbackIssueVerdictStatsResponse, error) {
	if s.verdictRepo == nil {
		return &dto.ReviewQueueFeedbackIssueVerdictStatsResponse{Issues: []dto.ReviewQueueFeedbackIssueVerdictStat{}}, nil
	}
	rows, err := s.verdictRepo.ListRecentByUser(userID, 500)
	if err != nil {
		return nil, err
	}
	type reasonCounter struct {
		accurate   int
		irrelevant int
	}
	type issueCounter struct {
		accurate   int
		irrelevant int
		reasons    map[string]*reasonCounter
	}
	counters := map[string]*issueCounter{}
	for _, row := range rows {
		issue := strings.TrimSpace(row.FeedbackIssue)
		if issue == "" {
			continue
		}
		counter := counters[issue]
		if counter == nil {
			counter = &issueCounter{reasons: map[string]*reasonCounter{}}
			counters[issue] = counter
		}
		isAccurate := row.Verdict == "accurate"
		if isAccurate {
			counter.accurate++
		} else if row.Verdict == "irrelevant" {
			counter.irrelevant++
		}
		for _, reason := range decodeStringList(row.Reasons) {
			reason = strings.TrimSpace(reason)
			if reason == "" {
				continue
			}
			reasonStats := counter.reasons[reason]
			if reasonStats == nil {
				reasonStats = &reasonCounter{}
				counter.reasons[reason] = reasonStats
			}
			if isAccurate {
				reasonStats.accurate++
			} else if row.Verdict == "irrelevant" {
				reasonStats.irrelevant++
			}
		}
	}
	issues := make([]dto.ReviewQueueFeedbackIssueVerdictStat, 0, len(counters))
	for issue, counter := range counters {
		reasons := make([]dto.ReviewQueueFeedbackIssueReasonStat, 0, len(counter.reasons))
		for reason, reasonCounter := range counter.reasons {
			total := reasonCounter.accurate + reasonCounter.irrelevant
			reasons = append(reasons, dto.ReviewQueueFeedbackIssueReasonStat{
				Reason:          reason,
				Accurate:        reasonCounter.accurate,
				Irrelevant:      reasonCounter.irrelevant,
				Total:           total,
				AccuracyRate:    ratio(reasonCounter.accurate, total),
				ScoreAdjustment: verdictScoreAdjustment(reasonCounter.accurate, reasonCounter.irrelevant),
			})
		}
		sort.SliceStable(reasons, func(i, j int) bool {
			if reasons[i].Total != reasons[j].Total {
				return reasons[i].Total > reasons[j].Total
			}
			return reasons[i].Reason < reasons[j].Reason
		})
		total := counter.accurate + counter.irrelevant
		issues = append(issues, dto.ReviewQueueFeedbackIssueVerdictStat{
			FeedbackIssue: issue,
			Accurate:      counter.accurate,
			Irrelevant:    counter.irrelevant,
			Total:         total,
			AccuracyRate:  ratio(counter.accurate, total),
			Reasons:       reasons,
		})
	}
	sort.SliceStable(issues, func(i, j int) bool {
		if issues[i].Total != issues[j].Total {
			return issues[i].Total > issues[j].Total
		}
		return issues[i].FeedbackIssue < issues[j].FeedbackIssue
	})
	return &dto.ReviewQueueFeedbackIssueVerdictStatsResponse{Issues: issues}, nil
}

func (s *ReviewQueueService) FeedbackIssueVerdictDetails(userID uint, limit int) (*dto.ReviewQueueFeedbackIssueVerdictDetailsResponse, error) {
	if s.verdictRepo == nil {
		return &dto.ReviewQueueFeedbackIssueVerdictDetailsResponse{Items: []dto.ReviewQueueFeedbackIssueVerdictDetail{}}, nil
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	rows, err := s.verdictRepo.ListRecentByUser(userID, limit)
	if err != nil {
		return nil, err
	}
	items := make([]dto.ReviewQueueFeedbackIssueVerdictDetail, 0, len(rows))
	for _, row := range rows {
		item := dto.ReviewQueueFeedbackIssueVerdictDetail{
			ID:                row.ID,
			QueueType:         row.QueueType,
			SourceID:          row.SourceID,
			BotID:             row.BotID,
			FeedbackIssue:     row.FeedbackIssue,
			Verdict:           row.Verdict,
			Reasons:           decodeStringList(row.Reasons),
			CreatedAt:         row.CreatedAt.UTC().Format(timeRFC3339),
			ExecutionQueueURL: reviewQueueVerdictURL(row),
		}
		item.ContentPreview, item.TargetSummary, item.SourceStatus = s.reviewQueueVerdictSourceContext(userID, row)
		items = append(items, item)
	}
	return &dto.ReviewQueueFeedbackIssueVerdictDetailsResponse{Items: items}, nil
}

func (s *ReviewQueueService) resolveReviewQueueBotID(userID uint, queueType string, sourceID uint, fallbackBotID uint) (uint, error) {
	if sourceID == 0 {
		return 0, errors.New("source_id is required")
	}
	switch queueType {
	case "post":
		if s.postDraftRepo == nil {
			return fallbackBotID, nil
		}
		draft, err := s.postDraftRepo.GetByUserAndID(userID, sourceID)
		if err != nil {
			return 0, err
		}
		return draft.BotID, nil
	case "comment":
		task, err := s.commentTaskRepo.GetByUserAndID(userID, sourceID)
		if err != nil {
			return 0, err
		}
		return task.BotID, nil
	case "reply":
		draft, err := s.replyDraftRepo.GetByUserAndID(userID, sourceID)
		if err != nil {
			return 0, err
		}
		return draft.BotID, nil
	default:
		return fallbackBotID, nil
	}
}

func (s *ReviewQueueService) reviewQueueVerdictSourceContext(userID uint, row model.ReviewQueueFeedbackIssueVerdict) (string, string, string) {
	switch row.QueueType {
	case "post":
		if s.postDraftRepo == nil {
			return "", "", ""
		}
		draft, err := s.postDraftRepo.GetByUserAndID(userID, row.SourceID)
		if err != nil {
			return "", "", ""
		}
		return truncateRunes(draft.GeneratedContent, 220), truncateRunes(firstNonEmpty(draft.ContentDirection, "Auto Post"), 120), normalizeReviewQueueStatus(draft.Status)
	case "comment":
		task, err := s.commentTaskRepo.GetByUserAndID(userID, row.SourceID)
		if err != nil {
			return "", "", ""
		}
		content := task.GeneratedComment
		if task.DeliveryMode == "quote_post" && strings.TrimSpace(task.QuotePostCandidate) != "" {
			content = task.QuotePostCandidate
		}
		target := strings.TrimSpace(firstNonEmpty(task.TargetTweetAuthor, task.TargetUsername))
		if task.TargetTweetText != "" {
			target = strings.TrimSpace(target + ": " + truncateRunes(task.TargetTweetText, 120))
		}
		return truncateRunes(content, 220), target, normalizeReviewQueueStatus(task.Status)
	case "reply":
		draft, err := s.replyDraftRepo.GetByUserAndID(userID, row.SourceID)
		if err != nil {
			return "", "", ""
		}
		target := strings.TrimSpace(replyAuthorDisplay(draft.CommentAuthorHandle))
		if draft.CommentText != "" {
			target = strings.TrimSpace(target + ": " + truncateRunes(draft.CommentText, 120))
		}
		return truncateRunes(draft.GeneratedReply, 220), target, normalizeReviewQueueStatus(draft.Status)
	default:
		return "", "", ""
	}
}

func reviewQueueVerdictURL(row model.ReviewQueueFeedbackIssueVerdict) string {
	queueType := strings.TrimSpace(row.QueueType)
	if queueType == "" {
		queueType = "all"
	}
	issue := strings.TrimSpace(row.FeedbackIssue)
	status := "pending_review"
	return "/execution-queue?type=" + queueType + "&status=" + status + "&feedback_issue=" + issue + "&focus_type=" + queueType + "&focus_source_id=" + strconv.FormatUint(uint64(row.SourceID), 10)
}

func ratio(numerator int, denominator int) float64 {
	if denominator <= 0 {
		return 0
	}
	return float64(numerator) / float64(denominator)
}

func verdictScoreAdjustment(accurate int, irrelevant int) int {
	diff := accurate - irrelevant
	if diff > 2 {
		return 2
	}
	if diff < -2 {
		return -2
	}
	return diff
}

func normalizeReviewQueueBulkType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "auto_post":
		return "post"
	case "auto_comment":
		return "comment"
	case "auto_reply":
		return "reply"
	default:
		return strings.ToLower(strings.TrimSpace(value))
	}
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
	case repository.PublishStatusPending:
		item.Status = "ready_to_publish"
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
	deliveryMode := firstNonEmpty(task.DeliveryMode, "manual_comment")
	content := task.GeneratedComment
	if deliveryMode == "quote_post" && strings.TrimSpace(task.QuotePostCandidate) != "" {
		content = task.QuotePostCandidate
	}
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
		DeliveryMode:       deliveryMode,
		Content:            content,
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
		SourceType:         task.SourceType,
		SourceRef:          task.SourceRef,
		SourceRegion:       task.SourceRegion,
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

func (s *ReviewQueueService) autoPostDraftToReviewQueueItem(draft model.AutoPostDraft, botName string, accountName string) dto.ReviewQueueItem {
	status := normalizeReviewQueueStatus(draft.Status)
	mode := inferReviewQueueExecutionMode(draft.CapabilityStatus)
	reasons := make([]string, 0, 2)
	if strings.TrimSpace(draft.FailureCategory) != "" {
		reasons = append(reasons, draft.FailureCategory)
	}
	if strings.TrimSpace(draft.FailureReason) != "" {
		reasons = append(reasons, draft.FailureReason)
	}
	target := strings.TrimSpace(draft.ContentDirection)
	if target == "" && draft.ContentLibraryID != 0 {
		target = "Content Library Item"
	}
	if target == "" {
		target = "Auto Post"
	}
	contentTitle := ""
	var exposureTrace *dto.ExposureSourceTrace
	if contentItem := s.contentItem(draft.UserID, draft.ContentLibraryID); contentItem != nil {
		contentTitle = contentItem.Title
		exposureTrace = exposureSourceTraceFromContentItem(contentItem)
	}
	return dto.ReviewQueueItem{
		ID:                  draft.ID,
		Type:                "post",
		Content:             draft.GeneratedContent,
		Status:              status,
		ExecutionMode:       mode,
		BotID:               draft.BotID,
		BotName:             botName,
		TwitterAccountID:    draft.XAccountID,
		TwitterAccountName:  accountName,
		TargetSummary:       truncateRunes(target, 120),
		RiskLevel:           draft.RiskLevel,
		RiskReasons:         reasons,
		PlanID:              draft.PlanID,
		ContentLibraryID:    draft.ContentLibraryID,
		ContentTitle:        contentTitle,
		ExposureSourceTrace: exposureTrace,
		ContentDirection:    draft.ContentDirection,
		SelectedTrends:      decodeTrendTopicItems(draft.SelectedTrends),
		CreatedAt:           draft.CreatedAt.UTC().Format(timeRFC3339),
		SourceStatus:        draft.Status,
		SourceID:            draft.ID,
	}
}

func (s *ReviewQueueService) contentTitle(userID, contentID uint) string {
	if item := s.contentItem(userID, contentID); item != nil {
		return item.Title
	}
	return ""
}

func (s *ReviewQueueService) contentItem(userID, contentID uint) *model.ContentLibraryItem {
	if s == nil || s.contentRepo == nil || contentID == 0 {
		return nil
	}
	item, err := s.contentRepo.GetByUserAndID(userID, contentID)
	if err != nil {
		return nil
	}
	return item
}

func inferReviewQueueExecutionMode(capabilityStatus string) string {
	switch capabilityStatus {
	case "manual_suggestion", "manual_comment_suggested":
		return ExecutionModeManual
	case "autopilot_prepared", "quote_post_ready":
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
