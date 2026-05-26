package service

import (
	"errors"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

const defaultAnalyticsRangeDays = 7
const analyticsFailureReasonLimit = 5
const analyticsAttentionItemLimit = 6

var ErrInvalidAnalyticsRange = errors.New("analytics range must be 7d or 30d")
var ErrAnalyticsAccountNotFound = errors.New("analytics account not found")

type AnalyticsService struct {
	activityRepo *repository.ActivityRepository
	postRepo     *repository.PostRepository
	accountRepo  *repository.TwitterAccountRepository
	dmRuleRepo   *repository.AutoDMRecipientRuleRepository
	dmImportRepo *repository.AutoDMRecipientImportRepository
	dmTaskRepo   *repository.AutoDMTaskRepository
}

func NewAnalyticsService(
	activityRepo *repository.ActivityRepository,
	postRepo *repository.PostRepository,
	accountRepo *repository.TwitterAccountRepository,
	dmRuleRepo *repository.AutoDMRecipientRuleRepository,
	dmImportRepo *repository.AutoDMRecipientImportRepository,
	dmTaskRepo *repository.AutoDMTaskRepository,
) *AnalyticsService {
	return &AnalyticsService{
		activityRepo: activityRepo,
		postRepo:     postRepo,
		accountRepo:  accountRepo,
		dmRuleRepo:   dmRuleRepo,
		dmImportRepo: dmImportRepo,
		dmTaskRepo:   dmTaskRepo,
	}
}

func (s *AnalyticsService) Overview(userID uint, query dto.AnalyticsOverviewQuery) (*dto.AnalyticsOverviewResponse, error) {
	rangeDays, err := normalizeAnalyticsRange(query.Range)
	if err != nil {
		return nil, err
	}
	accountID := query.AccountID
	accountHandle := ""
	if accountID > 0 {
		account, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, accountID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, ErrAnalyticsAccountNotFound
			}
			return nil, err
		}
		accountHandle = formatXAccountHandle(account.Username)
	}
	now := time.Now().UTC()
	start := startOfUTCDay(now).AddDate(0, 0, -(rangeDays - 1))

	statusCounts, err := s.activityRepo.CountByStatusBetween(userID, start, now, accountID, accountHandle)
	if err != nil {
		return nil, err
	}
	typeStatusCounts, err := s.activityRepo.CountByTypeAndStatusBetween(userID, start, now, accountID, accountHandle)
	if err != nil {
		return nil, err
	}
	dailyCounts, err := s.activityRepo.CountDailyByStatusBetween(userID, start, now, accountID, accountHandle)
	if err != nil {
		return nil, err
	}
	lastAt, err := s.activityRepo.LatestExecutedAtBetween(userID, start, now, accountID, accountHandle)
	if err != nil {
		return nil, err
	}
	postCounts, err := s.postRepo.CountByStatus(userID, accountID)
	if err != nil {
		return nil, err
	}
	postDailyRows, err := s.postRepo.CountDailyByStatusBetween(userID, start, now, accountID)
	if err != nil {
		return nil, err
	}
	recentPosts, err := s.postRepo.ListRecentForAnalytics(userID, start, now, accountID, 6)
	if err != nil {
		return nil, err
	}
	failureRows, err := s.activityRepo.CountFailureCategoriesBetween(userID, start, now, accountID, accountHandle, analyticsFailureReasonLimit)
	if err != nil {
		return nil, err
	}
	attentionRows, err := s.activityRepo.ListAttentionBetween(userID, start, now, accountID, accountHandle, analyticsAttentionItemLimit)
	if err != nil {
		return nil, err
	}
	accounts, err := s.accountRepo.ListByUserID(userID)
	if err != nil {
		return nil, err
	}
	accountActivityRows, err := s.activityRepo.CountByAccountAndStatusBetween(userID, start, now)
	if err != nil {
		return nil, err
	}
	accountPostRows, err := s.postRepo.CountByAccount(userID)
	if err != nil {
		return nil, err
	}
	autoDMOps, err := s.autoDMOperations(userID, start, now, accountID, accountHandle)
	if err != nil {
		return nil, err
	}

	statusMap := make(map[string]int64, len(statusCounts))
	var total int64
	for _, row := range statusCounts {
		statusMap[row.Status] = row.Count
		total += row.Count
	}
	success := statusMap["success"]
	failed := statusMap["failed"]
	review := statusMap["review"]
	successRate := 0
	if denom := success + failed; denom > 0 {
		successRate = int((success*100 + denom/2) / denom)
	}
	lastAtStr := ""
	if lastAt != nil {
		lastAtStr = lastAt.UTC().Format(time.RFC3339)
	}

	postMap := make(map[string]int64, len(postCounts))
	var postTotal int64
	for _, row := range postCounts {
		postMap[row.Status] = row.Count
		postTotal += row.Count
	}
	automationBreakdown := buildAutomationBreakdown(typeStatusCounts)

	return &dto.AnalyticsOverviewResponse{
		RangeDays:   rangeDays,
		GeneratedAt: now.Format(time.RFC3339),
		ActivitySummary: dto.AnalyticsActivitySummary{
			Total:          total,
			Success:        success,
			Failed:         failed,
			Review:         review,
			Total7d:        total,
			Success7d:      success,
			Failed7d:       failed,
			Review7d:       review,
			SuccessRatePct: successRate,
			LastActivityAt: lastAtStr,
		},
		PostSummary: dto.AnalyticsPostSummary{
			Total:      postTotal,
			Draft:      postMap["draft"],
			Scheduled:  postMap["scheduled"],
			Processing: postMap["processing"],
			Published:  postMap["published"],
			Failed:     postMap["failed"],
		},
		AutomationBreakdown: automationBreakdown,
		DailyActivity:       buildDailyActivity(start, rangeDays, dailyCounts),
		FailureReasons:      buildFailureReasons(failureRows),
		AttentionItems:      buildAttentionItems(attentionRows),
		AccountBreakdown:    buildAccountBreakdown(accounts, accountActivityRows, accountPostRows, accountID),
		AutoDMOperations:    autoDMOps,
		ContentEffect:       buildContentEffect(start, rangeDays, postMap, postDailyRows, recentPosts, automationBreakdown),
	}, nil
}

