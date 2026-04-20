package service

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"
)

type AutomationService struct {
	repo         *repository.AutomationRepository
	userRepo     *repository.UserRepository
	activityRepo *repository.ActivityRepository
	postRepo     *repository.PostRepository
}

func NewAutomationService(
	repo *repository.AutomationRepository,
	userRepo *repository.UserRepository,
	activityRepo *repository.ActivityRepository,
	postRepo *repository.PostRepository,
) *AutomationService {
	return &AutomationService{repo: repo, userRepo: userRepo, activityRepo: activityRepo, postRepo: postRepo}
}

func (s *AutomationService) List(userID uint) (*dto.AutomationsResponse, error) {
	if err := s.repo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	modules, err := s.repo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AutomationModuleData, 0, len(modules))
	for _, m := range modules {
		items = append(items, toAutomationModuleData(m))
	}
	if s.activityRepo != nil {
		now := time.Now().UTC()
		dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		for i := range items {
			nDayByType, err := s.activityRepo.CountSuccessByTypeBetween(userID, items[i].Type, dayStart, now)
			if err != nil {
				return nil, err
			}
			items[i].ExecutedToday = int(nDayByType)

			if items[i].Type != "reply" {
				continue
			}
			nDay, err := s.activityRepo.CountReplySuccessBetween(userID, dayStart, now)
			if err != nil {
				return nil, err
			}
			dl := items[i].Config.Frequency.DailyLimit
			rem := dl - int(nDay)
			if rem < 0 {
				rem = 0
			}
			last, err := s.activityRepo.LatestReplyExecutedAt(userID)
			if err != nil {
				return nil, err
			}
			lastStr := ""
			if last != nil {
				lastStr = last.UTC().Format(time.RFC3339)
			}
			items[i].ReplyUsage = &dto.AutomationReplyUsage{
				TodayCount:     int(nDay),
				DailyLimit:     dl,
				RemainingToday: rem,
				LastExecutedAt: lastStr,
			}
		}
	}
	return &dto.AutomationsResponse{Modules: items}, nil
}

func (s *AutomationService) Update(userID uint, typ string, req dto.AutomationConfigPayload) (*dto.AutomationModuleData, error) {
	if !isValidAutomationType(typ) {
		return nil, errors.New("invalid automation type")
	}
	if strings.TrimSpace(req.Tone) == "" {
		return nil, errors.New("tone is required")
	}
	if err := s.repo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	cfg, err := s.repo.GetByUserAndType(userID, typ)
	if err != nil {
		return nil, err
	}
	keywords, _ := json.Marshal(req.Safety.BlockedKeywords)

	if req.Enabled {
		if err := s.assertSubscriptionForAutomation(userID); err != nil {
			return nil, err
		}
	}
	cfg.Enabled = req.Enabled
	cfg.FrequencyIntervalMinutes = req.Frequency.IntervalMinutes
	cfg.FrequencyDailyLimit = req.Frequency.DailyLimit
	cfg.Tone = req.Tone
	cfg.SafetyRequireApproval = req.Safety.RequireApproval
	cfg.SafetyMaxPerHour = req.Safety.MaxPerHour
	cfg.SafetyBlockedKeywords = string(keywords)

	now := time.Now()
	if cfg.Enabled {
		if cfg.State == "Paused" {
			cfg.State = "Queued"
		}
		next := now.Add(time.Duration(cfg.FrequencyIntervalMinutes) * time.Minute)
		cfg.NextRunAt = &next
	} else {
		cfg.State = "Paused"
		cfg.NextRunAt = nil
	}
	if err := s.repo.Save(cfg); err != nil {
		return nil, err
	}
	data := toAutomationModuleData(*cfg)
	return &data, nil
}

