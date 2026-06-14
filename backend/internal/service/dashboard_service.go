package service

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

type DashboardService struct {
	userRepo         *repository.UserRepository
	walletRepo       *repository.WalletRepository
	accountRepo      *repository.TwitterAccountRepository
	activityRepo     *repository.ActivityRepository
	commentRepo      *repository.AutoCommentTaskRepository
	replyRepo        *repository.AutoReplyDraftRepository
	contentDraftRepo *repository.ContentDraftRepository
	publishRepo      *repository.PublishJobRepository
}

func NewDashboardService(
	userRepo *repository.UserRepository,
	walletRepo *repository.WalletRepository,
	accountRepo *repository.TwitterAccountRepository,
	activityRepo *repository.ActivityRepository,
	commentRepo *repository.AutoCommentTaskRepository,
	replyRepo *repository.AutoReplyDraftRepository,
	contentDraftRepo *repository.ContentDraftRepository,
	publishRepo *repository.PublishJobRepository,
) *DashboardService {
	return &DashboardService{
		userRepo:         userRepo,
		walletRepo:       walletRepo,
		accountRepo:      accountRepo,
		activityRepo:     activityRepo,
		commentRepo:      commentRepo,
		replyRepo:        replyRepo,
		contentDraftRepo: contentDraftRepo,
		publishRepo:      publishRepo,
	}
}

func (s *DashboardService) Overview(userID uint) (*dto.DashboardOverviewResponse, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}

	walletBound := true
	if _, err := s.walletRepo.GetPrimaryWallet(userID); err != nil {
		if err == gorm.ErrRecordNotFound {
			walletBound = false
		} else {
			return nil, err
		}
	}

	connectedCount, err := s.accountRepo.CountByUserID(userID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	trialLeft := subscription.TrialDaysLeft(user, now)
	plan := subscription.NormalizePlanCode(user.SubscriptionPlanCode)
	subSt := subscription.EffectiveStatus(user, now)
	expiresAt := ""
	if user.SubscriptionExpiresAt != nil {
		expiresAt = user.SubscriptionExpiresAt.UTC().Format(time.RFC3339)
	}

	act24, err := s.activityRepo.CountExecutedBetween(userID, now.Add(-24*time.Hour), now)
	if err != nil {
		return nil, err
	}
	actPrev24, err := s.activityRepo.CountExecutedBetween(userID, now.Add(-48*time.Hour), now.Add(-24*time.Hour))
	if err != nil {
		return nil, err
	}
	since7d := now.Add(-7 * 24 * time.Hour)
	succ, fail, err := s.activityRepo.SuccessVsFailedSince(userID, since7d)
	if err != nil {
		return nil, err
	}
	ratePct := 0
	if denom := succ + fail; denom > 0 {
		ratePct = int((100*succ + denom/2) / denom)
	}
	lastAt, err := s.activityRepo.LatestExecutedAt(userID)
	if err != nil {
		return nil, err
	}

	return &dto.DashboardOverviewResponse{
		Plan:                  plan,
		TrialDaysLeft:         trialLeft,
		SubscriptionStatus:    subSt,
		SubscriptionExpiresAt: expiresAt,
		WalletBound:           walletBound,
		ConnectedXCount:       connectedCount,

		ActivityCount24h:       act24,
		ActivityCountPrev24h:   actPrev24,
		ActivitySuccessRatePct: ratePct,
		LastActivityAt:         lastAt,
	}, nil
}

