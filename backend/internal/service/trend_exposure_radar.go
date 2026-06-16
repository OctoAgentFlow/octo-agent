package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
)

const tl1TrendingEndpoint = "https://www.tl1.com/api/trending"

func (s *TrendService) recordXAPICall(metric string, sourceType string, quantity int64, occurredAt time.Time, details map[string]any) {
	if s == nil {
		return
	}
	if quantity <= 0 {
		quantity = 1
	}
	if occurredAt.IsZero() {
		occurredAt = time.Now().UTC()
	}
	detailsJSON, _ := json.Marshal(details)
	row := model.CostUsageLedger{
		UserID:     0,
		SourceType: strings.TrimSpace(sourceType),
		Provider:   "x",
		Metric:     strings.TrimSpace(metric),
		Quantity:   quantity,
		Currency:   "USD",
		OccurredAt: occurredAt.UTC(),
		Details:    string(detailsJSON),
	}
	if row.SourceType == "" {
		row.SourceType = "x_api"
	}
	if row.Metric == "" {
		row.Metric = "api_call"
	}
	if s.exposure != nil && s.exposure.DB != nil {
		if err := s.exposure.DB.Create(&row).Error; err != nil {
			zap.L().Debug("record x api usage failed", zap.String("metric", row.Metric), zap.Error(err))
		}
		return
	}
	if s.repo != nil && s.repo.DB != nil {
		if err := s.repo.DB.Create(&row).Error; err != nil {
			zap.L().Debug("record x api usage failed", zap.String("metric", row.Metric), zap.Error(err))
		}
	}
}

type tl1TrendingResponse struct {
	UpdatedAt string        `json:"updatedAt"`
	Items     []tl1PostItem `json:"items"`
}

type tl1PostItem struct {
	TweetID        string  `json:"tweetId"`
	AuthorHandle   string  `json:"authorHandle"`
	DisplayName    string  `json:"displayName"`
	Content        string  `json:"content"`
	Status         string  `json:"status"`
	ViewsPerMin    float64 `json:"viewsPerMin"`
	FollowersCount int64   `json:"followersCount"`
	TweetAge       string  `json:"tweetAge"`
	Heat           string  `json:"heat"`
	Emoji          string  `json:"emoji"`
	HotCount       int     `json:"hotCount"`
	LastCheckTime  string  `json:"lastCheckTime"`
	History        []int64 `json:"history"`
	CurrentStats   struct {
		ViewCount    int64 `json:"viewCount"`
		LikeCount    int64 `json:"likeCount"`
		RetweetCount int64 `json:"retweetCount"`
		ReplyCount   int64 `json:"replyCount"`
	} `json:"currentStats"`
}

type exposureRadarTopicPerformance struct {
	Positive int64
	Rejected int64
}

type exposureRadarOutcomePerformance struct {
	Effective   int64
	Neutral     int64
	Ineffective int64
	NotSuitable int64
}

const (
	exposureHotOpportunityTier = "hot_opportunity"
	exposureRisingSignalTier   = "rising_opportunity"
	exposureSamplingTier       = "needs_sampling"
	exposureTopicLeadTier      = "topic_lead"
	exposureRisingMinViews     = int64(100)
	exposureRisingMinVelocity  = 5.0

	exposureQualityActNow  = "act_now"
	exposureQualityWatch   = "watch"
	exposureQualityExpired = "expired"

	exposureConfidenceRealImpressions = "real_impressions"
	exposureConfidenceEngagement      = "engagement_estimate"
	exposureConfidenceTopic           = "topic_level"
	exposureConfidenceFirstSample     = "first_sample"
)

type exposureHotThresholds struct {
	HotMinViews       int64
	HotMinVelocity    float64
	StrongMinViews    int64
	StrongMinVelocity float64
}

func (s *TrendService) ExposureRadar(ctx context.Context, userID uint, query dto.ExposureRadarQuery, now time.Time) (*dto.ExposureRadarResponse, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	region := strings.ToLower(strings.TrimSpace(query.Region))
	if region == "" {
		region = "zh"
	}
	query.Region = region
	if query.Hours <= 0 {
		query.Hours = 4
	}
	if query.Limit <= 0 || query.Limit > 100 {
		query.Limit = 50
	}
	if query.MaxFans <= 0 {
		query.MaxFans = 10000
	}
	switch region {
	case "zh", "cn", "chinese":
		resp, err := s.exposureRadarChinese(ctx, query, now)
		resp = s.annotateExposureRadarMemoryState(userID, query, s.annotateExposureRadarReviewState(userID, s.applyExposureRadarPerformanceRanking(userID, query, resp, now)))
		return s.withExposureRadarDiagnostics(resp, query, now), err
	case "en", "english":
		resp, err := s.exposureRadarEnglish(query, now)
		resp = s.annotateExposureRadarMemoryState(userID, query, s.annotateExposureRadarReviewState(userID, s.applyExposureRadarPerformanceRanking(userID, query, resp, now)))
		return s.withExposureRadarDiagnostics(resp, query, now), err
	default:
		query.Region = "zh"
		resp, err := s.exposureRadarChinese(ctx, query, now)
		resp = s.annotateExposureRadarMemoryState(userID, query, s.annotateExposureRadarReviewState(userID, s.applyExposureRadarPerformanceRanking(userID, query, resp, now)))
		return s.withExposureRadarDiagnostics(resp, query, now), err
	}
}

func (s *TrendService) ExposureRadarBrief(ctx context.Context, userID uint, query dto.ExposureRadarBriefQuery, now time.Time) (*dto.ExposureRadarBriefResponse, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	limit := query.Limit
	if limit <= 0 || limit > 20 {
		limit = 10
	}
	hours := query.Hours
	if hours <= 0 {
		hours = 1
	}
	if hours > 24 {
		hours = 24
	}
	radarQuery := dto.ExposureRadarQuery{
		Region:     query.Region,
		BotID:      query.BotID,
		XAccountID: query.XAccountID,
		Hours:      hours,
		MaxFans:    s.englishExposureMaxFans(),
		Limit:      radarMaxInt(limit*3, limit),
	}
	radar, err := s.ExposureRadar(ctx, userID, radarQuery, now)
	if err != nil {
		return nil, err
	}
	items := make([]dto.ExposureRadarBriefItem, 0, limit)
	for _, item := range radar.Items {
		if len(items) >= limit {
			break
		}
		if strings.EqualFold(item.RiskLevel, "high") {
			continue
		}
		items = append(items, exposureRadarBriefItem(len(items)+1, item))
	}
	return &dto.ExposureRadarBriefResponse{
		Region:           radar.Region,
		HourKey:          now.UTC().Format("2006010215"),
		GeneratedAt:      now.UTC().Format(time.RFC3339),
		SourceType:       radar.SourceType,
		SourceStatus:     radar.SourceStatus,
		DataQuality:      radar.DataQuality,
		Summary:          exposureRadarBriefSummary(radar.Region, items),
		LearningControls: radar.LearningControls,
		Items:            items,
	}, nil
}

func (s *TrendService) ExposureRadarPerformance(userID uint, query dto.ExposureRadarPerformanceQuery, now time.Time) (*dto.ExposureRadarPerformanceResponse, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	region := normalizeExposureRegion(query.Region)
	if strings.TrimSpace(query.Region) == "" || strings.TrimSpace(query.Region) == "all" {
		region = "all"
	}
	days := query.Days
	if days <= 0 {
		days = 7
	}
	if days > 90 {
		days = 90
	}
	since := now.AddDate(0, 0, -days)
	resp := &dto.ExposureRadarPerformanceResponse{
		Region:           region,
		BotID:            query.BotID,
		XAccountID:       query.XAccountID,
		RangeDays:        days,
		GeneratedAt:      now.UTC().Format(time.RFC3339),
		LearningControls: s.exposureRadarLearningControls(query.BotID, query.XAccountID, s.exposureRadarConfiguredRankingScope(query.BotID, query.XAccountID)),
		Regions:          []dto.ExposureRadarPerformanceStat{},
		TopTopics:        []dto.ExposureRadarTopicStat{},
	}
	scope := repository.ExposureRadarTaskScope{
		UserID:     userID,
		Region:     region,
		BotID:      query.BotID,
		XAccountID: query.XAccountID,
		Since:      since,
	}
	regionStats := map[string]*dto.ExposureRadarPerformanceStat{}
	ensureRegion := func(value string) *dto.ExposureRadarPerformanceStat {
		value = normalizeExposureRegion(value)
		if value == "" {
			value = "unknown"
		}
		if region != "all" && value != region {
			return nil
		}
		if regionStats[value] == nil {
			regionStats[value] = &dto.ExposureRadarPerformanceStat{Region: value, SourceHealthStatus: "unknown"}
		}
		return regionStats[value]
	}

	if s != nil && s.exposure != nil {
		rows, err := s.exposure.CountByRegionSince(region, since)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			stat := ensureRegion(row.Region)
			if stat == nil {
				continue
			}
			stat.OwnedSignalCount += row.SignalCount
			if row.LatestSeenAt.After(parseOptionalTime(stat.LatestCollectedAt)) {
				stat.LatestCollectedAt = row.LatestSeenAt.UTC().Format(time.RFC3339)
			}
			stat.SourceHealthStatus, _ = exposureSourceFreshness(row.LatestSeenAt, now, s.exposureRefreshInterval())
			resp.OwnedSignalCount += row.SignalCount
		}
		signalTopics, err := s.exposure.TopTopicsByRegionSince(region, since, 8)
		if err != nil {
			return nil, err
		}
		for _, row := range signalTopics {
			resp.TopTopics = append(resp.TopTopics, dto.ExposureRadarTopicStat{
				TopicName:   row.TopicName,
				Region:      normalizeExposureRegion(row.Region),
				SignalCount: row.SignalCount,
			})
		}
	}

	if s != nil && s.commentRepo != nil {
		statusRows, err := s.commentRepo.CountExposureRadarStatusByRegionSince(scope)
		if err != nil {
			return nil, err
		}
		for _, row := range statusRows {
			stat := ensureRegion(row.SourceRegion)
			if stat == nil {
				continue
			}
			stat.DraftCount += row.Count
			resp.DraftCount += row.Count
			if row.LatestAt.After(parseOptionalTime(stat.LatestDraftedAt)) {
				stat.LatestDraftedAt = row.LatestAt.UTC().Format(time.RFC3339)
			}
			switch exposureRadarPerformanceStatus(row.Status) {
			case "pending_review":
				stat.PendingReviewCount += row.Count
				resp.PendingReviewCount += row.Count
			case "approved":
				stat.ApprovedCount += row.Count
				resp.ApprovedCount += row.Count
				resp.PositiveCount += row.Count
			case "rejected":
				stat.RejectedCount += row.Count
				resp.RejectedCount += row.Count
			case "published":
				stat.PublishedCount += row.Count
				resp.PublishedCount += row.Count
				resp.PositiveCount += row.Count
			case "handled":
				stat.HandledCount += row.Count
				resp.HandledCount += row.Count
				resp.PositiveCount += row.Count
			}
		}
		taskTopics, err := s.commentRepo.CountExposureRadarTopicsByRegionSince(scope, 12)
		if err != nil {
			return nil, err
		}
		mergeExposureRadarTaskTopics(resp, taskTopics)
	}

	for _, stat := range regionStats {
		resp.Regions = append(resp.Regions, *stat)
	}
	sort.SliceStable(resp.Regions, func(i, j int) bool {
		if resp.Regions[i].Region != resp.Regions[j].Region {
			return resp.Regions[i].Region < resp.Regions[j].Region
		}
		return resp.Regions[i].DraftCount > resp.Regions[j].DraftCount
	})
	if resp.DraftCount > 0 {
		resp.ApprovalRate = roundRatio(float64(resp.ApprovedCount+resp.PublishedCount+resp.HandledCount) / float64(resp.DraftCount))
		resp.CompletionRate = roundRatio(float64(resp.PublishedCount+resp.HandledCount) / float64(resp.DraftCount))
	}
	totalOpportunityCount := resp.OwnedSignalCount + resp.DraftCount
	if totalOpportunityCount > 0 {
		resp.OwnedCollectorShare = roundRatio(float64(resp.OwnedSignalCount) / float64(totalOpportunityCount))
	}
	sort.SliceStable(resp.TopTopics, func(i, j int) bool {
		left := resp.TopTopics[i].SignalCount + resp.TopTopics[i].DraftCount*2 + resp.TopTopics[i].SuccessCount*3
		right := resp.TopTopics[j].SignalCount + resp.TopTopics[j].DraftCount*2 + resp.TopTopics[j].SuccessCount*3
		if left != right {
			return left > right
		}
		return resp.TopTopics[i].TopicName < resp.TopTopics[j].TopicName
	})
	if len(resp.TopTopics) > 8 {
		resp.TopTopics = resp.TopTopics[:8]
	}
	return resp, nil
}

