package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"gorm.io/gorm"
)

var ErrOAFBotLimitExceeded = errors.New("oaf bot limit exceeded for current plan")

type OAFBotService struct {
	botRepo     *repository.OAFBotRepository
	accountRepo *repository.TwitterAccountRepository
	userRepo    *repository.UserRepository
	ai          *AIService
}

func NewOAFBotService(botRepo *repository.OAFBotRepository, accountRepo *repository.TwitterAccountRepository, userRepo *repository.UserRepository, ai *AIService) *OAFBotService {
	return &OAFBotService{botRepo: botRepo, accountRepo: accountRepo, userRepo: userRepo, ai: ai}
}

func (s *OAFBotService) List(userID uint) (*dto.OAFBotListResponse, error) {
	rows, err := s.botRepo.ListByUserID(userID)
	if err != nil {
		return nil, err
	}
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	limits := subscription.LimitsForUser(user)
	items := make([]dto.OAFBotItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, oafBotToDTO(row))
	}
	usage := dto.PlanUsageData{OAFBots: int64(len(items))}
	if n, err := s.accountRepo.CountByUserID(userID); err == nil {
		usage.TwitterAccounts = n
	}
	return &dto.OAFBotListResponse{
		Items:  items,
		Usage:  usage,
		Limits: planLimitsToDTO(limits),
	}, nil
}

func (s *OAFBotService) Get(userID, id uint) (*dto.OAFBotItem, error) {
	bot, err := s.botRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	item := oafBotToDTO(*bot)
	return &item, nil
}

func (s *OAFBotService) Create(userID uint, req dto.OAFBotUpsertRequest) (*dto.OAFBotItem, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	limits := subscription.LimitsForUser(user)
	count, err := s.botRepo.CountByUserID(userID)
	if err != nil {
		return nil, err
	}
	if count >= limits.MaxBots {
		return nil, ErrOAFBotLimitExceeded
	}
	if err := s.assertTwitterAccount(userID, req.TwitterAccountID); err != nil {
		return nil, err
	}
	bot := &model.OAFBot{UserID: userID}
	applyOAFBotRequest(bot, req)
	if err := s.botRepo.Create(bot); err != nil {
		return nil, err
	}
	item := oafBotToDTO(*bot)
	return &item, nil
}

func (s *OAFBotService) Update(userID, id uint, req dto.OAFBotUpsertRequest) (*dto.OAFBotItem, error) {
	bot, err := s.botRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	if err := s.assertTwitterAccount(userID, req.TwitterAccountID); err != nil {
		return nil, err
	}
	applyOAFBotRequest(bot, req)
	if err := s.botRepo.Save(bot); err != nil {
		return nil, err
	}
	item := oafBotToDTO(*bot)
	return &item, nil
}

func (s *OAFBotService) TestGenerate(ctx context.Context, userID, id uint) (*dto.OAFBotTestGenerateResponse, error) {
	bot, err := s.botRepo.GetByUserAndID(userID, id)
	if err != nil {
		return nil, err
	}
	return s.ai.GenerateOAFBotSamples(ctx, GenerateOAFBotSamplesInput{
		Name:            bot.Name,
		Occupation:      bot.Occupation,
		Industry:        bot.Industry,
		AgeRange:        bot.AgeRange,
		Gender:          bot.Gender,
		Education:       bot.Education,
		MBTI:            bot.MBTI,
		PersonalityTags: decodeStringList(bot.PersonalityTags),
		IdentitySummary: bot.IdentitySummary,
		VoiceTone:       bot.VoiceTone,
		Topics:          decodeStringList(bot.Topics),
		ForbiddenTopics: decodeStringList(bot.ForbiddenTopics),
		GrowthGoal:      bot.GrowthGoal,
		SafetyMode:      bot.SafetyMode,
	})
}

func (s *OAFBotService) assertTwitterAccount(userID uint, accountID uint) error {
	if accountID == 0 {
		return nil
	}
	if _, err := s.accountRepo.GetConnectedByUserAndAccountID(userID, accountID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("twitter_account_id does not belong to current user")
		}
		return err
	}
	return nil
}

func applyOAFBotRequest(bot *model.OAFBot, req dto.OAFBotUpsertRequest) {
	bot.Name = limitString(req.Name, 96)
	bot.TwitterAccountID = req.TwitterAccountID
	bot.Occupation = limitString(req.Occupation, 128)
	bot.Industry = limitString(req.Industry, 128)
	bot.AgeRange = limitString(req.AgeRange, 64)
	bot.Gender = limitString(req.Gender, 64)
	bot.Education = limitString(req.Education, 128)
	bot.MBTI = strings.ToUpper(limitString(req.MBTI, 32))
	bot.PersonalityTags = encodeStringList(req.PersonalityTags)
	bot.IdentitySummary = limitString(req.IdentitySummary, 2000)
	bot.VoiceTone = limitString(req.VoiceTone, 128)
	bot.Topics = encodeStringList(req.Topics)
	bot.ForbiddenTopics = encodeStringList(req.ForbiddenTopics)
	bot.GrowthGoal = limitString(req.GrowthGoal, 2000)
	bot.SafetyMode = limitString(req.SafetyMode, 64)
	if bot.SafetyMode == "" {
		bot.SafetyMode = "balanced"
	}
}

func oafBotToDTO(bot model.OAFBot) dto.OAFBotItem {
	return dto.OAFBotItem{
		ID:               bot.ID,
		Name:             bot.Name,
		TwitterAccountID: bot.TwitterAccountID,
		Occupation:       bot.Occupation,
		Industry:         bot.Industry,
		AgeRange:         bot.AgeRange,
		Gender:           bot.Gender,
		Education:        bot.Education,
		MBTI:             bot.MBTI,
		PersonalityTags:  decodeStringList(bot.PersonalityTags),
		IdentitySummary:  bot.IdentitySummary,
		VoiceTone:        bot.VoiceTone,
		Topics:           decodeStringList(bot.Topics),
		ForbiddenTopics:  decodeStringList(bot.ForbiddenTopics),
		GrowthGoal:       bot.GrowthGoal,
		SafetyMode:       bot.SafetyMode,
		CreatedAt:        bot.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:        bot.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func encodeStringList(items []string) string {
	clean := make([]string, 0, len(items))
	seen := map[string]bool{}
	for _, item := range items {
		v := strings.TrimSpace(item)
		if v == "" || seen[strings.ToLower(v)] {
			continue
		}
		seen[strings.ToLower(v)] = true
		clean = append(clean, limitString(v, 80))
	}
	raw, _ := json.Marshal(clean)
	return string(raw)
}

func decodeStringList(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []string{}
	}
	return out
}

func limitString(s string, max int) string {
	s = strings.TrimSpace(s)
	if max <= 0 {
		return s
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
