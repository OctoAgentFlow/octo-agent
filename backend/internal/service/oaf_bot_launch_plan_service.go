package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"
)

type launchPlanGenerator func(context.Context, dto.OAFBotLaunchPlanRequest) (dto.OAFBotLaunchPlanOutput, error)

type OAFBotLaunchPlanService struct {
	repo     *repository.OAFBotLaunchPlanRepository
	ai       *AIService
	generate launchPlanGenerator
}

func NewOAFBotLaunchPlanService(repo *repository.OAFBotLaunchPlanRepository, ai *AIService) *OAFBotLaunchPlanService {
	s := &OAFBotLaunchPlanService{repo: repo, ai: ai}
	s.generate = s.callGenerate
	return s
}

func (s *OAFBotLaunchPlanService) Generate(ctx context.Context, req dto.OAFBotLaunchPlanRequest) (*dto.OAFBotLaunchPlanResponse, error) {
	req = normalizeLaunchPlanRequest(req)
	if strings.TrimSpace(req.ProjectSummary) == "" {
		return nil, fmt.Errorf("project summary is required")
	}
	if s.repo == nil {
		return nil, fmt.Errorf("launch plan repository is not configured")
	}
	plan, err := s.generate(ctx, req)
	if err != nil {
		return nil, err
	}
	plan = normalizeLaunchPlanOutput(plan, req)
	if len(plan.FirstPosts) != 3 || len(plan.CommentExamples) != 3 {
		return nil, fmt.Errorf("launch plan generation returned incomplete drafts")
	}
	token, err := randomLaunchPlanToken()
	if err != nil {
		return nil, err
	}
	inputJSON, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal launch plan input: %w", err)
	}
	outputJSON, err := json.Marshal(plan)
	if err != nil {
		return nil, fmt.Errorf("marshal launch plan output: %w", err)
	}
	now := time.Now().UTC()
	row := &model.OAFBotLaunchPlan{
		PublicToken: token,
		Stage:       req.Stage,
		AccountType: req.AccountType,
		XHandle:     normalizeHandle(req.XHandle),
		InputJSON:   string(inputJSON),
		OutputJSON:  string(outputJSON),
	}
	if err := s.repo.Create(row); err != nil {
		return nil, err
	}
	return &dto.OAFBotLaunchPlanResponse{
		Token:           token,
		CreateOAFBotURL: "/login?next=" + url.QueryEscape("/oaf-bots?launch_plan="+token),
		Plan:            plan,
		CreatedAt:       now.Format(time.RFC3339),
	}, nil
}

func (s *OAFBotLaunchPlanService) callGenerate(ctx context.Context, req dto.OAFBotLaunchPlanRequest) (dto.OAFBotLaunchPlanOutput, error) {
	if s == nil || s.ai == nil {
		return dto.OAFBotLaunchPlanOutput{}, fmt.Errorf("ai service is not configured")
	}
	return s.ai.GenerateOAFBotLaunchPlan(ctx, req)
}

func normalizeLaunchPlanRequest(req dto.OAFBotLaunchPlanRequest) dto.OAFBotLaunchPlanRequest {
	req.Stage = normalizeLaunchPlanStage(req.Stage)
	req.AccountType = normalizeLaunchPlanAccountType(req.AccountType)
	req.XHandle = normalizeHandle(req.XHandle)
	req.ProjectSummary = limitString(req.ProjectSummary, 1200)
	req.TargetAudience = limitString(req.TargetAudience, 800)
	req.DesiredFollowers = limitString(req.DesiredFollowers, 500)
	req.Industry = limitString(req.Industry, 300)
	req.SourceMaterial = limitString(req.SourceMaterial, 1800)
	req.VoicePreference = limitString(req.VoicePreference, 300)
	req.Guardrails = limitString(req.Guardrails, 800)
	req.WebsiteURL = limitString(req.WebsiteURL, 512)
	req.OutputLanguage = normalizeLaunchPlanOutputLanguage(req.OutputLanguage)
	return req
}

func normalizeLaunchPlanStage(value string) string {
	switch strings.TrimSpace(value) {
	case "existing_account", "multi_account":
		return strings.TrimSpace(value)
	default:
		return "start_from_zero"
	}
}

func normalizeLaunchPlanAccountType(value string) string {
	switch strings.TrimSpace(value) {
	case "brand", "founder_operator", "kol_creator", "community", "agency":
		return strings.TrimSpace(value)
	default:
		return "founder_operator"
	}
}

