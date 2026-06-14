package repository

import (
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type ContentLibraryRepository struct {
	DB *gorm.DB
}

type ContentLibraryQuery struct {
	TwitterAccountID uint
	BotID            uint
	Status           string
	Limit            int
}

type ContentLibraryDailyStat struct {
	DayKey string
	Count  int64
}

func NewContentLibraryRepository(db *gorm.DB) *ContentLibraryRepository {
	return &ContentLibraryRepository{DB: db}
}

func (r *ContentLibraryRepository) ListByUser(userID uint, query ContentLibraryQuery) ([]model.ContentLibraryItem, error) {
	limit := query.Limit
	if limit <= 0 {
		limit = 100
	}
	q := r.DB.Where("user_id = ?", userID)
	if query.TwitterAccountID > 0 {
		q = q.Where("(twitter_account_id IS NULL OR twitter_account_id = ?)", query.TwitterAccountID)
	}
	if query.BotID > 0 {
		q = q.Where("(bot_id IS NULL OR bot_id = ?)", query.BotID)
	}
	if query.Status != "" {
		q = q.Where("status = ?", query.Status)
	} else {
		q = q.Where("status <> ?", "archived")
	}
	var rows []model.ContentLibraryItem
	err := q.Order("priority DESC, updated_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *ContentLibraryRepository) ListActiveByUser(userID uint) ([]model.ContentLibraryItem, error) {
	var rows []model.ContentLibraryItem
	err := r.DB.Where("user_id = ? AND status = ?", userID, "active").
		Order("priority DESC, updated_at DESC, id DESC").
		Find(&rows).Error
	return rows, err
}

func (r *ContentLibraryRepository) CountByUserID(userID uint) (int64, error) {
	var n int64
	err := r.DB.Model(&model.ContentLibraryItem{}).
		Where("user_id = ? AND status <> ?", userID, "archived").
		Count(&n).Error
	return n, err
}

func (r *ContentLibraryRepository) GetByUserAndID(userID, id uint) (*model.ContentLibraryItem, error) {
	var row model.ContentLibraryItem
	err := r.DB.Where("user_id = ? AND id = ?", userID, id).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *ContentLibraryRepository) Create(item *model.ContentLibraryItem) error {
	return r.DB.Create(item).Error
}

func (r *ContentLibraryRepository) Save(item *model.ContentLibraryItem) error {
	return r.DB.Save(item).Error
}

func (r *ContentLibraryRepository) ArchiveByUserAndID(userID, id uint) error {
	return r.DB.Model(&model.ContentLibraryItem{}).
		Where("user_id = ? AND id = ?", userID, id).
		Update("status", "archived").Error
}

func (r *ContentLibraryRepository) MarkUsed(item *model.ContentLibraryItem, at time.Time) error {
	item.UsageCount++
	item.LastUsedAt = &at
	return r.Save(item)
}

func (r *ContentLibraryRepository) PickActiveForContentDraft(userID, xAccountID, botID uint) (*model.ContentLibraryItem, error) {
	q := r.DB.Where("user_id = ? AND status = ?", userID, "active").
		Where("(twitter_account_id IS NULL OR twitter_account_id = ?)", xAccountID)
	if botID > 0 {
		q = q.Where("(bot_id IS NULL OR bot_id = ?)", botID)
	} else {
		q = q.Where("bot_id IS NULL")
	}
	var row model.ContentLibraryItem
	err := q.Order("CASE WHEN last_used_at IS NULL THEN 0 ELSE 1 END ASC, usage_count ASC, priority DESC, last_used_at ASC, updated_at DESC, id ASC").
		First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *ContentLibraryRepository) PickActiveForAutoPost(userID, xAccountID, botID uint) (*model.ContentLibraryItem, error) {
	return r.PickActiveForContentDraft(userID, xAccountID, botID)
}

func (r *ContentLibraryRepository) ListActiveForGenerationContext(userID, xAccountID, botID uint, limit int) ([]model.ContentLibraryItem, error) {
	if limit <= 0 {
		limit = 20
	}
	q := r.DB.Where("user_id = ? AND status = ?", userID, "active").
		Where("(twitter_account_id IS NULL OR twitter_account_id = ?)", xAccountID)
	if botID > 0 {
		q = q.Where("(bot_id IS NULL OR bot_id = ?)", botID)
	} else {
		q = q.Where("bot_id IS NULL")
	}
	var rows []model.ContentLibraryItem
	err := q.Order("priority DESC, updated_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *ContentLibraryRepository) CountExposureRadarMemoryByDaySince(userID, xAccountID, botID uint, region string, since time.Time) ([]ContentLibraryDailyStat, error) {
	q := r.DB.Model(&model.ContentLibraryItem{}).
		Select("DATE(created_at) AS day_key, COUNT(*) AS count").
		Where("user_id = ? AND item_type = ? AND topics LIKE ?", userID, "data_insight", "%exposure-radar%")
	if region != "" && region != "all" {
		q = q.Where("topics LIKE ?", "%\""+region+"\"%")
	}
	if xAccountID > 0 {
		q = q.Where("(twitter_account_id IS NULL OR twitter_account_id = ?)", xAccountID)
	}
	if botID > 0 {
		q = q.Where("(bot_id IS NULL OR bot_id = ?)", botID)
	}
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since)
	}
	var rows []ContentLibraryDailyStat
	err := q.Group("DATE(created_at)").Order("day_key DESC").Scan(&rows).Error
	return rows, err
}

func (r *ContentLibraryRepository) ListExposureRadarMemoryBySourceURLs(userID, xAccountID, botID uint, sourceURLs []string) ([]model.ContentLibraryItem, error) {
	clean := make([]string, 0, len(sourceURLs))
	seen := map[string]bool{}
	for _, value := range sourceURLs {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		clean = append(clean, value)
	}
	if userID == 0 || len(clean) == 0 {
		return []model.ContentLibraryItem{}, nil
	}
	q := r.DB.Where("user_id = ? AND item_type = ? AND status <> ? AND topics LIKE ? AND source_url IN ?", userID, "data_insight", "archived", "%exposure-radar%", clean)
	if xAccountID > 0 {
		q = q.Where("(twitter_account_id IS NULL OR twitter_account_id = ?)", xAccountID)
	}
	if botID > 0 {
		q = q.Where("(bot_id IS NULL OR bot_id = ?)", botID)
	}
	var rows []model.ContentLibraryItem
	err := q.Order("updated_at DESC, id DESC").Find(&rows).Error
	return rows, err
}