func (s *TrendService) ExposureRadarArchive(userID uint, query dto.ExposureRadarArchiveQuery, now time.Time) (*dto.ExposureRadarArchiveResponse, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	region := normalizeExposureRegion(query.Region)
	if strings.TrimSpace(query.Region) == "" || strings.TrimSpace(query.Region) == "all" {
		region = "all"
	}
	days := query.Days
	if days <= 0 {
		days = 7
	}
	if days > 30 {
		days = 30
	}
	today := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)
	since := today.AddDate(0, 0, -days+1)
	resp := &dto.ExposureRadarArchiveResponse{
		Region:      region,
		BotID:       query.BotID,
		XAccountID:  query.XAccountID,
		RangeDays:   days,
		GeneratedAt: now.UTC().Format(time.RFC3339),
		Days:        []dto.ExposureRadarArchiveDay{},
	}
	dayMap := map[string]*dto.ExposureRadarArchiveDay{}
	ensureDay := func(dayKey, valueRegion string) *dto.ExposureRadarArchiveDay {
		dayKey = strings.TrimSpace(dayKey)
		if dayKey == "" {
			return nil
		}
		valueRegion = normalizeExposureRegion(valueRegion)
		if valueRegion == "" {
			valueRegion = region
		}
		if valueRegion == "" || valueRegion == "all" {
			valueRegion = "unknown"
		}
		if region != "all" && valueRegion != region {
			return nil
		}
		key := dayKey + ":" + valueRegion
		if dayMap[key] == nil {
			dayMap[key] = &dto.ExposureRadarArchiveDay{DateKey: dayKey, Region: valueRegion, TopTopics: []dto.ExposureRadarTopicStat{}}
		}
		return dayMap[key]
	}
	if region != "all" {
		for i := 0; i < days; i++ {
			ensureDay(today.AddDate(0, 0, -i).Format("2006-01-02"), region)
		}
	}
	if s != nil && s.exposure != nil {
		rows, err := s.exposure.CountByDaySince(region, since)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			day := ensureDay(row.DayKey, row.Region)
			if day != nil {
				day.SignalCount += row.SignalCount
			}
		}
		topicRows, err := s.exposure.TopTopicsByDaySince(region, since, days*8)
		if err != nil {
			return nil, err
		}
		for _, row := range topicRows {
			day := ensureDay(row.DayKey, row.Region)
			if day != nil {
				mergeExposureRadarArchiveTopic(day, dto.ExposureRadarTopicStat{TopicName: row.TopicName, Region: normalizeExposureRegion(row.Region), SignalCount: row.SignalCount})
			}
		}
	}
	scope := repository.ExposureRadarTaskScope{
		UserID:     userID,
		Region:     region,
		BotID:      query.BotID,
		XAccountID: query.XAccountID,
		Since:      since,
	}
	if s != nil && s.commentRepo != nil {
		rows, err := s.commentRepo.CountExposureRadarStatusByDaySince(scope)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			day := ensureDay(row.DayKey, row.SourceRegion)
			if day == nil {
				continue
			}
			day.DraftCount += row.Count
			switch exposureRadarPerformanceStatus(row.Status) {
			case "pending_review":
				day.PendingCount += row.Count
			case "approved", "published", "handled":
				day.PositiveCount += row.Count
			case "rejected":
				day.RejectedCount += row.Count
			}
		}
		topicRows, err := s.commentRepo.CountExposureRadarTopicsByDaySince(scope, days*12)
		if err != nil {
			return nil, err
		}
		for _, row := range topicRows {
			day := ensureDay(row.DayKey, row.SourceRegion)
			if day == nil {
				continue
			}
			topics := decodeStringList(row.TopicName)
			if len(topics) == 0 {
				topics = []string{row.TopicName}
			}
			for _, topic := range topics {
				topic = strings.TrimSpace(topic)
				if topic == "" || isExposureRadarMetaKeyword(topic) {
					continue
				}
				stat := dto.ExposureRadarTopicStat{TopicName: topic, Region: normalizeExposureRegion(row.SourceRegion), DraftCount: row.Count}
				switch exposureRadarPerformanceStatus(row.Status) {
				case "approved", "published", "handled":
					stat.SuccessCount = row.Count
				}
				mergeExposureRadarArchiveTopic(day, stat)
			}
		}
	}
	if s != nil && s.contentRepo != nil {
		rows, err := s.contentRepo.CountExposureRadarMemoryByDaySince(userID, query.XAccountID, query.BotID, region, since)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			day := ensureDay(row.DayKey, region)
			if day != nil {
				day.SavedMemoryCount += row.Count
			}
		}
	}
	for _, day := range dayMap {
		sort.SliceStable(day.TopTopics, func(i, j int) bool {
			left := day.TopTopics[i].SignalCount + day.TopTopics[i].DraftCount*2 + day.TopTopics[i].SuccessCount*3
			right := day.TopTopics[j].SignalCount + day.TopTopics[j].DraftCount*2 + day.TopTopics[j].SuccessCount*3
			if left != right {
				return left > right
			}
			return day.TopTopics[i].TopicName < day.TopTopics[j].TopicName
		})
		if len(day.TopTopics) > 3 {
			day.TopTopics = day.TopTopics[:3]
		}
		resp.Days = append(resp.Days, *day)
	}
	sort.SliceStable(resp.Days, func(i, j int) bool {
		if resp.Days[i].DateKey != resp.Days[j].DateKey {
			return resp.Days[i].DateKey > resp.Days[j].DateKey
		}
		return resp.Days[i].Region < resp.Days[j].Region
	})
	return resp, nil
}

func (s *TrendService) exposureRadarChinese(ctx context.Context, query dto.ExposureRadarQuery, now time.Time) (*dto.ExposureRadarResponse, error) {
	if s != nil && s.exposure != nil {
		rows, err := s.exposure.List(repository.ExposureTweetSignalListQuery{
			Region:      "zh",
			MaxFans:     query.MaxFans,
			HotMinViews: s.exposureHotThresholds().HotMinViews,
			ActiveAfter: now.Add(-time.Duration(query.Hours) * time.Hour),
			Limit:       query.Limit,
		})
		if err != nil {
			return nil, err
		}
		if len(rows) > 0 {
			items := make([]dto.ExposureRadarItem, 0, len(rows))
			for i := range rows {
				items = append(items, s.exposureTweetSignalToRadarItem(&rows[i]))
			}
			lastCollectedAt := latestExposureSignalSeenAt(rows)
			sourceStatus, freshnessSeconds := exposureSourceFreshness(lastCollectedAt, now, s.exposureRefreshInterval())
			return &dto.ExposureRadarResponse{
				Region:           "zh",
				DataSource:       "OAF Chinese tweet collector",
				DataQuality:      "tweet_level",
				SourceType:       "owned_collector",
				SourceStatus:     sourceStatus,
				UpdatedAt:        lastCollectedAt.UTC().Format(time.RFC3339),
				LastCollectedAt:  lastCollectedAt.UTC().Format(time.RFC3339),
				FreshnessSeconds: freshnessSeconds,
				Filters:          query,
				Items:            items,
				SourceNotice:     "Chinese-region items are collected by OAF from X recent search using Chinese topic seeds and cached trend topics. External trend data is only used as a fallback when owned signals are unavailable.",
			}, nil
		}
	}

	u, _ := url.Parse(tl1TrendingEndpoint)
	q := u.Query()
	q.Set("page", "1")
	q.Set("pageSize", strconv.Itoa(query.Limit))
	q.Set("hours", strconv.Itoa(query.Hours))
	q.Set("maxFans", strconv.FormatInt(query.MaxFans, 10))
	if query.MinHotCount > 0 {
		q.Set("minHotCount", strconv.Itoa(query.MinHotCount))
	}
	q.Set("t", strconv.FormatInt(now.UnixMilli(), 10))
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "OctoAgentFlow/1.0 ExposureRadar")
	client := &http.Client{Timeout: 8 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("tl1 trending returned status %d", res.StatusCode)
	}
	var payload tl1TrendingResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	items := make([]dto.ExposureRadarItem, 0, len(payload.Items))
	for _, row := range payload.Items {
		items = append(items, s.tl1PostToExposureItem(row))
	}
	return &dto.ExposureRadarResponse{
		Region:       "zh",
		DataSource:   "External public trend feed",
		DataQuality:  "tweet_level",
		SourceType:   "tl1_fallback",
		SourceStatus: "fallback",
		UpdatedAt:    radarFirstNonEmpty(payload.UpdatedAt, now.Format(time.RFC3339)),
		Filters:      query,
		Items:        items,
		SourceNotice: "Chinese-region items are proxied from external public trend data because owned OAF Chinese signals are not available yet. Use this as opportunity discovery, not a guaranteed production dependency.",
	}, nil
}

func (s *TrendService) exposureRadarEnglish(query dto.ExposureRadarQuery, now time.Time) (*dto.ExposureRadarResponse, error) {
	if s != nil && s.exposure != nil {
		rows, err := s.exposure.List(repository.ExposureTweetSignalListQuery{
			Region:      "en",
			MaxFans:     query.MaxFans,
			HotMinViews: s.exposureHotThresholds().HotMinViews,
			ActiveAfter: now.Add(-time.Duration(query.Hours) * time.Hour),
			Limit:       query.Limit,
		})
		if err != nil {
			return nil, err
		}
		if len(rows) > 0 {
			items := make([]dto.ExposureRadarItem, 0, len(rows))
			for i := range rows {
				items = append(items, s.exposureTweetSignalToRadarItem(&rows[i]))
			}
			lastCollectedAt := latestExposureSignalSeenAt(rows)
			sourceStatus, freshnessSeconds := exposureSourceFreshness(lastCollectedAt, now, s.exposureRefreshInterval())
			return &dto.ExposureRadarResponse{
				Region:           "en",
				DataSource:       "OAF English tweet collector",
				DataQuality:      "tweet_level",
				SourceType:       "owned_collector",
				SourceStatus:     sourceStatus,
				UpdatedAt:        lastCollectedAt.UTC().Format(time.RFC3339),
				LastCollectedAt:  lastCollectedAt.UTC().Format(time.RFC3339),
				FreshnessSeconds: freshnessSeconds,
				Filters:          query,
				Items:            items,
				SourceNotice:     "English-region items are collected by OAF from X recent search using configured trend topics. View velocity is computed from repeated snapshots when available; otherwise heat is based on public metrics.",
			}, nil
		}
	}
	if s == nil || s.repo == nil {
		return &dto.ExposureRadarResponse{
			Region:       "en",
			DataSource:   "X Trends cache",
			DataQuality:  "topic_level",
			SourceType:   "x_trends_cache",
			SourceStatus: "empty",
			Filters:      query,
			Items:        []dto.ExposureRadarItem{},
			SourceNotice: "English-region radar currently uses topic-level X Trends cache. Tweet-level velocity capture can replace this source without changing the UI.",
		}, nil
	}
	rows, err := s.repo.List(repository.TrendTopicListQuery{WOEID: "23424977", ActiveAt: now, Limit: query.Limit})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		rows, err = s.repo.List(repository.TrendTopicListQuery{WOEID: "1", ActiveAt: now, Limit: query.Limit})
		if err != nil {
			return nil, err
		}
	}
	items := make([]dto.ExposureRadarItem, 0, len(rows))
	lastTopicFetchedAt := time.Time{}
	for _, row := range rows {
		if row.FetchedAt.After(lastTopicFetchedAt) {
			lastTopicFetchedAt = row.FetchedAt
		}
		score := 50
		if row.TweetCount > 0 {
			score = radarMinInt(95, 55+int(math.Log10(float64(row.TweetCount))*12))
		}
		risk := strings.TrimSpace(row.RiskLevel)
		if risk == "" {
			risk = "low"
		}
		name := strings.TrimSpace(row.TrendName)
		items = append(items, dto.ExposureRadarItem{
			ID:               fmt.Sprintf("en-trend-%d", row.ID),
			Region:           "en",
			DataSource:       "X Trends cache",
			DataQuality:      "topic_level",
			DataConfidence:   exposureConfidenceTopic,
			ConfidenceReason: "This is a topic-level X Trends signal, not a specific post. Open live search before writing.",
			Title:            name,
			Content:          "Topic-level signal from X Trends. Use it to decide what to monitor, then inspect live posts before replying.",
			URL:              "https://x.com/search?q=" + url.QueryEscape(name) + "&src=typed_query&f=live",
			Status:           "rising",
			SignalLabel:      "Topic trend",
			TopicName:        name,
			HeatCount:        row.TweetCount,
			Score:            score,
			RiskLevel:        risk,
			OpportunityTier:  exposureTopicLeadTier,
			TierReason:       "topic-level trend lead; no tweet-level velocity is available yet",
			QualityStage:     exposureQualityWatch,
			QualityReason:    "Topic-level signal; watch live search before deciding whether a specific post is worth a manual reply.",
			OpportunityType:  "monitor",
			RecommendedUse:   "Open live search, find low-follower breakout posts, then route suitable replies into review.",
			Reason:           "English radar is currently topic-level. It identifies where to look; tweet-level velocity should be confirmed before action.",
			Guardrails:       exposureGuardrails(risk),
			UpdatedAt:        row.FetchedAt.UTC().Format(time.RFC3339),
		})
	}
	updatedAt := now.Format(time.RFC3339)
	if !lastTopicFetchedAt.IsZero() {
		updatedAt = lastTopicFetchedAt.UTC().Format(time.RFC3339)
	}
	return &dto.ExposureRadarResponse{
		Region:          "en",
		DataSource:      "X Trends cache",
		DataQuality:     "topic_level",
		SourceType:      "x_trends_cache",
		SourceStatus:    "cache",
		UpdatedAt:       updatedAt,
		LastCollectedAt: updatedAt,
		Filters:         query,
		Items:           items,
		SourceNotice:    "English-region radar currently uses topic-level X Trends cache. It is free-plan accessible, but tweet-level velocity capture is the next data upgrade.",
	}, nil
}

func (s *TrendService) annotateExposureRadarReviewState(userID uint, resp *dto.ExposureRadarResponse) *dto.ExposureRadarResponse {
	if resp == nil || userID == 0 || s == nil || s.commentRepo == nil || len(resp.Items) == 0 {
		return resp
	}
	tweetIDs := make([]string, 0, len(resp.Items))
	itemTweetIDs := make([]string, len(resp.Items))
	for i, item := range resp.Items {
		tweetID := exposureRadarTweetID(item)
		itemTweetIDs[i] = tweetID
		if tweetID != "" {
			tweetIDs = append(tweetIDs, tweetID)
		}
	}
	rows, err := s.commentRepo.ListLatestByUserAndTweetIDs(userID, tweetIDs)
	if err != nil || len(rows) == 0 {
		if err != nil {
			zap.L().Warn("exposure radar review state lookup failed", zap.Uint("user_id", userID), zap.Error(err))
		}
		return resp
	}
	byTweet := map[string]model.AutoCommentTask{}
	for _, row := range rows {
		tweetID := strings.TrimSpace(row.TargetTweetID)
		if tweetID != "" {
			byTweet[tweetID] = row
		}
	}
	for i := range resp.Items {
		row, ok := byTweet[itemTweetIDs[i]]
		if !ok {
			continue
		}
		resp.Items[i].ReviewTaskID = row.ID
		resp.Items[i].ReviewStatus = row.Status
		resp.Items[i].ReviewQueueURL = fmt.Sprintf("/execution-queue?type=comment&status=%s&focus_type=comment&focus_source_id=%d", url.QueryEscape(reviewQueueRadarStatus(row.Status)), row.ID)
		resp.Items[i].GeneratedComment = row.GeneratedComment
		resp.Items[i].ManualActionURL = firstNonEmpty(row.ManualActionURL, autoCommentManualActionURL(row.TargetUsername, row.TargetTweetID))
		resp.Items[i].CommentTweetID = row.CommentTweetID
		resp.Items[i].CommentURL = autoCommentCommentURL(row.CommentTweetID)
	}
	return resp
}

