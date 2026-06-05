package repository

import (
	"errors"
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type ActivityRepository struct {
	DB *gorm.DB
}

type ActivityStatusCount struct {
	Status string
	Count  int64
}

type ActivityTypeStatusCount struct {
	Type   string
	Status string
	Count  int64
}

type ActivityDailyStatusCount struct {
	Day    string
	Status string
	Count  int64
}

type ActivityFailureReasonCount struct {
	Reason   string
	Category string
	Count    int64
	LastAt   *time.Time
}

type ActivityAccountStatusCount struct {
	AccountID uint
	Handle    string
	Status    string
	Count     int64
	LastAt    *time.Time
}

func NewActivityRepository(db *gorm.DB) *ActivityRepository {
	return &ActivityRepository{DB: db}
}

// CountPostPublishSuccessBetween counts successful post activities with executed_at in [from, to] (inclusive bounds, UTC).
func (r *ActivityRepository) CountPostPublishSuccessBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND type = ? AND status = ?", userID, "post", "success").
		Where("executed_at >= ? AND executed_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

func (r *ActivityRepository) CountByPreviewKeysSince(userID uint, previewKeys []string, since time.Time) (int64, error) {
	if len(previewKeys) == 0 {
		return 0, nil
	}
	q := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND preview_key IN ?", userID, previewKeys)
	if !since.IsZero() {
		q = q.Where("executed_at >= ?", since)
	}
	var n int64
	err := q.Count(&n).Error
	return n, err
}

func (r *ActivityRepository) ExistsByPreviewKeySince(userID uint, previewKey string, since time.Time) (bool, error) {
	var n int64
	q := r.DB.Model(&model.ActivityLog{}).Where("user_id = ? AND preview_key = ?", userID, previewKey)
	if !since.IsZero() {
		q = q.Where("executed_at >= ?", since)
	}
	if err := q.Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}

// CountReplySuccessBetween counts successful reply activities with executed_at in [from, to] (inclusive bounds, UTC).
func (r *ActivityRepository) CountReplySuccessBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND type = ? AND status = ?", userID, "reply", "success").
		Where("executed_at >= ? AND executed_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

// HasSuccessfulReplyToRefTweet returns true if we already logged a successful reply to this comment tweet id.
func (r *ActivityRepository) HasSuccessfulReplyToRefTweet(userID uint, refTweetID string) (bool, error) {
	if refTweetID == "" {
		return false, nil
	}
	var n int64
	err := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND type = ? AND status = ?", userID, "reply", "success").
		Where("(reply_comment_tweet_id = ? OR ref_tweet_id = ?)", refTweetID, refTweetID).
		Count(&n).Error
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// HasSuccessfulCommentToRefTweet returns true if we already logged a successful Auto Comment against this target tweet.
func (r *ActivityRepository) HasSuccessfulCommentToRefTweet(userID, xAccountID uint, refTweetID string) (bool, error) {
	if refTweetID == "" {
		return false, nil
	}
	q := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND type = ? AND status = ?", userID, "comment", "success").
		Where("(reply_comment_tweet_id = ? OR ref_tweet_id = ?)", refTweetID, refTweetID)
	if xAccountID > 0 {
		q = q.Where("x_account_id = ?", xAccountID)
	}
	var n int64
	if err := q.Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}

// LatestReplyExecutedAt returns the latest executed_at among reply activities (success or failed), or nil.
func (r *ActivityRepository) LatestReplyExecutedAt(userID uint) (*time.Time, error) {
	var row model.ActivityLog
	err := r.DB.Where("user_id = ? AND type = ?", userID, "reply").
		Order("executed_at DESC").Limit(1).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t := row.ExecutedAt
	return &t, nil
}

func (r *ActivityRepository) List(userID uint, page int, pageSize int, typ string, eventScope string, status string, from, to time.Time, accountID uint, accountHandle string, errorReason string, failureCategory string) ([]model.ActivityLog, int64, error) {
	q := r.DB.Model(&model.ActivityLog{}).Where("user_id = ?", userID)
	if eventScope == "system" {
		q = q.Where("type = ?", "system")
	} else if typ != "" {
		q = q.Where("type = ?", typ)
	} else if eventScope == "execution" {
		q = q.Where("type <> ?", "system")
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	if errorReason != "" {
		q = q.Where("COALESCE(NULLIF(TRIM(error_message), ''), 'Unknown error') = ?", errorReason)
	}
	q = applyActivityFailureCategoryFilter(q, failureCategory)
	q = applyActivityAccountFilter(q, accountID, accountHandle)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var items []model.ActivityLog
	offset := (page - 1) * pageSize
	err := q.Order("executed_at DESC").Limit(pageSize).Offset(offset).Find(&items).Error
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func applyActivityFailureCategoryFilter(q *gorm.DB, category string) *gorm.DB {
	switch category {
	case "x_auth":
		return q.Where("status = ? AND ("+activityErrorLikeClause(8)+")", append([]any{"failed"}, activityErrorLikeArgs(
			"%unauthorized%", "%401%", "%oauth%", "%token%", "%credential%", "%reauth%", "%authorization%", "%forbidden%",
		)...)...)
	case "rate_limit":
		return q.Where("status = ? AND ("+activityErrorLikeClause(4)+")", append([]any{"failed"}, activityErrorLikeArgs(
			"%rate limit%", "%too many requests%", "%429%", "%retry after%",
		)...)...)
	case "safety":
		return q.Where("status = ? AND ("+activityErrorLikeClause(7)+")", append([]any{"failed"}, activityErrorLikeArgs(
			"%blocked_keyword%", "%blocked keyword%", "%risk%", "%sensitive%", "%safety%", "%policy%", "%rejected%",
		)...)...)
	case "configuration":
		return q.Where("status = ? AND ("+activityErrorLikeClause(8)+")", append([]any{"failed"}, activityErrorLikeArgs(
			"%missing%", "%not configured%", "%no account%", "%setup%", "%capability%", "%permission%", "%empty%", "%disabled%",
		)...)...)
	case "network":
		return q.Where("status = ? AND ("+activityErrorLikeClause(6)+")", append([]any{"failed"}, activityErrorLikeArgs(
			"%timeout%", "%connection%", "%dial tcp%", "%network%", "%dns%", "%tls%",
		)...)...)
	case "system":
		return q.Where("status = ? AND ("+activityErrorLikeClause(7)+")", append([]any{"failed"}, activityErrorLikeArgs(
			"%panic%", "%database%", "% sql%", "%internal%", "%server error%", "%500%", "%bad gateway%",
		)...)...)
	case "unknown":
		known := append([]any{"failed"}, activityErrorLikeArgs(
			"%unauthorized%", "%401%", "%oauth%", "%token%", "%credential%", "%reauth%", "%authorization%", "%forbidden%",
			"%rate limit%", "%too many requests%", "%429%", "%retry after%",
			"%blocked_keyword%", "%blocked keyword%", "%risk%", "%sensitive%", "%safety%", "%policy%", "%rejected%",
			"%missing%", "%not configured%", "%no account%", "%setup%", "%capability%", "%permission%", "%empty%", "%disabled%",
			"%timeout%", "%connection%", "%dial tcp%", "%network%", "%dns%", "%tls%",
			"%panic%", "%database%", "% sql%", "%internal%", "%server error%", "%500%", "%bad gateway%",
		)...)
		return q.Where("status = ? AND (TRIM(COALESCE(error_message, '')) = '' OR NOT ("+activityErrorLikeClause(len(known)-1)+"))", known...)
	default:
		return q
	}
}

func activityErrorLikeClause(count int) string {
	parts := make([]string, 0, count)
	for i := 0; i < count; i++ {
		parts = append(parts, "LOWER(COALESCE(error_message, '')) LIKE ?")
	}
	return strings.Join(parts, " OR ")
}

func activityErrorLikeArgs(patterns ...string) []any {
	args := make([]any, 0, len(patterns))
	for _, pattern := range patterns {
		args = append(args, pattern)
	}
	return args
}

// CountExecutedBetween counts rows with executed_at in [from, to). Pass zero to from or to to leave that bound open.
func (r *ActivityRepository) CountExecutedBetween(userID uint, from, to time.Time) (int64, error) {
	var n int64
	q := r.DB.Model(&model.ActivityLog{}).Where("user_id = ?", userID)
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	if err := q.Count(&n).Error; err != nil {
		return 0, err
	}
	return n, nil
}

// SuccessVsFailedSince counts success and failed statuses since `since` (inclusive).
func (r *ActivityRepository) SuccessVsFailedSince(userID uint, since time.Time) (success int64, failed int64, err error) {
	err = r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND executed_at >= ? AND status = ?", userID, since, "success").
		Count(&success).Error
	if err != nil {
		return 0, 0, err
	}
	err = r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND executed_at >= ? AND status = ?", userID, since, "failed").
		Count(&failed).Error
	if err != nil {
		return 0, 0, err
	}
	return success, failed, nil
}

// LatestExecutedAt returns the most recent executed_at for the user, or nil if none.
func (r *ActivityRepository) LatestExecutedAt(userID uint) (*time.Time, error) {
	var row model.ActivityLog
	err := r.DB.Where("user_id = ?", userID).Order("executed_at DESC").Limit(1).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t := row.ExecutedAt
	return &t, nil
}

// LatestExecutedAtBetween returns the most recent executed_at in the filtered window, or nil if none.
func (r *ActivityRepository) LatestExecutedAtBetween(userID uint, from, to time.Time, accountID uint, accountHandle string) (*time.Time, error) {
	var row model.ActivityLog
	q := r.DB.Where("user_id = ?", userID)
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	q = applyActivityAccountFilter(q, accountID, accountHandle)
	err := q.Order("executed_at DESC").Limit(1).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t := row.ExecutedAt
	return &t, nil
}

// CountSuccessByTypeBetween counts successful activities of a type in [from, to] (inclusive bounds, UTC).
func (r *ActivityRepository) CountSuccessByTypeBetween(userID uint, typ string, from, to time.Time) (int64, error) {
	var n int64
	err := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND type = ? AND status = ?", userID, typ, "success").
		Where("executed_at >= ? AND executed_at <= ?", from, to).
		Count(&n).Error
	return n, err
}

// CountByStatusSince counts activity rows by status since `since` (inclusive).
func (r *ActivityRepository) CountByStatusSince(userID uint, status string, since time.Time) (int64, error) {
	var n int64
	q := r.DB.Model(&model.ActivityLog{}).Where("user_id = ? AND status = ?", userID, status)
	if !since.IsZero() {
		q = q.Where("executed_at >= ?", since)
	}
	if err := q.Count(&n).Error; err != nil {
		return 0, err
	}
	return n, nil
}

// LatestSuccessExecutedAt returns the latest successful execution time, or nil.
func (r *ActivityRepository) LatestSuccessExecutedAt(userID uint) (*time.Time, error) {
	var row model.ActivityLog
	err := r.DB.Where("user_id = ? AND status = ?", userID, "success").
		Order("executed_at DESC").Limit(1).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t := row.ExecutedAt
	return &t, nil
}

// CountByStatusBetween aggregates activity rows by status with executed_at in [from, to).
func (r *ActivityRepository) CountByStatusBetween(userID uint, from, to time.Time, accountID uint, accountHandle string) ([]ActivityStatusCount, error) {
	var rows []ActivityStatusCount
	q := r.DB.Model(&model.ActivityLog{}).
		Select("status, COUNT(*) AS count").
		Where("user_id = ?", userID)
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	q = applyActivityAccountFilter(q, accountID, accountHandle)
	err := q.Group("status").Scan(&rows).Error
	return rows, err
}

// CountByTypeAndStatusBetween aggregates activity rows by automation type and status with executed_at in [from, to).
func (r *ActivityRepository) CountByTypeAndStatusBetween(userID uint, from, to time.Time, accountID uint, accountHandle string) ([]ActivityTypeStatusCount, error) {
	var rows []ActivityTypeStatusCount
	q := r.DB.Model(&model.ActivityLog{}).
		Select("type, status, COUNT(*) AS count").
		Where("user_id = ?", userID)
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	q = applyActivityAccountFilter(q, accountID, accountHandle)
	err := q.Group("type, status").Scan(&rows).Error
	return rows, err
}

// CountDailyByStatusBetween aggregates activity rows by UTC date and status with executed_at in [from, to).
func (r *ActivityRepository) CountDailyByStatusBetween(userID uint, from, to time.Time, accountID uint, accountHandle string) ([]ActivityDailyStatusCount, error) {
	var rows []ActivityDailyStatusCount
	q := r.DB.Model(&model.ActivityLog{}).
		Select("DATE(executed_at) AS day, status, COUNT(*) AS count").
		Where("user_id = ?", userID)
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	q = applyActivityAccountFilter(q, accountID, accountHandle)
	err := q.Group("DATE(executed_at), status").Order("day ASC").Scan(&rows).Error
	return rows, err
}

// CountFailureReasonsBetween aggregates failed activities by error message in [from, to).
func (r *ActivityRepository) CountFailureReasonsBetween(userID uint, from, to time.Time, accountID uint, accountHandle string, limit int) ([]ActivityFailureReasonCount, error) {
	if limit <= 0 {
		limit = 5
	}
	var rows []ActivityFailureReasonCount
	reasonExpr := "COALESCE(NULLIF(TRIM(error_message), ''), 'Unknown error')"
	q := r.DB.Model(&model.ActivityLog{}).
		Select(reasonExpr+" AS reason, COUNT(*) AS count, MAX(executed_at) AS last_at").
		Where("user_id = ? AND status = ?", userID, "failed")
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	q = applyActivityAccountFilter(q, accountID, accountHandle)
	err := q.Group(reasonExpr).Order("count DESC, last_at DESC").Limit(limit).Scan(&rows).Error
	return rows, err
}

// CountFailureCategoriesBetween aggregates failed activities by normalized failure category in [from, to).
func (r *ActivityRepository) CountFailureCategoriesBetween(userID uint, from, to time.Time, accountID uint, accountHandle string, limit int) ([]ActivityFailureReasonCount, error) {
	if limit <= 0 {
		limit = 5
	}
	var rows []ActivityFailureReasonCount
	categoryExpr := activityFailureCategoryCaseExpr()
	q := r.DB.Model(&model.ActivityLog{}).
		Select(categoryExpr+" AS category, "+categoryExpr+" AS reason, COUNT(*) AS count, MAX(executed_at) AS last_at").
		Where("user_id = ? AND status = ?", userID, "failed")
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	q = applyActivityAccountFilter(q, accountID, accountHandle)
	err := q.Group(categoryExpr).Order("count DESC, last_at DESC").Limit(limit).Scan(&rows).Error
	return rows, err
}

func activityFailureCategoryCaseExpr() string {
	text := "LOWER(COALESCE(error_message, ''))"
	return "CASE" +
		" WHEN " + activityCategoryLikeExpr(text, []string{"%unauthorized%", "%401%", "%oauth%", "%token%", "%credential%", "%reauth%", "%authorization%", "%forbidden%"}) + " THEN 'x_auth'" +
		" WHEN " + activityCategoryLikeExpr(text, []string{"%rate limit%", "%too many requests%", "%429%", "%retry after%"}) + " THEN 'rate_limit'" +
		" WHEN " + activityCategoryLikeExpr(text, []string{"%blocked_keyword%", "%blocked keyword%", "%risk%", "%sensitive%", "%safety%", "%policy%", "%rejected%"}) + " THEN 'safety'" +
		" WHEN " + activityCategoryLikeExpr(text, []string{"%missing%", "%not configured%", "%no account%", "%setup%", "%capability%", "%permission%", "%empty%", "%disabled%"}) + " THEN 'configuration'" +
		" WHEN " + activityCategoryLikeExpr(text, []string{"%timeout%", "%connection%", "%dial tcp%", "%network%", "%dns%", "%tls%"}) + " THEN 'network'" +
		" WHEN " + activityCategoryLikeExpr(text, []string{"%panic%", "%database%", "% sql%", "%internal%", "%server error%", "%500%", "%bad gateway%"}) + " THEN 'system'" +
		" ELSE 'unknown' END"
}

func activityCategoryLikeExpr(textExpr string, patterns []string) string {
	parts := make([]string, 0, len(patterns))
	for _, pattern := range patterns {
		parts = append(parts, textExpr+" LIKE '"+pattern+"'")
	}
	return "(" + strings.Join(parts, " OR ") + ")"
}

// ListAttentionBetween returns recent failed or review activities in [from, to).
func (r *ActivityRepository) ListAttentionBetween(userID uint, from, to time.Time, accountID uint, accountHandle string, limit int) ([]model.ActivityLog, error) {
	if limit <= 0 {
		limit = 6
	}
	var rows []model.ActivityLog
	q := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND status IN ?", userID, []string{"failed", "review"})
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	q = applyActivityAccountFilter(q, accountID, accountHandle)
	err := q.Order("executed_at DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *ActivityRepository) ListDMOperationEventsBetween(userID uint, from, to time.Time, accountID uint, accountHandle string, limit int) ([]model.ActivityLog, error) {
	if limit <= 0 || limit > 20 {
		limit = 6
	}
	var rows []model.ActivityLog
	q := r.DB.Model(&model.ActivityLog{}).
		Where("user_id = ? AND type = ?", userID, "dm").
		Where("preview_key IN ?", []string{"activity.preview.dmRecipientImport", "activity.preview.dmRecipientRuleUpdated"})
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	q = applyActivityAccountFilter(q, accountID, accountHandle)
	err := q.Order("executed_at DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

// CountByAccountAndStatusBetween aggregates activities by X account and status in [from, to).
func (r *ActivityRepository) CountByAccountAndStatusBetween(userID uint, from, to time.Time) ([]ActivityAccountStatusCount, error) {
	var rows []ActivityAccountStatusCount
	q := r.DB.Model(&model.ActivityLog{}).
		Select("x_account_id AS account_id, account_handle AS handle, status, COUNT(*) AS count, MAX(executed_at) AS last_at").
		Where("user_id = ?", userID)
	if !from.IsZero() {
		q = q.Where("executed_at >= ?", from)
	}
	if !to.IsZero() {
		q = q.Where("executed_at < ?", to)
	}
	err := q.Group("x_account_id, account_handle, status").Scan(&rows).Error
	return rows, err
}

func applyActivityAccountFilter(q *gorm.DB, accountID uint, accountHandle string) *gorm.DB {
	if accountID == 0 {
		return q
	}
	if accountHandle == "" {
		return q.Where("x_account_id = ?", accountID)
	}
	return q.Where("(x_account_id = ? OR account_handle = ?)", accountID, accountHandle)
}