func (s *AnalyticsService) autoDMOperations(userID uint, start, now time.Time, accountID uint, accountHandle string) (dto.AnalyticsAutoDMOperations, error) {
	var out dto.AnalyticsAutoDMOperations
	if s.dmRuleRepo != nil {
		rows, err := s.dmRuleRepo.CountByStatus(userID, accountID)
		if err != nil {
			return out, err
		}
		out.Recipients = buildAutoDMRecipientSummary(rows)
	}
	if s.dmImportRepo != nil {
		summary, err := s.dmImportRepo.SummaryBetween(userID, start, now, accountID)
		if err != nil {
			return out, err
		}
		errorRows, err := s.dmImportRepo.ListRecentErrorsBetween(userID, start, now, accountID, 5)
		if err != nil {
			return out, err
		}
		out.Imports = buildAutoDMImportSummary(summary, errorRows)
	}
	if s.dmTaskRepo != nil {
		statusRows, retryable, err := s.dmTaskRepo.CountByStatusBetween(userID, start, now, accountID)
		if err != nil {
			return out, err
		}
		failureRows, err := s.dmTaskRepo.CountFailureCategoriesBetween(userID, start, now, accountID, 5)
		if err != nil {
			return out, err
		}
		out.Tasks = buildAutoDMTaskSummary(statusRows, retryable)
		out.FailureCategories = buildAutoDMFailureCategories(failureRows)
	}
	recentRows, err := s.activityRepo.ListDMOperationEventsBetween(userID, start, now, accountID, accountHandle, 6)
	if err != nil {
		return out, err
	}
	out.RecentEvents = buildAutoDMEvents(recentRows)
	return out, nil
}

func normalizeAnalyticsRange(value string) (int, error) {
	switch value {
	case "", "7d":
		return defaultAnalyticsRangeDays, nil
	case "30d":
		return 30, nil
	default:
		return 0, ErrInvalidAnalyticsRange
	}
}

func startOfUTCDay(t time.Time) time.Time {
	u := t.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
}