func (s *TrendService) annotateExposureRadarMemoryState(userID uint, query dto.ExposureRadarQuery, resp *dto.ExposureRadarResponse) *dto.ExposureRadarResponse {
	if resp == nil || userID == 0 || s == nil || s.contentRepo == nil || len(resp.Items) == 0 {
		return resp
	}
	sourceURLs := make([]string, 0, len(resp.Items))
	itemURLs := make([]string, len(resp.Items))
	for i, item := range resp.Items {
		sourceURL := strings.TrimSpace(item.URL)
		itemURLs[i] = sourceURL
		if sourceURL != "" {
			sourceURLs = append(sourceURLs, sourceURL)
		}
	}
	rows, err := s.contentRepo.ListExposureRadarMemoryBySourceURLs(userID, query.XAccountID, query.BotID, sourceURLs)
	if err != nil || len(rows) == 0 {
		if err != nil {
			zap.L().Warn("exposure radar memory state lookup failed", zap.Uint("user_id", userID), zap.Error(err))
		}
		return resp
	}
	byURL := map[string]uint{}
	for _, row := range rows {
		sourceURL := strings.TrimSpace(row.SourceURL)
		if sourceURL != "" && byURL[sourceURL] == 0 {
			byURL[sourceURL] = row.ID
		}
	}
	for i := range resp.Items {
		if id := byURL[itemURLs[i]]; id > 0 {
			resp.Items[i].SavedMemoryID = id
		}
	}
	return resp
}

func (s *TrendService) applyExposureRadarPerformanceRanking(userID uint, query dto.ExposureRadarQuery, resp *dto.ExposureRadarResponse, now time.Time) *dto.ExposureRadarResponse {
	if resp != nil {
		resp.LearningControls = s.exposureRadarLearningControls(query.BotID, query.XAccountID, "no_memory")
		resp = s.applyExposureRadarAccountFit(userID, query, resp)
	}
	if resp == nil || userID == 0 || s == nil || len(resp.Items) == 0 {
		return sortExposureRadarItemsByQuality(resp)
	}
	if !s.exposureLearningRankingEnabled() {
		resp.LearningControls = s.exposureRadarLearningControls(query.BotID, query.XAccountID, "disabled")
		return sortExposureRadarItemsByQuality(resp)
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	windowStart := now.AddDate(0, 0, -s.exposureLearningWindowDays())
	scope := repository.ExposureRadarTaskScope{
		UserID:     userID,
		Region:     resp.Region,
		BotID:      query.BotID,
		XAccountID: query.XAccountID,
		Since:      windowStart,
	}
	mode := s.exposureLearningMode()
	if mode == "scoped" && query.BotID == 0 && query.XAccountID == 0 {
		resp.LearningControls = s.exposureRadarLearningControls(query.BotID, query.XAccountID, "no_memory")
		return sortExposureRadarItemsByQuality(resp)
	}
	if mode == "workspace" {
		scope.BotID = 0
		scope.XAccountID = 0
	}
	perf := map[string]exposureRadarTopicPerformance{}
	if s.commentRepo != nil {
		rows, err := s.commentRepo.ExposureRadarTopicPerformanceByRegionSince(scope)
		if err != nil {
			zap.L().Warn("exposure radar performance ranking lookup failed", zap.Uint("user_id", userID), zap.String("region", resp.Region), zap.Error(err))
		} else {
			perf = exposureRadarTopicPerformanceMap(rows)
		}
	}
	outcomes := s.exposureRadarOutcomePerformanceMap(userID, scope, windowStart)
	scopeLabel := "selected Bot/account"
	rankingScope := "selected_bot_account"
	if mode == "workspace" || (query.BotID == 0 && query.XAccountID == 0) {
		scopeLabel = "workspace"
		rankingScope = "workspace"
	}
	if len(perf) == 0 && len(outcomes) == 0 && mode == "hybrid" && (query.BotID > 0 || query.XAccountID > 0) {
		scope.BotID = 0
		scope.XAccountID = 0
		if s.commentRepo != nil {
			rows, err := s.commentRepo.ExposureRadarTopicPerformanceByRegionSince(scope)
			if err != nil {
				zap.L().Warn("exposure radar fallback ranking lookup failed", zap.Uint("user_id", userID), zap.String("region", resp.Region), zap.Error(err))
			} else {
				perf = exposureRadarTopicPerformanceMap(rows)
			}
		}
		outcomes = s.exposureRadarOutcomePerformanceMap(userID, scope, windowStart)
		scopeLabel = "workspace"
		rankingScope = "workspace"
	}
	if len(perf) == 0 && len(outcomes) == 0 {
		resp.LearningControls = s.exposureRadarLearningControls(query.BotID, query.XAccountID, "no_memory")
		return sortExposureRadarItemsByQuality(resp)
	}
	resp.LearningControls = s.exposureRadarLearningControls(query.BotID, query.XAccountID, rankingScope)
	for i := range resp.Items {
		totalDelta := 0
		reasons := []string{}
		topic := exposureRadarItemTopic(resp.Items[i])
		key := exposureRadarTopicKey(resp.Items[i].Region, topic)
		if stat, ok := perf[key]; ok {
			delta := exposureRadarRankingDelta(stat.Positive, stat.Rejected)
			if delta != 0 {
				totalDelta += delta
			}
			if reason := exposureRadarRankingReason(stat.Positive, stat.Rejected, scopeLabel); reason != "" {
				reasons = append(reasons, reason)
			}
		}
		outcomeStat := exposureRadarOutcomeStatsForItem(outcomes, resp.Items[i])
		if !exposureRadarOutcomePerformanceEmpty(outcomeStat) {
			delta := exposureRadarOutcomeRankingDelta(outcomeStat)
			if delta != 0 {
				totalDelta += delta
			}
			if reason := exposureRadarOutcomeRankingReason(outcomeStat, scopeLabel); reason != "" {
				reasons = append(reasons, reason)
			}
			if outcomeStat.NotSuitable > 0 {
				resp.Items[i].RecommendedUse = exposureRadarConservativeRecommendedUse(resp.Items[i].RecommendedUse)
			}
		}
		totalDelta = radarMaxInt(-16, radarMinInt(16, totalDelta))
		if totalDelta != 0 {
			resp.Items[i].Score = radarMaxInt(0, radarMinInt(100, resp.Items[i].Score+totalDelta))
			resp.Items[i].RankingDelta = totalDelta
		}
		if reason := exposureRadarJoinRankingReasons(reasons...); reason != "" {
			resp.Items[i].RankingReason = reason
		}
	}
	return sortExposureRadarItemsByQuality(resp)
}

func (s *TrendService) applyExposureRadarAccountFit(userID uint, query dto.ExposureRadarQuery, resp *dto.ExposureRadarResponse) *dto.ExposureRadarResponse {
	if resp == nil || userID == 0 || s == nil || s.botRepo == nil || len(resp.Items) == 0 {
		return resp
	}
	bot, err := s.exposureRadarFitBot(userID, query)
	if err != nil || bot == nil {
		return resp
	}
	profile := exposureRadarFitProfileFromBot(*bot)
	if len(profile.Keywords) == 0 && len(profile.AvoidKeywords) == 0 {
		return resp
	}
	for i := range resp.Items {
		score, label, reason, matched := exposureRadarAccountFit(resp.Items[i], profile)
		if score <= 0 {
			continue
		}
		resp.Items[i].AccountFitScore = score
		resp.Items[i].AccountFitLabel = label
		resp.Items[i].AccountFitReason = reason
		resp.Items[i].AccountFitKeywords = matched
		delta := exposureRadarAccountFitDelta(label)
		if delta != 0 {
			resp.Items[i].Score = radarMaxInt(0, radarMinInt(100, resp.Items[i].Score+delta))
			resp.Items[i].RankingDelta += delta
		}
		if reason != "" {
			resp.Items[i].RankingReason = exposureRadarJoinRankingReasons(resp.Items[i].RankingReason, reason)
		}
		if label == "avoid" {
			resp.Items[i].RecommendedUse = exposureRadarConservativeRecommendedUse(resp.Items[i].RecommendedUse)
		}
	}
	return resp
}

func (s *TrendService) exposureRadarFitBot(userID uint, query dto.ExposureRadarQuery) (*model.OAFBot, error) {
	if query.BotID > 0 {
		return s.botRepo.GetByUserAndID(userID, query.BotID)
	}
	if query.XAccountID > 0 {
		return s.botRepo.GetByUserAndTwitterAccountID(userID, query.XAccountID)
	}
	return nil, nil
}

type exposureRadarFitProfile struct {
	Keywords      []string
	AvoidKeywords []string
}

func exposureRadarFitProfileFromBot(bot model.OAFBot) exposureRadarFitProfile {
	keywords := []string{}
	keywords = append(keywords, decodeStringList(bot.Topics)...)
	keywords = append(keywords, decodeStringList(bot.Keywords)...)
	keywords = append(keywords, decodeStringList(bot.ContentPillars)...)
	keywords = append(keywords, bot.Industry, bot.ProjectOneLiner, bot.TargetAudience)
	avoid := []string{}
	avoid = append(avoid, decodeStringList(bot.ForbiddenTopics)...)
	avoid = append(avoid, decodeStringList(bot.AvoidClaims)...)
	return exposureRadarFitProfile{
		Keywords:      exposureRadarFitTerms(keywords, 16),
		AvoidKeywords: exposureRadarFitTerms(avoid, 12),
	}
}

func exposureRadarAccountFit(item dto.ExposureRadarItem, profile exposureRadarFitProfile) (int, string, string, []string) {
	text := strings.ToLower(strings.Join([]string{item.Title, item.TopicName, item.Content, item.AuthorName, item.AuthorHandle}, " "))
	matched := []string{}
	avoidMatched := []string{}
	for _, term := range profile.Keywords {
		if term != "" && strings.Contains(text, strings.ToLower(term)) {
			matched = append(matched, term)
		}
	}
	for _, term := range profile.AvoidKeywords {
		if term != "" && strings.Contains(text, strings.ToLower(term)) {
			avoidMatched = append(avoidMatched, term)
		}
	}
	score := 45 + radarMinInt(35, len(matched)*12) - radarMinInt(40, len(avoidMatched)*18)
	if item.RiskLevel == "high" {
		score -= 18
	} else if item.RiskLevel == "medium" {
		score -= 8
	}
	score = radarMaxInt(5, radarMinInt(95, score))
	label := "weak"
	switch {
	case len(avoidMatched) > 0 || score < 30:
		label = "avoid"
	case score >= 74:
		label = "strong"
	case score >= 56:
		label = "good"
	}
	reason := ""
	switch label {
	case "strong":
		reason = "Account fit boost: this signal matches the selected Bot/account positioning."
	case "good":
		reason = "Account fit signal: there is some overlap with the selected Bot/account positioning."
	case "avoid":
		reason = "Account fit penalty: this signal touches avoided topics or has weak persona fit."
	default:
		reason = "Account fit weak: inspect manually before spending reply effort."
	}
	return score, label, reason, compactAccountStrings(matched, 4)
}

func exposureRadarAccountFitDelta(label string) int {
	switch label {
	case "strong":
		return 8
	case "good":
		return 4
	case "avoid":
		return -10
	default:
		return -2
	}
}

func exposureRadarFitTerms(values []string, limit int) []string {
	terms := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		for _, token := range accountTokens(value) {
			token = strings.Trim(strings.ToLower(token), "#@")
			if token == "" || accountStopWords[token] || len([]rune(token)) < 2 || seen[token] {
				continue
			}
			seen[token] = true
			terms = append(terms, token)
			if limit > 0 && len(terms) >= limit {
				return terms
			}
		}
	}
	return terms
}

func sortExposureRadarItemsByQuality(resp *dto.ExposureRadarResponse) *dto.ExposureRadarResponse {
	if resp == nil || len(resp.Items) == 0 {
		return resp
	}
	sort.SliceStable(resp.Items, func(i, j int) bool {
		leftStage := exposureQualityStageRank(resp.Items[i].QualityStage)
		rightStage := exposureQualityStageRank(resp.Items[j].QualityStage)
		if leftStage != rightStage {
			return leftStage > rightStage
		}
		if resp.Items[i].Score != resp.Items[j].Score {
			return resp.Items[i].Score > resp.Items[j].Score
		}
		if resp.Items[i].ViewsPerMin != resp.Items[j].ViewsPerMin {
			return resp.Items[i].ViewsPerMin > resp.Items[j].ViewsPerMin
		}
		if resp.Items[i].HeatCount != resp.Items[j].HeatCount {
			return resp.Items[i].HeatCount > resp.Items[j].HeatCount
		}
		return resp.Items[i].ID < resp.Items[j].ID
	})
	return resp
}

