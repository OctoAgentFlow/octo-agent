package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

type ExposureRadarManualService struct {
	repo *repository.ExposureRadarManualRecordRepository
}

func NewExposureRadarManualService(repo *repository.ExposureRadarManualRecordRepository) *ExposureRadarManualService {
	return &ExposureRadarManualService{repo: repo}
}

func (s *ExposureRadarManualService) Upsert(userID uint, req dto.ExposureRadarManualRecordRequest) (*dto.ExposureRadarManualRecordItem, error) {
	if s == nil || s.repo == nil {
		return nil, fmt.Errorf("exposure radar manual service unavailable")
	}
	signalID := strings.TrimSpace(req.SignalID)
	if signalID == "" {
		return nil, fmt.Errorf("signal_id is required")
	}
	record, err := s.repo.GetByUserAndSignal(userID, signalID)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		record = &model.ExposureRadarManualRecord{
			UserID:     userID,
			SignalID:   signalID,
			Region:     normalizeExposureRadarManualRegion(req.Region),
			TaskStatus: "todo",
		}
		applyExposureRadarManualRecordRequest(record, req, time.Now().UTC())
		if err := s.repo.Create(record); err != nil {
			return nil, err
		}
		item := exposureRadarManualRecordToDTO(*record)
		return &item, nil
	}
	applyExposureRadarManualRecordRequest(record, req, time.Now().UTC())
	if err := s.repo.Save(record); err != nil {
		return nil, err
	}
	item := exposureRadarManualRecordToDTO(*record)
	return &item, nil
}

func (s *ExposureRadarManualService) ListBySignalIDs(userID uint, signalIDs []string) (*dto.ExposureRadarManualRecordsResponse, error) {
	rows, err := s.repo.ListBySignalIDs(userID, signalIDs)
	if err != nil {
		return nil, err
	}
	items := make([]dto.ExposureRadarManualRecordItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, exposureRadarManualRecordToDTO(row))
	}
	return &dto.ExposureRadarManualRecordsResponse{Items: items}, nil
}