func (s *DashboardService) Workbench(userID uint) (*dto.DashboardWorkbenchResponse, error) {
	opportunityTasks, err := s.commentRepo.ListByUser(userID, 80)
	if err != nil {
		return nil, err
	}
	commentTasks, err := s.commentRepo.ListQueueByUser(userID, 500)
	if err != nil {
		return nil, err
	}
	replyDrafts, err := s.replyRepo.ListByUser(userID, 500)
	if err != nil {
		return nil, err
	}
	postDrafts, err := s.contentDraftRepo.ListByUser(userID, 500)
	if err != nil {
		return nil, err
	}

	commentJobs, err := dashboardPublishJobs(s.publishRepo, userID, repository.PublishSourceComment, commentTaskIDs(commentTasks))
	if err != nil {
		return nil, err
	}
	replyJobs, err := dashboardPublishJobs(s.publishRepo, userID, repository.PublishSourceReply, replyDraftIDs(replyDrafts))
	if err != nil {
		return nil, err
	}
	postJobs, err := dashboardPublishJobs(s.publishRepo, userID, repository.PublishSourcePost, postDraftIDs(postDrafts))
	if err != nil {
		return nil, err
	}

	opportunities := make([]dto.DashboardWorkbenchItem, 0, 3)
	for _, task := range opportunityTasks {
		if task.OpportunityScore < 70 {
			continue
		}
		opportunities = append(opportunities, dashboardCommentOpportunitySummary(task))
		if len(opportunities) == 3 {
			break
		}
	}
	if len(opportunities) == 0 {
		for _, task := range opportunityTasks {
			if task.OpportunityScore <= 0 {
				continue
			}
			opportunities = append(opportunities, dashboardCommentOpportunitySummary(task))
			if len(opportunities) == 3 {
				break
			}
		}
	}

	reviewItems := make([]dashboardWorkbenchReviewItem, 0, 8)
	stats := dto.ReviewQueueStats{}
	for _, task := range commentTasks {
		item := autoCommentTaskToReviewQueueItem(task, "", "")
		applyPublishJobToReviewQueueItem(&item, commentJobs[task.ID])
		incrementReviewQueueStats(&stats, item.Status)
		if dashboardWorkbenchStatus(item.Status) {
			reviewItems = append(reviewItems, dashboardWorkbenchReviewItem{Item: dashboardReviewQueueSummary(item), CreatedAt: item.CreatedAt})
		}
	}
	for _, draft := range replyDrafts {
		item := autoReplyDraftToReviewQueueItem(draft, "", "")
		applyPublishJobToReviewQueueItem(&item, replyJobs[draft.ID])
		incrementReviewQueueStats(&stats, item.Status)
		if dashboardWorkbenchStatus(item.Status) {
			reviewItems = append(reviewItems, dashboardWorkbenchReviewItem{Item: dashboardReviewQueueSummary(item), CreatedAt: item.CreatedAt})
		}
	}
	for _, draft := range postDrafts {
		if isDailyXQueueDraft(draft) {
			continue
		}
		item := dashboardPostDraftToReviewQueueItem(draft)
		applyPublishJobToReviewQueueItem(&item, postJobs[draft.ID])
		incrementReviewQueueStats(&stats, item.Status)
		if dashboardWorkbenchStatus(item.Status) {
			reviewItems = append(reviewItems, dashboardWorkbenchReviewItem{Item: dashboardReviewQueueSummary(item), CreatedAt: item.CreatedAt})
		}
	}
	sort.SliceStable(reviewItems, func(i, j int) bool {
		return reviewItems[i].CreatedAt > reviewItems[j].CreatedAt
	})
	if len(reviewItems) > 3 {
		reviewItems = reviewItems[:3]
	}
	reviews := make([]dto.DashboardWorkbenchItem, 0, len(reviewItems))
	for _, item := range reviewItems {
		reviews = append(reviews, item.Item)
	}

	return &dto.DashboardWorkbenchResponse{
		Opportunities: opportunities,
		Reviews:       reviews,
		Stats:         stats,
	}, nil
}

type dashboardWorkbenchReviewItem struct {
	Item      dto.DashboardWorkbenchItem
	CreatedAt string
}

func dashboardCommentOpportunitySummary(task model.AutoCommentTask) dto.DashboardWorkbenchItem {
	status := normalizeReviewQueueStatus(task.Status)
	return dto.DashboardWorkbenchItem{
		ID:          fmt.Sprintf("comment-%d", task.ID),
		Type:        "comment",
		SourceID:    task.ID,
		Title:       compactDashboardSummary(firstNonEmpty(formatDashboardHandle(task.TargetUsername), task.TargetTweetAuthor, "Auto Comment"), 40),
		Description: "",
		Status:      status,
		Href:        "/execution-queue?type=comment",
		Tone:        dashboardTone(task.RiskLevel, status, "blue"),
		Score:       task.OpportunityScore,
	}
}

func dashboardPublishJobs(repo *repository.PublishJobRepository, userID uint, source string, ids []uint) (map[uint]model.PublishJob, error) {
	out := map[uint]model.PublishJob{}
	if repo == nil || len(ids) == 0 {
		return out, nil
	}
	rows, err := repo.ListBySources(userID, source, ids)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.SourceID] = row
	}
	return out, nil
}

