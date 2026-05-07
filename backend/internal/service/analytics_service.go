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
}

func NewAnalyticsService(
	activityRepo *repository.ActivityRepository,
	postRepo *repository.PostRepository,
	accountRepo *repository.TwitterAccountRepository,
) *AnalyticsService {
	return &AnalyticsService{activityRepo: activityRepo, postRepo: postRepo, accountRepo: accountRepo}
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
	failureRows, err := s.activityRepo.CountFailureReasonsBetween(userID, start, now, accountID, accountHandle, analyticsFailureReasonLimit)
	if err != nil {
		return nil, err
	}
	attentionRows, err := s.activityRepo.ListAttentionBetween(userID, start, now, accountID, accountHandle, analyticsAttentionItemLimit)
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
		AutomationBreakdown: buildAutomationBreakdown(typeStatusCounts),
		DailyActivity:       buildDailyActivity(start, rangeDays, dailyCounts),
		FailureReasons:      buildFailureReasons(failureRows),
		AttentionItems:      buildAttentionItems(attentionRows),
	}, nil
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
		item := dto.AnalyticsFailureReason{
			Reason: row.Reason,
			Count:  row.Count,
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
