package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

type ExposureRadarManualService struct {
	repo         *repository.ExposureRadarManualRecordRepository
	strategyRepo *repository.ExposureRadarGrowthStrategyRepository
	peopleRepo   *repository.ExposureRadarPeopleNoteRepository
	xBearerToken string
}

func NewExposureRadarManualService(repo *repository.ExposureRadarManualRecordRepository) *ExposureRadarManualService {
	return &ExposureRadarManualService{repo: repo}
}

func (s *ExposureRadarManualService) WithGrowthStrategyRepository(repo *repository.ExposureRadarGrowthStrategyRepository) *ExposureRadarManualService {
	s.strategyRepo = repo
	return s
}

func (s *ExposureRadarManualService) WithPeopleNoteRepository(repo *repository.ExposureRadarPeopleNoteRepository) *ExposureRadarManualService {
	s.peopleRepo = repo
	return s
}

func (s *ExposureRadarManualService) WithXBearerToken(token string) *ExposureRadarManualService {
	s.xBearerToken = strings.TrimSpace(token)
	return s
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

func (s *ExposureRadarManualService) ListRecentRecords(userID uint, region string, days int, limit int) (*dto.ExposureRadarManualRecordsResponse, error) {
	if days <= 0 {
		days = 7
	}
	if days > 365 {
		days = 365
	}
	rows, err := s.repo.ListRecent(userID, normalizeExposureRadarManualRegionForQuery(region), time.Now().UTC().AddDate(0, 0, -days), limit)
	if err != nil {
		return nil, err
	}
	items := make([]dto.ExposureRadarManualRecordItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, exposureRadarManualRecordToDTO(row))
	}
	return &dto.ExposureRadarManualRecordsResponse{Items: items}, nil
}

func (s *ExposureRadarManualService) ResolvePublishingResult(ctx context.Context, req dto.ExposureRadarResultLookupRequest) (*dto.ExposureRadarResultLookupResponse, error) {
	publishedURL := strings.TrimSpace(req.PublishedURL)
	tweetID := firstNonEmpty(strings.TrimSpace(req.CommentTweetID), extractTweetID(publishedURL))
	if tweetID == "" {
		return nil, fmt.Errorf("valid X reply URL or tweet id is required")
	}
	resp := &dto.ExposureRadarResultLookupResponse{
		PublishedURL:   publishedURL,
		CommentTweetID: tweetID,
		Status:         "id_only",
		Source:         "parsed_url",
		Message:        "Reply tweet id was parsed from the URL.",
	}
	if resp.PublishedURL == "" {
		resp.PublishedURL = fmt.Sprintf("https://x.com/i/web/status/%s", tweetID)
	}
	if s == nil || strings.TrimSpace(s.xBearerToken) == "" {
		resp.Status = "token_missing"
		resp.Message = "Reply tweet id was parsed, but X bearer token is not configured for metric lookup."
		return resp, nil
	}
	tweets, err := twitter.LookupTweetsByIDs(ctx, s.xBearerToken, []string{tweetID})
	if err != nil {
		resp.Status = "lookup_failed"
		resp.Message = err.Error()
		return resp, nil
	}
	if len(tweets) == 0 {
		resp.Status = "not_found"
		resp.Message = "X did not return metrics for this reply tweet."
		return resp, nil
	}
	row := tweets[0]
	resp.Status = "fetched"
	resp.Source = "x_api"
	resp.Message = "Public metrics were fetched from X."
	resp.MetricsFetched = true
	resp.ResultImpressionCount = int64Ptr(row.ImpressionCount)
	resp.ResultLikeCount = int64Ptr(row.LikeCount)
	resp.ResultReplyCount = int64Ptr(row.ReplyCount)
	resp.ResultRetweetCount = int64Ptr(row.RetweetCount)
	resp.ResultQuoteCount = int64Ptr(row.QuoteCount)
	resp.ResultBookmarkCount = int64Ptr(row.BookmarkCount)
	return resp, nil
}

