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

const (
	exposureHotOpportunityTier = "hot_opportunity"
	exposureEarlySignalTier    = "early_signal"
	exposureHotMinViews        = int64(3000)
	exposureHotMinVelocity     = 30.0
)

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
		return s.annotateExposureRadarMemoryState(userID, query, s.annotateExposureRadarReviewState(userID, s.applyExposureRadarPerformanceRanking(userID, query, resp, now))), err
	case "en", "english":
		resp, err := s.exposureRadarEnglish(query, now)
		return s.annotateExposureRadarMemoryState(userID, query, s.annotateExposureRadarReviewState(userID, s.applyExposureRadarPerformanceRanking(userID, query, resp, now))), err
	default:
		query.Region = "zh"
		resp, err := s.exposureRadarChinese(ctx, query, now)
		return s.annotateExposureRadarMemoryState(userID, query, s.annotateExposureRadarReviewState(userID, s.applyExposureRadarPerformanceRanking(userID, query, resp, now))), err
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
			ActiveAfter: now.Add(-time.Duration(query.Hours) * time.Hour),
			Limit:       query.Limit,
		})
		if err != nil {
			return nil, err
		}
		if len(rows) > 0 {
			items := make([]dto.ExposureRadarItem, 0, len(rows))
			for i := range rows {
				items = append(items, exposureTweetSignalToRadarItem(&rows[i]))
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
		items = append(items, tl1PostToExposureItem(row))
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
			ActiveAfter: now.Add(-time.Duration(query.Hours) * time.Hour),
			Limit:       query.Limit,
		})
		if err != nil {
			return nil, err
		}
		if len(rows) > 0 {
			items := make([]dto.ExposureRadarItem, 0, len(rows))
			for i := range rows {
				items = append(items, exposureTweetSignalToRadarItem(&rows[i]))
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
			ID:              fmt.Sprintf("en-trend-%d", row.ID),
			Region:          "en",
			DataSource:      "X Trends cache",
			DataQuality:     "topic_level",
			Title:           name,
			Content:         "Topic-level signal from X Trends. Use it to decide what to monitor, then inspect live posts before replying.",
			URL:             "https://x.com/search?q=" + url.QueryEscape(name) + "&src=typed_query&f=live",
			Status:          "rising",
			SignalLabel:     "Topic trend",
			TopicName:       name,
			HeatCount:       row.TweetCount,
			Score:           score,
			RiskLevel:       risk,
			OpportunityType: "monitor",
			RecommendedUse:  "Open live search, find low-follower breakout posts, then route suitable replies into review.",
			Reason:          "English radar is currently topic-level. It identifies where to look; tweet-level velocity should be confirmed before action.",
			Guardrails:      exposureGuardrails(risk),
			UpdatedAt:       row.FetchedAt.UTC().Format(time.RFC3339),
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
	}
	if resp == nil || userID == 0 || s == nil || s.commentRepo == nil || len(resp.Items) == 0 {
		return resp
	}
	if !s.exposureLearningRankingEnabled() {
		resp.LearningControls = s.exposureRadarLearningControls(query.BotID, query.XAccountID, "disabled")
		return resp
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
		return resp
	}
	if mode == "workspace" {
		scope.BotID = 0
		scope.XAccountID = 0
	}
	rows, err := s.commentRepo.ExposureRadarTopicPerformanceByRegionSince(scope)
	if err != nil {
		zap.L().Warn("exposure radar performance ranking lookup failed", zap.Uint("user_id", userID), zap.String("region", resp.Region), zap.Error(err))
		return resp
	}
	perf := exposureRadarTopicPerformanceMap(rows)
	scopeLabel := "selected Bot/account"
	rankingScope := "selected_bot_account"
	if mode == "workspace" || (query.BotID == 0 && query.XAccountID == 0) {
		scopeLabel = "workspace"
		rankingScope = "workspace"
	}
	if len(perf) == 0 && mode == "hybrid" && (query.BotID > 0 || query.XAccountID > 0) {
		scope.BotID = 0
		scope.XAccountID = 0
		rows, err = s.commentRepo.ExposureRadarTopicPerformanceByRegionSince(scope)
		if err != nil {
			zap.L().Warn("exposure radar fallback ranking lookup failed", zap.Uint("user_id", userID), zap.String("region", resp.Region), zap.Error(err))
			return resp
		}
		perf = exposureRadarTopicPerformanceMap(rows)
		scopeLabel = "workspace"
		rankingScope = "workspace"
	}
	if len(perf) == 0 {
		resp.LearningControls = s.exposureRadarLearningControls(query.BotID, query.XAccountID, "no_memory")
		return resp
	}
	resp.LearningControls = s.exposureRadarLearningControls(query.BotID, query.XAccountID, rankingScope)
	for i := range resp.Items {
		topic := exposureRadarItemTopic(resp.Items[i])
		key := exposureRadarTopicKey(resp.Items[i].Region, topic)
		stat, ok := perf[key]
		if !ok {
			continue
		}
		delta := exposureRadarRankingDelta(stat.Positive, stat.Rejected)
		if delta == 0 {
			continue
		}
		resp.Items[i].Score = radarMaxInt(0, radarMinInt(100, resp.Items[i].Score+delta))
		resp.Items[i].RankingDelta = delta
		resp.Items[i].RankingReason = exposureRadarRankingReason(stat.Positive, stat.Rejected, scopeLabel)
	}
	sort.SliceStable(resp.Items, func(i, j int) bool {
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
	return s.refreshExposureSignals(ctx, "en", now)
}

func (s *TrendService) RefreshChineseExposureSignals(ctx context.Context, now time.Time) error {
	return s.refreshExposureSignals(ctx, "zh", now)
}

func (s *TrendService) refreshExposureSignals(ctx context.Context, region string, now time.Time) error {
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
		if err != nil {
			zap.L().Warn("exposure recent search failed", zap.String("region", region), zap.String("topic", name), zap.Error(err))
			continue
		}
		upserted := 0
		for _, tweet := range tweets {
			row, ok := s.tweetSearchToExposureSignal(tweet, region, name, query, now)
			if !ok {
				continue
			}
			if err := s.exposure.UpsertSignal(row, now); err != nil {
				return err
			}
			upserted++
		}
		zap.L().Debug("exposure topic scanned", zap.String("region", region), zap.String("topic", name), zap.Int("candidates", len(tweets)), zap.Int("upserted", upserted))
	}
	return nil
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

func tl1PostToExposureItem(row tl1PostItem) dto.ExposureRadarItem {
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
	tier, tierReason := exposureOpportunityTier(row.CurrentStats.ViewCount, row.ViewsPerMin, tl1VelocityState(row.Status))
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
		ID:              "zh-tweet-" + row.TweetID,
		Region:          "zh",
		DataSource:      "External public trend feed",
		DataQuality:     "tweet_level",
		Title:           radarFirstNonEmpty(row.DisplayName, row.AuthorHandle),
		AuthorHandle:    row.AuthorHandle,
		AuthorName:      row.DisplayName,
		TweetID:         row.TweetID,
		Content:         row.Content,
		URL:             url,
		Status:          status,
		SignalLabel:     radarFirstNonEmpty(row.Emoji+" "+row.Heat, status),
		TopicName:       "",
		ViewsPerMin:     row.ViewsPerMin,
		HeatCount:       row.CurrentStats.ViewCount,
		FollowersCount:  row.FollowersCount,
		LikeCount:       row.CurrentStats.LikeCount,
		ReplyCount:      row.CurrentStats.ReplyCount,
		RetweetCount:    row.CurrentStats.RetweetCount,
		ImpressionCount: row.CurrentStats.ViewCount,
		HotCount:        row.HotCount,
		AgeLabel:        row.TweetAge,
		VelocityState:   tl1VelocityState(row.Status),
		OpportunityTier: tier,
		TierReason:      tierReason,
		Cooling:         strings.EqualFold(row.Status, "cooling") || strings.EqualFold(row.Status, "stopped"),
		VelocityHistory: row.History,
		Score:           score,
		RiskLevel:       risk,
		OpportunityType: "reply",
		RecommendedUse:  "Inspect the live thread, write a context-aware reply, and avoid forced promotion.",
		Reason:          "Low-follower or early-window posts with rising views can carry useful reply exposure when the reply is timely and relevant.",
		Guardrails:      exposureGuardrails(risk),
		UpdatedAt:       radarFirstNonEmpty(row.LastCheckTime, ""),
	}
}

func exposureTweetSignalToRadarItem(row *model.ExposureTweetSignal) dto.ExposureRadarItem {
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
	tier, tierReason := exposureOpportunityTier(row.CurrentCount, row.ViewsPerMinute, velocityState)
	return dto.ExposureRadarItem{
		ID:              region + "-tweet-" + row.TweetID,
		Region:          region,
		DataSource:      dataSource,
		DataQuality:     "tweet_level",
		Title:           radarFirstNonEmpty(row.AuthorName, row.AuthorHandle, row.TopicName),
		AuthorHandle:    row.AuthorHandle,
		AuthorName:      row.AuthorName,
		AuthorID:        row.AuthorID,
		TweetID:         row.TweetID,
		Content:         row.Content,
		URL:             url,
		Status:          status,
		SignalLabel:     signalLabel,
		TopicName:       row.TopicName,
		PublishedAt:     row.PublishedAt.UTC().Format(time.RFC3339),
		ViewsPerMin:     row.ViewsPerMinute,
		HeatCount:       row.CurrentCount,
		FollowersCount:  row.FollowersCount,
		LikeCount:       row.LikeCount,
		ReplyCount:      row.ReplyCount,
		RetweetCount:    row.RetweetCount,
		QuoteCount:      row.QuoteCount,
		BookmarkCount:   row.BookmarkCount,
		ImpressionCount: row.ImpressionCount,
		AgeLabel:        ageLabel(row.PublishedAt, time.Now().UTC()),
		VelocityState:   velocityState,
		OpportunityTier: tier,
		TierReason:      tierReason,
		Cooling:         velocityState == "cooling",
		VelocityHistory: exposureVelocityHistory(row),
		Score:           score,
		RiskLevel:       radarFirstNonEmpty(row.RiskLevel, "low"),
		OpportunityType: "reply",
		RecommendedUse:  "Inspect the live thread, check persona fit, then write or generate a contextual reply for review.",
		Reason:          reason,
		Guardrails:      exposureGuardrails(row.RiskLevel),
		UpdatedAt:       row.LastSeenAt.UTC().Format(time.RFC3339),
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
	for _, item := range items {
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
	return fmt.Sprintf("%s radar found %d comment opportunities in this window: %d still rising and %d cooling.", label, len(items), burst, cooling)
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

func exposureOpportunityTier(views int64, viewsPerMinute float64, velocityState string) (string, string) {
	if views >= exposureHotMinViews && (viewsPerMinute >= exposureHotMinVelocity || velocityState == "burst" || velocityState == "rising") {
		return exposureHotOpportunityTier, fmt.Sprintf("views >= %s and momentum is active", compactCount(views))
	}
	if views >= exposureHotMinViews {
		return exposureEarlySignalTier, fmt.Sprintf("views reached %s, but momentum is not confirmed yet", compactCount(views))
	}
	return exposureEarlySignalTier, fmt.Sprintf("below %s views; keep watching before treating it as a hot opportunity", compactCount(exposureHotMinViews))
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
		return 25
	}
	if s.cfg.ExposureSearchResults < 10 {
		return 10
	}
	if s.cfg.ExposureSearchResults > 100 {
		return 100
	}
	return s.cfg.ExposureSearchResults
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
