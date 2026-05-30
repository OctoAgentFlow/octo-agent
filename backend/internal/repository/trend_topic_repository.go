package repository

import (
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type TrendTopicRepository struct{ DB *gorm.DB }

type TrendCacheRegionStatus struct {
	RegionName      string
	TotalTopics     int64
	LatestFetchedAt *time.Time
	LatestUpdatedAt *time.Time
}

type TrendCacheStatus struct {
	TotalTopics     int64
	LatestFetchedAt *time.Time
	LatestUpdatedAt *time.Time
	Regions         []TrendCacheRegionStatus `gorm:"-"`
}

type TrendTopicListQuery struct {
	WOEID     string
	Region    string
	Category  string
	RiskLevel string
	ActiveAt  time.Time
	Limit     int
}

func NewTrendTopicRepository(db *gorm.DB) *TrendTopicRepository {
	return &TrendTopicRepository{DB: db}
}

func (r *TrendTopicRepository) UpsertBatch(rows []model.TrendTopic) error {
	if len(rows) == 0 {
		return nil
	}
	return r.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "normalized_name"},
			{Name: "woe_id"},
			{Name: "fetched_bucket"},
		},
		DoUpdates: clause.AssignmentColumns([]string{
			"trend_name",
			"region_name",
			"tweet_count",
			"category",
			"risk_level",
			"language_hint",
			"source",
			"fetched_at",
			"expires_at",
			"raw_payload",
			"updated_at",
		}),
	}).Create(&rows).Error
}

func (r *TrendTopicRepository) LatestFetchedAt(woeid string) (*time.Time, error) {
	woeid = strings.TrimSpace(woeid)
	if woeid == "" {
		return nil, nil
	}
	var row model.TrendTopic
	err := r.DB.Where("woe_id = ?", woeid).Order("fetched_at DESC").First(&row).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	t := row.FetchedAt
	return &t, nil
}

func (r *TrendTopicRepository) List(query TrendTopicListQuery) ([]model.TrendTopic, error) {
	limit := query.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	q := r.DB.Model(&model.TrendTopic{})
	if strings.TrimSpace(query.WOEID) != "" {
		q = q.Where("woe_id = ?", strings.TrimSpace(query.WOEID))
	}
	if strings.TrimSpace(query.Region) != "" {
		q = q.Where("region_name = ?", strings.TrimSpace(query.Region))
	}
	if strings.TrimSpace(query.Category) != "" {
		q = q.Where("category = ?", strings.TrimSpace(query.Category))
	}
	if strings.TrimSpace(query.RiskLevel) != "" {
		q = q.Where("risk_level = ?", strings.TrimSpace(query.RiskLevel))
	}
	if !query.ActiveAt.IsZero() {
		q = q.Where("expires_at > ?", query.ActiveAt)
	}
	var rows []model.TrendTopic
	err := q.Order("fetched_at DESC, tweet_count DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *TrendTopicRepository) CacheStatus() (*TrendCacheStatus, error) {
	var status TrendCacheStatus
	if err := r.DB.Model(&model.TrendTopic{}).
		Select("COUNT(*) AS total_topics, MAX(fetched_at) AS latest_fetched_at, MAX(updated_at) AS latest_updated_at").
		Scan(&status).Error; err != nil {
		return nil, err
	}
	if err := r.DB.Model(&model.TrendTopic{}).
		Select("region_name, COUNT(*) AS total_topics, MAX(fetched_at) AS latest_fetched_at, MAX(updated_at) AS latest_updated_at").
		Group("region_name").
		Order("region_name ASC").
		Scan(&status.Regions).Error; err != nil {
		return nil, err
	}
	return &status, nil
}

func (r *TrendTopicRepository) DeleteExpired(before time.Time) (int64, error) {
	tx := r.DB.Where("expires_at < ?", before).Delete(&model.TrendTopic{})
	return tx.RowsAffected, tx.Error
}