func (s *TrendService) withExposureRadarDiagnostics(resp *dto.ExposureRadarResponse, query dto.ExposureRadarQuery, now time.Time) *dto.ExposureRadarResponse {
	if resp == nil {
		return resp
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	region := normalizeExposureRegion(resp.Region)
	if region == "" {
		region = normalizeExposureRegion(query.Region)
	}
	if region == "" {
		region = "zh"
	}
	windowHours := query.Hours
	if windowHours <= 0 {
		windowHours = 4
	}
	maxFans := query.MaxFans
	if maxFans <= 0 {
		maxFans = 10000
	}
	activeAfter := now.Add(-time.Duration(windowHours) * time.Hour)
	thresholds := s.exposureHotThresholds()
	diag := dto.ExposureRadarDiagnostics{
		Status:                 "healthy",
		Region:                 region,
		SourceType:             resp.SourceType,
		SourceStatus:           resp.SourceStatus,
		XTrendsEnabled:         s != nil && s.cfg.Enabled,
		BearerTokenConfigured:  s != nil && strings.TrimSpace(s.cfg.BearerToken) != "",
		RefreshIntervalMinutes: int(s.exposureRefreshInterval().Minutes()),
		TopicLimit:             s.englishExposureTopicLimit(),
		SearchResults:          s.englishExposureSearchResults(),
		ConfiguredMaxFans:      maxFans,
		ConfiguredMinHeat:      int(s.englishExposureMinHeat()),
		ConfiguredHotMinViews:  thresholds.HotMinViews,
		ConfiguredHotVelocity:  thresholds.HotMinVelocity,
		ConfiguredStrongViews:  thresholds.StrongMinViews,
		ConfiguredStrongSpeed:  thresholds.StrongMinVelocity,
		WindowHours:            windowHours,
		RequestedLimit:         query.Limit,
		ReturnedCount:          len(resp.Items),
		FreshnessSeconds:       resp.FreshnessSeconds,
		Issues:                 []dto.ExposureRadarDiagnosticIssue{},
		Suggestions:            []string{},
	}
	if diag.RequestedLimit <= 0 {
		diag.RequestedLimit = 50
	}
	for _, item := range resp.Items {
		if item.ImpressionCount > diag.MaxImpressionCount {
			diag.MaxImpressionCount = item.ImpressionCount
		}
		if item.ViewsPerMin > diag.MaxViewsPerMinute {
			diag.MaxViewsPerMinute = item.ViewsPerMin
		}
		switch strings.TrimSpace(item.DataQuality) {
		case "tweet_level":
			diag.TweetLevelCount++
		case "topic_level":
			diag.TopicLevelCount++
		}
		switch normalizeExposureOpportunityTierForDiagnostics(item.OpportunityTier) {
		case exposureHotOpportunityTier:
			diag.HotOpportunityCount++
		case exposureRisingSignalTier:
			diag.RisingOpportunityCount++
		case exposureSamplingTier:
			diag.NeedsSamplingCount++
		case exposureTopicLeadTier:
			diag.TopicLeadCount++
		}
		switch strings.TrimSpace(item.DataConfidence) {
		case exposureConfidenceRealImpressions:
			diag.RealImpressionCount++
		case exposureConfidenceFirstSample:
			diag.FirstSampleCount++
		}
		if item.Score >= 75 {
			diag.HighScoreCount++
		}
	}
	if s != nil && s.exposure != nil {
		stats, err := s.exposure.DiagnosticStats(region, activeAfter, maxFans, thresholds.HotMinViews, thresholds.HotMinVelocity)
		if err != nil {
			zap.L().Warn("exposure radar diagnostic stats failed", zap.String("region", region), zap.Error(err))
			diag.Issues = append(diag.Issues, exposureDiagnosticIssue("diagnostic_query_failed", "warning", "Could not load stored collector diagnostics. The opportunity list still reflects the current query."))
		} else {
			diag.OwnedSignalCount = stats.TotalCount
			diag.OwnedInWindowCount = stats.InWindowCount
			diag.OwnedUnderFanLimit = stats.UnderFanLimitCount
			diag.OwnedOverFanLimit = stats.OverFanLimitCount
			if stats.VisiblePoolCount > 0 {
				diag.VisiblePoolCount = stats.VisiblePoolCount
			}
			if stats.WindowRealViewCount > 0 {
				diag.WindowRealViewCount = stats.WindowRealViewCount
			}
			if stats.WindowPriorSamples > 0 {
				diag.WindowPriorSampleCount = stats.WindowPriorSamples
			}
			if stats.MaxImpressionCount > diag.MaxImpressionCount {
				diag.MaxImpressionCount = stats.MaxImpressionCount
			}
			if stats.MaxViewsPerMinute > diag.MaxViewsPerMinute {
				diag.MaxViewsPerMinute = stats.MaxViewsPerMinute
			}
			if !stats.LatestSeenAt.IsZero() {
				diag.LatestOwnedSignalAt = stats.LatestSeenAt.UTC().Format(time.RFC3339)
				if diag.FreshnessSeconds == 0 {
					diag.FreshnessSeconds = int64(now.Sub(stats.LatestSeenAt.UTC()).Seconds())
				}
			}
		}
	}
	finalizeExposureRadarHotGapDiagnostics(&diag)
	diag.Status = exposureRadarDiagnosticStatus(diag)
	diag.Issues = append(diag.Issues, exposureRadarDiagnosticIssues(diag)...)
	diag.Suggestions = exposureRadarDiagnosticSuggestions(diag)
	resp.Diagnostics = diag
	return resp
}

func finalizeExposureRadarHotGapDiagnostics(diag *dto.ExposureRadarDiagnostics) {
	if diag == nil {
		return
	}
	if diag.VisiblePoolCount == 0 && diag.TweetLevelCount > 0 {
		diag.VisiblePoolCount = int64(diag.TweetLevelCount)
	}
	if diag.WindowRealViewCount == 0 && diag.RealImpressionCount > 0 {
		diag.WindowRealViewCount = int64(diag.RealImpressionCount)
	}
	if diag.WindowPriorSampleCount == 0 && diag.TweetLevelCount > diag.FirstSampleCount {
		diag.WindowPriorSampleCount = int64(diag.TweetLevelCount - diag.FirstSampleCount)
	}
	if diag.ConfiguredHotMinViews > diag.MaxImpressionCount {
		diag.HotViewsGap = diag.ConfiguredHotMinViews - diag.MaxImpressionCount
	}
	if diag.ConfiguredHotVelocity > diag.MaxViewsPerMinute {
		diag.HotVelocityGap = diag.ConfiguredHotVelocity - diag.MaxViewsPerMinute
	}
	diag.RealViewCoverage = exposureRatio(diag.WindowRealViewCount, diag.VisiblePoolCount)
	diag.SamplingCoverage = exposureRatio(diag.WindowPriorSampleCount, diag.VisiblePoolCount)
	diag.TopMissingReason, diag.TopMissingDetail = exposureRadarTopMissingReason(*diag)
}

func exposureRatio(part, total int64) float64 {
	if part <= 0 || total <= 0 {
		return 0
	}
	value := float64(part) / float64(total)
	if value > 1 {
		return 1
	}
	return value
}

func exposureMaxInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}

func exposureRadarTopMissingReason(diag dto.ExposureRadarDiagnostics) (string, string) {
	if diag.HotOpportunityCount > 0 {
		return "none", "Hot opportunities are already visible in the current window."
	}
	if !diag.XTrendsEnabled || !diag.BearerTokenConfigured {
		return "x_config_blocked", "X Recent Search collection is not fully configured."
	}
	if diag.OwnedSignalCount == 0 {
		return "no_owned_signals", "No owned tweet-level signals have been collected for this region yet."
	}
	if diag.OwnedInWindowCount == 0 {
		return "window_too_short", fmt.Sprintf("Owned signals exist, but none are inside the last %dh window.", diag.WindowHours)
	}
	if diag.VisiblePoolCount == 0 && diag.OwnedOverFanLimit > 0 {
		return "fan_filter_strict", fmt.Sprintf("Stored signals are outside the current <=%s follower filter.", compactCount(diag.ConfiguredMaxFans))
	}
	if diag.VisiblePoolCount > 0 && diag.VisiblePoolCount < int64(exposureMaxInt(3, diag.RequestedLimit/4)) {
		return "query_low_yield", fmt.Sprintf("Only %d visible candidates are in this window, so the topic/query pool may be too narrow.", diag.VisiblePoolCount)
	}
	if diag.VisiblePoolCount > 0 && diag.RealViewCoverage < 0.35 {
		return "x_impressions_sparse", fmt.Sprintf("Only %d/%d visible candidates have real X view counts.", diag.WindowRealViewCount, diag.VisiblePoolCount)
	}
	if diag.VisiblePoolCount > 0 && diag.SamplingCoverage < 0.35 {
		return "insufficient_resampling", fmt.Sprintf("Only %d/%d visible candidates have a prior sample for velocity.", diag.WindowPriorSampleCount, diag.VisiblePoolCount)
	}
	if diag.MaxImpressionCount < diag.ConfiguredHotMinViews {
		return "views_below_threshold", fmt.Sprintf("Best visible post has %s views, still %s below the hot threshold.", compactCount(diag.MaxImpressionCount), compactCount(diag.HotViewsGap))
	}
	if diag.MaxViewsPerMinute < diag.ConfiguredHotVelocity {
		return "velocity_below_threshold", fmt.Sprintf("Best visible velocity is %.1f/min, still %.1f/min below the hot threshold.", diag.MaxViewsPerMinute, diag.HotVelocityGap)
	}
	return "no_true_hot", "Visible candidates are close, but none satisfy both real views and velocity together."
}

func exposureRadarDiagnosticStatus(diag dto.ExposureRadarDiagnostics) string {
	if !diag.XTrendsEnabled || !diag.BearerTokenConfigured {
		return "blocked"
	}
	if diag.SourceType == "tl1_fallback" || diag.SourceType == "x_trends_cache" || diag.SourceStatus == "fallback" || diag.SourceStatus == "cache" {
		return "fallback"
	}
	if diag.SourceStatus == "stale" {
		return "stale"
	}
	if diag.ReturnedCount == 0 || (diag.OwnedSignalCount > 0 && diag.OwnedInWindowCount == 0) {
		return "empty"
	}
	if diag.HotOpportunityCount == 0 && diag.RisingOpportunityCount == 0 {
		return "limited"
	}
	if diag.HotOpportunityCount == 0 {
		return "warming"
	}
	return "healthy"
}

func exposureRadarDiagnosticIssues(diag dto.ExposureRadarDiagnostics) []dto.ExposureRadarDiagnosticIssue {
	issues := []dto.ExposureRadarDiagnosticIssue{}
	if !diag.XTrendsEnabled {
		issues = append(issues, exposureDiagnosticIssue("x_trends_disabled", "critical", "X trends and recent-search collection are disabled, so owned Exposure Radar signals cannot refresh."))
	}
	if !diag.BearerTokenConfigured {
		issues = append(issues, exposureDiagnosticIssue("bearer_token_missing", "critical", "The X bearer token is missing, so owned tweet collection cannot call Recent Search."))
	}
	if diag.SourceType == "tl1_fallback" {
		issues = append(issues, exposureDiagnosticIssue("external_fallback", "warning", "Chinese Radar is using external fallback data because owned Chinese tweet signals are unavailable for the current filters."))
	}
	if diag.SourceType == "x_trends_cache" {
		issues = append(issues, exposureDiagnosticIssue("topic_cache_only", "warning", "Radar is showing topic-level X Trends cache instead of tweet-level opportunities."))
	}
	if diag.SourceStatus == "stale" {
		issues = append(issues, exposureDiagnosticIssue("collector_stale", "warning", "The latest owned collector snapshot is older than the expected refresh window."))
	}
	if diag.OwnedSignalCount == 0 && diag.BearerTokenConfigured && diag.XTrendsEnabled {
		issues = append(issues, exposureDiagnosticIssue("no_owned_signals", "warning", "No owned tweet-level signals have been stored for this region yet."))
	}
	if diag.OwnedSignalCount > 0 && diag.OwnedInWindowCount == 0 {
		issues = append(issues, exposureDiagnosticIssue("window_too_short", "info", "Owned signals exist, but none are inside the selected time window."))
	}
	if diag.OwnedOverFanLimit > 0 && diag.OwnedUnderFanLimit == 0 {
		issues = append(issues, exposureDiagnosticIssue("fan_filter_strict", "info", "Stored signals exist, but the author follower filter removes them from this view."))
	}
	if diag.ReturnedCount > 0 && diag.TweetLevelCount > 0 && diag.HotOpportunityCount == 0 {
		issues = append(issues, exposureDiagnosticIssue("no_true_hot", "info", "Tweet-level signals are available, but none meet the hot-opportunity threshold of real impressions plus momentum."))
	}
	if diag.TweetLevelCount > 0 && diag.FirstSampleCount == diag.TweetLevelCount {
		issues = append(issues, exposureDiagnosticIssue("first_sample_only", "info", "All tweet-level signals are first snapshots, so velocity needs another collector pass before hot/rising labels become reliable."))
	}
	if diag.ReturnedCount == 0 && diag.OwnedSignalCount > 0 {
		issues = append(issues, exposureDiagnosticIssue("filters_empty", "info", "Owned signals exist, but the current window, follower, or limit filters return no visible cards."))
	}
	return issues
}

func exposureRadarDiagnosticSuggestions(diag dto.ExposureRadarDiagnostics) []string {
	suggestions := []string{}
	hasIssue := func(code string) bool {
		for _, issue := range diag.Issues {
			if issue.Code == code {
				return true
			}
		}
		return false
	}
	if hasIssue("x_trends_disabled") || hasIssue("bearer_token_missing") {
		suggestions = append(suggestions, "Check prod x_trends configuration and X_BEARER_TOKEN before judging Radar quality.")
	}
	if hasIssue("no_owned_signals") || hasIssue("collector_stale") || hasIssue("first_sample_only") {
		suggestions = append(suggestions, "Run the admin manual Exposure refresh once, then refresh this page after the collector finishes.")
	}
	if hasIssue("window_too_short") {
		suggestions = append(suggestions, "Increase the window from 1-2h to 4-8h to inspect whether collection is working.")
	}
	if hasIssue("fan_filter_strict") {
		suggestions = append(suggestions, "Raise the author follower filter temporarily to verify whether useful signals are being excluded.")
	}
	if hasIssue("topic_cache_only") || hasIssue("external_fallback") {
		suggestions = append(suggestions, "Treat these cards as research leads until owned tweet-level signals become fresh.")
	}
	if hasIssue("no_true_hot") {
		if reasonSuggestion := exposureRadarMissingReasonSuggestion(diag); reasonSuggestion != "" {
			suggestions = append(suggestions, reasonSuggestion)
		}
		suggestions = append(suggestions, fmt.Sprintf("Use Rising opportunities first; hot opportunities require at least %s real impressions plus %.0f/min velocity. Strong hot remains %s+ and %.0f/min.", compactCount(diag.ConfiguredHotMinViews), diag.ConfiguredHotVelocity, compactCount(diag.ConfiguredStrongViews), diag.ConfiguredStrongSpeed))
	}
	if len(suggestions) == 0 {
		suggestions = append(suggestions, "Collector health looks usable. Work from Priority opportunities first, then inspect Rising and Needs sampling cards.")
	}
	return compactExposureRadarStringList(suggestions)
}

func exposureRadarMissingReasonSuggestion(diag dto.ExposureRadarDiagnostics) string {
	switch diag.TopMissingReason {
	case "query_low_yield":
		return "Current topic/query yield is low; broaden Chinese seed topics or increase topic/search coverage before lowering hot thresholds."
	case "x_impressions_sparse":
		return "X returned sparse real-view data in this window; inspect Rising cards and wait for another refresh before treating this as a threshold issue."
	case "insufficient_resampling":
		return "Most candidates need a second sample; run another refresh after the interval so velocity labels become reliable."
	case "views_below_threshold":
		return fmt.Sprintf("Best visible views are %s below the hot threshold; lower the view threshold only if this gap stays consistent across multiple refreshes.", compactCount(diag.HotViewsGap))
	case "velocity_below_threshold":
		return fmt.Sprintf("Best visible speed is %.1f/min below the hot threshold; the candidates have views but not enough momentum yet.", diag.HotVelocityGap)
	}
	return ""
}

func exposureDiagnosticIssue(code, severity, message string) dto.ExposureRadarDiagnosticIssue {
	return dto.ExposureRadarDiagnosticIssue{Code: code, Severity: severity, Message: message}
}

func normalizeExposureOpportunityTierForDiagnostics(value string) string {
	switch strings.TrimSpace(value) {
	case exposureHotOpportunityTier:
		return exposureHotOpportunityTier
	case exposureRisingSignalTier, "rising_signal":
		return exposureRisingSignalTier
	case exposureTopicLeadTier:
		return exposureTopicLeadTier
	default:
		return exposureSamplingTier
	}
}