func (s *ExposureRadarManualService) RefreshPublishingResults(ctx context.Context, userID uint, req dto.ExposureRadarResultRefreshRequest) (*dto.ExposureRadarResultRefreshResponse, error) {
	if s == nil || s.repo == nil {
		return nil, fmt.Errorf("exposure radar manual service unavailable")
	}
	days := req.Days
	if days <= 0 {
		days = 7
	}
	if days > 30 {
		days = 30
	}
	limit := req.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 200 {
		limit = 200
	}
	region := firstNonEmpty(normalizeExposureRadarManualRegionForQuery(req.Region), "all")
	rows, err := s.repo.ListRecent(userID, region, time.Now().UTC().AddDate(0, 0, -days), limit)
	if err != nil {
		return nil, err
	}
	resp := &dto.ExposureRadarResultRefreshResponse{
		Region:          region,
		Days:            days,
		Limit:           limit,
		TokenConfigured: strings.TrimSpace(s.xBearerToken) != "",
		ScannedCount:    len(rows),
		Items:           []dto.ExposureRadarResultRefreshItem{},
	}
	type candidate struct {
		index     int
		itemIndex int
		tweetID   string
	}
	candidates := make([]candidate, 0, len(rows))
	for index := range rows {
		row := rows[index]
		item := dto.ExposureRadarResultRefreshItem{
			SignalID:     row.SignalID,
			PublishedURL: row.PublishedURL,
		}
		if strings.TrimSpace(row.PublishedURL) == "" {
			item.Status = "skipped"
			item.Message = "No published reply URL stored for this manual record."
			resp.SkippedCount++
			resp.Items = append(resp.Items, item)
			continue
		}
		tweetID := extractTweetID(row.PublishedURL)
		if tweetID == "" {
			item.Status = "skipped"
			item.Message = "Published URL does not contain a valid X tweet id."
			resp.SkippedCount++
			resp.Items = append(resp.Items, item)
			continue
		}
		item.CommentTweetID = tweetID
		resp.EligibleCount++
		candidates = append(candidates, candidate{index: index, itemIndex: len(resp.Items), tweetID: tweetID})
		resp.Items = append(resp.Items, item)
	}
	if len(candidates) == 0 {
		resp.Message = "No published reply URLs were eligible for metric refresh."
		return resp, nil
	}
	if !resp.TokenConfigured {
		resp.SkippedCount += len(candidates)
		resp.Message = "X bearer token is not configured, so metrics were not refreshed."
		for index := range resp.Items {
			if resp.Items[index].CommentTweetID != "" && resp.Items[index].Status == "" {
				resp.Items[index].Status = "token_missing"
				resp.Items[index].Message = resp.Message
			}
		}
		return resp, nil
	}
	ids := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		ids = append(ids, candidate.tweetID)
	}
	tweets, err := twitter.LookupTweetsByIDs(ctx, s.xBearerToken, ids)
	if err != nil {
		resp.FailedCount += len(candidates)
		resp.Message = err.Error()
		for index := range resp.Items {
			if resp.Items[index].CommentTweetID != "" && resp.Items[index].Status == "" {
				resp.Items[index].Status = "lookup_failed"
				resp.Items[index].Message = err.Error()
			}
		}
		return resp, nil
	}
	tweetByID := make(map[string]twitter.TweetSearchItem, len(tweets))
	for _, tweet := range tweets {
		tweetByID[tweet.ID] = tweet
	}
	now := time.Now().UTC()
	for _, candidate := range candidates {
		if candidate.itemIndex < 0 || candidate.itemIndex >= len(resp.Items) {
			continue
		}
		tweet, ok := tweetByID[candidate.tweetID]
		if !ok {
			resp.FailedCount++
			resp.Items[candidate.itemIndex].Status = "not_found"
			resp.Items[candidate.itemIndex].Message = "X did not return metrics for this reply tweet."
			continue
		}
		row := &rows[candidate.index]
		row.ResultImpressionCount = tweet.ImpressionCount
		row.ResultLikeCount = tweet.LikeCount
		row.ResultReplyCount = tweet.ReplyCount
		row.ResultRetweetCount = tweet.RetweetCount
		row.ResultQuoteCount = tweet.QuoteCount
		row.ResultBookmarkCount = tweet.BookmarkCount
		row.ResultScore = exposureRadarResultScore(row)
		row.ResultCheckedAt = &now
		if err := s.repo.Save(row); err != nil {
			resp.FailedCount++
			resp.Items[candidate.itemIndex].Status = "save_failed"
			resp.Items[candidate.itemIndex].Message = err.Error()
			continue
		}
		resp.RefreshedCount++
		resp.Items[candidate.itemIndex].Status = "refreshed"
		resp.Items[candidate.itemIndex].Message = "Public metrics refreshed from X."
		resp.Items[candidate.itemIndex].ResultImpressionCount = row.ResultImpressionCount
		resp.Items[candidate.itemIndex].ResultLikeCount = row.ResultLikeCount
		resp.Items[candidate.itemIndex].ResultReplyCount = row.ResultReplyCount
		resp.Items[candidate.itemIndex].ResultRetweetCount = row.ResultRetweetCount
		resp.Items[candidate.itemIndex].ResultQuoteCount = row.ResultQuoteCount
		resp.Items[candidate.itemIndex].ResultBookmarkCount = row.ResultBookmarkCount
		resp.Items[candidate.itemIndex].ResultScore = row.ResultScore
		resp.Items[candidate.itemIndex].ResultCheckedAt = optionalTimeString(row.ResultCheckedAt)
	}
	if resp.Message == "" {
		resp.Message = fmt.Sprintf("Refreshed %d published reply result(s).", resp.RefreshedCount)
	}
	return resp, nil
}