func (s *ExposureRadarManualService) ListPeople(userID uint, region string, days int, limit int) (*dto.ExposureRadarPeopleResponse, error) {
	if days <= 0 {
		days = 30
	}
	if days > 365 {
		days = 365
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := s.repo.ListRecent(userID, normalizeExposureRadarManualRegionForQuery(region), time.Now().UTC().AddDate(0, 0, -days), 1000)
	if err != nil {
		return nil, err
	}
	people := map[string]*dto.ExposureRadarPersonItem{}
	for _, row := range rows {
		if strings.TrimSpace(row.AuthorHandle) == "" && strings.TrimSpace(row.AuthorName) == "" && strings.TrimSpace(row.AuthorID) == "" {
			continue
		}
		key := strings.ToLower(firstNonEmpty(strings.TrimPrefix(strings.TrimSpace(row.AuthorHandle), "@"), strings.TrimSpace(row.AuthorID), strings.TrimSpace(row.AuthorName)))
		if key == "" {
			continue
		}
		item, ok := people[key]
		if !ok {
			latest := exposureRadarManualRecordToDTO(row)
			item = &dto.ExposureRadarPersonItem{
				Key:          key,
				Name:         firstNonEmpty(strings.TrimSpace(row.AuthorName), strings.TrimSpace(row.AuthorHandle), strings.TrimSpace(row.AuthorID)),
				Handle:       strings.TrimPrefix(strings.TrimSpace(row.AuthorHandle), "@"),
				MaxScore:     row.Score,
				Followers:    row.FollowersCount,
				LatestRecord: latest,
			}
			people[key] = item
		}
		item.Count++
		if row.CopiedAt != nil {
			item.Copied++
		}
		if row.OpenedAt != nil {
			item.Opened++
		}
		if row.SavedAt != nil || row.SavedMemoryID > 0 {
			item.Saved++
		}
		if row.HandledAt != nil || strings.TrimSpace(row.TaskStatus) == "done" {
			item.Handled++
		}
		if strings.TrimSpace(row.Outcome) != "" {
			item.Feedback++
		}
		if row.Score > item.MaxScore {
			item.MaxScore = row.Score
		}
		if row.FollowersCount > item.Followers {
			item.Followers = row.FollowersCount
		}
		item.TotalEngagement += row.ReplyCount + row.RetweetCount + row.LikeCount + row.QuoteCount + row.BookmarkCount
		if row.UpdatedAt.After(parseDTOTime(item.LatestRecord.UpdatedAt)) {
			item.LatestRecord = exposureRadarManualRecordToDTO(row)
		}
	}
	items := make([]dto.ExposureRadarPersonItem, 0, len(people))
	for _, person := range people {
		person.Stage = exposureRadarManualPersonStage(*person)
		items = append(items, *person)
	}
	sort.Slice(items, func(i, j int) bool {
		if exposureRadarManualPersonStageWeight(items[i].Stage) != exposureRadarManualPersonStageWeight(items[j].Stage) {
			return exposureRadarManualPersonStageWeight(items[i].Stage) > exposureRadarManualPersonStageWeight(items[j].Stage)
		}
		if items[i].MaxScore != items[j].MaxScore {
			return items[i].MaxScore > items[j].MaxScore
		}
		if items[i].Count != items[j].Count {
			return items[i].Count > items[j].Count
		}
		return items[i].TotalEngagement > items[j].TotalEngagement
	})
	if len(items) > limit {
		items = items[:limit]
	}
	return &dto.ExposureRadarPeopleResponse{Items: items}, nil
}

func applyExposureRadarManualRecordRequest(record *model.ExposureRadarManualRecord, req dto.ExposureRadarManualRecordRequest, now time.Time) {
	record.Region = firstNonEmpty(normalizeExposureRadarManualRegion(req.Region), record.Region, "en")
	if req.BotID > 0 {
		record.BotID = req.BotID
	}
	if req.XAccountID > 0 {
		record.XAccountID = req.XAccountID
	}
	setIfNotEmpty(&record.DataSource, req.DataSource, 64)
	setIfNotEmpty(&record.DataQuality, req.DataQuality, 32)
	setIfNotEmpty(&record.TweetID, req.TweetID, 64)
	setIfNotEmpty(&record.URL, req.URL, 512)
	setIfNotEmpty(&record.Title, req.Title, 255)
	if strings.TrimSpace(req.Content) != "" {
		record.Content = limitManualString(req.Content, 2000)
	}
	setIfNotEmpty(&record.AuthorID, req.AuthorID, 64)
	setIfNotEmpty(&record.AuthorHandle, strings.TrimPrefix(req.AuthorHandle, "@"), 128)
	setIfNotEmpty(&record.AuthorName, req.AuthorName, 255)
	setIfNotEmpty(&record.TopicName, req.TopicName, 255)
	if req.Score > 0 {
		record.Score = req.Score
	}
	setIfNotEmpty(&record.RiskLevel, req.RiskLevel, 32)
	setIfNotEmpty(&record.OpportunityType, req.OpportunityType, 64)
	setIfNotEmpty(&record.OpportunityTier, req.OpportunityTier, 64)
	setIfNotEmpty(&record.QualityStage, req.QualityStage, 32)
	if req.ViewsPerMinute > 0 {
		record.ViewsPerMinute = req.ViewsPerMinute
	}
	if req.FollowersCount > 0 {
		record.FollowersCount = req.FollowersCount
	}
	if req.HeatCount > 0 {
		record.HeatCount = req.HeatCount
	}
	applyInt64IfPositive(&record.ReplyCount, req.ReplyCount)
	applyInt64IfPositive(&record.RetweetCount, req.RetweetCount)
	applyInt64IfPositive(&record.LikeCount, req.LikeCount)
	applyInt64IfPositive(&record.QuoteCount, req.QuoteCount)
	applyInt64IfPositive(&record.BookmarkCount, req.BookmarkCount)
	applyInt64IfPositive(&record.ImpressionCount, req.ImpressionCount)
	if req.ReviewTaskID > 0 {
		record.ReviewTaskID = req.ReviewTaskID
	}
	if req.SavedMemoryID > 0 {
		record.SavedMemoryID = req.SavedMemoryID
	}
	setIfNotEmpty(&record.GeneratedComment, req.GeneratedComment, 512)
	if status := normalizeExposureRadarTaskStatus(req.TaskStatus); status != "" {
		record.TaskStatus = status
	}
	if req.Copied && record.CopiedAt == nil {
		record.CopiedAt = &now
	}
	if req.Opened && record.OpenedAt == nil {
		record.OpenedAt = &now
	}
	if req.Saved && record.SavedAt == nil {
		record.SavedAt = &now
	}
	if req.Handled {
		record.HandledAt = &now
		record.TaskStatus = "done"
	}
	setIfNotEmpty(&record.PublishedURL, req.PublishedURL, 512)
	if outcome := normalizeExposureRadarManualOutcome(req.Outcome); outcome != "" {
		record.Outcome = outcome
		record.FeedbackAt = &now
	}
	setIfNotEmpty(&record.FeedbackComment, req.FeedbackComment, 512)
	setIfNotEmpty(&record.SafetyStatus, req.SafetyStatus, 32)
	setIfNotEmpty(&record.SafetySummary, req.SafetySummary, 512)
	if len(req.SafetyChecks) > 0 {
		if raw, err := json.Marshal(req.SafetyChecks); err == nil {
			record.SafetyChecksJSON = string(raw)
		}
	}
	setIfNotEmpty(&record.ReplyAngleID, req.ReplyAngleID, 64)
	setIfNotEmpty(&record.ReplyAngleTitle, req.ReplyAngleTitle, 128)
	if record.TaskStatus == "" {
		record.TaskStatus = "todo"
	}
}

func exposureRadarManualRecordToDTO(row model.ExposureRadarManualRecord) dto.ExposureRadarManualRecordItem {
	return dto.ExposureRadarManualRecordItem{
		ID:               row.ID,
		BotID:            row.BotID,
		XAccountID:       row.XAccountID,
		SignalID:         row.SignalID,
		Region:           row.Region,
		DataSource:       row.DataSource,
		DataQuality:      row.DataQuality,
		TweetID:          row.TweetID,
		URL:              row.URL,
		Title:            row.Title,
		Content:          row.Content,
		AuthorID:         row.AuthorID,
		AuthorHandle:     row.AuthorHandle,
		AuthorName:       row.AuthorName,
		TopicName:        row.TopicName,
		Score:            row.Score,
		RiskLevel:        row.RiskLevel,
		OpportunityType:  row.OpportunityType,
		OpportunityTier:  row.OpportunityTier,
		QualityStage:     row.QualityStage,
		ViewsPerMinute:   row.ViewsPerMinute,
		FollowersCount:   row.FollowersCount,
		HeatCount:        row.HeatCount,
		ReplyCount:       row.ReplyCount,
		RetweetCount:     row.RetweetCount,
		LikeCount:        row.LikeCount,
		QuoteCount:       row.QuoteCount,
		BookmarkCount:    row.BookmarkCount,
		ImpressionCount:  row.ImpressionCount,
		ReviewTaskID:     row.ReviewTaskID,
		SavedMemoryID:    row.SavedMemoryID,
		GeneratedComment: row.GeneratedComment,
		TaskStatus:       row.TaskStatus,
		PublishedURL:     row.PublishedURL,
		Outcome:          row.Outcome,
		FeedbackComment:  row.FeedbackComment,
		SafetyStatus:     row.SafetyStatus,
		SafetySummary:    row.SafetySummary,
		SafetyChecks:     decodeExposureRadarSafetyChecks(row.SafetyChecksJSON),
		ReplyAngleID:     row.ReplyAngleID,
		ReplyAngleTitle:  row.ReplyAngleTitle,
		CopiedAt:         optionalTimeString(row.CopiedAt),
		OpenedAt:         optionalTimeString(row.OpenedAt),
		SavedAt:          optionalTimeString(row.SavedAt),
		HandledAt:        optionalTimeString(row.HandledAt),
		FeedbackAt:       optionalTimeString(row.FeedbackAt),
		CreatedAt:        row.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:        row.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func decodeExposureRadarSafetyChecks(raw string) []dto.ExposureRadarSafetyCheckItem {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var items []dto.ExposureRadarSafetyCheckItem
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil
	}
	return items
}

func optionalTimeString(value *time.Time) string {
	if value == nil || value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func parseDTOTime(raw string) time.Time {
	parsed, _ := time.Parse(time.RFC3339, strings.TrimSpace(raw))
	return parsed
}

func setIfNotEmpty(target *string, value string, max int) {
	value = strings.TrimSpace(value)
	if value == "" {
		return
	}
	*target = limitManualString(value, max)
}

func applyInt64IfPositive(target *int64, value int64) {
	if value > 0 {
		*target = value
	}
}

func limitManualString(value string, max int) string {
	value = strings.TrimSpace(value)
	if max <= 0 || len([]rune(value)) <= max {
		return value
	}
	runes := []rune(value)
	return string(runes[:max])
}

func normalizeExposureRadarManualRegion(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "zh" || value == "cn" || value == "zh-cn" {
		return "zh"
	}
	if value == "en" {
		return "en"
	}
	return ""
}

func normalizeExposureRadarManualRegionForQuery(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "all" {
		return "all"
	}
	return normalizeExposureRadarManualRegion(value)
}

func normalizeExposureRadarTaskStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "todo", "in_progress", "done", "skipped", "later":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func normalizeExposureRadarManualOutcome(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "effective", "neutral", "ineffective", "not_suitable":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func exposureRadarManualPersonStage(person dto.ExposureRadarPersonItem) string {
	unhandled := person.Count - person.Handled
	if unhandled > 0 && person.MaxScore >= 75 {
		return "priority"
	}
	if person.Count >= 2 {
		return "repeat"
	}
	if person.Handled > 0 || person.Copied > 0 || person.Saved > 0 || person.Feedback > 0 {
		return "engaged"
	}
	return "new"
}

func exposureRadarManualPersonStageWeight(stage string) int {
	switch stage {
	case "priority":
		return 4
	case "repeat":
		return 3
	case "engaged":
		return 2
	default:
		return 1
	}
}