func exposureRadarTweetID(item dto.ExposureRadarItem) string {
	if strings.HasPrefix(item.ID, "zh-tweet-") {
		return strings.TrimPrefix(item.ID, "zh-tweet-")
	}
	if strings.HasPrefix(item.ID, "en-tweet-") {
		return strings.TrimPrefix(item.ID, "en-tweet-")
	}
	return extractTweetID(item.URL)
}

func reviewQueueRadarStatus(status string) string {
	status = strings.TrimSpace(status)
	if status == "" || status == "review" {
		return "pending_review"
	}
	if status == "handled" {
		return "all"
	}
	if status == "sent" {
		return "published"
	}
	return status
}

func (s *TrendService) RefreshEnglishExposureSignals(ctx context.Context, now time.Time) error {
	return s.refreshExposureSignals(ctx, "en", now, false)
}

func (s *TrendService) RefreshChineseExposureSignals(ctx context.Context, now time.Time) error {
	return s.refreshExposureSignals(ctx, "zh", now, false)
}

func (s *TrendService) ForceRefreshExposureSignals(ctx context.Context, region string, now time.Time) error {
	return s.refreshExposureSignals(ctx, region, now, true)
}

func (s *TrendService) refreshExposureSignals(ctx context.Context, region string, now time.Time, force bool) error {
	if s == nil || s.repo == nil || s.exposure == nil {
		return nil
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if !s.cfg.Enabled || strings.TrimSpace(s.cfg.BearerToken) == "" {
		return nil
	}
	region = normalizeExposureRegion(region)
	if region == "" {
		region = "en"
	}
	if !force {
		if latest, err := s.exposure.LatestSeenAt(region); err != nil {
			return err
		} else if latest != nil {
			interval := time.Duration(s.cfg.ExposureRefreshMinutes) * time.Minute
			if interval <= 0 {
				interval = 15 * time.Minute
			}
			if now.Sub(latest.UTC()) < interval {
				return nil
			}
		}
	}
	resampledIDs, resampled, err := s.refreshExistingExposureSignals(ctx, region, now)
	if err != nil {
		zap.L().Warn("exposure resample lookup failed", zap.String("region", region), zap.Error(err))
	}
	rows, err := s.exposureTopics(region, now)
	if err != nil {
		return err
	}
	for _, topic := range rows {
		name := strings.TrimSpace(topic.TrendName)
		if name == "" || topic.RiskLevel == "high" {
			continue
		}
		query := buildRecentSearchQuery(name, region)
		tweets, err := twitter.SearchRecentTweets(ctx, s.cfg.BearerToken, query, s.englishExposureSearchResults())
		status := "success"
		if err != nil {
			status = "failed"
		}
		s.recordXAPICall("recent_search", "exposure_refresh", 1, now, map[string]any{
			"region": region,
			"topic":  name,
			"query":  query,
			"status": status,
		})
		if err != nil {
			zap.L().Warn("exposure recent search failed", zap.String("region", region), zap.String("topic", name), zap.Error(err))
			continue
		}
		selected := selectExposureTweetCandidates(tweets, now, s.exposureCandidateKeepLimit(), s.exposureHotThresholds())
		upserted := 0
		for _, tweet := range selected {
			if resampledIDs[strings.TrimSpace(tweet.ID)] {
				continue
			}
			row, ok := s.tweetSearchToExposureSignal(tweet, region, name, query, now)
			if !ok {
				continue
			}
			if err := s.exposure.UpsertSignal(row, now); err != nil {
				return err
			}
			upserted++
		}
		zap.L().Debug("exposure topic scanned", zap.String("region", region), zap.String("topic", name), zap.Int("candidates", len(tweets)), zap.Int("selected", len(selected)), zap.Int("upserted", upserted), zap.Int("resampled_before_scan", resampled))
	}
	return nil
}

func (s *TrendService) refreshExistingExposureSignals(ctx context.Context, region string, now time.Time) (map[string]bool, int, error) {
	resampledIDs := map[string]bool{}
	if s == nil || s.exposure == nil {
		return resampledIDs, 0, nil
	}
	if normalizeExposureRegion(region) != "zh" {
		return resampledIDs, 0, nil
	}
	rows, err := s.exposure.ListResampleCandidates(repository.ExposureTweetSignalResampleQuery{
		Region:      region,
		MaxFans:     s.englishExposureMaxFans(),
		HotMinViews: s.exposureHotThresholds().HotMinViews,
		ActiveAfter: now.Add(-s.exposureResampleWindow(region)),
		Limit:       s.exposureResampleLimit(region),
	})
	if err != nil || len(rows) == 0 {
		return resampledIDs, 0, err
	}
	ids := make([]string, 0, len(rows))
	existingByID := map[string]model.ExposureTweetSignal{}
	for _, row := range rows {
		id := strings.TrimSpace(row.TweetID)
		if id == "" {
			continue
		}
		ids = append(ids, id)
		existingByID[id] = row
	}
	if len(ids) == 0 {
		return resampledIDs, 0, nil
	}
	tweets, err := twitter.LookupTweetsByIDs(ctx, s.cfg.BearerToken, ids)
	status := "success"
	if err != nil {
		status = "failed"
	}
	s.recordXAPICall("tweet_lookup", "exposure_refresh", 1, now, map[string]any{
		"region":   region,
		"id_count": len(ids),
		"status":   status,
	})
	if err != nil {
		return resampledIDs, 0, err
	}
	upserted := 0
	for _, tweet := range tweets {
		existing := existingByID[strings.TrimSpace(tweet.ID)]
		topicName := strings.TrimSpace(existing.TopicName)
		sourceQuery := strings.TrimSpace(existing.SourceQuery)
		if sourceQuery == "" && topicName != "" {
			sourceQuery = buildRecentSearchQuery(topicName, region)
		}
		row, ok := s.tweetSearchToExposureSignal(tweet, region, topicName, sourceQuery, now)
		if !ok {
			continue
		}
		row.Source = radarFirstNonEmpty(existing.Source, "x_tweet_lookup")
		if err := s.exposure.UpsertSignal(row, now); err != nil {
			return resampledIDs, upserted, err
		}
		resampledIDs[strings.TrimSpace(tweet.ID)] = true
		upserted++
	}
	zap.L().Debug("exposure existing signals resampled", zap.String("region", region), zap.Int("candidates", len(rows)), zap.Int("looked_up", len(tweets)), zap.Int("upserted", upserted))
	return resampledIDs, upserted, nil
}

func (s *TrendService) englishExposureTopics(now time.Time) ([]model.TrendTopic, error) {
	return s.exposureTopics("en", now)
}

func (s *TrendService) exposureTopics(region string, now time.Time) ([]model.TrendTopic, error) {
	region = normalizeExposureRegion(region)
	topicLimit := s.englishExposureTopicLimit()
	regions := s.cfg.Regions
	if len(regions) == 0 {
		regions = []config.XTrendsRegionConfig{{WOEID: "1", Name: "Worldwide"}, {WOEID: "23424977", Name: "United States"}}
	}
	seen := map[string]bool{}
	out := make([]model.TrendTopic, 0, topicLimit)
	if s.exposureLearningCollectorEnabled() {
		for _, row := range s.exposureReviewMemoryTopics(region, now, topicLimit) {
			key := normalizeTrendName(row.TrendName)
			if key == "" || seen[key] || row.RiskLevel == "high" {
				continue
			}
			seen[key] = true
			out = append(out, row)
			if len(out) >= topicLimit {
				return out, nil
			}
		}
	}
	for _, cfgRegion := range regions {
		woeid := strings.TrimSpace(cfgRegion.WOEID)
		if woeid == "" {
			continue
		}
		rows, err := s.repo.List(repository.TrendTopicListQuery{WOEID: woeid, ActiveAt: now, Limit: topicLimit})
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			if region == "zh" && row.LanguageHint != "zh" && !containsHan(row.TrendName) {
				continue
			}
			key := normalizeTrendName(row.TrendName)
			if key == "" || seen[key] || row.RiskLevel == "high" {
				continue
			}
			seen[key] = true
			out = append(out, row)
		}
	}
	if region == "zh" {
		for _, seed := range s.chineseExposureSeedTopics() {
			key := normalizeTrendName(seed)
			if key == "" || seen[key] {
				continue
			}
			seen[key] = true
			category, risk := classifyTrendTopic(seed)
			out = append(out, model.TrendTopic{
				TrendName:      seed,
				NormalizedName: key,
				WOEID:          "zh_recent_search",
				RegionName:     "Chinese recent search",
				Category:       category,
				RiskLevel:      risk,
				LanguageHint:   "zh",
				Source:         "oaf_seed",
				FetchedAt:      now,
			})
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].TweetCount != out[j].TweetCount {
			return out[i].TweetCount > out[j].TweetCount
		}
		return out[i].FetchedAt.After(out[j].FetchedAt)
	})
	if len(out) > topicLimit {
		out = out[:topicLimit]
	}
	return out, nil
}

func (s *TrendService) exposureReviewMemoryTopics(region string, now time.Time, topicLimit int) []model.TrendTopic {
	if s == nil || s.commentRepo == nil || topicLimit <= 0 {
		return nil
	}
	rows, err := s.commentRepo.ExposureRadarGlobalTopicPerformanceByRegionSince(region, now.AddDate(0, 0, -s.exposureLearningWindowDays()), topicLimit*3)
	if err != nil {
		zap.L().Warn("exposure review memory topics lookup failed", zap.String("region", region), zap.Error(err))
		return nil
	}
	out := make([]model.TrendTopic, 0, radarMinInt(topicLimit, len(rows)))
	seen := map[string]bool{}
	for _, row := range rows {
		topics := decodeStringList(row.TopicName)
		if len(topics) == 0 {
			topics = []string{row.TopicName}
		}
		for _, topic := range topics {
			topic = strings.TrimSpace(topic)
			key := normalizeTrendName(topic)
			if key == "" || seen[key] || isExposureRadarMetaKeyword(topic) {
				continue
			}
			category, risk := classifyTrendTopic(topic)
			if risk == "high" {
				continue
			}
			seen[key] = true
			out = append(out, model.TrendTopic{
				TrendName:      topic,
				NormalizedName: key,
				WOEID:          "review_memory",
				RegionName:     "Exposure Radar review memory",
				TweetCount:     row.Positive,
				Category:       category,
				RiskLevel:      risk,
				LanguageHint:   region,
				Source:         "exposure_review_memory",
				FetchedAt:      now,
			})
			if len(out) >= topicLimit {
				return out
			}
		}
	}
	return out
}

func (s *TrendService) tl1PostToExposureItem(row tl1PostItem) dto.ExposureRadarItem {
	status := strings.TrimSpace(row.Status)
	if status == "" {
		status = strings.ToLower(strings.TrimSpace(row.Heat))
	}
	score := int(math.Round(row.ViewsPerMin/3)) + 50
	if row.FollowersCount > 0 && row.FollowersCount <= 10000 {
		score += 12
	}
	if row.HotCount >= 3 {
		score += 8
	}
	if status == "fire" {
		score += 10
	}
	score = radarMaxInt(35, radarMinInt(99, score))
	risk := "low"
	if containsSensitiveRadarText(row.Content) {
		risk = "medium"
	}
	velocityState := tl1VelocityState(row.Status)
	dataConfidence, confidenceReason := exposureDataConfidence("tweet_level", row.CurrentStats.ViewCount, true)
	tier, tierReason := exposureOpportunityTier("tweet_level", row.CurrentStats.ViewCount, row.CurrentStats.ViewCount, row.ViewsPerMin, velocityState, true, s.exposureHotThresholds())
	cooling := strings.EqualFold(row.Status, "cooling") || strings.EqualFold(row.Status, "stopped")
	qualityStage, qualityReason := exposureQualityStage("tweet_level", tier, velocityState, risk, row.ViewsPerMin, score, cooling, time.Time{}, time.Now().UTC(), s.exposureHotThresholds())
	url := ""
	if row.TweetID != "" {
		handle := strings.TrimPrefix(strings.TrimSpace(row.AuthorHandle), "@")
		if handle != "" {
			url = "https://x.com/" + handle + "/status/" + row.TweetID
		} else {
			url = "https://x.com/i/web/status/" + row.TweetID
		}
	}
	return dto.ExposureRadarItem{
		ID:               "zh-tweet-" + row.TweetID,
		Region:           "zh",
		DataSource:       "External public trend feed",
		DataQuality:      "tweet_level",
		DataConfidence:   dataConfidence,
		ConfidenceReason: confidenceReason,
		Title:            radarFirstNonEmpty(row.DisplayName, row.AuthorHandle),
		AuthorHandle:     row.AuthorHandle,
		AuthorName:       row.DisplayName,
		TweetID:          row.TweetID,
		Content:          row.Content,
		URL:              url,
		Status:           status,
		SignalLabel:      radarFirstNonEmpty(row.Emoji+" "+row.Heat, status),
		TopicName:        "",
		ViewsPerMin:      row.ViewsPerMin,
		HeatCount:        row.CurrentStats.ViewCount,
		FollowersCount:   row.FollowersCount,
		LikeCount:        row.CurrentStats.LikeCount,
		ReplyCount:       row.CurrentStats.ReplyCount,
		RetweetCount:     row.CurrentStats.RetweetCount,
		ImpressionCount:  row.CurrentStats.ViewCount,
		HotCount:         row.HotCount,
		AgeLabel:         row.TweetAge,
		VelocityState:    velocityState,
		OpportunityTier:  tier,
		TierReason:       tierReason,
		QualityStage:     qualityStage,
		QualityReason:    qualityReason,
		Cooling:          cooling,
		VelocityHistory:  row.History,
		Score:            score,
		RiskLevel:        risk,
		OpportunityType:  "reply",
		RecommendedUse:   "Inspect the live thread, write a context-aware reply, and avoid forced promotion.",
		Reason:           "Low-follower or early-window posts with rising views can carry useful reply exposure when the reply is timely and relevant.",
		Guardrails:       exposureGuardrails(risk),
		UpdatedAt:        radarFirstNonEmpty(row.LastCheckTime, ""),
	}
}

