package service

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

var ErrActivityAccountNotFound = errors.New("activity account not found")

type ActivityService struct {
	repo        *repository.ActivityRepository
	accountRepo *repository.TwitterAccountRepository
}

func NewActivityService(repo *repository.ActivityRepository, accountRepo *repository.TwitterAccountRepository) *ActivityService {
	return &ActivityService{repo: repo, accountRepo: accountRepo}
}

func (s *ActivityService) List(userID uint, query dto.ActivityQuery) (*dto.ActivityListResponse, error) {
	page := query.Page
	if page <= 0 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	typ := strings.TrimSpace(strings.ToLower(query.Type))
	if typ != "" && typ != "post" && typ != "reply" && typ != "dm" && typ != "comment" && typ != "system" {
		return nil, errors.New("invalid activity type")
	}
	eventScope := strings.TrimSpace(strings.ToLower(query.EventScope))
	if eventScope != "" && eventScope != "all" && eventScope != "execution" && eventScope != "system" {
		return nil, errors.New("invalid activity event scope")
	}
	if eventScope == "all" {
		eventScope = ""
	}
	status := strings.TrimSpace(strings.ToLower(query.Status))
	if status != "" && status != "success" && status != "review" && status != "failed" {
		return nil, errors.New("invalid activity status")
	}

	from, to, err := activityRangeBounds(query.Range, time.Now().UTC())
	if err != nil {
		return nil, err
	}

	accountID := query.AccountID
	accountHandle := ""
	if accountID > 0 {
		account, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, accountID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, ErrActivityAccountNotFound
			}
			return nil, err
		}
		accountHandle = formatXAccountHandle(account.Username)
	}
	errorReason := strings.TrimSpace(query.ErrorReason)
	if len([]rune(errorReason)) > 512 {
		return nil, errors.New("invalid error reason")
	}
	failureCategory := strings.TrimSpace(strings.ToLower(query.FailureCategory))
	if failureCategory != "" && !isValidActivityFailureCategory(failureCategory) {
		return nil, errors.New("invalid activity failure category")
	}

	items, total, err := s.repo.List(userID, page, pageSize, typ, eventScope, status, from, to, accountID, accountHandle, errorReason, failureCategory)
	if err != nil {
		return nil, err
	}

	data := make([]dto.ActivityItemData, 0, len(items))
	for _, item := range items {
		accountHandle, sourceModule := activityDisplaySource(item.Type, item.AccountHandle)
		data = append(data, dto.ActivityItemData{
			ID:                  item.ID,
			XAccountID:          item.XAccountID,
			Type:                item.Type,
			Status:              item.Status,
			PreviewKey:          item.PreviewKey,
			DisplayKey:          activityPreviewDisplayKey(item.PreviewKey),
			AccountHandle:       accountHandle,
			SourceModule:        sourceModule,
			ExecutedAt:          item.ExecutedAt.UTC().Format(time.RFC3339),
			ErrorMessage:        item.ErrorMessage,
			FailureCategory:     classifyActivityFailure(item.Status, item.ErrorMessage),
			ReplyCommentTweetID: item.ReplyCommentTweetID,
			ReplyToUsername:     item.ReplyToUsername,
			ReplyToTextPreview:  item.ReplyToTextPreview,
			ReplyTextPreview:    item.ReplyTextPreview,
			ReviewQueueBulk:     reviewQueueBulkActivityData(item.PreviewKey, item.ErrorMessage),
		})
	}

	return &dto.ActivityListResponse{
		Items: data,
		Pagination: dto.ActivityPagination{
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		},
	}, nil
}

var reviewQueueBulkActivityPattern = regexp.MustCompile(`^Bulk ([a-z_]+) completed: ([0-9]+) succeeded, ([0-9]+) failed, ([0-9]+) total\.`)

func reviewQueueBulkActivityData(previewKey string, message string) *dto.ReviewQueueBulkActionActivityData {
	if previewKey != "activity.preview.reviewQueueBulkAction" {
		return nil
	}
	matches := reviewQueueBulkActivityPattern.FindStringSubmatch(strings.TrimSpace(message))
	if len(matches) != 5 {
		return &dto.ReviewQueueBulkActionActivityData{}
	}
	succeeded, _ := strconv.Atoi(matches[2])
	failed, _ := strconv.Atoi(matches[3])
	total, _ := strconv.Atoi(matches[4])
	return &dto.ReviewQueueBulkActionActivityData{
		Action:    matches[1],
		Total:     total,
		Succeeded: succeeded,
		Failed:    failed,
	}
}

func activityRangeBounds(value string, now time.Time) (time.Time, time.Time, error) {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "":
		return time.Time{}, time.Time{}, nil
	case "24h":
		return now.Add(-24 * time.Hour), now, nil
	case "7d":
		return now.AddDate(0, 0, -7), now, nil
	case "30d":
		return now.AddDate(0, 0, -30), now, nil
	default:
		return time.Time{}, time.Time{}, errors.New("invalid activity range")
	}
}

func activityDisplaySource(typ string, accountHandle string) (string, string) {
	if typ != "system" {
		return accountHandle, ""
	}
	handle := strings.TrimSpace(accountHandle)
	if handle == "" {
		return "System", ""
	}
	parts := strings.Split(handle, "/")
	if len(parts) < 2 {
		return handle, ""
	}
	source := strings.TrimSpace(parts[len(parts)-1])
	switch source {
	case "Auto Post":
		return strings.TrimSpace(parts[0]), "post"
	case "Auto Reply":
		return strings.TrimSpace(parts[0]), "reply"
	case "Auto Comment":
		return strings.TrimSpace(parts[0]), "comment"
	case "Auto DM":
		return strings.TrimSpace(parts[0]), "dm"
	default:
		return handle, ""
	}
}

func activityPreviewDisplayKey(previewKey string) string {
	switch previewKey {
	case "activity.preview.autoPostDraftGenerated":
		return "activity.preview.contentDraftGenerated"
	case "activity.preview.autoPostAutopilotPrepared":
		return "activity.preview.contentDraftReadyToHandle"
	case "activity.preview.autoPostRiskReview":
		return "activity.preview.contentDraftRiskReview"
	case "activity.preview.autoPostSchedulerSkipped":
		return "activity.preview.contentDraftSchedulerSkipped"
	case "activity.preview.autoPostSchedulerFailed":
		return "activity.preview.contentDraftSchedulerFailed"
	case "activity.preview.autoPostPublishJobCreated":
		return "activity.preview.contentDraftPublishJobCreated"
	case "activity.preview.autoPostSimulatedPublishSuccess":
		return "activity.preview.contentDraftSimulatedPublishSuccess"
	case "activity.preview.autoPostSimulatedPublishFailed":
		return "activity.preview.contentDraftSimulatedPublishFailed"
	default:
		return previewKey
	}
}