func (s *ExposureRadarManualService) GetGrowthStrategy(userID uint, region string, botID uint, xAccountID uint) (*dto.ExposureRadarGrowthStrategyItem, error) {
	item := defaultExposureRadarGrowthStrategyDTO(region, botID, xAccountID)
	if s == nil || s.strategyRepo == nil {
		return &item, nil
	}
	row, err := s.strategyRepo.Get(userID, item.Region, botID, xAccountID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if botID > 0 && xAccountID > 0 {
				if fallback, fallbackErr := s.strategyRepo.Get(userID, item.Region, 0, xAccountID); fallbackErr == nil {
					next := exposureRadarGrowthStrategyToDTO(*fallback)
					next.BotID = botID
					next.XAccountID = xAccountID
					return &next, nil
				} else if !errors.Is(fallbackErr, gorm.ErrRecordNotFound) {
					return nil, fallbackErr
				}
			}
			return &item, nil
		}
		return nil, err
	}
	next := exposureRadarGrowthStrategyToDTO(*row)
	return &next, nil
}

func (s *ExposureRadarManualService) UpsertGrowthStrategy(userID uint, req dto.ExposureRadarGrowthStrategyRequest) (*dto.ExposureRadarGrowthStrategyItem, error) {
	if s == nil || s.strategyRepo == nil {
		return nil, fmt.Errorf("exposure radar strategy service unavailable")
	}
	region := firstNonEmpty(normalizeExposureRadarManualRegion(req.Region), "en")
	row, err := s.strategyRepo.Get(userID, region, req.BotID, req.XAccountID)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		row = &model.ExposureRadarGrowthStrategy{
			UserID:         userID,
			BotID:          req.BotID,
			XAccountID:     req.XAccountID,
			Region:         region,
			DailyMoveLimit: 10,
			SafetyMode:     "balanced",
			ReplyStyle:     "operator_observation",
		}
	}
	applyExposureRadarGrowthStrategyRequest(row, req)
	if err := s.strategyRepo.Save(row); err != nil {
		return nil, err
	}
	item := exposureRadarGrowthStrategyToDTO(*row)
	return &item, nil
}