func (s *TrendService) exposureTweetSignalToRadarItem(row *model.ExposureTweetSignal) dto.ExposureRadarItem {
	if row == nil {
		return dto.ExposureRadarItem{}
	}
	region := normalizeExposureRegion(row.Region)
	if region == "" {
		region = "en"
	}
	dataSource := "OAF English tweet collector"
	signalLabel := "OAF signal"
	reason := "This English post was collected from a live trend search and has public engagement or snapshot velocity that may be worth early review."
	if region == "zh" {
		dataSource = "OAF Chinese tweet collector"
		signalLabel = "OAF 中文信号"
		reason = "This Chinese post was collected from OAF's own Chinese recent-search path and is available for contextual reply review without relying on external fallback data."
	}
	url := ""
	if strings.TrimSpace(row.AuthorHandle) != "" && strings.TrimSpace(row.TweetID) != "" {
		url = "https://x.com/" + strings.TrimPrefix(row.AuthorHandle, "@") + "/status/" + row.TweetID
	} else if strings.TrimSpace(row.TweetID) != "" {
		url = "https://x.com/i/web/status/" + row.TweetID
	}
	score := 50
	if row.ViewsPerMinute > 0 {
		score += radarMinInt(30, int(math.Round(row.ViewsPerMinute/2)))
	}
	if row.FollowersCount > 0 && row.FollowersCount <= 10000 {
		score += 12
	}
	if row.CurrentCount > 0 {
		score += radarMinInt(12, int(math.Log10(float64(row.CurrentCount))*4))
	}
	score = radarMaxInt(35, radarMinInt(99, score))
	status := "rising"
	if row.ViewsPerMinute >= 50 {
		status = "fire"
	} else if row.ViewsPerMinute <= 0 {
		status = "observed"
	}
	velocityState := exposureVelocityState(row)
	hasPriorSample := row.PreviousCount > 0 || row.ViewsPerMinute > 0
	dataConfidence, confidenceReason := exposureDataConfidence("tweet_level", row.ImpressionCount, hasPriorSample)
	tier, tierReason := exposureOpportunityTier("tweet_level", row.CurrentCount, row.ImpressionCount, row.ViewsPerMinute, velocityState, hasPriorSample, s.exposureHotThresholds())
	qualityNow := row.LastSeenAt.UTC()
	if qualityNow.IsZero() {
		qualityNow = time.Now().UTC()
	}
	qualityStage, qualityReason := exposureQualityStage("tweet_level", tier, velocityState, radarFirstNonEmpty(row.RiskLevel, "low"), row.ViewsPerMinute, score, velocityState == "cooling", row.PublishedAt.UTC(), qualityNow, s.exposureHotThresholds())
	return dto.ExposureRadarItem{
		ID:               region + "-tweet-" + row.TweetID,
		Region:           region,
		DataSource:       dataSource,
		DataQuality:      "tweet_level",
		DataConfidence:   dataConfidence,
		ConfidenceReason: confidenceReason,
		Title:            radarFirstNonEmpty(row.AuthorName, row.AuthorHandle, row.TopicName),
		AuthorHandle:     row.AuthorHandle,
		AuthorName:       row.AuthorName,
		AuthorID:         row.AuthorID,
		TweetID:          row.TweetID,
		Content:          row.Content,
		URL:              url,
		Status:           status,
		SignalLabel:      signalLabel,
		TopicName:        row.TopicName,
		PublishedAt:      row.PublishedAt.UTC().Format(time.RFC3339),
		ViewsPerMin:      row.ViewsPerMinute,
		HeatCount:        row.CurrentCount,
		FollowersCount:   row.FollowersCount,
		LikeCount:        row.LikeCount,
		ReplyCount:       row.ReplyCount,
		RetweetCount:     row.RetweetCount,
		QuoteCount:       row.QuoteCount,
		BookmarkCount:    row.BookmarkCount,
		ImpressionCount:  row.ImpressionCount,
		AgeLabel:         ageLabel(row.PublishedAt, time.Now().UTC()),
		VelocityState:    velocityState,
		OpportunityTier:  tier,
		TierReason:       tierReason,
		QualityStage:     qualityStage,
		QualityReason:    qualityReason,
		Cooling:          velocityState == "cooling",
		VelocityHistory:  exposureVelocityHistory(row),
		Score:            score,
		RiskLevel:        radarFirstNonEmpty(row.RiskLevel, "low"),
		OpportunityType:  "reply",
		RecommendedUse:   "Inspect the live thread, check persona fit, then write or generate a contextual reply for review.",
		Reason:           reason,
		Guardrails:       exposureGuardrails(row.RiskLevel),
		UpdatedAt:        row.LastSeenAt.UTC().Format(time.RFC3339),
	}
}

func (s *TrendService) tweetSearchToExposureSignal(tweet twitter.TweetSearchItem, region, topicName, sourceQuery string, now time.Time) (*model.ExposureTweetSignal, bool) {
	region = normalizeExposureRegion(region)
	if region == "" {
		region = "en"
	}
	current := englishTweetHeat(tweet)
	if strings.TrimSpace(tweet.ID) == "" || strings.TrimSpace(tweet.Text) == "" {
		return nil, false
	}
	if containsSensitiveRadarText(tweet.Text) {
		return nil, false
	}
	if !tweet.CreatedAt.IsZero() && now.Sub(tweet.CreatedAt) > 24*time.Hour {
		return nil, false
	}
	if maxFans := s.englishExposureMaxFans(); maxFans > 0 && tweet.FollowersCount > maxFans {
		return nil, false
	}
	if minHeat := s.englishExposureMinHeat(); current < minHeat {
		return nil, false
	}
	risk := "low"
	return &model.ExposureTweetSignal{
		TweetID:         tweet.ID,
		Region:          region,
		Language:        region,
		Source:          "x_recent_search",
		SourceQuery:     sourceQuery,
		TopicName:       topicName,
		AuthorID:        tweet.AuthorID,
		AuthorHandle:    tweet.AuthorUsername,
		AuthorName:      tweet.AuthorName,
		FollowersCount:  tweet.FollowersCount,
		Content:         tweet.Text,
		PublishedAt:     tweet.CreatedAt,
		FirstSeenAt:     now,
		LastSeenAt:      now,
		CurrentCount:    current,
		LikeCount:       tweet.LikeCount,
		ReplyCount:      tweet.ReplyCount,
		RetweetCount:    tweet.RetweetCount,
		QuoteCount:      tweet.QuoteCount,
		BookmarkCount:   tweet.BookmarkCount,
		ImpressionCount: tweet.ImpressionCount,
		RiskLevel:       risk,
		RawPayload:      tweet.Raw,
	}, true
}

func exposureVelocityState(row *model.ExposureTweetSignal) string {
	if row == nil {
		return "unknown"
	}
	if row.PreviousCount <= 0 {
		return "new"
	}
	if row.CurrentCount < row.PreviousCount {
		return "cooling"
	}
	delta := row.CurrentCount - row.PreviousCount
	if row.ViewsPerMinute >= 50 || delta >= 500 {
		return "burst"
	}
	if row.ViewsPerMinute >= 5 || delta >= 50 {
		return "rising"
	}
	if delta == 0 || row.ViewsPerMinute <= 0.05 {
		return "cooling"
	}
	return "steady"
}

func exposureVelocityHistory(row *model.ExposureTweetSignal) []int64 {
	if row == nil {
		return nil
	}
	history := []int64{}
	if row.PreviousCount > 0 {
		history = append(history, row.PreviousCount)
	}
	if row.CurrentCount > 0 && (len(history) == 0 || history[len(history)-1] != row.CurrentCount) {
		history = append(history, row.CurrentCount)
	}
	return history
}

func exposureRadarBriefItem(rank int, item dto.ExposureRadarItem) dto.ExposureRadarBriefItem {
	topic := radarFirstNonEmpty(item.TopicName, item.Title)
	velocity := item.VelocityState
	if velocity == "" {
		velocity = tl1VelocityState(item.Status)
	}
	return dto.ExposureRadarBriefItem{
		Rank:             rank,
		SignalID:         item.ID,
		Region:           item.Region,
		DataSource:       item.DataSource,
		DataQuality:      item.DataQuality,
		TopicName:        item.TopicName,
		Title:            radarFirstNonEmpty(topic, "Untitled signal"),
		Summary:          exposureBriefSummaryText(item),
		Content:          item.Content,
		AuthorHandle:     item.AuthorHandle,
		AuthorName:       item.AuthorName,
		WhyItMatters:     exposureBriefWhyItMatters(item, velocity),
		SuggestedAction:  exposureBriefSuggestedAction(item, velocity),
		BestUse:          exposureBriefBestUse(item),
		Score:            item.Score,
		VelocityState:    velocity,
		QualityStage:     item.QualityStage,
		QualityReason:    item.QualityReason,
		RiskLevel:        radarFirstNonEmpty(item.RiskLevel, "low"),
		SourceURL:        item.URL,
		Guardrails:       item.Guardrails,
		ReviewTaskID:     item.ReviewTaskID,
		ReviewStatus:     item.ReviewStatus,
		ReviewQueueURL:   item.ReviewQueueURL,
		GeneratedComment: item.GeneratedComment,
		SavedMemoryID:    item.SavedMemoryID,
	}
}

func exposureBriefSummaryText(item dto.ExposureRadarItem) string {
	content := strings.TrimSpace(item.Content)
	if content == "" {
		return radarFirstNonEmpty(item.Reason, item.RecommendedUse, "A radar signal is available for operator review.")
	}
	content = strings.Join(strings.Fields(content), " ")
	if len([]rune(content)) > 180 {
		runes := []rune(content)
		content = string(runes[:180]) + "..."
	}
	return content
}

func exposureBriefWhyItMatters(item dto.ExposureRadarItem, velocity string) string {
	parts := []string{}
	switch velocity {
	case "burst":
		parts = append(parts, "the conversation is accelerating quickly")
	case "rising", "new":
		parts = append(parts, "the signal is still early enough for a timely reply")
	case "cooling":
		parts = append(parts, "the signal may be past its best reply window")
	default:
		parts = append(parts, "the signal has enough public activity to inspect")
	}
	if item.FollowersCount > 0 && item.FollowersCount <= 10000 {
		parts = append(parts, "the author has a smaller audience, so the reply surface may be less crowded")
	}
	if item.TopicName != "" {
		parts = append(parts, "it connects to "+item.TopicName)
	}
	return strings.Join(parts, "; ") + "."
}

func exposureBriefSuggestedAction(item dto.ExposureRadarItem, velocity string) string {
	if item.DataQuality != "tweet_level" {
		return "Use this as a topic lead, then inspect live posts before writing a manual comment."
	}
	if normalizeExposureQualityStage(item.QualityStage) == exposureQualityExpired {
		return "Treat this as past the best window; open the thread only if context still looks active."
	}
	if normalizeExposureQualityStage(item.QualityStage) == exposureQualityActNow {
		return "Handle this first: inspect the live thread, generate or write a reply, copy it, and publish manually on X."
	}
	if velocity == "cooling" {
		return "Open the thread first; only write a comment if the conversation is still active and persona-fit is clear."
	}
	if item.RiskLevel == "medium" || item.RiskLevel == "high" {
		return "Keep the manual comment conservative; avoid claims the Bot cannot support."
	}
	return "Generate a contextual comment, copy it, then open the original post and publish manually on X."
}

func exposureBriefBestUse(item dto.ExposureRadarItem) string {
	switch item.OpportunityType {
	case "reply":
		return "comment_review"
	default:
		if item.DataQuality == "topic_level" {
			return "topic_research"
		}
		return "operator_review"
	}
}

func exposureRadarBriefSummary(region string, items []dto.ExposureRadarBriefItem) string {
	if len(items) == 0 {
		return "No eligible radar opportunities are available for this window."
	}
	burst := 0
	cooling := 0
	actNow := 0
	for _, item := range items {
		if normalizeExposureQualityStage(item.QualityStage) == exposureQualityActNow {
			actNow++
		}
		switch item.VelocityState {
		case "burst", "rising", "new":
			burst++
		case "cooling":
			cooling++
		}
	}
	label := "English"
	if normalizeExposureRegion(region) == "zh" {
		label = "Chinese"
	}
	return fmt.Sprintf("%s radar found %d comment opportunities in this window: %d should be handled first, %d still rising, and %d cooling.", label, len(items), actNow, burst, cooling)
}

func tl1VelocityState(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "fire":
		return "burst"
	case "hot":
		return "rising"
	case "cooling", "stopped":
		return "cooling"
	case "normal":
		return "steady"
	default:
		return "unknown"
	}
}

func buildEnglishRecentSearchQuery(topic string) string {
	return buildRecentSearchQuery(topic, "en")
}

func buildRecentSearchQuery(topic, region string) string {
	topic = strings.TrimSpace(topic)
	if strings.ContainsAny(topic, " \t") && !strings.HasPrefix(topic, "\"") {
		topic = "\"" + strings.ReplaceAll(topic, "\"", "") + "\""
	}
	lang := "en"
	if normalizeExposureRegion(region) == "zh" {
		lang = "zh"
	}
	return strings.TrimSpace(topic + " lang:" + lang + " -is:retweet -is:reply -is:quote")
}

func englishTweetHeat(tweet twitter.TweetSearchItem) int64 {
	if tweet.ImpressionCount > 0 {
		return tweet.ImpressionCount
	}
	return tweet.LikeCount + tweet.ReplyCount*3 + tweet.RetweetCount*4 + tweet.QuoteCount*4
}

func selectExposureTweetCandidates(tweets []twitter.TweetSearchItem, now time.Time, limit int, thresholds exposureHotThresholds) []twitter.TweetSearchItem {
	out := make([]twitter.TweetSearchItem, 0, len(tweets))
	for _, tweet := range tweets {
		if strings.TrimSpace(tweet.ID) == "" {
			continue
		}
		out = append(out, tweet)
	}
	sortExposureTweetCandidates(out, now, thresholds)
	seen := map[string]bool{}
	deduped := out[:0]
	for _, tweet := range out {
		id := strings.TrimSpace(tweet.ID)
		if seen[id] {
			continue
		}
		seen[id] = true
		deduped = append(deduped, tweet)
	}
	out = deduped
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}

func sortExposureTweetCandidates(tweets []twitter.TweetSearchItem, now time.Time, thresholds exposureHotThresholds) {
	thresholds = normalizeExposureHotThresholds(thresholds)
	sort.SliceStable(tweets, func(i, j int) bool {
		left := exposureTweetCandidateScore(tweets[i], now, thresholds)
		right := exposureTweetCandidateScore(tweets[j], now, thresholds)
		if left != right {
			return left > right
		}
		if tweets[i].CreatedAt.Equal(tweets[j].CreatedAt) {
			return tweets[i].ID < tweets[j].ID
		}
		return tweets[i].CreatedAt.After(tweets[j].CreatedAt)
	})
}

