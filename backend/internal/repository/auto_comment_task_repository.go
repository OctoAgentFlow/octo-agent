package repository

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const autoCommentQueueOrder = "CASE WHEN status IN ('ready_to_publish','approved','pending_review','review','draft') THEN 0 WHEN status IN ('handled','rejected','failed','blocked','sent','published') THEN 2 ELSE 1 END ASC, opportunity_score DESC, detected_at DESC, id DESC"

type AutoCommentTaskRepository struct {
	DB *gorm.DB
}

type AutoCommentStatusStat struct {
	SourceRegion string
	Status       string
	Count        int64
	LatestAt     time.Time
}

type AutoCommentTopicStat struct {
	SourceRegion string
	TopicName    string
	Status       string
	Count        int64
}

type ExposureRadarTopicPerformance struct {
	SourceRegion string
	TopicName    string
	Positive     int64
	Rejected     int64
	Total        int64
}

type ExposureRadarTaskScope struct {
	UserID     uint
	Region     string
	BotID      uint
	XAccountID uint
	Since      time.Time
}

func NewAutoCommentTaskRepository(db *gorm.DB) *AutoCommentTaskRepository {
	return &AutoCommentTaskRepository{DB: db}
}

func (r *AutoCommentTaskRepository) ListByUser(userID uint, limit int) ([]model.AutoCommentTask, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	var rows []model.AutoCommentTask
	err := r.DB.Where("user_id = ? AND status <> ?", userID, "skipped").Order(autoCommentQueueOrder).Limit(limit * 3).Find(&rows).Error
	if err != nil {
		return nil, err
	}
	return dedupeAutoCommentTasks(rows, limit), nil
}

func (r *AutoCommentTaskRepository) ListQueueByUser(userID uint, limit int) ([]model.AutoCommentTask, error) {
	if limit <= 0 {
		limit = 500
	}
	var rows []model.AutoCommentTask
	err := r.DB.Where("user_id = ? AND status NOT IN ?", userID, []string{"handled", "skipped"}).Order(autoCommentQueueOrder).Limit(limit * 3).Find(&rows).Error
	if err != nil {
		return nil, err
	}
	return dedupeAutoCommentTasks(rows, limit), nil
}

func (r *AutoCommentTaskRepository) GetByUserAndID(userID, id uint) (*model.AutoCommentTask, error) {
	var row model.AutoCommentTask
	err := r.DB.Where("user_id = ? AND id = ?", userID, id).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoCommentTaskRepository) ExistsForTargetTweet(userID, xAccountID uint, tweetID string) (bool, error) {
	var n int64
	err := r.DB.Model(&model.AutoCommentTask{}).
		Where("user_id = ? AND x_account_id = ? AND target_tweet_id = ?", userID, xAccountID, tweetID).
		Count(&n).Error
	return n > 0, err
}

func (r *AutoCommentTaskRepository) ExistsCompletedForTargetTweet(userID, xAccountID uint, tweetID string) (bool, error) {
	if tweetID == "" {
		return false, nil
	}
	var n int64
	err := r.DB.Model(&model.AutoCommentTask{}).
		Where("user_id = ? AND x_account_id = ? AND target_tweet_id = ?", userID, xAccountID, tweetID).
		Where("status IN ?", []string{"sent", "published", "handled"}).
		Count(&n).Error
	return n > 0, err
}

