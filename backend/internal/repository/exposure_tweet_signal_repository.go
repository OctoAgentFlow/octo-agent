package repository

import (
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type ExposureTweetSignalRepository struct{ DB *gorm.DB }

type ExposureTweetSignalListQuery struct {
	Region      string
	MaxFans     int64
	MinVelocity float64
	ActiveAfter time.Time
	Limit       int
}

type ExposureSignalRegionStat struct {
	Region       string
	SignalCount  int64
	LatestSeenAt time.Time
}

type ExposureSignalTopicStat struct {
	Region      string
	TopicName   string
	SignalCount int64
}

type ExposureSignalDailyStat struct {
	DayKey      string
	Region      string
	SignalCount int64
}

type ExposureSignalDailyTopicStat struct {
	DayKey      string
	Region      string
	TopicName   string
	SignalCount int64
}

type ExposureSignalDiagnosticStats struct {
	TotalCount           int64
	InWindowCount        int64
	UnderFanLimitCount   int64
	OverFanLimitCount    int64
	RealImpressionCount  int64
	PriorSampleCount     int64
	HotCandidateCount    int64
	RisingCandidateCount int64
	LatestSeenAt         time.Time
}

func NewExposureTweetSignalRepository(db *gorm.DB) *ExposureTweetSignalRepository {
	return &ExposureTweetSignalRepository{DB: db}
}

func (r *ExposureTweetSignalRepository) UpsertSignal(row *model.ExposureTweetSignal, now time.Time) error {
	if row == nil || strings.TrimSpace(row.TweetID) == "" {
		return nil
	}
	var existing model.ExposureTweetSignal
	result := r.DB.Where("tweet_id = ?", row.TweetID).Limit(1).Find(&existing)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		if row.FirstSeenAt.IsZero() {
			row.FirstSeenAt = now
		}
		if row.LastSeenAt.IsZero() {
			row.LastSeenAt = now
		}
		return r.DB.Create(row).Error
	}
	prevCount := existing.CurrentCount
	prevSeen := existing.LastSeenAt
	minutes := now.Sub(prevSeen).Minutes()
	velocity := 0.0
	if minutes > 0.25 && row.CurrentCount >= prevCount {
		velocity = float64(row.CurrentCount-prevCount) / minutes
	}
	updates := map[string]any{
		"region":           row.Region,
		"language":         row.Language,
		"source":           row.Source,
		"source_query":     row.SourceQuery,
		"topic_name":       row.TopicName,
		"author_id":        row.AuthorID,
		"author_handle":    row.AuthorHandle,
		"author_name":      row.AuthorName,
		"followers_count":  row.FollowersCount,
		"content":          row.Content,
		"published_at":     row.PublishedAt,
		"last_seen_at":     now,
		"previous_count":   prevCount,
		"current_count":    row.CurrentCount,
		"views_per_minute": velocity,
		"like_count":       row.LikeCount,
		"reply_count":      row.ReplyCount,
		"retweet_count":    row.RetweetCount,
		"quote_count":      row.QuoteCount,
		"bookmark_count":   row.BookmarkCount,
		"impression_count": row.ImpressionCount,
		"risk_level":       row.RiskLevel,
		"raw_payload":      row.RawPayload,
	}
	return r.DB.Model(&existing).Updates(updates).Error
}

func (r *ExposureTweetSignalRepository) LatestSeenAt(region string) (*time.Time, error) {
	var row model.ExposureTweetSignal
	q := r.DB.Model(&model.ExposureTweetSignal{})
	if strings.TrimSpace(region) != "" {
		q = q.Where("region = ?", strings.TrimSpace(region))
	}
	result := q.Order("last_seen_at DESC").Limit(1).Find(&row)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	t := row.LastSeenAt
	return &t, nil
}