func exposureTweetCandidateScore(tweet twitter.TweetSearchItem, now time.Time, thresholds exposureHotThresholds) int64 {
	thresholds = normalizeExposureHotThresholds(thresholds)
	heat := englishTweetHeat(tweet)
	score := heat * 10
	if tweet.ImpressionCount > 0 {
		score += 120000 + tweet.ImpressionCount*12
	}
	if tweet.ImpressionCount >= thresholds.StrongMinViews {
		score += 180000
	} else if tweet.ImpressionCount >= thresholds.HotMinViews {
		score += 90000
	}
	if tweet.FollowersCount > 0 && tweet.FollowersCount <= 10000 {
		score += 12000
	}
	if tweet.CreatedAt.IsZero() {
		return score
	}
	age := now.Sub(tweet.CreatedAt)
	switch {
	case age < 0:
		score -= 10000
	case age <= 2*time.Hour:
		score += 12000
	case age <= 8*time.Hour:
		score += 7000
	case age <= 24*time.Hour:
		score += 2000
	default:
		score -= 50000
	}
	return score
}

func exposureOpportunityTier(dataQuality string, heatCount, impressionCount int64, viewsPerMinute float64, velocityState string, hasPriorSample bool, thresholds exposureHotThresholds) (string, string) {
	thresholds = normalizeExposureHotThresholds(thresholds)
	if strings.TrimSpace(dataQuality) != "tweet_level" {
		return exposureTopicLeadTier, "topic-level signal; inspect live posts before treating it as a reply opportunity"
	}
	hasMomentum := viewsPerMinute >= thresholds.HotMinVelocity || velocityState == "burst"
	if impressionCount >= thresholds.HotMinViews && hasMomentum {
		if exposureStrongHot(impressionCount, viewsPerMinute, thresholds) {
			return exposureHotOpportunityTier, fmt.Sprintf("strong hot: real impressions >= %s and velocity >= %.0f/min", compactCount(thresholds.StrongMinViews), thresholds.StrongMinVelocity)
		}
		return exposureHotOpportunityTier, fmt.Sprintf("hot opportunity: real impressions >= %s and velocity >= %.0f/min", compactCount(thresholds.HotMinViews), thresholds.HotMinVelocity)
	}
	if impressionCount >= thresholds.HotMinViews {
		return exposureRisingSignalTier, fmt.Sprintf("real impressions reached %s, but hot-opportunity momentum is not confirmed yet", compactCount(impressionCount))
	}
	if heatCount >= exposureRisingMinViews || viewsPerMinute >= exposureRisingMinVelocity || velocityState == "burst" || velocityState == "rising" {
		return exposureRisingSignalTier, fmt.Sprintf("heat >= %s or momentum is emerging", compactCount(exposureRisingMinViews))
	}
	if !hasPriorSample || velocityState == "new" || velocityState == "unknown" {
		return exposureSamplingTier, "first snapshot or missing velocity; wait for another sample before calling it hot"
	}
	return exposureSamplingTier, fmt.Sprintf("below %s real impressions; keep sampling before treating it as a hot post", compactCount(thresholds.HotMinViews))
}

func exposureQualityStage(dataQuality string, tier string, velocityState string, riskLevel string, viewsPerMinute float64, score int, cooling bool, publishedAt time.Time, now time.Time, thresholds exposureHotThresholds) (string, string) {
	thresholds = normalizeExposureHotThresholds(thresholds)
	tier = normalizeExposureOpportunityTierForDiagnostics(tier)
	velocityState = strings.TrimSpace(velocityState)
	riskLevel = strings.TrimSpace(riskLevel)
	if riskLevel == "" {
		riskLevel = "low"
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if strings.TrimSpace(dataQuality) != "tweet_level" || tier == exposureTopicLeadTier {
		return exposureQualityWatch, "Topic-level lead; inspect live search before deciding whether a specific post is worth a manual reply."
	}
	if cooling || velocityState == "cooling" || exposureQualityWindowExpired(publishedAt, now, viewsPerMinute, thresholds) {
		return exposureQualityExpired, "Conversation momentum appears to be cooling or outside the timely reply window."
	}
	if riskLevel == "high" || riskLevel == "medium" {
		return exposureQualityWatch, "Potentially useful, but context and brand fit should be checked before any manual reply."
	}
	if tier == exposureHotOpportunityTier {
		if velocityState == "burst" || velocityState == "rising" || viewsPerMinute >= thresholds.HotMinVelocity || score >= 75 {
			return exposureQualityActNow, "Hot post still has enough momentum for a timely manual reply."
		}
		return exposureQualityWatch, "Real views are strong, but reply momentum is not urgent yet."
	}
	if tier == exposureRisingSignalTier {
		if velocityState == "burst" || viewsPerMinute >= thresholds.HotMinVelocity || score >= 85 {
			return exposureQualityActNow, "Rising signal has enough velocity to inspect before the window closes."
		}
		return exposureQualityWatch, "Rising signal is promising, but it can wait behind stronger active opportunities."
	}
	return exposureQualityWatch, "Needs another sample or stronger metrics before treating it as an urgent opportunity."
}

func exposureQualityWindowExpired(publishedAt time.Time, now time.Time, viewsPerMinute float64, thresholds exposureHotThresholds) bool {
	if publishedAt.IsZero() || now.IsZero() || now.Before(publishedAt) {
		return false
	}
	age := now.Sub(publishedAt)
	if age >= 12*time.Hour {
		return viewsPerMinute < thresholds.HotMinVelocity
	}
	if age >= 8*time.Hour {
		return viewsPerMinute < exposureRisingMinVelocity
	}
	return false
}

func normalizeExposureQualityStage(value string) string {
	switch strings.TrimSpace(value) {
	case exposureQualityActNow:
		return exposureQualityActNow
	case exposureQualityExpired:
		return exposureQualityExpired
	default:
		return exposureQualityWatch
	}
}

func exposureQualityStageRank(stage string) int {
	switch normalizeExposureQualityStage(stage) {
	case exposureQualityActNow:
		return 3
	case exposureQualityWatch:
		return 2
	case exposureQualityExpired:
		return 1
	default:
		return 0
	}
}

func exposureStrongHot(impressionCount int64, viewsPerMinute float64, thresholds exposureHotThresholds) bool {
	thresholds = normalizeExposureHotThresholds(thresholds)
	return impressionCount >= thresholds.StrongMinViews && viewsPerMinute >= thresholds.StrongMinVelocity
}

func exposureDataConfidence(dataQuality string, impressionCount int64, hasPriorSample bool) (string, string) {
	if strings.TrimSpace(dataQuality) != "tweet_level" {
		return exposureConfidenceTopic, "Only topic-level trend data is available; no specific post metrics were sampled."
	}
	if !hasPriorSample {
		return exposureConfidenceFirstSample, "This is the first snapshot, so velocity still needs another sample."
	}
	if impressionCount > 0 {
		return exposureConfidenceRealImpressions, "Uses reported impression/view metrics from the sampled post."
	}
	return exposureConfidenceEngagement, "X did not provide impressions for this sample; heat is estimated from public engagement."
}

func (s *TrendService) englishExposureTopicLimit() int {
	if s == nil || s.cfg.ExposureTopicLimit <= 0 {
		return 16
	}
	if s.cfg.ExposureTopicLimit > 50 {
		return 50
	}
	return s.cfg.ExposureTopicLimit
}

func (s *TrendService) englishExposureSearchResults() int {
	if s == nil || s.cfg.ExposureSearchResults <= 0 {
		return 50
	}
	if s.cfg.ExposureSearchResults < 10 {
		return 10
	}
	if s.cfg.ExposureSearchResults > 100 {
		return 100
	}
	return s.cfg.ExposureSearchResults
}

func (s *TrendService) exposureCandidateKeepLimit() int {
	searchResults := s.englishExposureSearchResults()
	limit := searchResults / 2
	if limit < 10 {
		return 10
	}
	if limit > 20 {
		return 20
	}
	return limit
}

func (s *TrendService) exposureResampleLimit(region string) int {
	limit := s.exposureCandidateKeepLimit() * 4
	if normalizeExposureRegion(region) == "zh" {
		limit = s.exposureCandidateKeepLimit() * 5
	}
	if limit < 30 {
		return 30
	}
	if limit > 100 {
		return 100
	}
	return limit
}

func (s *TrendService) exposureResampleWindow(region string) time.Duration {
	if normalizeExposureRegion(region) == "zh" {
		return 8 * time.Hour
	}
	return 4 * time.Hour
}

func (s *TrendService) englishExposureMaxFans() int64 {
	if s == nil || s.cfg.ExposureMaxFans <= 0 {
		return 10000
	}
	return s.cfg.ExposureMaxFans
}

func (s *TrendService) englishExposureMinHeat() int64 {
	if s == nil || s.cfg.ExposureMinHeat <= 0 {
		return 3
	}
	return s.cfg.ExposureMinHeat
}

func (s *TrendService) exposureHotThresholds() exposureHotThresholds {
	if s == nil {
		return defaultExposureHotThresholds()
	}
	return normalizeExposureHotThresholds(exposureHotThresholds{
		HotMinViews:       s.cfg.ExposureHotMinViews,
		HotMinVelocity:    s.cfg.ExposureHotMinVelocity,
		StrongMinViews:    s.cfg.ExposureStrongHotViews,
		StrongMinVelocity: s.cfg.ExposureStrongHotSpeed,
	})
}

func defaultExposureHotThresholds() exposureHotThresholds {
	return exposureHotThresholds{
		HotMinViews:       1000,
		HotMinVelocity:    8,
		StrongMinViews:    3000,
		StrongMinVelocity: 30,
	}
}

func normalizeExposureHotThresholds(value exposureHotThresholds) exposureHotThresholds {
	defaults := defaultExposureHotThresholds()
	if value.HotMinViews <= 0 {
		value.HotMinViews = defaults.HotMinViews
	}
	if value.HotMinVelocity <= 0 {
		value.HotMinVelocity = defaults.HotMinVelocity
	}
	if value.StrongMinViews <= 0 {
		value.StrongMinViews = defaults.StrongMinViews
	}
	if value.StrongMinVelocity <= 0 {
		value.StrongMinVelocity = defaults.StrongMinVelocity
	}
	if value.StrongMinViews < value.HotMinViews {
		value.StrongMinViews = value.HotMinViews
	}
	if value.StrongMinVelocity < value.HotMinVelocity {
		value.StrongMinVelocity = value.HotMinVelocity
	}
	return value
}

func (s *TrendService) exposureLearningRankingEnabled() bool {
	if s == nil || s.cfg.ExposureLearning.RankingEnabled == nil {
		return true
	}
	return *s.cfg.ExposureLearning.RankingEnabled
}

func (s *TrendService) exposureLearningCollectorEnabled() bool {
	if s == nil || s.cfg.ExposureLearning.CollectorEnabled == nil {
		return true
	}
	return *s.cfg.ExposureLearning.CollectorEnabled
}

func (s *TrendService) exposureLearningMode() string {
	if s == nil {
		return "hybrid"
	}
	switch strings.TrimSpace(s.cfg.ExposureLearning.Mode) {
	case "workspace", "scoped", "hybrid":
		return strings.TrimSpace(s.cfg.ExposureLearning.Mode)
	default:
		return "hybrid"
	}
}

func (s *TrendService) exposureLearningWindowDays() int {
	if s == nil || s.cfg.ExposureLearning.WindowDays <= 0 {
		return 30
	}
	if s.cfg.ExposureLearning.WindowDays > 90 {
		return 90
	}
	return s.cfg.ExposureLearning.WindowDays
}

func (s *TrendService) exposureRadarLearningControls(botID, xAccountID uint, rankingScope string) dto.ExposureRadarLearningControls {
	if strings.TrimSpace(rankingScope) == "" {
		rankingScope = "no_memory"
	}
	return dto.ExposureRadarLearningControls{
		RankingEnabled:   s.exposureLearningRankingEnabled(),
		CollectorEnabled: s.exposureLearningCollectorEnabled(),
		Mode:             s.exposureLearningMode(),
		WindowDays:       s.exposureLearningWindowDays(),
		RankingScope:     rankingScope,
	}
}

func (s *TrendService) exposureRadarConfiguredRankingScope(botID, xAccountID uint) string {
	if !s.exposureLearningRankingEnabled() {
		return "disabled"
	}
	if s.exposureLearningMode() == "workspace" {
		return "workspace"
	}
	if s.exposureLearningMode() == "scoped" && botID == 0 && xAccountID == 0 {
		return "no_memory"
	}
	if botID > 0 || xAccountID > 0 {
		return "selected_bot_account"
	}
	return "workspace"
}

func (s *TrendService) exposureRefreshInterval() time.Duration {
	if s == nil || s.cfg.ExposureRefreshMinutes <= 0 {
		return 15 * time.Minute
	}
	return time.Duration(s.cfg.ExposureRefreshMinutes) * time.Minute
}

func (s *TrendService) ExposureRefreshInterval() time.Duration {
	return s.exposureRefreshInterval()
}

func (s *TrendService) ExposureRefreshReadiness() (bool, string) {
	if s == nil || s.repo == nil || s.exposure == nil {
		return false, "trend exposure service is not configured"
	}
	if !s.cfg.Enabled {
		return false, "x trends sync disabled"
	}
	if strings.TrimSpace(s.cfg.BearerToken) == "" {
		return false, "x trends bearer token missing"
	}
	return true, ""
}

func (s *TrendService) chineseExposureSeedTopics() []string {
	defaults := []string{"AI", "AI Agent", "Web3", "比特币", "以太坊", "加密货币", "空投", "链上", "出海", "创业", "SaaS", "增长"}
	if s == nil || len(s.cfg.ExposureZhSeedTopics) == 0 {
		return defaults
	}
	seen := map[string]bool{}
	out := []string{}
	for _, topic := range s.cfg.ExposureZhSeedTopics {
		topic = strings.TrimSpace(topic)
		key := normalizeTrendName(topic)
		if topic == "" || key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, topic)
	}
	if len(out) == 0 {
		return defaults
	}
	return out
}

func normalizeExposureRegion(region string) string {
	switch strings.ToLower(strings.TrimSpace(region)) {
	case "zh", "cn", "chinese", "zh-cn", "zh-tw":
		return "zh"
	case "en", "english":
		return "en"
	default:
		return ""
	}
}

func containsHan(value string) bool {
	for _, ch := range value {
		if ch >= '\u4e00' && ch <= '\u9fff' {
			return true
		}
	}
	return false
}

func latestExposureSignalSeenAt(rows []model.ExposureTweetSignal) time.Time {
	latest := time.Time{}
	for _, row := range rows {
		if row.LastSeenAt.After(latest) {
			latest = row.LastSeenAt
		}
	}
	return latest
}

