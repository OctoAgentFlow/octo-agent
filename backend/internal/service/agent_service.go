package service

import (
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"
)

type AgentService struct {
	automationRepo *repository.AutomationRepository
}

func NewAgentService(automationRepo *repository.AutomationRepository) *AgentService {
	return &AgentService{automationRepo: automationRepo}
}

func (s *AgentService) List(userID uint) ([]dto.AgentResponse, error) {
	if err := s.automationRepo.EnsureDefaults(userID); err != nil {
		return nil, err
	}
	modules, err := s.automationRepo.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	items := make([]dto.AgentResponse, 0, len(modules))
	for _, m := range modules {
		items = append(items, automationToAgentResponse(m))
	}
	return items, nil
}

func automationToAgentResponse(m model.AutomationConfig) dto.AgentResponse {
	out := dto.AgentResponse{
		ID:      m.ID,
		Name:    agentDisplayName(m.Type),
		Model:   "automation:" + m.Type,
		Type:    m.Type,
		State:   m.State,
		Enabled: m.Enabled,
	}
	if m.LastRunAt != nil {
		out.LastRunAt = m.LastRunAt.UTC().Format(time.RFC3339)
	}
	if m.NextRunAt != nil {
		out.NextRunAt = m.NextRunAt.UTC().Format(time.RFC3339)
	}
	return out
}

func agentDisplayName(typ string) string {
	typ = strings.TrimSpace(strings.ToLower(typ))
	if typ == "dm" {
		return "DM Agent"
	}
	if typ == "" {
		return "Automation Agent"
	}
	return strings.ToUpper(typ[:1]) + typ[1:] + " Agent"
}