func normalizeLaunchPlanOutputLanguage(value string) string {
	switch strings.TrimSpace(value) {
	case "en":
		return "en"
	default:
		return "zh-CN"
	}
}

func normalizeLaunchPlanOutput(out dto.OAFBotLaunchPlanOutput, req dto.OAFBotLaunchPlanRequest) dto.OAFBotLaunchPlanOutput {
	out.AccountPositioning = limitString(out.AccountPositioning, 500)
	out.RecommendedBotType = limitString(firstNonEmpty(out.RecommendedBotType, launchPlanAccountTypeLabel(req.AccountType)), 80)
	out.RecommendedOccupation = limitString(firstNonEmpty(out.RecommendedOccupation, "Founder / operator"), 120)
	out.RecommendedIndustries = limitStringList(out.RecommendedIndustries, 5, 80)
	out.ContentThemes = limitStringList(out.ContentThemes, 6, 120)
	out.SafetyGuardrails = limitStringList(out.SafetyGuardrails, 6, 160)
	out.SevenDayPlan = normalizeLaunchPlanDays(out.SevenDayPlan)
	out.FirstPosts = normalizeLaunchPlanDrafts(out.FirstPosts, 3, 240)
	out.CommentExamples = normalizeLaunchPlanDrafts(out.CommentExamples, 3, 220)
	out.BioSuggestion = limitString(out.BioSuggestion, 180)
	out.OperatingCadence = limitString(out.OperatingCadence, 360)
	out.CreateOAFBotCTA = limitString(firstNonEmpty(out.CreateOAFBotCTA, "Use this plan to create an OAF Bot."), 160)
	if len(out.RecommendedIndustries) == 0 && strings.TrimSpace(req.Industry) != "" {
		out.RecommendedIndustries = []string{limitString(req.Industry, 80)}
	}
	if len(out.ContentThemes) == 0 {
		out.ContentThemes = []string{"Account positioning", "Founder/operator notes", "Product workflow proof"}
	}
	if len(out.SafetyGuardrails) == 0 {
		out.SafetyGuardrails = []string{"No guaranteed growth", "No spam", "No financial promises"}
	}
	return out
}

func normalizeLaunchPlanDays(days []dto.OAFBotLaunchPlanDay) []dto.OAFBotLaunchPlanDay {
	out := make([]dto.OAFBotLaunchPlanDay, 0, 7)
	for _, day := range days {
		if len(out) >= 7 {
			break
		}
		item := dto.OAFBotLaunchPlanDay{
			Day:     day.Day,
			Theme:   limitString(day.Theme, 120),
			Action:  limitString(day.Action, 180),
			Outcome: limitString(day.Outcome, 160),
		}
		if item.Day <= 0 {
			item.Day = len(out) + 1
		}
		if item.Theme == "" && item.Action == "" {
			continue
		}
		out = append(out, item)
	}
	return out
}

func normalizeLaunchPlanDrafts(drafts []dto.OAFBotLaunchPlanDraft, limit int, maxContent int) []dto.OAFBotLaunchPlanDraft {
	out := make([]dto.OAFBotLaunchPlanDraft, 0, limit)
	for _, draft := range drafts {
		if len(out) >= limit {
			break
		}
		content := fitGeneratedTweet(draft.Content, maxContent)
		if content == "" {
			continue
		}
		out = append(out, dto.OAFBotLaunchPlanDraft{
			Label:   limitString(draft.Label, 80),
			Content: content,
			Why:     limitString(draft.Why, 180),
		})
	}
	return out
}

func limitStringList(values []string, limit int, maxRunes int) []string {
	out := make([]string, 0, limit)
	seen := map[string]bool{}
	for _, value := range values {
		v := limitString(value, maxRunes)
		key := strings.ToLower(v)
		if v == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, v)
		if limit > 0 && len(out) >= limit {
			return out
		}
	}
	return out
}

func launchPlanAccountTypeLabel(value string) string {
	switch strings.TrimSpace(value) {
	case "brand":
		return "Brand account"
	case "kol_creator":
		return "KOL / creator"
	case "community":
		return "Community account"
	case "agency":
		return "Agency managed"
	default:
		return "Founder / operator"
	}
}

func randomLaunchPlanToken() (string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate launch plan token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}