func (r *ExposureTweetSignalRepository) List(query ExposureTweetSignalListQuery) ([]model.ExposureTweetSignal, error) {
	limit := query.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	q := r.DB.Model(&model.ExposureTweetSignal{})
	if strings.TrimSpace(query.Region) != "" {
		q = q.Where("region = ?", strings.TrimSpace(query.Region))
	}
	if query.MaxFans > 0 {
		q = q.Where("followers_count = 0 OR followers_count <= ?", query.MaxFans)
	}
	if query.MinVelocity > 0 {
		q = q.Where("views_per_minute >= ?", query.MinVelocity)
	}
	if !query.ActiveAfter.IsZero() {
		q = q.Where("published_at = ? OR published_at >= ? OR last_seen_at >= ?", time.Time{}, query.ActiveAfter, query.ActiveAfter)
	}
	var rows []model.ExposureTweetSignal
	err := q.Order("CASE WHEN previous_count > 0 OR views_per_minute > 0 THEN 0 ELSE 1 END ASC, CASE WHEN impression_count >= 1000 THEN 0 ELSE 1 END ASC, views_per_minute DESC, impression_count DESC, current_count DESC, followers_count ASC, last_seen_at DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *ExposureTweetSignalRepository) DiagnosticStats(region string, activeAfter time.Time, maxFans int64) (ExposureSignalDiagnosticStats, error) {
	stats := ExposureSignalDiagnosticStats{}
	q := r.DB.Model(&model.ExposureTweetSignal{})
	if strings.TrimSpace(region) != "" && strings.TrimSpace(region) != "all" {
		q = q.Where("region = ?", strings.TrimSpace(region))
	}
	if activeAfter.IsZero() {
		activeAfter = time.Time{}
	}
	if maxFans <= 0 {
		maxFans = 10000
	}
	err := q.Select(`
		COUNT(*) AS total_count,
		COALESCE(SUM(CASE WHEN published_at = ? OR published_at >= ? OR last_seen_at >= ? THEN 1 ELSE 0 END), 0) AS in_window_count,
		COALESCE(SUM(CASE WHEN followers_count = 0 OR followers_count <= ? THEN 1 ELSE 0 END), 0) AS under_fan_limit_count,
		COALESCE(SUM(CASE WHEN followers_count > ? THEN 1 ELSE 0 END), 0) AS over_fan_limit_count,
		COALESCE(SUM(CASE WHEN impression_count > 0 THEN 1 ELSE 0 END), 0) AS real_impression_count,
		COALESCE(SUM(CASE WHEN previous_count > 0 OR views_per_minute > 0 THEN 1 ELSE 0 END), 0) AS prior_sample_count,
		COALESCE(SUM(CASE WHEN impression_count >= 1000 AND views_per_minute >= 8 THEN 1 ELSE 0 END), 0) AS hot_candidate_count,
		COALESCE(SUM(CASE WHEN impression_count >= 1000 OR current_count >= 100 OR views_per_minute >= 5 THEN 1 ELSE 0 END), 0) AS rising_candidate_count,
		MAX(last_seen_at) AS latest_seen_at
	`, time.Time{}, activeAfter, activeAfter, maxFans, maxFans).Scan(&stats).Error
	return stats, err
}

func (r *ExposureTweetSignalRepository) CountByRegionSince(region string, since time.Time) ([]ExposureSignalRegionStat, error) {
	q := r.DB.Model(&model.ExposureTweetSignal{}).
		Select("region, COUNT(*) AS signal_count, MAX(last_seen_at) AS latest_seen_at")
	if strings.TrimSpace(region) != "" && strings.TrimSpace(region) != "all" {
		q = q.Where("region = ?", strings.TrimSpace(region))
	}
	if !since.IsZero() {
		q = q.Where("last_seen_at >= ?", since)
	}
	var rows []ExposureSignalRegionStat
	err := q.Group("region").Scan(&rows).Error
	return rows, err
}

func (r *ExposureTweetSignalRepository) TopTopicsByRegionSince(region string, since time.Time, limit int) ([]ExposureSignalTopicStat, error) {
	if limit <= 0 || limit > 20 {
		limit = 8
	}
	q := r.DB.Model(&model.ExposureTweetSignal{}).
		Select("region, topic_name, COUNT(*) AS signal_count").
		Where("topic_name <> ''")
	if strings.TrimSpace(region) != "" && strings.TrimSpace(region) != "all" {
		q = q.Where("region = ?", strings.TrimSpace(region))
	}
	if !since.IsZero() {
		q = q.Where("last_seen_at >= ?", since)
	}
	var rows []ExposureSignalTopicStat
	err := q.Group("region, topic_name").Order("signal_count DESC").Limit(limit).Scan(&rows).Error
	return rows, err
}

func (r *ExposureTweetSignalRepository) CountByDaySince(region string, since time.Time) ([]ExposureSignalDailyStat, error) {
	q := r.DB.Model(&model.ExposureTweetSignal{}).
		Select("DATE(last_seen_at) AS day_key, region, COUNT(*) AS signal_count")
	if strings.TrimSpace(region) != "" && strings.TrimSpace(region) != "all" {
		q = q.Where("region = ?", strings.TrimSpace(region))
	}
	if !since.IsZero() {
		q = q.Where("last_seen_at >= ?", since)
	}
	var rows []ExposureSignalDailyStat
	err := q.Group("DATE(last_seen_at), region").Order("day_key DESC, region ASC").Scan(&rows).Error
	return rows, err
}

func (r *ExposureTweetSignalRepository) TopTopicsByDaySince(region string, since time.Time, limit int) ([]ExposureSignalDailyTopicStat, error) {
	if limit <= 0 || limit > 100 {
		limit = 60
	}
	q := r.DB.Model(&model.ExposureTweetSignal{}).
		Select("DATE(last_seen_at) AS day_key, region, topic_name, COUNT(*) AS signal_count").
		Where("topic_name <> ''")
	if strings.TrimSpace(region) != "" && strings.TrimSpace(region) != "all" {
		q = q.Where("region = ?", strings.TrimSpace(region))
	}
	if !since.IsZero() {
		q = q.Where("last_seen_at >= ?", since)
	}
	var rows []ExposureSignalDailyTopicStat
	err := q.Group("DATE(last_seen_at), region, topic_name").
		Order("day_key DESC, signal_count DESC").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}