func buildAutomationBreakdown(rows []repository.ActivityTypeStatusCount) []dto.AnalyticsAutomationMetric {
	order := []string{"post", "reply", "dm"}
	metrics := map[string]*dto.AnalyticsAutomationMetric{}
	for _, typ := range order {
		metrics[typ] = &dto.AnalyticsAutomationMetric{Type: typ}
	}
	for _, row := range rows {
		item, ok := metrics[row.Type]
		if !ok {
			item = &dto.AnalyticsAutomationMetric{Type: row.Type}
			metrics[row.Type] = item
			order = append(order, row.Type)
		}
		item.Total += row.Count
		switch row.Status {
		case "success":
			item.Success += row.Count
		case "failed":
			item.Failed += row.Count
		case "review":
			item.Review += row.Count
		}
	}
	out := make([]dto.AnalyticsAutomationMetric, 0, len(order))
	for _, typ := range order {
		out = append(out, *metrics[typ])
	}
	return out
}

func buildDailyActivity(start time.Time, days int, rows []repository.ActivityDailyStatusCount) []dto.AnalyticsDailyActivity {
	buckets := make(map[string]*dto.AnalyticsDailyActivity, days)
	out := make([]dto.AnalyticsDailyActivity, 0, days)
	for i := 0; i < days; i++ {
		date := start.AddDate(0, 0, i).Format("2006-01-02")
		out = append(out, dto.AnalyticsDailyActivity{Date: date})
		buckets[date] = &out[i]
	}
	for _, row := range rows {
		item, ok := buckets[row.Day]
		if !ok {
			continue
		}
		item.Total += row.Count
		switch row.Status {
		case "success":
			item.Success += row.Count
		case "failed":
			item.Failed += row.Count
		case "review":
			item.Review += row.Count
		}
	}
	return out
}

func buildFailureReasons(rows []repository.ActivityFailureReasonCount) []dto.AnalyticsFailureReason {
	out := make([]dto.AnalyticsFailureReason, 0, len(rows))
	for _, row := range rows {
		category := row.Category
		if category == "" {
			category = classifyActivityFailure("failed", row.Reason)
		}
		item := dto.AnalyticsFailureReason{
			Reason:   category,
			Category: category,
			Count:    row.Count,
		}
		if row.LastAt != nil {
			item.LastAt = row.LastAt.UTC().Format(time.RFC3339)
		}
		out = append(out, item)
	}
	return out
}

func buildAttentionItems(rows []model.ActivityLog) []dto.AnalyticsAttentionItem {
	out := make([]dto.AnalyticsAttentionItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, dto.AnalyticsAttentionItem{
			ID:            row.ID,
			XAccountID:    row.XAccountID,
			Type:          row.Type,
			Status:        row.Status,
			AccountHandle: row.AccountHandle,
			PreviewKey:    row.PreviewKey,
			ExecutedAt:    row.ExecutedAt.UTC().Format(time.RFC3339),
			ErrorMessage:  row.ErrorMessage,
		})
	}
	return out
}

func buildAutoDMRecipientSummary(rows []repository.AutoDMRecipientRuleStatusCount) dto.AnalyticsAutoDMRecipientSummary {
	var out dto.AnalyticsAutoDMRecipientSummary
	for _, row := range rows {
		out.Total += row.Count
		switch row.Status {
		case repository.AutoDMRecipientAllowlisted:
			out.Allowlisted += row.Count
		case repository.AutoDMRecipientBlocked:
			out.Blocked += row.Count
		case repository.AutoDMRecipientUnsubscribed:
			out.Unsubscribed += row.Count
		}
	}
	return out
}