func (s *AutomationService) Toggle(userID uint, typ string, enabled bool) (*dto.AutomationModuleData, error) {
	if !isValidAutomationType(typ) {
		return nil, errors.New("invalid automation type")
	}
	if err := s.repo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	cfg, err := s.repo.GetByUserAndType(userID, typ)
	if err != nil {
		return nil, err
	}
	if enabled {
		if err := s.assertSubscriptionForAutomation(userID); err != nil {
			return nil, err
		}
	}
	cfg.Enabled = enabled
	now := time.Now()
	if enabled {
		if cfg.State == "Paused" {
			cfg.State = "Queued"
		}
		next := now.Add(time.Duration(cfg.FrequencyIntervalMinutes) * time.Minute)
		cfg.NextRunAt = &next
	} else {
		cfg.State = "Paused"
		cfg.NextRunAt = nil
	}
	if err := s.repo.Save(cfg); err != nil {
		return nil, err
	}
	data := toAutomationModuleData(*cfg)
	return &data, nil
}

func (s *AutomationService) RuntimeStatus(userID uint) (*dto.AutomationRuntimeStatusData, error) {
	if err := s.repo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	modules, err := s.repo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	since24h := now.Add(-24 * time.Hour)

	needsReviewRows, err := s.activityRepo.CountByStatusSince(userID, "review", time.Time{})
	if err != nil {
		return nil, err
	}
	retries24hRows, err := s.activityRepo.CountByStatusSince(userID, "failed", since24h)
	if err != nil {
		return nil, err
	}
	lastSuccessAt := ""
	if t, err := s.activityRepo.LatestSuccessExecutedAt(userID); err != nil {
		return nil, err
	} else if t != nil {
		lastSuccessAt = t.UTC().Format(time.RFC3339)
	}

	queuedPosts := int64(0)
	if s.postRepo != nil {
		queuedPosts, err = s.postRepo.CountByUserAndStatuses(userID, []string{"scheduled", "processing"})
		if err != nil {
			return nil, err
		}
	}
	enabledCount := 0
	for _, m := range modules {
		if m.Enabled {
			enabledCount++
		}
	}
	// QueueDepth real source:
	// - scheduled/processing posts (actual pending publish tasks)
	// - review activities awaiting manual action
	// - enabled automation modules as lightweight baseline workers
	queueDepth := int(queuedPosts+needsReviewRows) + enabledCount

	return &dto.AutomationRuntimeStatusData{
		QueueDepth:    queueDepth,
		LastSuccessAt: lastSuccessAt,
		RetriesLast24: int(retries24hRows),
		NeedsReview:   int(needsReviewRows),
	}, nil
}

func (s *AutomationService) assertSubscriptionForAutomation(userID uint) error {
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	return subscription.AssertUserMayProduceContent(u, time.Now())
}

func isValidAutomationType(typ string) bool {
	return typ == "post" || typ == "reply" || typ == "dm"
}

func toAutomationModuleData(m model.AutomationConfig) dto.AutomationModuleData {
	var blocked []string
	_ = json.Unmarshal([]byte(m.SafetyBlockedKeywords), &blocked)
	data := dto.AutomationModuleData{
		Type:  m.Type,
		Name:  strings.ToUpper(m.Type[:1]) + m.Type[1:],
		State: m.State,
		Config: dto.AutomationConfigPayload{
			Enabled: m.Enabled,
			Frequency: dto.AutomationFrequency{
				IntervalMinutes: m.FrequencyIntervalMinutes,
				DailyLimit:      m.FrequencyDailyLimit,
			},
			Tone: m.Tone,
			Safety: dto.AutomationSafety{
				RequireApproval: m.SafetyRequireApproval,
				MaxPerHour:      m.SafetyMaxPerHour,
				BlockedKeywords: blocked,
			},
		},
	}
	if m.LastRunAt != nil {
		data.LastRunAt = m.LastRunAt.UTC().Format(time.RFC3339)
	}
	if m.NextRunAt != nil {
		data.NextRunAt = m.NextRunAt.UTC().Format(time.RFC3339)
	}
	return data
}
