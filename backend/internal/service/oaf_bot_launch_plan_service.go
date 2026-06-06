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
	plan = completeLaunchPlanOutput(plan, req)
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

func completeLaunchPlanOutput(out dto.OAFBotLaunchPlanOutput, req dto.OAFBotLaunchPlanRequest) dto.OAFBotLaunchPlanOutput {
	fallbackPosts := fallbackLaunchPlanPosts(req)
	for len(out.FirstPosts) < 3 && len(fallbackPosts) > 0 {
		out.FirstPosts = append(out.FirstPosts, fallbackPosts[0])
		fallbackPosts = fallbackPosts[1:]
	}
	out.FirstPosts = normalizeLaunchPlanDrafts(out.FirstPosts, 3, 240)

	fallbackComments := fallbackLaunchPlanComments(req)
	for len(out.CommentExamples) < 3 && len(fallbackComments) > 0 {
		out.CommentExamples = append(out.CommentExamples, fallbackComments[0])
		fallbackComments = fallbackComments[1:]
	}
	out.CommentExamples = normalizeLaunchPlanDrafts(out.CommentExamples, 3, 220)

	fallbackDays := fallbackLaunchPlanDays(req)
	for len(out.SevenDayPlan) < 7 && len(fallbackDays) > 0 {
		day := fallbackDays[0]
		day.Day = len(out.SevenDayPlan) + 1
		out.SevenDayPlan = append(out.SevenDayPlan, day)
		fallbackDays = fallbackDays[1:]
	}
	out.SevenDayPlan = normalizeLaunchPlanDays(out.SevenDayPlan)
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

func fallbackLaunchPlanPosts(req dto.OAFBotLaunchPlanRequest) []dto.OAFBotLaunchPlanDraft {
	if req.OutputLanguage == "zh-CN" {
		return []dto.OAFBotLaunchPlanDraft{
			{
				Label:   "账号定位",
				Content: "从 0 起号，先别急着追求频率。先让 OAF Bot 明确人设、内容记忆和安全边界，每条内容都经过审核再进入执行。",
				Why:     "用起号第一原则说明 OAF Bot 的运营价值。",
			},
			{
				Label:   "运营流程",
				Content: "一个可持续的 X 账号，不只需要灵感，还需要稳定流程：素材进入内容池，OAF Bot 生成草稿，人审核后再发布。",
				Why:     "把产品能力解释成具体运营流程。",
			},
			{
				Label:   "安全边界",
				Content: "好的自动化不是盲目代发，而是让人设、语气和边界先被定义清楚，再让 AI 帮你减少重复劳动。",
				Why:     "强调受控自动化，避免夸张承诺。",
			},
		}
	}
	return []dto.OAFBotLaunchPlanDraft{
		{
			Label:   "Account positioning",
			Content: "Starting an X account is easier when the OAF Bot has a clear role, content memory, and guardrails before any automation runs.",
			Why:     "Introduces the operating principle behind the account.",
		},
		{
			Label:   "Operating workflow",
			Content: "A sustainable X workflow starts with source material, turns it into drafts, reviews every action, then lets feedback improve the next queue.",
			Why:     "Shows the product as an operating loop, not a writing tool.",
		},
		{
			Label:   "Controlled automation",
			Content: "Good automation is not blind autopilot. Define the persona, voice, and boundaries first, then let the OAF Bot reduce repeat work safely.",
			Why:     "Frames automation around control and human review.",
		},
	}
}

func fallbackLaunchPlanComments(req dto.OAFBotLaunchPlanRequest) []dto.OAFBotLaunchPlanDraft {
	if req.OutputLanguage == "zh-CN" {
		return []dto.OAFBotLaunchPlanDraft{
			{
				Label:   "实用回应",
				Content: "同意，起号最难的不是每天发什么，而是长期保持同一个人设和边界。",
				Why:     "用 operator 视角参与讨论。",
			},
			{
				Label:   "流程补充",
				Content: "我会先把素材、语气和禁止表达放进 OAF Bot，再让它产出可审核草稿，而不是直接自动发布。",
				Why:     "自然说明审核优先的流程。",
			},
			{
				Label:   "轻问题",
				Content: "你现在运营 X 账号时，最难稳定的是内容方向、回复语气，还是发布节奏？",
				Why:     "用问题引导真实互动。",
			},
		}
	}
	return []dto.OAFBotLaunchPlanDraft{
		{
			Label:   "Operator reply",
			Content: "Exactly. The hard part is not posting more; it is keeping the same voice and boundaries over time.",
			Why:     "Adds a practical operator perspective.",
		},
		{
			Label:   "Workflow reply",
			Content: "I would put source material, voice, and blocked claims into the OAF Bot first, then review drafts before anything gets published.",
			Why:     "Explains the review-first workflow naturally.",
		},
		{
			Label:   "Light question",
			Content: "What is hardest to keep consistent in your X workflow right now: topics, replies, or publishing rhythm?",
			Why:     "Invites a focused reply without sounding promotional.",
		},
	}
}

func fallbackLaunchPlanDays(req dto.OAFBotLaunchPlanRequest) []dto.OAFBotLaunchPlanDay {
	if req.OutputLanguage == "zh-CN" {
		return []dto.OAFBotLaunchPlanDay{
			{Day: 1, Theme: "定位", Action: "确定账号代表谁、服务谁，以及绝对不能承诺什么。", Outcome: "形成清晰人设和边界。"},
			{Day: 2, Theme: "内容池", Action: "整理 3-5 条可信素材，放入 OAF Bot 可引用的内容池。", Outcome: "减少空泛生成。"},
			{Day: 3, Theme: "语气", Action: "写出 3 条样例内容，审核并编辑，让 Bot 学习表达偏好。", Outcome: "初步稳定语气。"},
			{Day: 4, Theme: "首发", Action: "生成首批帖子草稿，只复制或发布通过人工审核的内容。", Outcome: "安全开始输出。"},
			{Day: 5, Theme: "互动", Action: "选择少量高相关讨论，用评论示例练习自然参与。", Outcome: "建立真实互动。"},
			{Day: 6, Theme: "复盘", Action: "记录被拒绝、被编辑和被复制的内容，更新边界和主题。", Outcome: "让后续草稿更贴近账号。"},
			{Day: 7, Theme: "节奏", Action: "确定每周发帖、评论和复盘频率，保持审核优先。", Outcome: "形成可持续运营节奏。"},
		}
	}
	return []dto.OAFBotLaunchPlanDay{
		{Day: 1, Theme: "Positioning", Action: "Define who the account represents, who it serves, and which claims are off-limits.", Outcome: "Clear persona and guardrails."},
		{Day: 2, Theme: "Content memory", Action: "Collect 3-5 trusted source notes for the OAF Bot to reference.", Outcome: "Less generic generation."},
		{Day: 3, Theme: "Voice", Action: "Generate three sample posts, edit them, and let the Bot learn your preferences.", Outcome: "Early voice consistency."},
		{Day: 4, Theme: "First posts", Action: "Create the first post drafts and only copy or publish reviewed content.", Outcome: "Safe public start."},
		{Day: 5, Theme: "Interaction", Action: "Pick a few relevant conversations and test natural comment examples.", Outcome: "Real engagement practice."},
		{Day: 6, Theme: "Learning", Action: "Review rejected, edited, and copied content to refine topics and guardrails.", Outcome: "Better future drafts."},
		{Day: 7, Theme: "Cadence", Action: "Set a weekly rhythm for posts, comments, and review-first operations.", Outcome: "Sustainable operating habit."},
	}
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
