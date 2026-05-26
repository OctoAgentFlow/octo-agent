package service

import (
	"errors"
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

	items, total, err := s.repo.List(userID, page, pageSize, typ, status, from, to, accountID, accountHandle, errorReason)
	if err != nil {
		return nil, err
	}

	data := make([]dto.ActivityItemData, 0, len(items))
	for _, item := range items {
		data = append(data, dto.ActivityItemData{
			ID:                  item.ID,
			XAccountID:          item.XAccountID,
			Type:                item.Type,
			Status:              item.Status,
			PreviewKey:          item.PreviewKey,
			AccountHandle:       item.AccountHandle,
			ExecutedAt:          item.ExecutedAt.UTC().Format(time.RFC3339),
			ErrorMessage:        item.ErrorMessage,
			ReplyCommentTweetID: item.ReplyCommentTweetID,
			ReplyToUsername:     item.ReplyToUsername,
			ReplyToTextPreview:  item.ReplyToTextPreview,
			ReplyTextPreview:    item.ReplyTextPreview,
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