func (r *AutoCommentTaskRepository) GetByTargetTweet(userID, xAccountID uint, tweetID string) (*model.AutoCommentTask, error) {
	var row model.AutoCommentTask
	err := r.DB.Where("user_id = ? AND x_account_id = ? AND target_tweet_id = ?", userID, xAccountID, tweetID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *AutoCommentTaskRepository) ListLatestByUserAndTweetIDs(userID uint, tweetIDs []string) ([]model.AutoCommentTask, error) {
	clean := make([]string, 0, len(tweetIDs))
	seen := map[string]bool{}
	for _, tweetID := range tweetIDs {
		tweetID = strings.TrimSpace(tweetID)
		if tweetID == "" || seen[tweetID] {
			continue
		}
		seen[tweetID] = true
		clean = append(clean, tweetID)
	}
	if userID == 0 || len(clean) == 0 {
		return []model.AutoCommentTask{}, nil
	}
	var rows []model.AutoCommentTask
	err := r.DB.Where("user_id = ? AND target_tweet_id IN ?", userID, clean).
		Order("updated_at DESC, id DESC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	return dedupeAutoCommentTasksByTweet(rows), nil
}

func (r *AutoCommentTaskRepository) Create(task *model.AutoCommentTask) error {
	_, err := r.CreateIfNotExists(task)
	return err
}

func (r *AutoCommentTaskRepository) CreateIfNotExists(task *model.AutoCommentTask) (bool, error) {
	if task == nil {
		return false, fmt.Errorf("auto comment task is nil")
	}
	if task.UserID > 0 && task.XAccountID > 0 && task.TargetTweetID != "" {
		existing, err := r.GetByTargetTweet(task.UserID, task.XAccountID, task.TargetTweetID)
		if err == nil {
			*task = *existing
			return false, nil
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return false, err
		}
	}
	tx := r.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(task)
	if tx.Error != nil {
		return false, tx.Error
	}
	if tx.RowsAffected == 0 && task.UserID > 0 && task.XAccountID > 0 && task.TargetTweetID != "" {
		existing, err := r.GetByTargetTweet(task.UserID, task.XAccountID, task.TargetTweetID)
		if err != nil {
			return false, err
		}
		*task = *existing
		return false, nil
	}
	return true, nil
}

func (r *AutoCommentTaskRepository) Save(task *model.AutoCommentTask) error {
	return r.DB.Save(task).Error
}

func (r *AutoCommentTaskRepository) DeleteByUserAndID(userID, id uint) error {
	return r.DB.Where("user_id = ? AND id = ?", userID, id).Delete(&model.AutoCommentTask{}).Error
}

func (r *AutoCommentTaskRepository) CountSuccessBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.AutoCommentTask{}).
		Where("user_id = ? AND status = ?", userID, "sent").
		Where("sent_at >= ? AND sent_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

func (r *AutoCommentTaskRepository) CountCreatedBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.AutoCommentTask{}).
		Where("user_id = ?", userID).
		Where("status <> ?", "skipped").
		Where("generated_at IS NOT NULL").
		Where("created_at >= ? AND created_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

func (r *AutoCommentTaskRepository) CountStatusByUserBots(userID uint, botIDs []uint, status string) (map[uint]int, error) {
	out := map[uint]int{}
	if len(botIDs) == 0 {
		return out, nil
	}
	type row struct {
		BotID uint
		Count int
	}
	var rows []row
	err := r.DB.Model(&model.AutoCommentTask{}).
		Select("bot_id, COUNT(*) AS count").
		Where("user_id = ? AND bot_id IN ? AND status = ?", userID, botIDs, status).
		Group("bot_id").
		Scan(&rows).Error
	for _, item := range rows {
		out[item.BotID] = item.Count
	}
	return out, err
}

func (r *AutoCommentTaskRepository) CountExposureRadarStatusByRegionSince(scope ExposureRadarTaskScope) ([]AutoCommentStatusStat, error) {
	q := r.DB.Model(&model.AutoCommentTask{}).
		Select("source_region, status, COUNT(*) AS count, MAX(created_at) AS latest_at").
		Where("user_id = ? AND source_type = ?", scope.UserID, "exposure_radar")
	q = applyExposureRadarTaskScope(q, scope)
	var rows []AutoCommentStatusStat
	err := q.Group("source_region, status").Scan(&rows).Error
	return rows, err
}

func (r *AutoCommentTaskRepository) CountExposureRadarTopicsByRegionSince(scope ExposureRadarTaskScope, limit int) ([]AutoCommentTopicStat, error) {
	if limit <= 0 || limit > 20 {
		limit = 8
	}
	q := r.DB.Model(&model.AutoCommentTask{}).
		Select("source_region, matched_keywords AS topic_name, status, COUNT(*) AS count").
		Where("user_id = ? AND source_type = ?", scope.UserID, "exposure_radar").
		Where("matched_keywords <> ''")
	q = applyExposureRadarTaskScope(q, scope)
	var rows []AutoCommentTopicStat
	err := q.Group("source_region, matched_keywords, status").Order("count DESC").Limit(limit).Scan(&rows).Error
	return rows, err
}

func (r *AutoCommentTaskRepository) ExposureRadarTopicPerformanceByRegionSince(scope ExposureRadarTaskScope) ([]ExposureRadarTopicPerformance, error) {
	q := r.DB.Model(&model.AutoCommentTask{}).
		Select(`
			source_region,
			matched_keywords AS topic_name,
			SUM(CASE WHEN status IN ('approved','ready_to_publish','sending','sent','published','handled') THEN 1 ELSE 0 END) AS positive,
			SUM(CASE WHEN status IN ('rejected','blocked','failed') THEN 1 ELSE 0 END) AS rejected,
			COUNT(*) AS total
		`).
		Where("user_id = ? AND source_type = ?", scope.UserID, "exposure_radar").
		Where("matched_keywords <> ''")
	q = applyExposureRadarTaskScope(q, scope)
	var rows []ExposureRadarTopicPerformance
	err := q.Group("source_region, matched_keywords").Scan(&rows).Error
	return rows, err
}

func (r *AutoCommentTaskRepository) ExposureRadarGlobalTopicPerformanceByRegionSince(region string, since time.Time, limit int) ([]ExposureRadarTopicPerformance, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	q := r.DB.Model(&model.AutoCommentTask{}).
		Select(`
			source_region,
			matched_keywords AS topic_name,
			SUM(CASE WHEN status IN ('approved','ready_to_publish','sending','sent','published','handled') THEN 1 ELSE 0 END) AS positive,
			SUM(CASE WHEN status IN ('rejected','blocked','failed') THEN 1 ELSE 0 END) AS rejected,
			COUNT(*) AS total
		`).
		Where("source_type = ?", "exposure_radar").
		Where("matched_keywords <> ''")
	if strings.TrimSpace(region) != "" && strings.TrimSpace(region) != "all" {
		q = q.Where("source_region = ?", strings.TrimSpace(region))
	}
	if !since.IsZero() {
		q = q.Where("created_at >= ?", since)
	}
	var rows []ExposureRadarTopicPerformance
	err := q.Group("source_region, matched_keywords").
		Having("SUM(CASE WHEN status IN ('approved','ready_to_publish','sending','sent','published','handled') THEN 1 ELSE 0 END) > SUM(CASE WHEN status IN ('rejected','blocked','failed') THEN 1 ELSE 0 END)").
		Order("positive DESC, rejected ASC, total DESC").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}

func applyExposureRadarTaskScope(q *gorm.DB, scope ExposureRadarTaskScope) *gorm.DB {
	if strings.TrimSpace(scope.Region) != "" && strings.TrimSpace(scope.Region) != "all" {
		q = q.Where("source_region = ?", strings.TrimSpace(scope.Region))
	}
	if scope.BotID > 0 {
		q = q.Where("bot_id = ?", scope.BotID)
	}
	if scope.XAccountID > 0 {
		q = q.Where("x_account_id = ?", scope.XAccountID)
	}
	if !scope.Since.IsZero() {
		q = q.Where("created_at >= ?", scope.Since)
	}
	return q
}

func dedupeAutoCommentTasks(rows []model.AutoCommentTask, limit int) []model.AutoCommentTask {
	if len(rows) == 0 {
		return rows
	}
	seen := make(map[string]struct{}, len(rows))
	out := make([]model.AutoCommentTask, 0, len(rows))
	for _, row := range rows {
		key := autoCommentTaskDedupeKey(row)
		if key != "" {
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
		}
		out = append(out, row)
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
}

func dedupeAutoCommentTasksByTweet(rows []model.AutoCommentTask) []model.AutoCommentTask {
	if len(rows) == 0 {
		return rows
	}
	seen := map[string]bool{}
	out := make([]model.AutoCommentTask, 0, len(rows))
	for _, row := range rows {
		key := strings.TrimSpace(row.TargetTweetID)
		if key == "" {
			key = fmt.Sprintf("id:%d", row.ID)
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, row)
	}
	return out
}

func autoCommentTaskDedupeKey(row model.AutoCommentTask) string {
	if row.UserID == 0 || row.XAccountID == 0 || row.TargetTweetID == "" {
		return ""
	}
	return fmt.Sprintf("%d:%d:%s", row.UserID, row.XAccountID, row.TargetTweetID)
}