func (s *ExposureRadarManualService) UpsertPeopleNote(userID uint, req dto.ExposureRadarPeopleNoteRequest) (*dto.ExposureRadarPeopleNoteItem, error) {
	if s == nil || s.peopleRepo == nil {
		return nil, fmt.Errorf("exposure radar people note service unavailable")
	}
	handle := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(req.AuthorHandle), "@"))
	if handle == "" {
		return nil, fmt.Errorf("author_handle is required")
	}
	region := normalizeExposureRadarManualRegionForQuery(req.Region)
	if region == "" {
		region = "all"
	}
	row, err := s.peopleRepo.Get(userID, region, handle)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		row = &model.ExposureRadarPeopleNote{
			UserID:       userID,
			Region:       region,
			AuthorHandle: handle,
		}
	}
	row.AuthorName = limitManualString(req.AuthorName, 255)
	row.Stage = normalizeExposureRadarPeopleCRMStage(req.Stage)
	row.Notes = limitManualString(req.Notes, 512)
	row.TagsJSON = encodeExposureRadarManualStringList(req.Tags, 12, 48)
	row.LastSignalID = limitManualString(req.LastSignalID, 160)
	now := time.Now().UTC()
	row.LastInteractionAt = &now
	if err := s.peopleRepo.Save(row); err != nil {
		return nil, err
	}
	item := exposureRadarPeopleNoteToDTO(*row)
	return &item, nil
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
	notesByHandle := map[string]model.ExposureRadarPeopleNote{}
	if s.peopleRepo != nil {
		handles := make([]string, 0, len(rows))
		for _, row := range rows {
			if strings.TrimSpace(row.AuthorHandle) != "" {
				handles = append(handles, row.AuthorHandle)
			}
		}
		notes, err := s.peopleRepo.ListByHandles(userID, normalizeExposureRadarManualRegionForQuery(region), handles)
		if err != nil {
			return nil, err
		}
		for _, note := range notes {
			key := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(note.AuthorHandle), "@"))
			if key == "" {
				continue
			}
			existing, ok := notesByHandle[key]
			if !ok || note.Region != "all" || existing.Region == "all" {
				notesByHandle[key] = note
			}
		}
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
		if note, ok := notesByHandle[person.Key]; ok {
			person.CRMStage = note.Stage
			if note.Stage != "" {
				person.Stage = note.Stage
			}
			person.Notes = note.Notes
			person.Tags = decodeExposureRadarManualStringList(note.TagsJSON)
			person.LastInteractionAt = optionalTimeString(note.LastInteractionAt)
			person.CRMUpdatedAt = note.UpdatedAt.UTC().Format(time.RFC3339)
		}
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

func (s *ExposureRadarManualService) WeeklyReview(userID uint, region string, days int) (*dto.ExposureRadarWeeklyReviewResponse, error) {
	if days <= 0 {
		days = 7
	}
	if days > 90 {
		days = 90
	}
	rows, err := s.repo.ListRecent(userID, normalizeExposureRadarManualRegionForQuery(region), time.Now().UTC().AddDate(0, 0, -days), 1000)
	if err != nil {
		return nil, err
	}
	out := dto.ExposureRadarWeeklyReviewResponse{
		Region:      firstNonEmpty(normalizeExposureRadarManualRegionForQuery(region), "all"),
		Days:        days,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	}
	topicStats := map[string]*dto.ExposureRadarWeeklyReviewTopic{}
	peopleStats := map[string]*dto.ExposureRadarWeeklyReviewPerson{}
	var resultScoreTotal int
	var resultScoreCount int
	for _, row := range rows {
		out.TotalRecords++
		if row.HandledAt != nil || row.TaskStatus == "done" {
			out.HandledCount++
		}
		if strings.TrimSpace(row.PublishedURL) != "" || row.ResultCheckedAt != nil {
			out.PublishedCount++
		}
		if row.Outcome == "effective" {
			out.EffectiveCount++
		}
		if row.Outcome == "ineffective" || row.Outcome == "not_suitable" {
			out.NegativeCount++
		}
		if row.ResultScore > 0 {
			resultScoreTotal += row.ResultScore
			resultScoreCount++
		}
		topicName := firstNonEmpty(row.TopicName, row.OpportunityType, row.DataQuality, "untagged")
		if topicStats[topicName] == nil {
			topicStats[topicName] = &dto.ExposureRadarWeeklyReviewTopic{TopicName: topicName}
		}
		topicStats[topicName].Count++
		if row.Outcome == "effective" {
			topicStats[topicName].Effective++
		}
		handle := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(row.AuthorHandle), "@"))
		if handle != "" {
			if peopleStats[handle] == nil {
				peopleStats[handle] = &dto.ExposureRadarWeeklyReviewPerson{Handle: handle, Name: row.AuthorName}
			}
			peopleStats[handle].Count++
		}
	}
	if out.TotalRecords > 0 {
		out.CompletionRate = float64(out.HandledCount) / float64(out.TotalRecords)
	}
	if out.HandledCount > 0 {
		out.EffectiveRate = float64(out.EffectiveCount) / float64(out.HandledCount)
	}
	if resultScoreCount > 0 {
		out.AverageResultScore = float64(resultScoreTotal) / float64(resultScoreCount)
	}
	out.TopTopics = topWeeklyTopics(topicStats, 5)
	out.TopPeople = topWeeklyPeople(peopleStats, 5)
	out.Recommendations = buildWeeklyRecommendations(out)
	return &out, nil
}