func commentTaskIDs(rows []model.AutoCommentTask) []uint {
	ids := make([]uint, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids
}

func replyDraftIDs(rows []model.AutoReplyDraft) []uint {
	ids := make([]uint, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids
}

func postDraftIDs(rows []model.AutoPostDraft) []uint {
	ids := make([]uint, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids
}

func dashboardPostDraftToReviewQueueItem(draft model.AutoPostDraft) dto.ReviewQueueItem {
	status := normalizeReviewQueueStatus(draft.Status)
	reasons := make([]string, 0, 2)
	if strings.TrimSpace(draft.FailureCategory) != "" {
		reasons = append(reasons, draft.FailureCategory)
	}
	if strings.TrimSpace(draft.FailureReason) != "" {
		reasons = append(reasons, draft.FailureReason)
	}
	target := strings.TrimSpace(draft.ContentDirection)
	if target == "" {
		target = "Auto Post"
	}
	return dto.ReviewQueueItem{
		ID:               draft.ID,
		Type:             "post",
		Content:          draft.GeneratedContent,
		Status:           status,
		ExecutionMode:    inferReviewQueueExecutionMode(draft.CapabilityStatus),
		BotID:            draft.BotID,
		TwitterAccountID: draft.XAccountID,
		TargetSummary:    compactDashboardSummary(target, 120),
		RiskLevel:        draft.RiskLevel,
		RiskReasons:      reasons,
		PlanID:           draft.PlanID,
		ContentDirection: draft.ContentDirection,
		CreatedAt:        draft.CreatedAt.UTC().Format(timeRFC3339),
		SourceStatus:     draft.Status,
		SourceID:         draft.ID,
	}
}

func dashboardReviewQueueSummary(item dto.ReviewQueueItem) dto.DashboardWorkbenchItem {
	title := dashboardWorkbenchTypeTitle(item.Type)
	if item.Status == "failed" && strings.TrimSpace(item.PublishLastError) != "" {
		title = firstNonEmpty(title, "Failed")
	}
	return dto.DashboardWorkbenchItem{
		ID:          fmt.Sprintf("%s-%d", item.Type, item.SourceID),
		Type:        item.Type,
		SourceID:    item.SourceID,
		Title:       title,
		Description: "",
		Status:      item.Status,
		Href:        dashboardExecutionQueueHref(item.Type, item.Status),
		Tone:        dashboardTone(item.RiskLevel, item.Status, "amber"),
	}
}

func dashboardWorkbenchTypeTitle(itemType string) string {
	switch itemType {
	case "post":
		return "Auto Post"
	case "reply":
		return "Auto Reply"
	case "comment":
		return "Auto Comment"
	case "dm":
		return "Auto DM"
	default:
		return firstNonEmpty(itemType, "Queue item")
	}
}

func dashboardWorkbenchStatus(status string) bool {
	switch normalizeReviewQueueStatus(status) {
	case "draft", "pending_review", "approved", "ready_to_publish", "failed":
		return true
	default:
		return false
	}
}

func dashboardExecutionQueueHref(itemType string, status string) string {
	status = normalizeReviewQueueStatus(status)
	if status == "" {
		return fmt.Sprintf("/execution-queue?type=%s", itemType)
	}
	return fmt.Sprintf("/execution-queue?type=%s&status=%s", itemType, status)
}

func dashboardTone(riskLevel string, status string, fallback string) string {
	if riskLevel == "high" || normalizeReviewQueueStatus(status) == "failed" {
		return "rose"
	}
	if normalizeReviewQueueStatus(status) == "ready_to_publish" {
		return "green"
	}
	return fallback
}

func formatDashboardHandle(handle string) string {
	handle = strings.TrimSpace(handle)
	if handle == "" {
		return ""
	}
	if strings.HasPrefix(handle, "@") {
		return handle
	}
	return "@" + handle
}

func compactDashboardSummary(value string, maxLength int) string {
	normalized := strings.Join(strings.Fields(stripDashboardURLs(value)), " ")
	if len([]rune(normalized)) <= maxLength {
		return normalized
	}
	runes := []rune(normalized)
	if maxLength <= 3 {
		return string(runes[:maxLength])
	}
	return strings.TrimSpace(string(runes[:maxLength-3])) + "..."
}

func stripDashboardURLs(value string) string {
	parts := strings.Fields(value)
	for i, part := range parts {
		if strings.HasPrefix(part, "http://") || strings.HasPrefix(part, "https://") {
			parts[i] = "link"
		}
	}
	return strings.Join(parts, " ")
}
