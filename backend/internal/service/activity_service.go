package service

import (
	"errors"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/repository"
)

type ActivityService struct {
	repo *repository.ActivityRepository
}

func NewActivityService(repo *repository.ActivityRepository) *ActivityService {
	return &ActivityService{repo: repo}
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
	if typ != "" && typ != "post" && typ != "reply" && typ != "dm" {
		return nil, errors.New("invalid activity type")
	}
	status := strings.TrimSpace(strings.ToLower(query.Status))
	if status != "" && status != "success" && status != "review" && status != "failed" {
		return nil, errors.New("invalid activity status")
	}

	items, total, err := s.repo.List(userID, page, pageSize, typ, status)
	if err != nil {
		return nil, err
	}

	data := make([]dto.ActivityItemData, 0, len(items))
	for _, item := range items {
		data = append(data, dto.ActivityItemData{
			ID:                  item.ID,
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