func exposureSourceFreshness(lastCollectedAt, now time.Time, refreshInterval time.Duration) (string, int64) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if refreshInterval <= 0 {
		refreshInterval = 15 * time.Minute
	}
	if lastCollectedAt.IsZero() {
		return "unknown", 0
	}
	seconds := int64(now.Sub(lastCollectedAt.UTC()).Seconds())
	if seconds < 0 {
		seconds = 0
	}
	if time.Duration(seconds)*time.Second <= refreshInterval*2 {
		return "fresh", seconds
	}
	return "stale", seconds
}

func exposureRadarPerformanceStatus(status string) string {
	switch strings.TrimSpace(status) {
	case "pending_review", "review", "draft":
		return "pending_review"
	case "approved", "ready_to_publish", "processing", "sending":
		return "approved"
	case "rejected", "blocked", "failed":
		return "rejected"
	case "sent", "published":
		return "published"
	case "handled":
		return "handled"
	default:
		return "pending_review"
	}
}

func exposureRadarTopicPerformanceMap(rows []repository.ExposureRadarTopicPerformance) map[string]exposureRadarTopicPerformance {
	out := map[string]exposureRadarTopicPerformance{}
	for _, row := range rows {
		region := normalizeExposureRegion(row.SourceRegion)
		if region == "" {
			region = "unknown"
		}
		topics := decodeStringList(row.TopicName)
		if len(topics) == 0 {
			topics = []string{row.TopicName}
		}
		for _, topic := range topics {
			topic = strings.TrimSpace(topic)
			if topic == "" || isExposureRadarMetaKeyword(topic) {
				continue
			}
			key := exposureRadarTopicKey(region, topic)
			stat := out[key]
			stat.Positive += row.Positive
			stat.Rejected += row.Rejected
			out[key] = stat
		}
	}
	return out
}

func (s *TrendService) exposureRadarOutcomePerformanceMap(userID uint, scope repository.ExposureRadarTaskScope, since time.Time) map[string]exposureRadarOutcomePerformance {
	if s == nil || s.generationFeedback == nil || userID == 0 {
		return nil
	}
	if scope.BotID == 0 && scope.XAccountID > 0 {
		return nil
	}
	rows, err := s.generationFeedback.ListRecentByUserBotSceneSince(userID, scope.BotID, "auto_comment", since, 500)
	if err != nil {
		zap.L().Warn("exposure radar outcome ranking lookup failed", zap.Uint("user_id", userID), zap.String("region", scope.Region), zap.Error(err))
		return nil
	}
	scopeRegion := normalizeExposureRegion(scope.Region)
	out := map[string]exposureRadarOutcomePerformance{}
	for _, row := range rows {
		meta := exposureRadarOutcomeFeedbackMetadata(row.Comment)
		stat := exposureRadarOutcomePerformanceFromFeedback(row, meta)
		if exposureRadarOutcomePerformanceEmpty(stat) {
			continue
		}
		region := normalizeExposureRegion(meta["region"])
		if region == "" {
			continue
		}
		if scopeRegion != "" && region != scopeRegion {
			continue
		}
		for _, key := range exposureRadarOutcomeKeysFromMetadata(region, meta) {
			current := out[key]
			current.Effective += stat.Effective
			current.Neutral += stat.Neutral
			current.Ineffective += stat.Ineffective
			current.NotSuitable += stat.NotSuitable
			out[key] = current
		}
	}
	return out
}

func exposureRadarOutcomeFeedbackMetadata(comment string) map[string]string {
	meta := map[string]string{}
	for _, part := range strings.Split(comment, "|") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		pair := strings.SplitN(part, "=", 2)
		if len(pair) != 2 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(pair[0]))
		value := strings.TrimSpace(pair[1])
		if key != "" && value != "" {
			meta[key] = value
		}
	}
	return meta
}

func exposureRadarOutcomePerformanceFromFeedback(row model.OAFBotGenerationFeedback, meta map[string]string) exposureRadarOutcomePerformance {
	outcome := strings.ToLower(strings.TrimSpace(meta["manual_outcome"]))
	if outcome == "" {
		return exposureRadarOutcomePerformance{}
	}
	switch outcome {
	case "effective":
		return exposureRadarOutcomePerformance{Effective: 1}
	case "neutral":
		return exposureRadarOutcomePerformance{Neutral: 1}
	case "ineffective":
		return exposureRadarOutcomePerformance{Ineffective: 1}
	case "not_suitable":
		return exposureRadarOutcomePerformance{NotSuitable: 1}
	}
	for _, tag := range decodeStringList(row.IssueTags) {
		switch strings.ToLower(strings.TrimSpace(tag)) {
		case "effective":
			return exposureRadarOutcomePerformance{Effective: 1}
		case "neutral":
			return exposureRadarOutcomePerformance{Neutral: 1}
		case "ineffective":
			return exposureRadarOutcomePerformance{Ineffective: 1}
		case "not_suitable":
			return exposureRadarOutcomePerformance{NotSuitable: 1}
		}
	}
	return exposureRadarOutcomePerformance{}
}

func exposureRadarOutcomeKeysFromMetadata(region string, meta map[string]string) []string {
	return compactExposureRadarStringList([]string{
		exposureRadarOutcomeKey(region, "topic", meta["topic"]),
		exposureRadarOutcomeKey(region, "opportunity_type", meta["opportunity_type"]),
		exposureRadarOutcomeKey(region, "data_quality", meta["data_quality"]),
	})
}

func exposureRadarOutcomeStatsForItem(outcomes map[string]exposureRadarOutcomePerformance, item dto.ExposureRadarItem) exposureRadarOutcomePerformance {
	if len(outcomes) == 0 {
		return exposureRadarOutcomePerformance{}
	}
	if topicKey := exposureRadarOutcomeKey(item.Region, "topic", exposureRadarItemTopic(item)); topicKey != "" {
		if stat, ok := outcomes[topicKey]; ok {
			return stat
		}
	}
	keys := compactExposureRadarStringList([]string{
		exposureRadarOutcomeKey(item.Region, "opportunity_type", item.OpportunityType),
		exposureRadarOutcomeKey(item.Region, "data_quality", item.DataQuality),
	})
	seen := map[string]bool{}
	stat := exposureRadarOutcomePerformance{}
	for _, key := range keys {
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		current, ok := outcomes[key]
		if !ok {
			continue
		}
		stat.Effective += current.Effective
		stat.Neutral += current.Neutral
		stat.Ineffective += current.Ineffective
		stat.NotSuitable += current.NotSuitable
	}
	return stat
}

func exposureRadarOutcomeKey(region, dimension, value string) string {
	region = normalizeExposureRegion(region)
	if region == "" {
		region = "unknown"
	}
	dimension = strings.ToLower(strings.TrimSpace(dimension))
	value = strings.TrimSpace(value)
	if dimension == "" || value == "" {
		return ""
	}
	return region + ":" + dimension + ":" + normalizeTrendName(value)
}

func exposureRadarOutcomePerformanceEmpty(stat exposureRadarOutcomePerformance) bool {
	return stat.Effective == 0 && stat.Neutral == 0 && stat.Ineffective == 0 && stat.NotSuitable == 0
}

func compactExposureRadarStringList(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

func exposureRadarItemTopic(item dto.ExposureRadarItem) string {
	for _, value := range []string{item.TopicName, item.Title} {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func exposureRadarTopicKey(region, topic string) string {
	region = normalizeExposureRegion(region)
	if region == "" {
		region = "unknown"
	}
	return region + ":" + normalizeTrendName(topic)
}

func exposureRadarRankingDelta(positive, rejected int64) int {
	delta := int(positive*4 - rejected*5)
	if delta > 12 {
		return 12
	}
	if delta < -12 {
		return -12
	}
	return delta
}

func exposureRadarRankingReason(positive, rejected int64, scopeLabel string) string {
	if strings.TrimSpace(scopeLabel) == "" {
		scopeLabel = "workspace"
	}
	switch {
	case positive > 0 && rejected > 0:
		return fmt.Sprintf("Recent %s review memory: %d positive and %d rejected drafts for this topic.", scopeLabel, positive, rejected)
	case positive > 0:
		return fmt.Sprintf("Recent %s review memory: %d positive drafts for this topic.", scopeLabel, positive)
	case rejected > 0:
		return fmt.Sprintf("Recent %s review memory: %d rejected drafts for this topic; review carefully.", scopeLabel, rejected)
	default:
		return ""
	}
}

func exposureRadarOutcomeRankingDelta(stat exposureRadarOutcomePerformance) int {
	delta := int(stat.Effective*3 - stat.Neutral - stat.Ineffective*4 - stat.NotSuitable*6)
	if delta > 8 {
		return 8
	}
	if delta < -8 {
		return -8
	}
	return delta
}

func exposureRadarOutcomeRankingReason(stat exposureRadarOutcomePerformance, scopeLabel string) string {
	if strings.TrimSpace(scopeLabel) == "" {
		scopeLabel = "workspace"
	}
	parts := []string{}
	if stat.Effective > 0 {
		parts = append(parts, fmt.Sprintf("%d effective", stat.Effective))
	}
	if stat.Neutral > 0 {
		parts = append(parts, fmt.Sprintf("%d neutral", stat.Neutral))
	}
	if stat.Ineffective > 0 {
		parts = append(parts, fmt.Sprintf("%d ineffective", stat.Ineffective))
	}
	if stat.NotSuitable > 0 {
		parts = append(parts, fmt.Sprintf("%d not suitable", stat.NotSuitable))
	}
	if len(parts) == 0 {
		return ""
	}
	suffix := ""
	if stat.Ineffective > 0 || stat.NotSuitable > 0 {
		suffix = " Review fit carefully."
	}
	return fmt.Sprintf("Recent %s manual outcome feedback: %s for similar signals.%s", scopeLabel, strings.Join(parts, ", "), suffix)
}

func exposureRadarJoinRankingReasons(reasons ...string) string {
	out := make([]string, 0, len(reasons))
	seen := map[string]bool{}
	for _, reason := range reasons {
		reason = strings.TrimSpace(reason)
		if reason == "" || seen[reason] {
			continue
		}
		seen[reason] = true
		out = append(out, reason)
	}
	return strings.Join(out, " ")
}

func exposureRadarConservativeRecommendedUse(value string) string {
	value = strings.TrimSpace(value)
	prefix := "Review fit before replying; consider saving as memory or skipping if the context is sensitive or off-positioning."
	if value == "" {
		return prefix
	}
	if strings.Contains(value, prefix) {
		return value
	}
	return prefix + " Original suggestion: " + value
}

func isExposureRadarMetaKeyword(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "exposure_radar", "reply", "monitor", "zh", "en", "cn", "chinese", "english":
		return true
	default:
		return false
	}
}

func mergeExposureRadarTaskTopics(resp *dto.ExposureRadarPerformanceResponse, rows []repository.AutoCommentTopicStat) {
	if resp == nil || len(rows) == 0 {
		return
	}
	byKey := map[string]*dto.ExposureRadarTopicStat{}
	for i := range resp.TopTopics {
		key := normalizeExposureTopicStatKey(resp.TopTopics[i].Region, resp.TopTopics[i].TopicName)
		byKey[key] = &resp.TopTopics[i]
	}
	for _, row := range rows {
		region := normalizeExposureRegion(row.SourceRegion)
		if region == "" {
			region = "unknown"
		}
		topics := decodeStringList(row.TopicName)
		if len(topics) == 0 {
			topics = []string{row.TopicName}
		}
		for _, topic := range topics {
			topic = strings.TrimSpace(topic)
			if topic == "" {
				continue
			}
			key := normalizeExposureTopicStatKey(region, topic)
			stat := byKey[key]
			if stat == nil {
				resp.TopTopics = append(resp.TopTopics, dto.ExposureRadarTopicStat{TopicName: topic, Region: region})
				stat = &resp.TopTopics[len(resp.TopTopics)-1]
				byKey[key] = stat
			}
			stat.DraftCount += row.Count
			switch exposureRadarPerformanceStatus(row.Status) {
			case "approved", "published", "handled":
				stat.SuccessCount += row.Count
			}
		}
	}
}

func mergeExposureRadarArchiveTopic(day *dto.ExposureRadarArchiveDay, next dto.ExposureRadarTopicStat) {
	if day == nil || strings.TrimSpace(next.TopicName) == "" {
		return
	}
	region := normalizeExposureRegion(next.Region)
	if region == "" {
		region = normalizeExposureRegion(day.Region)
	}
	key := normalizeExposureTopicStatKey(region, next.TopicName)
	for i := range day.TopTopics {
		if normalizeExposureTopicStatKey(day.TopTopics[i].Region, day.TopTopics[i].TopicName) == key {
			day.TopTopics[i].SignalCount += next.SignalCount
			day.TopTopics[i].DraftCount += next.DraftCount
			day.TopTopics[i].SuccessCount += next.SuccessCount
			return
		}
	}
	next.Region = region
	day.TopTopics = append(day.TopTopics, next)
}

func normalizeExposureTopicStatKey(region, topic string) string {
	return normalizeExposureRegion(region) + ":" + normalizeTrendName(topic)
}

func parseOptionalTime(value string) time.Time {
	if strings.TrimSpace(value) == "" {
		return time.Time{}
	}
	t, _ := time.Parse(time.RFC3339, value)
	return t
}

func roundRatio(value float64) float64 {
	return math.Round(value*1000) / 1000
}

func ageLabel(publishedAt, now time.Time) string {
	if publishedAt.IsZero() {
		return ""
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	d := now.Sub(publishedAt.UTC())
	if d < time.Hour {
		return fmt.Sprintf("%dm", radarMaxInt(1, int(d.Minutes())))
	}
	if d < 48*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

func containsSensitiveRadarText(value string) bool {
	text := strings.ToLower(value)
	keywords := []string{"election", "war", "lawsuit", "court", "sex", "政治", "选举", "战争", "诉讼", "性爱", "色情"}
	for _, keyword := range keywords {
		if strings.Contains(text, keyword) {
			return true
		}
	}
	return false
}

func exposureGuardrails(risk string) []string {
	if risk == "high" || risk == "medium" {
		return []string{
			"Review context before replying.",
			"Do not make claims the product cannot support.",
			"Avoid spammy CTAs and forced promotion.",
		}
	}
	return []string{
		"Reply only when the persona has a credible angle.",
		"Keep the response contextual and specific.",
		"Route generated copy through review before publishing.",
	}
}

func radarFirstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func radarMinInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func radarMaxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func compactCount(value int64) string {
	if value >= 1000000 {
		return fmt.Sprintf("%.1fM", float64(value)/1000000)
	}
	if value >= 1000 {
		return fmt.Sprintf("%.1fK", float64(value)/1000)
	}
	return strconv.FormatInt(value, 10)
}