func buildAutoDMImportSummary(summary repository.AutoDMRecipientImportSummary, rows []model.AutoDMRecipientImport) dto.AnalyticsAutoDMImportSummary {
	out := dto.AnalyticsAutoDMImportSummary{
		Batches:      summary.Batches,
		Imported:     summary.Imported,
		Skipped:      summary.Skipped,
		ErrorBatches: summary.ErrorBatches,
		RecentErrors: []dto.AnalyticsAutoDMImportError{},
	}
	for _, row := range rows {
		out.RecentErrors = append(out.RecentErrors, dto.AnalyticsAutoDMImportError{
			ID:         row.ID,
			XAccountID: row.XAccountID,
			Errors:     parseAutoDMImportErrors(row.ErrorSummary),
			ImportedAt: row.ImportedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func buildAutoDMTaskSummary(rows []repository.AutoDMTaskStatusCount, retryable int64) dto.AnalyticsAutoDMTaskSummary {
	var out dto.AnalyticsAutoDMTaskSummary
	out.Retryable = retryable
	for _, row := range rows {
		out.Total += row.Count
		switch row.Status {
		case "review":
			out.Review += row.Count
		case "approved":
			out.Approved += row.Count
		case "sending":
			out.Sending += row.Count
		case "sent":
			out.Sent += row.Count
		case "failed":
			out.Failed += row.Count
		case "blocked":
			out.Blocked += row.Count
		}
	}
	out.NeedsAttention = out.Review + out.Failed + out.Blocked + out.Retryable
	return out
}

func buildAutoDMFailureCategories(rows []repository.AutoDMTaskFailureCategoryCount) []dto.AnalyticsAutoDMFailureCategory {
	out := make([]dto.AnalyticsAutoDMFailureCategory, 0, len(rows))
	for _, row := range rows {
		item := dto.AnalyticsAutoDMFailureCategory{Category: row.Category, Count: row.Count}
		if row.LastAt != nil {
			item.LastAt = row.LastAt.UTC().Format(time.RFC3339)
		}
		out = append(out, item)
	}
	return out
}

func buildAutoDMEvents(rows []model.ActivityLog) []dto.AnalyticsAutoDMEvent {
	out := make([]dto.AnalyticsAutoDMEvent, 0, len(rows))
	for _, row := range rows {
		out = append(out, dto.AnalyticsAutoDMEvent{
			ID:            row.ID,
			XAccountID:    row.XAccountID,
			Status:        row.Status,
			AccountHandle: row.AccountHandle,
			PreviewKey:    row.PreviewKey,
			ExecutedAt:    row.ExecutedAt.UTC().Format(time.RFC3339),
			Message:       row.ErrorMessage,
		})
	}
	return out
}

func buildContentEffect(
	start time.Time,
	days int,
	statusMap map[string]int64,
	dailyRows []repository.PostDailyStatusCount,
	recentPosts []model.Post,
	automationRows []dto.AnalyticsAutomationMetric,
) dto.AnalyticsContentEffect {
	conversion := dto.AnalyticsContentConversion{
		Draft:      statusMap["draft"],
		Scheduled:  statusMap["scheduled"],
		Processing: statusMap["processing"],
		Published:  statusMap["published"],
		Failed:     statusMap["failed"],
	}
	conversion.Total = conversion.Draft + conversion.Scheduled + conversion.Processing + conversion.Published + conversion.Failed
	conversion.Ready = conversion.Draft + conversion.Scheduled
	conversion.Active = conversion.Scheduled + conversion.Processing
	if conversion.Total > 0 {
		conversion.PublishRatePct = int((conversion.Published*100 + conversion.Total/2) / conversion.Total)
	}
	return dto.AnalyticsContentEffect{
		Conversion:   conversion,
		Daily:        buildContentDaily(start, days, dailyRows),
		RecentPosts:  buildContentPosts(recentPosts),
		PostActivity: buildPostActivity(automationRows),
	}
}

func buildContentDaily(start time.Time, days int, rows []repository.PostDailyStatusCount) []dto.AnalyticsContentDaily {
	buckets := make(map[string]*dto.AnalyticsContentDaily, days)
	out := make([]dto.AnalyticsContentDaily, 0, days)
	for i := 0; i < days; i++ {
		date := start.AddDate(0, 0, i).Format("2006-01-02")
		out = append(out, dto.AnalyticsContentDaily{Date: date})
		buckets[date] = &out[i]
	}
	for _, row := range rows {
		item, ok := buckets[row.Day]
		if !ok {
			continue
		}
		item.Total += row.Count
		switch row.Status {
		case "draft":
			item.Draft += row.Count
		case "scheduled":
			item.Scheduled += row.Count
		case "processing":
			item.Processing += row.Count
		case "published":
			item.Published += row.Count
		case "failed":
			item.Failed += row.Count
		}
	}
	return out
}

func buildContentPosts(rows []model.Post) []dto.AnalyticsContentPost {
	out := make([]dto.AnalyticsContentPost, 0, len(rows))
	for _, row := range rows {
		item := dto.AnalyticsContentPost{
			ID:         row.ID,
			XAccountID: row.XAccountID,
			Content:    row.Content,
			Status:     row.Status,
			UpdatedAt:  row.UpdatedAt.UTC().Format(time.RFC3339),
		}
		if row.ScheduledAt != nil {
			item.ScheduledAt = row.ScheduledAt.UTC().Format(time.RFC3339)
		}
		if row.PublishedAt != nil {
			item.PublishedAt = row.PublishedAt.UTC().Format(time.RFC3339)
		}
		out = append(out, item)
	}
	return out
}

func buildPostActivity(rows []dto.AnalyticsAutomationMetric) dto.AnalyticsContentActivity {
	var out dto.AnalyticsContentActivity
	for _, row := range rows {
		if row.Type != "post" {
			continue
		}
		out.Success = row.Success
		out.Failed = row.Failed
		out.Review = row.Review
		out.Total = row.Total
		return out
	}
	return out
}

func buildAccountBreakdown(
	accounts []model.TwitterAccount,
	activityRows []repository.ActivityAccountStatusCount,
	postRows []repository.PostAccountCount,
	filterAccountID uint,
) []dto.AnalyticsAccountMetric {
	type bucket struct {
		total  int64
		succ   int64
		fail   int64
		review int64
		last   *time.Time
	}
	activityByID := make(map[uint]*bucket)
	activityByHandle := make(map[string]*bucket)
	for _, row := range activityRows {
		var b *bucket
		if row.AccountID > 0 {
			b = activityByID[row.AccountID]
			if b == nil {
				b = &bucket{}
				activityByID[row.AccountID] = b
			}
		} else {
			handle := row.Handle
			b = activityByHandle[handle]
			if b == nil {
				b = &bucket{}
				activityByHandle[handle] = b
			}
		}
		b.total += row.Count
		switch row.Status {
		case "success":
			b.succ += row.Count
		case "failed":
			b.fail += row.Count
		case "review":
			b.review += row.Count
		}
		if row.LastAt != nil && (b.last == nil || row.LastAt.After(*b.last)) {
			t := *row.LastAt
			b.last = &t
		}
	}

	postsByID := make(map[uint]int64, len(postRows))
	for _, row := range postRows {
		postsByID[row.AccountID] = row.Count
	}

	out := make([]dto.AnalyticsAccountMetric, 0, len(accounts))
	for _, account := range accounts {
		if filterAccountID > 0 && account.ID != filterAccountID {
			continue
		}
		handle := formatXAccountHandle(account.Username)
		b := &bucket{}
		if byID := activityByID[account.ID]; byID != nil {
			*b = *byID
		}
		if byHandle := activityByHandle[handle]; byHandle != nil {
			b.total += byHandle.total
			b.succ += byHandle.succ
			b.fail += byHandle.fail
			b.review += byHandle.review
			if byHandle.last != nil && (b.last == nil || byHandle.last.After(*b.last)) {
				t := *byHandle.last
				b.last = &t
			}
		}
		successRate := 0
		if denom := b.succ + b.fail; denom > 0 {
			successRate = int((b.succ*100 + denom/2) / denom)
		}
		item := dto.AnalyticsAccountMetric{
			AccountID:      account.ID,
			Username:       account.Username,
			DisplayName:    account.DisplayName,
			AvatarURL:      account.AvatarURL,
			Followers:      account.Followers,
			ActivityTotal:  b.total,
			Success:        b.succ,
			Failed:         b.fail,
			Review:         b.review,
			SuccessRatePct: successRate,
			PostTotal:      postsByID[account.ID],
		}
		if b.last != nil {
			item.LastActivityAt = b.last.UTC().Format(time.RFC3339)
		}
		out = append(out, item)
	}
	return out
}