func (s *ExposureRadarManualService) SafetyCenter(userID uint, region string, days int) (*dto.ExposureRadarSafetyCenterResponse, error) {
	if days <= 0 {
		days = 7
	}
	if days > 90 {
		days = 90
	}
	rows, err := s.repo.ListRecent(userID, normalizeExposureRadarManualRegionForQuery(region), time.Now().UTC().AddDate(0, 0, -days), 1000)
	if err != nil {
		return nil, err
	}
	out := dto.ExposureRadarSafetyCenterResponse{
		Region:      firstNonEmpty(normalizeExposureRadarManualRegionForQuery(region), "all"),
		Days:        days,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	}
	for _, row := range rows {
		out.TotalRecords++
		switch strings.TrimSpace(row.SafetyStatus) {
		case "block":
			out.BlockCount++
		case "watch":
			out.WatchCount++
		case "pass":
			out.PassCount++
		}
		for _, check := range decodeExposureRadarSafetyChecks(row.SafetyChecksJSON) {
			if check.Key == "promotion" && check.Status != "pass" {
				out.PromotionSmell++
			}
			if check.Key == "claims" && check.Status != "pass" {
				out.RiskyClaimCount++
			}
		}
	}
	out.Warnings = buildSafetyCenterWarnings(out)
	return &out, nil
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
	resultUpdated := false
	if req.ResultImpressionCount != nil {
		resultUpdated = applyInt64IfNonNegative(&record.ResultImpressionCount, *req.ResultImpressionCount) || resultUpdated
	}
	if req.ResultLikeCount != nil {
		resultUpdated = applyInt64IfNonNegative(&record.ResultLikeCount, *req.ResultLikeCount) || resultUpdated
	}
	if req.ResultReplyCount != nil {
		resultUpdated = applyInt64IfNonNegative(&record.ResultReplyCount, *req.ResultReplyCount) || resultUpdated
	}
	if req.ResultRetweetCount != nil {
		resultUpdated = applyInt64IfNonNegative(&record.ResultRetweetCount, *req.ResultRetweetCount) || resultUpdated
	}
	if req.ResultQuoteCount != nil {
		resultUpdated = applyInt64IfNonNegative(&record.ResultQuoteCount, *req.ResultQuoteCount) || resultUpdated
	}
	if req.ResultBookmarkCount != nil {
		resultUpdated = applyInt64IfNonNegative(&record.ResultBookmarkCount, *req.ResultBookmarkCount) || resultUpdated
	}
	setIfNotEmpty(&record.ResultNotes, req.ResultNotes, 512)
	if strings.TrimSpace(req.ResultNotes) != "" {
		resultUpdated = true
	}
	if resultUpdated {
		record.ResultScore = exposureRadarResultScore(record)
		record.ResultCheckedAt = &now
	}
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
		ID:                    row.ID,
		BotID:                 row.BotID,
		XAccountID:            row.XAccountID,
		SignalID:              row.SignalID,
		Region:                row.Region,
		DataSource:            row.DataSource,
		DataQuality:           row.DataQuality,
		TweetID:               row.TweetID,
		URL:                   row.URL,
		Title:                 row.Title,
		Content:               row.Content,
		AuthorID:              row.AuthorID,
		AuthorHandle:          row.AuthorHandle,
		AuthorName:            row.AuthorName,
		TopicName:             row.TopicName,
		Score:                 row.Score,
		RiskLevel:             row.RiskLevel,
		OpportunityType:       row.OpportunityType,
		OpportunityTier:       row.OpportunityTier,
		QualityStage:          row.QualityStage,
		ViewsPerMinute:        row.ViewsPerMinute,
		FollowersCount:        row.FollowersCount,
		HeatCount:             row.HeatCount,
		ReplyCount:            row.ReplyCount,
		RetweetCount:          row.RetweetCount,
		LikeCount:             row.LikeCount,
		QuoteCount:            row.QuoteCount,
		BookmarkCount:         row.BookmarkCount,
		ImpressionCount:       row.ImpressionCount,
		ReviewTaskID:          row.ReviewTaskID,
		SavedMemoryID:         row.SavedMemoryID,
		GeneratedComment:      row.GeneratedComment,
		TaskStatus:            row.TaskStatus,
		PublishedURL:          row.PublishedURL,
		Outcome:               row.Outcome,
		FeedbackComment:       row.FeedbackComment,
		ResultImpressionCount: row.ResultImpressionCount,
		ResultLikeCount:       row.ResultLikeCount,
		ResultReplyCount:      row.ResultReplyCount,
		ResultRetweetCount:    row.ResultRetweetCount,
		ResultQuoteCount:      row.ResultQuoteCount,
		ResultBookmarkCount:   row.ResultBookmarkCount,
		ResultNotes:           row.ResultNotes,
		ResultScore:           row.ResultScore,
		ResultCheckedAt:       optionalTimeString(row.ResultCheckedAt),
		SafetyStatus:          row.SafetyStatus,
		SafetySummary:         row.SafetySummary,
		SafetyChecks:          decodeExposureRadarSafetyChecks(row.SafetyChecksJSON),
		ReplyAngleID:          row.ReplyAngleID,
		ReplyAngleTitle:       row.ReplyAngleTitle,
		CopiedAt:              optionalTimeString(row.CopiedAt),
		OpenedAt:              optionalTimeString(row.OpenedAt),
		SavedAt:               optionalTimeString(row.SavedAt),
		HandledAt:             optionalTimeString(row.HandledAt),
		FeedbackAt:            optionalTimeString(row.FeedbackAt),
		CreatedAt:             row.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:             row.UpdatedAt.UTC().Format(time.RFC3339),
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

func applyInt64IfNonNegative(target *int64, value int64) bool {
	if value < 0 || *target == value {
		return false
	}
	*target = value
	return true
}

func int64Ptr(value int64) *int64 {
	return &value
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

func defaultExposureRadarGrowthStrategyDTO(region string, botID uint, xAccountID uint) dto.ExposureRadarGrowthStrategyItem {
	return dto.ExposureRadarGrowthStrategyItem{
		BotID:          botID,
		XAccountID:     xAccountID,
		Region:         firstNonEmpty(normalizeExposureRadarManualRegion(region), "en"),
		CoreTopics:     []string{},
		AvoidTopics:    []string{},
		Competitors:    []string{},
		ReplyStyle:     "operator_observation",
		DailyMoveLimit: 10,
		SafetyMode:     "balanced",
	}
}

func applyExposureRadarGrowthStrategyRequest(record *model.ExposureRadarGrowthStrategy, req dto.ExposureRadarGrowthStrategyRequest) {
	record.Region = firstNonEmpty(normalizeExposureRadarManualRegion(req.Region), record.Region, "en")
	record.BotID = req.BotID
	record.XAccountID = req.XAccountID
	setIfNotEmpty(&record.TargetAudience, req.TargetAudience, 512)
	setIfNotEmpty(&record.PrimaryGoal, normalizeExposureRadarPrimaryGoal(req.PrimaryGoal), 128)
	record.CoreTopicsJSON = encodeExposureRadarManualStringList(req.CoreTopics, 20, 80)
	record.AvoidTopicsJSON = encodeExposureRadarManualStringList(req.AvoidTopics, 20, 80)
	record.CompetitorsJSON = encodeExposureRadarManualStringList(req.Competitors, 20, 80)
	record.ReplyStyle = firstNonEmpty(normalizeExposureRadarReplyStyle(req.ReplyStyle), record.ReplyStyle, "operator_observation")
	if req.DailyMoveLimit > 0 {
		if req.DailyMoveLimit > 50 {
			req.DailyMoveLimit = 50
		}
		record.DailyMoveLimit = req.DailyMoveLimit
	}
	record.SafetyMode = firstNonEmpty(normalizeExposureRadarSafetyMode(req.SafetyMode), record.SafetyMode, "balanced")
	setIfNotEmpty(&record.OperatorNotes, req.OperatorNotes, 512)
}

func exposureRadarGrowthStrategyToDTO(row model.ExposureRadarGrowthStrategy) dto.ExposureRadarGrowthStrategyItem {
	return dto.ExposureRadarGrowthStrategyItem{
		ID:                  row.ID,
		BotID:               row.BotID,
		XAccountID:          row.XAccountID,
		Region:              row.Region,
		TargetAudience:      row.TargetAudience,
		PrimaryGoal:         row.PrimaryGoal,
		CoreTopics:          decodeExposureRadarManualStringList(row.CoreTopicsJSON),
		AvoidTopics:         decodeExposureRadarManualStringList(row.AvoidTopicsJSON),
		Competitors:         decodeExposureRadarManualStringList(row.CompetitorsJSON),
		ReplyStyle:          firstNonEmpty(row.ReplyStyle, "operator_observation"),
		DailyMoveLimit:      firstPositive(row.DailyMoveLimit, 10),
		SafetyMode:          firstNonEmpty(row.SafetyMode, "balanced"),
		OperatorNotes:       row.OperatorNotes,
		LastReviewedSummary: row.LastReviewedSummary,
		CreatedAt:           row.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:           row.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func exposureRadarPeopleNoteToDTO(row model.ExposureRadarPeopleNote) dto.ExposureRadarPeopleNoteItem {
	return dto.ExposureRadarPeopleNoteItem{
		ID:                row.ID,
		Region:            row.Region,
		AuthorHandle:      row.AuthorHandle,
		AuthorName:        row.AuthorName,
		Stage:             row.Stage,
		Tags:              decodeExposureRadarManualStringList(row.TagsJSON),
		Notes:             row.Notes,
		LastSignalID:      row.LastSignalID,
		LastInteractionAt: optionalTimeString(row.LastInteractionAt),
		UpdatedAt:         row.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func encodeExposureRadarManualStringList(values []string, limit int, maxLen int) string {
	if limit <= 0 {
		limit = len(values)
	}
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		value = limitManualString(value, maxLen)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
		if len(out) >= limit {
			break
		}
	}
	raw, _ := json.Marshal(out)
	return string(raw)
}

func decodeExposureRadarManualStringList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	var values []string
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return []string{}
	}
	return values
}

func normalizeExposureRadarPrimaryGoal(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "awareness", "relationships", "traffic", "community", "research":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return strings.TrimSpace(value)
	}
}

func normalizeExposureRadarReplyStyle(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "operator_observation", "light_question", "peer_experience", "caution_note":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func normalizeExposureRadarSafetyMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "conservative", "balanced", "growth":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func normalizeExposureRadarPeopleCRMStage(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "priority", "watch", "engaged", "avoid", "new":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func exposureRadarResultScore(row *model.ExposureRadarManualRecord) int {
	score := 0
	if row.ResultImpressionCount >= 100 {
		score += 30
	}
	if row.ResultImpressionCount >= 1000 {
		score += 20
	}
	score += int(minExposureRadarManualInt64(row.ResultLikeCount*5, 25))
	score += int(minExposureRadarManualInt64(row.ResultReplyCount*8, 25))
	score += int(minExposureRadarManualInt64(row.ResultRetweetCount*10, 20))
	score += int(minExposureRadarManualInt64(row.ResultQuoteCount*10, 20))
	score += int(minExposureRadarManualInt64(row.ResultBookmarkCount*6, 15))
	if row.Outcome == "effective" {
		score += 20
	}
	if score > 100 {
		return 100
	}
	return score
}

func topWeeklyTopics(stats map[string]*dto.ExposureRadarWeeklyReviewTopic, limit int) []dto.ExposureRadarWeeklyReviewTopic {
	items := make([]dto.ExposureRadarWeeklyReviewTopic, 0, len(stats))
	for _, item := range stats {
		items = append(items, *item)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Effective != items[j].Effective {
			return items[i].Effective > items[j].Effective
		}
		return items[i].Count > items[j].Count
	})
	if len(items) > limit {
		return items[:limit]
	}
	return items
}

func topWeeklyPeople(stats map[string]*dto.ExposureRadarWeeklyReviewPerson, limit int) []dto.ExposureRadarWeeklyReviewPerson {
	items := make([]dto.ExposureRadarWeeklyReviewPerson, 0, len(stats))
	for _, item := range stats {
		items = append(items, *item)
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Count > items[j].Count
	})
	if len(items) > limit {
		return items[:limit]
	}
	return items
}

func buildWeeklyRecommendations(review dto.ExposureRadarWeeklyReviewResponse) []string {
	recommendations := []string{}
	if review.TotalRecords == 0 {
		return []string{"Start by handling 5-10 radar signals manually so the weekly review has enough evidence."}
	}
	if review.CompletionRate < 0.35 {
		recommendations = append(recommendations, "Reduce the daily move target or focus only on act-now signals until completion improves.")
	}
	if review.EffectiveRate >= 0.3 {
		recommendations = append(recommendations, "Keep the current topic mix and turn the top effective topics into Content Memory.")
	}
	if review.NegativeCount > review.EffectiveCount {
		recommendations = append(recommendations, "Review negative outcomes before increasing volume; the reply angle or topic fit may be too broad.")
	}
	if len(review.TopPeople) > 0 {
		recommendations = append(recommendations, "Move repeat authors into People Radar notes so future replies can be relationship-aware.")
	}
	if len(recommendations) == 0 {
		recommendations = append(recommendations, "Keep the workflow stable and collect one more week of result data before changing thresholds.")
	}
	return recommendations
}

func buildSafetyCenterWarnings(summary dto.ExposureRadarSafetyCenterResponse) []string {
	warnings := []string{}
	if summary.BlockCount > 0 {
		warnings = append(warnings, "Some drafts were blocked by safety checks. Keep manual review required for these topics.")
	}
	if summary.WatchCount > summary.PassCount && summary.TotalRecords > 0 {
		warnings = append(warnings, "Watch-level drafts are higher than pass-level drafts. Tighten reply style or avoid sensitive topics.")
	}
	if summary.PromotionSmell > 0 {
		warnings = append(warnings, "A few replies looked promotional. Prefer replying to the post context before mentioning your product.")
	}
	if summary.RiskyClaimCount > 0 {
		warnings = append(warnings, "Risky growth or factual claims appeared in drafts. Keep claims verifiable and conservative.")
	}
	if len(warnings) == 0 {
		warnings = append(warnings, "No major safety concentration detected in recent manual records.")
	}
	return warnings
}

func firstPositive(value int, fallback int) int {
	if value > 0 {
		return value
	}
	return fallback
}

func minExposureRadarManualInt64(a int64, b int64) int64 {
	if a < b {
		return a
	}
	return b
}
