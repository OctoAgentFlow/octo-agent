package service

import (
	"fmt"
	"strings"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"
)

type ContentLibraryService struct {
	repo        *repository.ContentLibraryRepository
	accountRepo *repository.TwitterAccountRepository
	oafBotRepo  *repository.OAFBotRepository
}

func NewContentLibraryService(repo *repository.ContentLibraryRepository, accountRepo *repository.TwitterAccountRepository, oafBotRepo *repository.OAFBotRepository) *ContentLibraryService {
	return &ContentLibraryService{repo: repo, accountRepo: accountRepo, oafBotRepo: oafBotRepo}
}

func (s *ContentLibraryService) List(userID uint, query dto.ContentLibraryItemQuery) (*dto.ContentLibraryItemsResponse, error) {
	rows, err := s.repo.ListByUser(userID, repository.ContentLibraryQuery{
		TwitterAccountID: query.TwitterAccountID,
		BotID:            query.BotID,
		Status:           normalizeContentLibraryStatusForQuery(query.Status),
		Limit:            query.Limit,
	})
	if err != nil {
		return nil, err
	}
	items := make([]dto.ContentLibraryItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, contentLibraryItemToDTO(row))
	}
	return &dto.ContentLibraryItemsResponse{Items: items}, nil
}

func (s *ContentLibraryService) Get(userID, id uint) (*dto.ContentLibraryItem, error) {
	row, err := s.repo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	item := contentLibraryItemToDTO(*row)
	return &item, nil
}

func (s *ContentLibraryService) Create(userID uint, req dto.ContentLibraryItemRequest) (*dto.ContentLibraryItem, error) {
	if err := s.validateScope(userID, req.TwitterAccountID, req.BotID); err != nil {
		return nil, err
	}
	item := &model.ContentLibraryItem{UserID: userID}
	applyContentLibraryRequest(item, req)
	if err := s.repo.Create(item); err != nil {
		return nil, err
	}
	out := contentLibraryItemToDTO(*item)
	return &out, nil
}

func (s *ContentLibraryService) Update(userID, id uint, req dto.ContentLibraryItemRequest) (*dto.ContentLibraryItem, error) {
	if err := s.validateScope(userID, req.TwitterAccountID, req.BotID); err != nil {
		return nil, err
	}
	item, err := s.repo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	applyContentLibraryRequest(item, req)
	if err := s.repo.Save(item); err != nil {
		return nil, err
	}
	out := contentLibraryItemToDTO(*item)
	return &out, nil
}

func (s *ContentLibraryService) Delete(userID, id uint) error {
	return s.repo.ArchiveByUserAndID(userID, id)
}

func (s *ContentLibraryService) validateScope(userID, twitterAccountID, botID uint) error {
	if twitterAccountID != 0 && s.accountRepo != nil {
		if _, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, twitterAccountID); err != nil {
			return fmt.Errorf("x account not found")
		}
	}
	if botID != 0 && s.oafBotRepo != nil {
		if _, err := s.oafBotRepo.GetByUserAndID(userID, botID); err != nil {
			return fmt.Errorf("oaf bot not found")
		}
	}
	return nil
}

func applyContentLibraryRequest(item *model.ContentLibraryItem, req dto.ContentLibraryItemRequest) {
	if req.TwitterAccountID > 0 {
		v := req.TwitterAccountID
		item.TwitterAccountID = &v
	} else {
		item.TwitterAccountID = nil
	}
	if req.BotID > 0 {
		v := req.BotID
		item.BotID = &v
	} else {
		item.BotID = nil
	}
	item.Title = limitString(req.Title, 160)
	item.ItemType = normalizeContentLibraryType(req.ItemType)
	item.Body = strings.TrimSpace(req.Body)
	item.SourceURL = limitString(req.SourceURL, 512)
	item.Topics = encodeStringList(req.Topics)
	item.GrowthGoal = limitString(req.GrowthGoal, 512)
	item.CTAPreference = limitString(req.CTAPreference, 256)
	item.Priority = req.Priority
	if item.Priority <= 0 {
		item.Priority = 50
	}
	item.Status = normalizeContentLibraryStatus(req.Status)
}

func contentLibraryItemToDTO(row model.ContentLibraryItem) dto.ContentLibraryItem {
	out := dto.ContentLibraryItem{
		ID:            row.ID,
		UserID:        row.UserID,
		Title:         row.Title,
		ItemType:      row.ItemType,
		Body:          row.Body,
		SourceURL:     row.SourceURL,
		Topics:        decodeStringList(row.Topics),
		GrowthGoal:    row.GrowthGoal,
		CTAPreference: row.CTAPreference,
		Priority:      row.Priority,
		Status:        row.Status,
		UsageCount:    row.UsageCount,
		LastUsedAt:    formatOptionalTime(row.LastUsedAt),
		CreatedAt:     row.CreatedAt.UTC().Format(timeRFC3339),
		UpdatedAt:     row.UpdatedAt.UTC().Format(timeRFC3339),
	}
	if row.TwitterAccountID != nil {
		out.TwitterAccountID = *row.TwitterAccountID
	}
	if row.BotID != nil {
		out.BotID = *row.BotID
	}
	return out
}

func normalizeContentLibraryType(value string) string {
	switch strings.TrimSpace(value) {
	case "product_update", "feature_highlight", "pain_point", "faq", "case_study", "comparison", "tutorial", "data_insight", "announcement", "campaign", "link", "thread_seed":
		return strings.TrimSpace(value)
	default:
		return "idea"
	}
}

func normalizeContentLibraryStatus(value string) string {
	switch strings.TrimSpace(value) {
	case "paused", "archived":
		return strings.TrimSpace(value)
	default:
		return "active"
	}
}

func normalizeContentLibraryStatusForQuery(value string) string {
	switch strings.TrimSpace(value) {
	case "active", "paused", "archived":
		return strings.TrimSpace(value)
	default:
		return ""
	}
}
