package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"octo-agent/backend/internal/dto"
	openaiint "octo-agent/backend/internal/integration/openai"
)

type AIService struct {
	openai *openaiint.Client
}

type AIGeneratedText struct {
	Text  string
	Usage openaiint.TextUsage
}

type AutoCommentCandidate struct {
	Type    string `json:"type"`
	Label   string `json:"label"`
	Comment string `json:"comment"`
}

type AIGeneratedAutoCommentCandidates struct {
	Text       string
	Candidates []AutoCommentCandidate
	Usage      openaiint.TextUsage
}

type AutoCommentTargetSuggestion struct {
	Handle      string `json:"handle"`
	DisplayName string `json:"display_name"`
	Category    string `json:"category"`
	Priority    int    `json:"priority"`
	Reason      string `json:"reason"`
	SearchQuery string `json:"search_query"`
}

type GenerateAutoCommentTargetSuggestionsInput struct {
	BotName          string
	ProjectOneLiner  string
	TargetAudience   string
	CoreValueProps   string
	ProductFeatures  string
	Differentiators  string
	Topics           []string
	Keywords         []string
	ContentTitles    []string
	ContentTopics    []string
	ExistingTargets  []string
	HighScoreTargets []string
}

type AIGeneratedAutoCommentTargetSuggestions struct {
	Items []AutoCommentTargetSuggestion
	Usage openaiint.TextUsage
}

type GenerationContentContextItem struct {
	Title         string
	ItemType      string
	Body          string
	SourceURL     string
	Topics        []string
	GrowthGoal    string
	CTAPreference string
}

type GenerateAutoCommentInput struct {
	TargetUsername    string
	TargetTweet       string
	Tone              string
	BlockedWords      []string
	HasBot            bool
	Name              string
	Occupation        string
	Industry          string
	AgeRange          string
	Gender            string
	Education         string
	MBTI              string
	PersonalityTags   []string
	IdentitySummary   string
	VoiceTone         string
	Topics            []string
	ForbiddenTopics   []string
	GrowthGoal        string
	ProjectOneLiner   string
	TargetAudience    string
	CoreValueProps    string
	ProductFeatures   string
	Differentiators   string
	ContentPillars    []string
	ContentObjectives string
	PreferredCTA      string
	WebsiteURL        string
	TelegramURL       string
	DiscordURL        string
	DocsURL           string
	CTAPolicy         string
	Hashtags          []string
	Keywords          []string
	ComplianceNotes   string
	AvoidClaims       []string
	SafetyMode        string
	PrimaryLanguage   string
	LanguageStrategy  string
	ContentContext    []GenerationContentContextItem
	FeedbackSignals   []string
}

type GenerateAutoReplyInput struct {
	CommentAuthor     string
	RootTweet         string
	CommentText       string
	Tone              string
	BlockedWords      []string
	HasBot            bool
	Name              string
	Occupation        string
	Industry          string
	AgeRange          string
	Gender            string
	Education         string
	MBTI              string
	PersonalityTags   []string
	IdentitySummary   string
	VoiceTone         string
	Topics            []string
	ForbiddenTopics   []string
	GrowthGoal        string
	ProjectOneLiner   string
	TargetAudience    string
	CoreValueProps    string
	ProductFeatures   string
	Differentiators   string
	ContentPillars    []string
	ContentObjectives string
	PreferredCTA      string
	WebsiteURL        string
	TelegramURL       string
	DiscordURL        string
	DocsURL           string
	CTAPolicy         string
	Hashtags          []string
	Keywords          []string
	ComplianceNotes   string
	AvoidClaims       []string
	SafetyMode        string
	PrimaryLanguage   string
	LanguageStrategy  string
	ContentContext    []GenerationContentContextItem
}

type GenerateAutoDMInput struct {
	RecipientUsername string
	RecentInteraction string
	Tone              string
	HasBot            bool
	Name              string
	Occupation        string
	Industry          string
	IdentitySummary   string
	VoiceTone         string
	Topics            []string
	GrowthGoal        string
	ProjectOneLiner   string
	TargetAudience    string
	CoreValueProps    string
	ProductFeatures   string
	Differentiators   string
	PreferredCTA      string
	WebsiteURL        string
	TelegramURL       string
	DiscordURL        string
	DocsURL           string
	CTAPolicy         string
	Keywords          []string
	ComplianceNotes   string
	AvoidClaims       []string
	PrimaryLanguage   string
	LanguageStrategy  string
	ContentContext    []GenerationContentContextItem
}

type GenerateOAFBotSamplesInput struct {
	Scene             string
	SampleContext     string
	UnsafeContent     string
	RewriteMode       string
	SafetyHits        []dto.OAFBotSafetyHit
	Name              string
	Occupation        string
	Industry          string
	AgeRange          string
	Gender            string
	Education         string
	MBTI              string
	PersonalityTags   []string
	IdentitySummary   string
	VoiceTone         string
	Topics            []string
	ForbiddenTopics   []string
	GrowthGoal        string
	ProjectOneLiner   string
	TargetAudience    string
	CoreValueProps    string
	ProductFeatures   string
	Differentiators   string
	ContentPillars    []string
	ContentObjectives string
	PreferredCTA      string
	WebsiteURL        string
	TelegramURL       string
	DiscordURL        string
	DocsURL           string
	CTAPolicy         string
	Hashtags          []string
	Keywords          []string
	ComplianceNotes   string
	AvoidClaims       []string
	SafetyMode        string
	PrimaryLanguage   string
	LanguageStrategy  string
}

type CompleteOAFBotProfileInput struct {
	Mode              string
	Name              string
	Occupation        string
	Industry          string
	AgeRange          string
	Gender            string
	Education         string
	MBTI              string
	PersonalityTags   []string
	IdentitySummary   string
	VoiceTone         string
	Topics            []string
	ForbiddenTopics   []string
	GrowthGoal        string
	ProjectOneLiner   string
	TargetAudience    string
	CoreValueProps    string
	ProductFeatures   string
	Differentiators   string
	ContentPillars    []string
	ContentObjectives string
	PreferredCTA      string
	WebsiteURL        string
	TelegramURL       string
	DiscordURL        string
	DocsURL           string
	CTAPolicy         string
	Hashtags          []string
	Keywords          []string
	ComplianceNotes   string
	AvoidClaims       []string
	SafetyMode        string
	PrimaryLanguage   string
	LanguageStrategy  string
	FeedbackSignals   []string
}

type GenerateAutoPostInput struct {
	AccountHandle     string
	Topic             string
	ContentDirection  string
	ContentItemTitle  string
	ContentItemType   string
	ContentItemBody   string
	ContentItemURL    string
	ContentItemTopics []string
	ContentItemGoal   string
	ContentItemCTA    string
	RecentPosts       []string
	ContentLengthMode string
	MaxCharacters     int
	HasBot            bool
	Name              string
	Occupation        string
	Industry          string
	AgeRange          string
	Gender            string
	Education         string
	MBTI              string
	PersonalityTags   []string
	IdentitySummary   string
	VoiceTone         string
	Topics            []string
	ForbiddenTopics   []string
	GrowthGoal        string
	ProjectOneLiner   string
	TargetAudience    string
	CoreValueProps    string
	ProductFeatures   string
	Differentiators   string
	ContentPillars    []string
	ContentObjectives string
	PreferredCTA      string
	WebsiteURL        string
	TelegramURL       string
	DiscordURL        string
	DocsURL           string
	CTAPolicy         string
	Hashtags          []string
	Keywords          []string
	ComplianceNotes   string
	AvoidClaims       []string
	SafetyMode        string
	PrimaryLanguage   string
	LanguageStrategy  string
}

func NewAIService(openaiClient *openaiint.Client) *AIService {
	return &AIService{openai: openaiClient}
}

func (s *AIService) providerSource() string {
	if s != nil && s.openai != nil && s.openai.IsConfigured() {
		return "openai"
	}
	return "unconfigured"
}

func (s *AIService) GenerateAutoReply(ctx context.Context, in GenerateAutoReplyInput) (AIGeneratedText, error) {
	commentText := strings.TrimSpace(in.CommentText)
	if commentText == "" {
		return AIGeneratedText{}, fmt.Errorf("comment text is required")
	}
	tone := strings.TrimSpace(in.Tone)
	if tone == "" {
		tone = "Friendly"
	}
	system := strings.Join([]string{
		"You are Octo-Agent Flow's Auto Reply assistant.",
		"Write one concise X/Twitter reply to a user's comment.",
		"Directly address the user's comment and keep the account voice consistent.",
		"Output only the reply text.",
	}, " ")

	var user strings.Builder
	user.WriteString("Comment author: @")
	user.WriteString(strings.TrimPrefix(strings.TrimSpace(in.CommentAuthor), "@"))
	user.WriteString("\n")
	if strings.TrimSpace(in.RootTweet) != "" {
		user.WriteString("Original post context:\n")
		user.WriteString(strings.TrimSpace(in.RootTweet))
		user.WriteString("\n\n")
	}
	user.WriteString("Comment to reply to:\n")
	user.WriteString(commentText)
	user.WriteString("\n\n")
	if in.HasBot {
		user.WriteString("Use this OAF Bot persona:\n")
		user.WriteString("name: " + strings.TrimSpace(in.Name) + "\n")
		user.WriteString("occupation: " + strings.TrimSpace(in.Occupation) + "\n")
		user.WriteString("industry: " + strings.TrimSpace(in.Industry) + "\n")
		user.WriteString("age_range: " + strings.TrimSpace(in.AgeRange) + "\n")
		user.WriteString("gender: " + strings.TrimSpace(in.Gender) + "\n")
		user.WriteString("education: " + strings.TrimSpace(in.Education) + "\n")
		user.WriteString("mbti: " + strings.TrimSpace(in.MBTI) + "\n")
		user.WriteString("personality_tags: " + strings.Join(in.PersonalityTags, ", ") + "\n")
		user.WriteString("identity_summary: " + strings.TrimSpace(in.IdentitySummary) + "\n")
		user.WriteString("voice_tone: " + strings.TrimSpace(in.VoiceTone) + "\n")
		user.WriteString("topics: " + strings.Join(in.Topics, ", ") + "\n")
		user.WriteString("forbidden_topics: " + strings.Join(in.ForbiddenTopics, ", ") + "\n")
		user.WriteString("growth_goal: " + strings.TrimSpace(in.GrowthGoal) + "\n")
		writeOAFBotStrategyContext(&user, oafBotStrategyContext{
			ProjectOneLiner:   in.ProjectOneLiner,
			TargetAudience:    in.TargetAudience,
			CoreValueProps:    in.CoreValueProps,
			ProductFeatures:   in.ProductFeatures,
			Differentiators:   in.Differentiators,
			ContentPillars:    in.ContentPillars,
			ContentObjectives: in.ContentObjectives,
			PreferredCTA:      in.PreferredCTA,
			WebsiteURL:        in.WebsiteURL,
			TelegramURL:       in.TelegramURL,
			DiscordURL:        in.DiscordURL,
			DocsURL:           in.DocsURL,
			CTAPolicy:         in.CTAPolicy,
			Hashtags:          in.Hashtags,
			Keywords:          in.Keywords,
			ComplianceNotes:   in.ComplianceNotes,
			AvoidClaims:       in.AvoidClaims,
		})
		user.WriteString("safety_mode: " + strings.TrimSpace(in.SafetyMode) + "\n")
		writeLanguageConfig(&user, in.PrimaryLanguage, in.LanguageStrategy)
	} else {
		user.WriteString("No OAF Bot is bound to this account. Use the default Octo-Agent Flow voice: natural, practical, and calm.\n")
		user.WriteString("Tone: " + tone + "\n")
	}
	if len(in.BlockedWords) > 0 {
		user.WriteString("Avoid these words or topics: ")
		user.WriteString(strings.Join(in.BlockedWords, ", "))
		user.WriteString("\n")
	}
	writeGenerationContentContext(&user, in.ContentContext, 700)
	user.WriteString("Hard rules:\n")
	user.WriteString("- Maximum 220 characters.\n")
	user.WriteString("- Directly respond to the comment; do not answer a different question.\n")
	user.WriteString("- Use content library context only when it helps answer the user's exact comment. Do not force unrelated product promotion.\n")
	user.WriteString("- If the comment asks a question, answer that exact question using the original post and persona/product context. Do not use generic thanks-only replies.\n")
	user.WriteString("- If the answer is not fully known from context, acknowledge briefly and offer the safest next step instead of inventing details.\n")
	user.WriteString("- Language is mandatory: when language_strategy is follow_context, reply in the same language as the comment whenever the comment language is clear.\n")
	user.WriteString("- If the comment is negative, stay calm, professional, and non-defensive.\n")
	user.WriteString("- Do not sound like an ad and do not over-direct traffic.\n")
	user.WriteString("- You may ask a light follow-up question if it improves the interaction.\n")
	user.WriteString("- Do not impersonate an official project, exchange, or support account.\n")
	user.WriteString("- Do not insult, harass, or attack users.\n")
	user.WriteString("- Do not ask for seed phrases, private keys, wallet connections, follows, likes, airdrops, or giveaways.\n")
	user.WriteString("- Do not promise returns, profits, token prices, or investment outcomes.\n")
	user.WriteString("- Do not include surrounding quotes.\n")

	result, err := s.openai.GenerateTextWithUsage(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	})
	if err != nil {
		return AIGeneratedText{}, err
	}
	return AIGeneratedText{Text: truncateRunes(strings.TrimSpace(result.Text), 220), Usage: result.Usage}, nil
}

func (s *AIService) GenerateAutoComment(ctx context.Context, in GenerateAutoCommentInput) (AIGeneratedText, error) {
	candidates, err := s.GenerateAutoCommentCandidates(ctx, in)
	if err != nil {
		return AIGeneratedText{}, err
	}
	return AIGeneratedText{Text: candidates.Text, Usage: candidates.Usage}, nil
}

func (s *AIService) GenerateAutoCommentCandidates(ctx context.Context, in GenerateAutoCommentInput) (AIGeneratedAutoCommentCandidates, error) {
	targetTweet := strings.TrimSpace(in.TargetTweet)
	if targetTweet == "" {
		return AIGeneratedAutoCommentCandidates{}, fmt.Errorf("target tweet is required")
	}
	tone := strings.TrimSpace(in.Tone)
	if tone == "" {
		tone = "Friendly"
	}
	system := strings.Join([]string{
		"You are Octo-Agent Flow's social growth assistant.",
		"Write three concise X/Twitter comment drafts for a target tweet.",
		"The goal is to join the conversation naturally and earn exposure, without sounding spammy, generic, or manipulative.",
		"The comment will go into a human review queue before publishing.",
		"Return strict JSON only.",
	}, " ")

	var user strings.Builder
	user.WriteString("Target account: @")
	user.WriteString(strings.TrimPrefix(strings.TrimSpace(in.TargetUsername), "@"))
	user.WriteString("\n")
	user.WriteString("Target tweet:\n")
	user.WriteString(targetTweet)
	user.WriteString("\n\n")
	if in.HasBot {
		user.WriteString("Use this OAF Bot persona:\n")
		user.WriteString("name: " + strings.TrimSpace(in.Name) + "\n")
		user.WriteString("occupation: " + strings.TrimSpace(in.Occupation) + "\n")
		user.WriteString("industry: " + strings.TrimSpace(in.Industry) + "\n")
		user.WriteString("age_range: " + strings.TrimSpace(in.AgeRange) + "\n")
		user.WriteString("gender: " + strings.TrimSpace(in.Gender) + "\n")
		user.WriteString("education: " + strings.TrimSpace(in.Education) + "\n")
		user.WriteString("mbti: " + strings.TrimSpace(in.MBTI) + "\n")
		user.WriteString("personality_tags: " + strings.Join(in.PersonalityTags, ", ") + "\n")
		user.WriteString("identity_summary: " + strings.TrimSpace(in.IdentitySummary) + "\n")
		user.WriteString("voice_tone: " + strings.TrimSpace(in.VoiceTone) + "\n")
		user.WriteString("topics: " + strings.Join(in.Topics, ", ") + "\n")
		user.WriteString("forbidden_topics: " + strings.Join(in.ForbiddenTopics, ", ") + "\n")
		user.WriteString("growth_goal: " + strings.TrimSpace(in.GrowthGoal) + "\n")
		writeOAFBotStrategyContext(&user, oafBotStrategyContext{
			ProjectOneLiner:   in.ProjectOneLiner,
			TargetAudience:    in.TargetAudience,
			CoreValueProps:    in.CoreValueProps,
			ProductFeatures:   in.ProductFeatures,
			Differentiators:   in.Differentiators,
			ContentPillars:    in.ContentPillars,
			ContentObjectives: in.ContentObjectives,
			PreferredCTA:      in.PreferredCTA,
			WebsiteURL:        in.WebsiteURL,
			TelegramURL:       in.TelegramURL,
			DiscordURL:        in.DiscordURL,
			DocsURL:           in.DocsURL,
			CTAPolicy:         in.CTAPolicy,
			Hashtags:          in.Hashtags,
			Keywords:          in.Keywords,
			ComplianceNotes:   in.ComplianceNotes,
			AvoidClaims:       in.AvoidClaims,
		})
		user.WriteString("safety_mode: " + strings.TrimSpace(in.SafetyMode) + "\n")
		writeLanguageConfig(&user, in.PrimaryLanguage, in.LanguageStrategy)
	} else {
		user.WriteString("No OAF Bot is bound to this account. Use the default Octo-Agent Flow voice: practical, natural, useful, and non-spammy.\n")
		user.WriteString("Tone: ")
		user.WriteString(tone)
		user.WriteString("\n")
	}
	if len(in.BlockedWords) > 0 {
		user.WriteString("Avoid these words or topics: ")
		user.WriteString(strings.Join(in.BlockedWords, ", "))
		user.WriteString("\n")
	}
	writeGenerationContentContext(&user, in.ContentContext, 700)
	writeAutoCommentFeedbackSignals(&user, in.FeedbackSignals)
	user.WriteString("Candidate styles:\n")
	user.WriteString("- professional_view: a concise expert point of view.\n")
	user.WriteString("- engagement_question: a light question that invites discussion.\n")
	user.WriteString("- soft_cta: a subtle product-relevant angle without sounding like an ad.\n")
	user.WriteString("Hard rules:\n")
	user.WriteString("- Maximum 220 characters.\n")
	user.WriteString("- Prefer short, natural sentences suitable for X comments.\n")
	user.WriteString("- Add a concrete point of view or a light question when useful.\n")
	user.WriteString("- Use content library context only when it is relevant to the target tweet. Do not force unrelated product promotion.\n")
	user.WriteString("- Do not repeat the target tweet verbatim.\n")
	user.WriteString("- Do not sound like an ad and do not over-direct traffic.\n")
	user.WriteString("- Do not use hashtags unless they are already central to the target tweet.\n")
	user.WriteString("- Do not mention that you are an AI.\n")
	user.WriteString("- Do not impersonate the target account, a project official, or an exchange.\n")
	user.WriteString("- Do not ask for follows, likes, airdrops, giveaways, seed phrases, private keys, or wallet connections.\n")
	user.WriteString("- Do not promise returns, profits, token prices, or investment outcomes.\n")
	user.WriteString("- Do not include surrounding quotes.\n")
	user.WriteString("Return JSON shape: {\"candidates\":[{\"type\":\"professional_view\",\"label\":\"Professional view\",\"comment\":\"...\"},{\"type\":\"engagement_question\",\"label\":\"Engagement question\",\"comment\":\"...\"},{\"type\":\"soft_cta\",\"label\":\"Soft CTA\",\"comment\":\"...\"}]}\n")

	result, err := s.openai.GenerateTextWithUsageMaxTokens(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	}, 520)
	if err != nil {
		return AIGeneratedAutoCommentCandidates{}, err
	}
	candidates := parseAutoCommentCandidates(result.Text)
	if len(candidates) == 0 {
		return AIGeneratedAutoCommentCandidates{}, fmt.Errorf("auto comment candidates response is empty")
	}
	return AIGeneratedAutoCommentCandidates{Text: candidates[0].Comment, Candidates: candidates, Usage: result.Usage}, nil
}

func parseAutoCommentCandidates(raw string) []AutoCommentCandidate {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)
	var payload struct {
		Candidates []AutoCommentCandidate `json:"candidates"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		text := truncateRunes(strings.Trim(raw, "\"“”"), 220)
		if text == "" {
			return nil
		}
		return []AutoCommentCandidate{{Type: "professional_view", Label: "Professional view", Comment: text}}
	}
	out := make([]AutoCommentCandidate, 0, 3)
	seen := map[string]bool{}
	for _, item := range payload.Candidates {
		comment := truncateRunes(strings.TrimSpace(item.Comment), 220)
		if comment == "" || seen[strings.ToLower(comment)] {
			continue
		}
		seen[strings.ToLower(comment)] = true
		typ := normalizeAutoCommentCandidateType(item.Type)
		out = append(out, AutoCommentCandidate{
			Type:    typ,
			Label:   firstNonEmpty(strings.TrimSpace(item.Label), defaultAutoCommentCandidateLabel(typ)),
			Comment: comment,
		})
		if len(out) >= 3 {
			break
		}
	}
	return out
}

func (s *AIService) GenerateAutoCommentTargetSuggestions(ctx context.Context, in GenerateAutoCommentTargetSuggestionsInput) (AIGeneratedAutoCommentTargetSuggestions, error) {
	system := strings.Join([]string{
		"You are Octo-Agent Flow's X growth research assistant.",
		"Suggest target X accounts for Auto Comment monitoring.",
		"Return strict JSON only.",
		"Do not claim accounts are verified or currently active. Suggestions may need user verification.",
	}, " ")
	var user strings.Builder
	user.WriteString("Product / Bot context:\n")
	user.WriteString("bot_name: " + strings.TrimSpace(in.BotName) + "\n")
	user.WriteString("project_one_liner: " + strings.TrimSpace(in.ProjectOneLiner) + "\n")
	user.WriteString("target_audience: " + strings.TrimSpace(in.TargetAudience) + "\n")
	user.WriteString("core_value_props: " + strings.TrimSpace(in.CoreValueProps) + "\n")
	user.WriteString("product_features: " + strings.TrimSpace(in.ProductFeatures) + "\n")
	user.WriteString("differentiators: " + strings.TrimSpace(in.Differentiators) + "\n")
	if len(in.Topics) > 0 {
		user.WriteString("bot_topics: " + strings.Join(in.Topics, ", ") + "\n")
	}
	if len(in.Keywords) > 0 {
		user.WriteString("bot_keywords: " + strings.Join(in.Keywords, ", ") + "\n")
	}
	if len(in.ContentTitles) > 0 || len(in.ContentTopics) > 0 {
		user.WriteString("content_library_signals:\n")
		if len(in.ContentTitles) > 0 {
			user.WriteString("titles: " + strings.Join(in.ContentTitles, ", ") + "\n")
		}
		if len(in.ContentTopics) > 0 {
			user.WriteString("topics: " + strings.Join(in.ContentTopics, ", ") + "\n")
		}
	}
	if len(in.HighScoreTargets) > 0 {
		user.WriteString("existing high-opportunity targets: " + strings.Join(in.HighScoreTargets, ", ") + "\n")
	}
	if len(in.ExistingTargets) > 0 {
		user.WriteString("already monitored targets to avoid duplicating: " + strings.Join(in.ExistingTargets, ", ") + "\n")
	}
	user.WriteString("Suggest 8-12 candidate X handles across these categories: kol, founder, project, competitor, customer, media, analyst, investor, developer, community, ecosystem, partner, other.\n")
	user.WriteString("Prefer accounts likely relevant to Web3, AI agents, SocialFi, social media growth, or the supplied product context.\n")
	user.WriteString("Every item must include handle without @, category, priority 1-5, reason, and search_query for manual verification.\n")
	user.WriteString("Return JSON shape: {\"items\":[{\"handle\":\"example\",\"display_name\":\"Example\",\"category\":\"kol\",\"priority\":4,\"reason\":\"why this account is worth monitoring\",\"search_query\":\"site:x.com example AI agents\"}]}\n")

	result, err := s.openai.GenerateTextWithUsageMaxTokens(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	}, 900)
	if err != nil {
		return AIGeneratedAutoCommentTargetSuggestions{}, err
	}
	items := parseAutoCommentTargetSuggestions(result.Text, in.ExistingTargets)
	if len(items) == 0 {
		return AIGeneratedAutoCommentTargetSuggestions{}, fmt.Errorf("target suggestion response is empty")
	}
	return AIGeneratedAutoCommentTargetSuggestions{Items: items, Usage: result.Usage}, nil
}

func parseAutoCommentTargetSuggestions(raw string, existing []string) []AutoCommentTargetSuggestion {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)
	var payload struct {
		Items []AutoCommentTargetSuggestion `json:"items"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil
	}
	existingSet := map[string]bool{}
	for _, item := range existing {
		existingSet[normalizeSuggestionHandle(item)] = true
	}
	out := make([]AutoCommentTargetSuggestion, 0, len(payload.Items))
	seen := map[string]bool{}
	for _, item := range payload.Items {
		handle := normalizeSuggestionHandle(item.Handle)
		if handle == "" || existingSet[handle] || seen[handle] {
			continue
		}
		seen[handle] = true
		category := normalizeSuggestionCategory(item.Category)
		priority := item.Priority
		if priority < 1 || priority > 5 {
			priority = 3
		}
		out = append(out, AutoCommentTargetSuggestion{
			Handle:      handle,
			DisplayName: truncateRunes(strings.TrimSpace(item.DisplayName), 80),
			Category:    category,
			Priority:    priority,
			Reason:      truncateRunes(strings.TrimSpace(item.Reason), 300),
			SearchQuery: truncateRunes(strings.TrimSpace(item.SearchQuery), 180),
		})
		if len(out) >= 12 {
			break
		}
	}
	return out
}

func normalizeSuggestionHandle(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.TrimPrefix(value, "@")
	value = strings.TrimPrefix(value, "https://x.com/")
	value = strings.TrimPrefix(value, "https://twitter.com/")
	value = strings.Trim(value, "/")
	if value == "" || strings.Contains(value, "/") || strings.Contains(value, " ") {
		return ""
	}
	return value
}

func normalizeSuggestionCategory(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "kol", "founder", "project", "media", "competitor", "partner", "customer", "analyst", "investor", "developer", "community", "ecosystem", "other":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "kol"
	}
}

func writeAutoCommentFeedbackSignals(user *strings.Builder, signals []string) {
	if len(signals) == 0 {
		return
	}
	user.WriteString("Recent Auto Comment feedback to fix:\n")
	for i, signal := range signals {
		if i >= 6 {
			break
		}
		signal = strings.TrimSpace(signal)
		if signal == "" {
			continue
		}
		user.WriteString(fmt.Sprintf("- %s\n", truncateRunes(signal, 260)))
	}
	user.WriteString("Apply this feedback directly: avoid generic comments, hard-selling, off-topic replies, wrong tone, or unrelated promotion when these issues appear above.\n")
}

func normalizeAutoCommentCandidateType(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "professional_view", "engagement_question", "soft_cta":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return "professional_view"
	}
}

func defaultAutoCommentCandidateLabel(v string) string {
	switch v {
	case "engagement_question":
		return "Engagement question"
	case "soft_cta":
		return "Soft CTA"
	default:
		return "Professional view"
	}
}

func (s *AIService) GenerateAutoDM(ctx context.Context, in GenerateAutoDMInput) (AIGeneratedText, error) {
	recipient := strings.TrimPrefix(strings.TrimSpace(in.RecipientUsername), "@")
	if recipient == "" {
		recipient = "there"
	}
	system := strings.Join([]string{
		"You are Octo-Agent Flow's Auto DM assistant.",
		"Write one short, polite X/Twitter DM draft for a user who already engaged with the account.",
		"The DM must feel opt-in, useful, and non-pushy.",
		"Output only the DM text.",
	}, " ")
	var user strings.Builder
	user.WriteString("Recipient: @" + recipient + "\n")
	if strings.TrimSpace(in.RecentInteraction) != "" {
		user.WriteString("Recent interaction context:\n")
		user.WriteString(truncateRunes(in.RecentInteraction, 600))
		user.WriteString("\n")
	}
	if in.HasBot {
		user.WriteString("Use this OAF Bot persona:\n")
		user.WriteString("name: " + strings.TrimSpace(in.Name) + "\n")
		user.WriteString("occupation: " + strings.TrimSpace(in.Occupation) + "\n")
		user.WriteString("industry: " + strings.TrimSpace(in.Industry) + "\n")
		user.WriteString("identity_summary: " + strings.TrimSpace(in.IdentitySummary) + "\n")
		user.WriteString("voice_tone: " + strings.TrimSpace(in.VoiceTone) + "\n")
		user.WriteString("topics: " + strings.Join(in.Topics, ", ") + "\n")
		user.WriteString("growth_goal: " + strings.TrimSpace(in.GrowthGoal) + "\n")
		writeOAFBotStrategyContext(&user, oafBotStrategyContext{
			ProjectOneLiner: in.ProjectOneLiner,
			TargetAudience:  in.TargetAudience,
			CoreValueProps:  in.CoreValueProps,
			ProductFeatures: in.ProductFeatures,
			Differentiators: in.Differentiators,
			PreferredCTA:    in.PreferredCTA,
			WebsiteURL:      in.WebsiteURL,
			TelegramURL:     in.TelegramURL,
			DiscordURL:      in.DiscordURL,
			DocsURL:         in.DocsURL,
			CTAPolicy:       in.CTAPolicy,
			Keywords:        in.Keywords,
			ComplianceNotes: in.ComplianceNotes,
			AvoidClaims:     in.AvoidClaims,
		})
		writeLanguageConfig(&user, in.PrimaryLanguage, in.LanguageStrategy)
	} else {
		user.WriteString("Tone: " + firstNonEmpty(in.Tone, "friendly and practical") + "\n")
	}
	writeGenerationContentContext(&user, in.ContentContext, 700)
	user.WriteString("Hard rules:\n")
	user.WriteString("- Maximum 240 characters.\n")
	user.WriteString("- Mention the recent engagement only lightly.\n")
	user.WriteString("- Use content library context only when it makes the DM more useful.\n")
	user.WriteString("- Do not pretend the user requested help if they did not.\n")
	user.WriteString("- Do not ask for follows, likes, wallet connections, private keys, seed phrases, airdrops, or giveaways.\n")
	user.WriteString("- Do not promise returns, profits, token prices, or investment outcomes.\n")
	user.WriteString("- Include at most one link, and only if the CTA policy or content context makes it useful.\n")
	user.WriteString("- Make it easy to ignore. Do not pressure the recipient.\n")
	result, err := s.openai.GenerateTextWithUsage(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	})
	if err != nil {
		return AIGeneratedText{}, err
	}
	return AIGeneratedText{Text: truncateRunes(strings.TrimSpace(result.Text), 240), Usage: result.Usage}, nil
}

func (s *AIService) RewriteOAFBotSampleForSafety(ctx context.Context, in GenerateOAFBotSamplesInput) (*dto.OAFBotTestGenerateResponse, openaiint.TextUsage, error) {
	scene := normalizeSampleScene(in.Scene)
	if scene == "" {
		scene = "tweet"
	}
	unsafeContent := strings.TrimSpace(in.UnsafeContent)
	if unsafeContent == "" {
		return nil, openaiint.TextUsage{}, fmt.Errorf("content is required")
	}
	sceneInstruction, maxChars := sampleSceneInstruction(scene)
	system := strings.Join([]string{
		"You rewrite X/Twitter content for Octo-Agent Flow OAF Bot safety review.",
		"Preserve the user's persona, intent, language, and useful specifics.",
		"Remove or soften risky wording that matched safety rules.",
		"Return plain text only. Do not return JSON, markdown, labels, or surrounding quotes.",
	}, " ")
	var user strings.Builder
	user.WriteString("Requested scene: " + scene + "\n")
	user.WriteString(sceneInstruction + "\n")
	user.WriteString("Original content to rewrite:\n")
	user.WriteString(truncateRunes(unsafeContent, 1200))
	user.WriteString("\n")
	user.WriteString("Matched safety hits:\n")
	if len(in.SafetyHits) == 0 {
		user.WriteString("- No explicit hit list provided; rewrite conservatively.\n")
	}
	for _, hit := range in.SafetyHits {
		term := strings.TrimSpace(hit.Term)
		if term == "" {
			continue
		}
		user.WriteString("- " + strings.TrimSpace(hit.Source) + ": " + term + "\n")
	}
	if context := strings.TrimSpace(in.SampleContext); context != "" {
		user.WriteString("External sample context:\n")
		user.WriteString(truncateRunes(context, 1200))
		user.WriteString("\n")
	}
	user.WriteString("Persona and boundaries:\n")
	user.WriteString("Occupation: " + strings.TrimSpace(in.Occupation) + "\n")
	user.WriteString("Industry: " + strings.TrimSpace(in.Industry) + "\n")
	user.WriteString("Identity summary: " + strings.TrimSpace(in.IdentitySummary) + "\n")
	user.WriteString("Voice tone: " + strings.TrimSpace(in.VoiceTone) + "\n")
	user.WriteString("Topics: " + strings.Join(in.Topics, ", ") + "\n")
	user.WriteString("Forbidden topics: " + strings.Join(in.ForbiddenTopics, ", ") + "\n")
	user.WriteString("Avoid claims: " + strings.Join(in.AvoidClaims, ", ") + "\n")
	user.WriteString("Compliance notes: " + strings.TrimSpace(in.ComplianceNotes) + "\n")
	writeLanguageConfig(&user, in.PrimaryLanguage, in.LanguageStrategy)
	user.WriteString("Rules:\n")
	user.WriteString(fmt.Sprintf("- Maximum %d characters.\n", maxChars))
	switch strings.TrimSpace(in.RewriteMode) {
	case "conservative":
		user.WriteString("- Rewrite conservatively: remove risky phrasing, soften claims, and prefer neutral educational language.\n")
	case "shorter":
		user.WriteString("- Rewrite shorter: keep the core message but make it more concise and less promotional.\n")
	default:
		user.WriteString("- Rewrite naturally: keep the voice close to the original while removing risky wording.\n")
	}
	user.WriteString("- Do not include the matched risky terms unless they are necessary as neutral context; prefer safer alternatives.\n")
	user.WriteString("- Avoid guarantees, urgency traps, wallet/private-key prompts, official-support impersonation, and unsupported financial claims.\n")
	user.WriteString("- Keep it natural and usable as the requested scene.\n")

	result, err := s.openai.GenerateTextWithUsage(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	})
	if err != nil {
		return nil, openaiint.TextUsage{}, err
	}
	content := extractSceneContent(result.Text, scene)
	content = truncateRunes(stripGeneratedJSONWrapper(content, scene), maxChars)
	out := dto.OAFBotTestGenerateResponse{
		Scene:     scene,
		Content:   content,
		Provider:  s.providerSource(),
		RawResult: strings.TrimSpace(result.Text),
	}
	setSampleSceneContent(&out, scene, content)
	return &out, result.Usage, nil
}

func (s *AIService) GenerateOAFBotSamples(ctx context.Context, in GenerateOAFBotSamplesInput) (*dto.OAFBotTestGenerateResponse, openaiint.TextUsage, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = "OAF Bot"
	}
	scene := normalizeSampleScene(in.Scene)
	if scene == "" {
		scene = "tweet"
	}
	tone := strings.TrimSpace(in.VoiceTone)
	if tone == "" {
		tone = "clear, helpful and confident"
	}
	sceneInstruction, maxChars := sampleSceneInstruction(scene)
	system := strings.Join([]string{
		"You are Octo-Agent Flow's OAF Bot persona simulator.",
		"Generate safe example content for an AI social persona on X/Twitter.",
		"Generate only one output for the requested scene.",
		"Return plain text only. Do not return JSON, markdown, labels, field names, or surrounding quotes.",
	}, " ")

	var user strings.Builder
	user.WriteString("Requested scene: " + scene + "\n")
	user.WriteString(sceneInstruction + "\n")
	if context := strings.TrimSpace(in.SampleContext); context != "" {
		user.WriteString("External sample context:\n")
		user.WriteString(truncateRunes(context, 1200))
		user.WriteString("\n")
	} else {
		user.WriteString("External sample context: not provided.\n")
	}
	user.WriteString("Internal bot name: " + name + "\n")
	user.WriteString("Important: The internal bot name is only for dashboard identification. Do not mention the bot name in generated content unless the user's persona fields explicitly instruct self-introduction with that exact name.\n")
	user.WriteString("Occupation: " + strings.TrimSpace(in.Occupation) + "\n")
	user.WriteString("Industry: " + strings.TrimSpace(in.Industry) + "\n")
	user.WriteString("Age range: " + strings.TrimSpace(in.AgeRange) + "\n")
	user.WriteString("Gender expression: " + strings.TrimSpace(in.Gender) + "\n")
	user.WriteString("Education: " + strings.TrimSpace(in.Education) + "\n")
	user.WriteString("MBTI: " + strings.TrimSpace(in.MBTI) + "\n")
	user.WriteString("Personality tags: " + strings.Join(in.PersonalityTags, ", ") + "\n")
	user.WriteString("Identity summary: " + strings.TrimSpace(in.IdentitySummary) + "\n")
	user.WriteString("Voice tone: " + tone + "\n")
	user.WriteString("Topics: " + strings.Join(in.Topics, ", ") + "\n")
	user.WriteString("Forbidden topics: " + strings.Join(in.ForbiddenTopics, ", ") + "\n")
	user.WriteString("Growth goal: " + strings.TrimSpace(in.GrowthGoal) + "\n")
	writeOAFBotStrategyContext(&user, oafBotStrategyContext{
		ProjectOneLiner:   in.ProjectOneLiner,
		TargetAudience:    in.TargetAudience,
		CoreValueProps:    in.CoreValueProps,
		ProductFeatures:   in.ProductFeatures,
		Differentiators:   in.Differentiators,
		ContentPillars:    in.ContentPillars,
		ContentObjectives: in.ContentObjectives,
		PreferredCTA:      in.PreferredCTA,
		WebsiteURL:        in.WebsiteURL,
		TelegramURL:       in.TelegramURL,
		DiscordURL:        in.DiscordURL,
		DocsURL:           in.DocsURL,
		CTAPolicy:         in.CTAPolicy,
		Hashtags:          in.Hashtags,
		Keywords:          in.Keywords,
		ComplianceNotes:   in.ComplianceNotes,
		AvoidClaims:       in.AvoidClaims,
	})
	user.WriteString("Safety mode: " + strings.TrimSpace(in.SafetyMode) + "\n")
	writeLanguageConfig(&user, in.PrimaryLanguage, in.LanguageStrategy)
	if strings.TrimSpace(in.SampleContext) == "" {
		user.WriteString("If language_strategy is follow_context, use primary_language for this sample.\n")
	} else {
		user.WriteString("Use the external sample context as the immediate situation for the requested scene. If language_strategy is follow_context, match the context language when it is clear.\n")
	}
	user.WriteString("Rules:\n")
	user.WriteString(fmt.Sprintf("- Maximum %d characters.\n", maxChars))
	user.WriteString("- Generate only the requested scene and no other scene.\n")
	user.WriteString("- Output format: plain text only. No JSON. No markdown. No field names.\n")
	user.WriteString("- Avoid forbidden topics and do not mention that you are AI.\n")
	user.WriteString("- Keep the examples specific to the persona.\n")
	user.WriteString("- Do not mention the bot name in the content unless explicitly instructed by the user.\n")

	result, err := s.openai.GenerateTextWithUsage(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	})
	if err != nil {
		return nil, openaiint.TextUsage{}, err
	}
	text := result.Text
	content := extractSceneContent(text, scene)
	content = truncateRunes(stripGeneratedJSONWrapper(content, scene), maxChars)
	out := dto.OAFBotTestGenerateResponse{
		Scene:     scene,
		Content:   content,
		Provider:  s.providerSource(),
		RawResult: strings.TrimSpace(text),
	}
	setSampleSceneContent(&out, scene, content)
	return &out, result.Usage, nil
}

func (s *AIService) CompleteOAFBotProfile(ctx context.Context, in CompleteOAFBotProfileInput) (dto.OAFBotUpsertRequest, string, openaiint.TextUsage, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = "OAF Bot"
	}
	primaryLanguage := strings.TrimSpace(in.PrimaryLanguage)
	if primaryLanguage == "" {
		primaryLanguage = "zh-CN"
	}
	languageStrategy := strings.TrimSpace(in.LanguageStrategy)
	if languageStrategy == "" {
		languageStrategy = "follow_context"
	}
	system := strings.Join([]string{
		"You are Octo-Agent Flow's OAF Bot persona strategist.",
		"Complete missing persona and content strategy fields for an AI social bot on X/Twitter.",
		"Preserve user intent, keep fields concise, and avoid unsupported claims.",
		"Return strict JSON only. Do not return markdown, comments, or extra text.",
	}, " ")

	var user strings.Builder
	user.WriteString("Current draft fields. Empty fields need help; non-empty fields should be refined only when necessary.\n")
	if strings.TrimSpace(in.Mode) == oafBotProfileAssistModeImproveAll {
		user.WriteString("Assist mode: improve_all. You may refine existing fields when it clearly improves specificity, consistency, or safety.\n")
	} else {
		user.WriteString("Assist mode: fill_missing_only. Prioritize missing fields and avoid changing user-provided intent.\n")
	}
	if len(in.FeedbackSignals) > 0 {
		user.WriteString("Recent negative generation feedback to fix. Treat these as concrete quality signals for the revised persona and strategy fields:\n")
		for i, signal := range in.FeedbackSignals {
			user.WriteString(fmt.Sprintf("%d. %s\n", i+1, strings.TrimSpace(signal)))
		}
		user.WriteString("When feedback mentions off-persona, generic output, unsafe claims, wrong language, length, CTA, promotion links, or missing context, reflect the fix in identity_summary, voice_tone, topics, forbidden_topics, growth_goal, content_objectives, preferred_cta, cta_policy, keywords, compliance_notes, avoid_claims, primary_language, or language_strategy as appropriate.\n")
	}
	user.WriteString("name: " + name + "\n")
	user.WriteString("occupation: " + strings.TrimSpace(in.Occupation) + "\n")
	user.WriteString("industry: " + strings.TrimSpace(in.Industry) + "\n")
	user.WriteString("age_range: " + strings.TrimSpace(in.AgeRange) + "\n")
	user.WriteString("gender: " + strings.TrimSpace(in.Gender) + "\n")
	user.WriteString("education: " + strings.TrimSpace(in.Education) + "\n")
	user.WriteString("mbti: " + strings.TrimSpace(in.MBTI) + "\n")
	user.WriteString("personality_tags: " + strings.Join(in.PersonalityTags, ", ") + "\n")
	user.WriteString("identity_summary: " + strings.TrimSpace(in.IdentitySummary) + "\n")
	user.WriteString("voice_tone: " + strings.TrimSpace(in.VoiceTone) + "\n")
	user.WriteString("topics: " + strings.Join(in.Topics, ", ") + "\n")
	user.WriteString("forbidden_topics: " + strings.Join(in.ForbiddenTopics, ", ") + "\n")
	user.WriteString("growth_goal: " + strings.TrimSpace(in.GrowthGoal) + "\n")
	writeOAFBotStrategyContext(&user, oafBotStrategyContext{
		ProjectOneLiner:   in.ProjectOneLiner,
		TargetAudience:    in.TargetAudience,
		CoreValueProps:    in.CoreValueProps,
		ProductFeatures:   in.ProductFeatures,
		Differentiators:   in.Differentiators,
		ContentPillars:    in.ContentPillars,
		ContentObjectives: in.ContentObjectives,
		PreferredCTA:      in.PreferredCTA,
		WebsiteURL:        in.WebsiteURL,
		TelegramURL:       in.TelegramURL,
		DiscordURL:        in.DiscordURL,
		DocsURL:           in.DocsURL,
		CTAPolicy:         in.CTAPolicy,
		Hashtags:          in.Hashtags,
		Keywords:          in.Keywords,
		ComplianceNotes:   in.ComplianceNotes,
		AvoidClaims:       in.AvoidClaims,
	})
	user.WriteString("safety_mode: " + strings.TrimSpace(in.SafetyMode) + "\n")
	user.WriteString("primary_language: " + primaryLanguage + "\n")
	user.WriteString("language_strategy: " + languageStrategy + "\n\n")
	user.WriteString("Return JSON with exactly these keys:\n")
	user.WriteString("occupation, industry, personality_tags, identity_summary, voice_tone, topics, forbidden_topics, growth_goal, project_one_liner, target_audience, core_value_props, product_features, differentiators, content_pillars, content_objectives, preferred_cta, website_url, telegram_url, discord_url, docs_url, cta_policy, hashtags, keywords, compliance_notes, avoid_claims, safety_mode, primary_language, language_strategy.\n")
	user.WriteString("Rules:\n")
	user.WriteString("- Arrays must contain short strings, usually 3-6 items.\n")
	user.WriteString("- Keep identity_summary under 260 characters.\n")
	user.WriteString("- Keep voice_tone under 120 characters.\n")
	user.WriteString("- If project details are thin, make practical assumptions but do not invent partnerships, guarantees, token prices, or regulated claims.\n")
	user.WriteString("- Do not invent website, Telegram, Discord, or docs URLs. Keep URL fields empty unless they are already present in the draft.\n")
	user.WriteString("- Use the primary language for natural-language fields unless language_strategy implies bilingual or mixed output.\n")

	result, err := s.openai.GenerateTextWithUsageMaxTokens(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	}, 700)
	if err != nil {
		return dto.OAFBotUpsertRequest{}, "", openaiint.TextUsage{}, err
	}
	profile, err := parseCompletedOAFBotProfile(result.Text)
	if err != nil {
		return dto.OAFBotUpsertRequest{}, strings.TrimSpace(result.Text), result.Usage, err
	}
	return profile, strings.TrimSpace(result.Text), result.Usage, nil
}

func (s *AIService) GenerateAutoPost(ctx context.Context, in GenerateAutoPostInput) (AIGeneratedText, error) {
	handle := strings.TrimSpace(in.AccountHandle)
	if handle == "" {
		handle = "@account"
	}
	direction := strings.TrimSpace(firstNonEmpty(in.ContentDirection, in.Topic))
	system := strings.Join([]string{
		"You are Octo-Agent Flow's Auto Post content generator.",
		"Write one original X/Twitter post for the provided account.",
		"Generate exactly one tweet.",
		"Output plain text only. Do not include JSON, markdown, labels, field names, or surrounding quotes.",
	}, " ")

	var user strings.Builder
	user.WriteString("Account: " + handle + "\n")
	if direction != "" {
		user.WriteString("Content direction: " + direction + "\n")
	}
	if strings.TrimSpace(in.ContentItemTitle) != "" || strings.TrimSpace(in.ContentItemBody) != "" {
		user.WriteString("Primary content library item:\n")
		user.WriteString("title: " + strings.TrimSpace(in.ContentItemTitle) + "\n")
		user.WriteString("type: " + strings.TrimSpace(in.ContentItemType) + "\n")
		user.WriteString("body: " + strings.TrimSpace(in.ContentItemBody) + "\n")
		if strings.TrimSpace(in.ContentItemURL) != "" {
			user.WriteString("source_url: " + strings.TrimSpace(in.ContentItemURL) + "\n")
		}
		if len(in.ContentItemTopics) > 0 {
			user.WriteString("topics: " + strings.Join(in.ContentItemTopics, ", ") + "\n")
		}
		if strings.TrimSpace(in.ContentItemGoal) != "" {
			user.WriteString("growth_goal_from_content_item: " + strings.TrimSpace(in.ContentItemGoal) + "\n")
		}
		if strings.TrimSpace(in.ContentItemCTA) != "" {
			user.WriteString("cta_preference_from_content_item: " + strings.TrimSpace(in.ContentItemCTA) + "\n")
		}
	}
	if in.HasBot {
		user.WriteString("Use this OAF Bot persona:\n")
		user.WriteString("internal_bot_name: " + strings.TrimSpace(in.Name) + "\n")
		user.WriteString("occupation: " + strings.TrimSpace(in.Occupation) + "\n")
		user.WriteString("industry: " + strings.TrimSpace(in.Industry) + "\n")
		user.WriteString("age_range: " + strings.TrimSpace(in.AgeRange) + "\n")
		user.WriteString("gender: " + strings.TrimSpace(in.Gender) + "\n")
		user.WriteString("education: " + strings.TrimSpace(in.Education) + "\n")
		user.WriteString("mbti: " + strings.TrimSpace(in.MBTI) + "\n")
		user.WriteString("personality_tags: " + strings.Join(in.PersonalityTags, ", ") + "\n")
		user.WriteString("identity_summary: " + strings.TrimSpace(in.IdentitySummary) + "\n")
		user.WriteString("voice_tone: " + strings.TrimSpace(in.VoiceTone) + "\n")
		user.WriteString("topics: " + strings.Join(in.Topics, ", ") + "\n")
		user.WriteString("forbidden_topics: " + strings.Join(in.ForbiddenTopics, ", ") + "\n")
		user.WriteString("growth_goal: " + strings.TrimSpace(in.GrowthGoal) + "\n")
		writeOAFBotStrategyContext(&user, oafBotStrategyContext{
			ProjectOneLiner:   in.ProjectOneLiner,
			TargetAudience:    in.TargetAudience,
			CoreValueProps:    in.CoreValueProps,
			ProductFeatures:   in.ProductFeatures,
			Differentiators:   in.Differentiators,
			ContentPillars:    in.ContentPillars,
			ContentObjectives: in.ContentObjectives,
			PreferredCTA:      in.PreferredCTA,
			WebsiteURL:        in.WebsiteURL,
			TelegramURL:       in.TelegramURL,
			DiscordURL:        in.DiscordURL,
			DocsURL:           in.DocsURL,
			CTAPolicy:         in.CTAPolicy,
			Hashtags:          in.Hashtags,
			Keywords:          in.Keywords,
			ComplianceNotes:   in.ComplianceNotes,
			AvoidClaims:       in.AvoidClaims,
		})
		user.WriteString("safety_mode: " + strings.TrimSpace(in.SafetyMode) + "\n")
		writeLanguageConfig(&user, in.PrimaryLanguage, in.LanguageStrategy)
	} else {
		user.WriteString("No OAF Bot is bound to this account. Use the default Octo-Agent Flow voice: practical, clear, useful, and non-spammy.\n")
	}
	if len(in.RecentPosts) > 0 {
		user.WriteString("Recent generated posts to avoid repeating:\n")
		for _, post := range in.RecentPosts {
			post = strings.TrimSpace(post)
			if post == "" {
				continue
			}
			user.WriteString("- ")
			user.WriteString(truncateRunes(post, 180))
			user.WriteString("\n")
		}
	}
	maxCharacters := in.MaxCharacters
	if maxCharacters <= 0 {
		maxCharacters = xStandardDraftMax
	}
	lengthMode := strings.ToLower(strings.TrimSpace(in.ContentLengthMode))
	user.WriteString("Hard rules:\n")
	if lengthMode == autoPostLengthModeLong {
		user.WriteString(fmt.Sprintf("- X Premium longer-post mode: target 700-1200 characters, hard maximum %d characters.\n", maxCharacters))
		user.WriteString("- Use short paragraphs and keep the post readable in the X timeline.\n")
	} else {
		user.WriteString("- Target 180-220 characters; never write close to the X 280-character limit.\n")
	}
	user.WriteString("- Use at most 2 hashtags, and only when they fit naturally.\n")
	user.WriteString("- Make it useful and specific, not hype.\n")
	user.WriteString("- Do not mention that you are AI.\n")
	user.WriteString("- Do not mention the bot name in generated content unless the user explicitly instructed it in identity_summary, voice_tone, or growth_goal.\n")
	user.WriteString("- Avoid repeating recent posts or using the same opening pattern.\n")
	user.WriteString("- Do not ask for private keys, seed phrases, wallet connections, airdrops, or guaranteed returns.\n")
	user.WriteString("- Avoid forbidden topics if any are listed.\n")

	result, err := s.openai.GenerateTextWithUsage(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	})
	if err != nil {
		return AIGeneratedText{}, err
	}
	text := strings.TrimSpace(result.Text)
	if lengthMode == autoPostLengthModeLong {
		text = fitGeneratedTweet(text, maxCharacters)
	} else {
		text = fitXStandardPost(text)
	}
	return AIGeneratedText{Text: text, Usage: result.Usage}, nil
}

type oafBotStrategyContext struct {
	ProjectOneLiner   string
	TargetAudience    string
	CoreValueProps    string
	ProductFeatures   string
	Differentiators   string
	ContentPillars    []string
	ContentObjectives string
	PreferredCTA      string
	WebsiteURL        string
	TelegramURL       string
	DiscordURL        string
	DocsURL           string
	CTAPolicy         string
	Hashtags          []string
	Keywords          []string
	ComplianceNotes   string
	AvoidClaims       []string
}

func writeOAFBotStrategyContext(user *strings.Builder, in oafBotStrategyContext) {
	user.WriteString("project_one_liner: " + strings.TrimSpace(in.ProjectOneLiner) + "\n")
	user.WriteString("target_audience: " + strings.TrimSpace(in.TargetAudience) + "\n")
	user.WriteString("core_value_props: " + strings.TrimSpace(in.CoreValueProps) + "\n")
	user.WriteString("product_features: " + strings.TrimSpace(in.ProductFeatures) + "\n")
	user.WriteString("differentiators: " + strings.TrimSpace(in.Differentiators) + "\n")
	user.WriteString("content_pillars: " + strings.Join(in.ContentPillars, ", ") + "\n")
	user.WriteString("content_objectives: " + strings.TrimSpace(in.ContentObjectives) + "\n")
	user.WriteString("preferred_cta: " + strings.TrimSpace(in.PreferredCTA) + "\n")
	user.WriteString("promotion_website_url: " + strings.TrimSpace(in.WebsiteURL) + "\n")
	user.WriteString("promotion_telegram_url: " + strings.TrimSpace(in.TelegramURL) + "\n")
	user.WriteString("promotion_discord_url: " + strings.TrimSpace(in.DiscordURL) + "\n")
	user.WriteString("promotion_docs_url: " + strings.TrimSpace(in.DocsURL) + "\n")
	user.WriteString("promotion_cta_policy: " + strings.TrimSpace(in.CTAPolicy) + "\n")
	user.WriteString("promotion_rules: Use only configured promotion links. Never invent website, Telegram, Discord, or docs links. Include a link only when the user intent, content item, or CTA policy makes it useful.\n")
	user.WriteString("preferred_hashtags: " + strings.Join(in.Hashtags, ", ") + "\n")
	user.WriteString("keywords: " + strings.Join(in.Keywords, ", ") + "\n")
	user.WriteString("compliance_notes: " + strings.TrimSpace(in.ComplianceNotes) + "\n")
	user.WriteString("avoid_claims: " + strings.Join(in.AvoidClaims, ", ") + "\n")
}

func writeLanguageConfig(user *strings.Builder, primaryLanguage, strategy string) {
	primary := strings.TrimSpace(primaryLanguage)
	if primary == "" {
		primary = "zh-CN"
	}
	langStrategy := strings.TrimSpace(strategy)
	if langStrategy == "" {
		langStrategy = "follow_context"
	}
	user.WriteString("primary_language: " + primary + "\n")
	user.WriteString("primary_language_meaning: " + languageLabelForPrompt(primary) + "\n")
	user.WriteString("language_strategy: " + langStrategy + "\n")
	user.WriteString("Language rules:\n")
	switch langStrategy {
	case "always_primary":
		user.WriteString("- Always output in the primary_language.\n")
	case "bilingual":
		user.WriteString("- Use bilingual output when helpful, but keep it concise and avoid making every message too long.\n")
	case "mixed_style":
		user.WriteString("- Use a natural Chinese-English mixed style suitable for Web3 / AI communities; do not sound like a literal translation.\n")
	default:
		user.WriteString("- For replies, comments, and DMs, follow the input context language when it is clear; otherwise use primary_language.\n")
	}
	user.WriteString("- If there is no explicit external input context, output in primary_language.\n")
	user.WriteString("- Keep language choice stable and intentional according to the configured strategy.\n")
}

func languageLabelForPrompt(value string) string {
	switch strings.TrimSpace(value) {
	case "zh-CN":
		return "Simplified Chinese"
	case "zh-TW":
		return "Traditional Chinese"
	case "en":
		return "English"
	case "ja":
		return "Japanese"
	case "ko":
		return "Korean"
	case "es":
		return "Spanish"
	case "pt":
		return "Portuguese"
	case "vi":
		return "Vietnamese"
	case "id":
		return "Indonesian"
	case "de":
		return "German"
	case "fr":
		return "French"
	case "mixed_zh_en":
		return "Natural Chinese-English mixed style"
	default:
		return value
	}
}

func normalizeSampleScene(scene string) string {
	switch strings.TrimSpace(scene) {
	case "tweet", "":
		return "tweet"
	case "reply", "comment", "dm":
		return strings.TrimSpace(scene)
	default:
		return ""
	}
}

func sampleSceneInstruction(scene string) (string, int) {
	switch scene {
	case "reply":
		return "Scene: reply. Generate one X reply only. Use a generic sample context internally, but do not mention the context or return labels.", 180
	case "comment":
		return "Scene: comment. Generate one X comment only. It should feel natural, non-spammy, and suitable for a target tweet.", 180
	case "dm":
		return "Scene: dm. Generate one lightweight DM only. It should be personalized, respectful, and not pushy.", 220
	default:
		return "Scene: tweet. Generate one original X post only.", 240
	}
}

func extractSceneContent(raw, scene string) string {
	text := cleanupGeneratedPayload(raw)
	if text == "" {
		return ""
	}
	var obj map[string]any
	if err := json.Unmarshal([]byte(text), &obj); err != nil {
		return text
	}
	if value := stringifySceneValue(obj[scene]); value != "" {
		return value
	}
	if value := stringifySceneValue(obj["content"]); value != "" {
		return value
	}
	if value := stringifySceneValue(obj["text"]); value != "" {
		return value
	}
	if value := stringifySceneValue(obj["message"]); value != "" {
		return value
	}
	return text
}

func cleanupGeneratedPayload(raw string) string {
	text := strings.TrimSpace(raw)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	return strings.TrimSpace(text)
}

func parseCompletedOAFBotProfile(raw string) (dto.OAFBotUpsertRequest, error) {
	text := cleanupGeneratedPayload(raw)
	var out dto.OAFBotUpsertRequest
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		return dto.OAFBotUpsertRequest{}, fmt.Errorf("parse completed oaf bot profile: %w", err)
	}
	out.Occupation = strings.TrimSpace(out.Occupation)
	out.Industry = strings.TrimSpace(out.Industry)
	out.IdentitySummary = strings.TrimSpace(out.IdentitySummary)
	out.VoiceTone = strings.TrimSpace(out.VoiceTone)
	out.GrowthGoal = strings.TrimSpace(out.GrowthGoal)
	out.ProjectOneLiner = strings.TrimSpace(out.ProjectOneLiner)
	out.TargetAudience = strings.TrimSpace(out.TargetAudience)
	out.CoreValueProps = strings.TrimSpace(out.CoreValueProps)
	out.ProductFeatures = strings.TrimSpace(out.ProductFeatures)
	out.Differentiators = strings.TrimSpace(out.Differentiators)
	out.ContentObjectives = strings.TrimSpace(out.ContentObjectives)
	out.PreferredCTA = strings.TrimSpace(out.PreferredCTA)
	out.WebsiteURL = strings.TrimSpace(out.WebsiteURL)
	out.TelegramURL = strings.TrimSpace(out.TelegramURL)
	out.DiscordURL = strings.TrimSpace(out.DiscordURL)
	out.DocsURL = strings.TrimSpace(out.DocsURL)
	out.CTAPolicy = strings.TrimSpace(out.CTAPolicy)
	out.ComplianceNotes = strings.TrimSpace(out.ComplianceNotes)
	out.SafetyMode = strings.TrimSpace(out.SafetyMode)
	out.PrimaryLanguage = strings.TrimSpace(out.PrimaryLanguage)
	out.LanguageStrategy = strings.TrimSpace(out.LanguageStrategy)
	out.PersonalityTags = cleanGeneratedStringList(out.PersonalityTags, 8)
	out.Topics = cleanGeneratedStringList(out.Topics, 8)
	out.ForbiddenTopics = cleanGeneratedStringList(out.ForbiddenTopics, 8)
	out.ContentPillars = cleanGeneratedStringList(out.ContentPillars, 8)
	out.Hashtags = cleanGeneratedStringList(out.Hashtags, 8)
	out.Keywords = cleanGeneratedStringList(out.Keywords, 10)
	out.AvoidClaims = cleanGeneratedStringList(out.AvoidClaims, 8)
	return out, nil
}

func cleanGeneratedStringList(items []string, limit int) []string {
	if limit <= 0 {
		limit = 8
	}
	out := make([]string, 0, len(items))
	seen := map[string]bool{}
	for _, item := range items {
		v := strings.TrimSpace(item)
		if v == "" {
			continue
		}
		key := strings.ToLower(v)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, v)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func stringifySceneValue(value any) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case map[string]any:
		for _, key := range []string{"content", "text", "message", "body"} {
			if text := stringifySceneValue(v[key]); text != "" {
				return text
			}
		}
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			if text := stringifySceneValue(item); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, "\n")
	}
	return ""
}

func stripGeneratedJSONWrapper(content, scene string) string {
	text := strings.TrimSpace(content)
	if text == "" {
		return ""
	}
	if !strings.Contains(text, "{") || !strings.Contains(text, "}") {
		return text
	}
	extracted := extractSceneContent(text, scene)
	if extracted != text {
		return extracted
	}
	return text
}

func setSampleSceneContent(out *dto.OAFBotTestGenerateResponse, scene, content string) {
	switch scene {
	case "reply":
		out.Reply = content
	case "comment":
		out.Comment = content
	case "dm":
		out.DM = content
	default:
		out.Tweet = content
	}
}

func truncateRunes(s string, max int) string {
	if max <= 0 {
		return ""
	}
	r := []rune(strings.TrimSpace(s))
	if len(r) <= max {
		return strings.TrimSpace(s)
	}
	return string(r[:max])
}

func writeGenerationContentContext(user *strings.Builder, items []GenerationContentContextItem, bodyLimit int) {
	if len(items) == 0 {
		return
	}
	if bodyLimit <= 0 {
		bodyLimit = 700
	}
	user.WriteString("Relevant content library context:\n")
	for i, item := range items {
		if i >= 3 {
			break
		}
		title := strings.TrimSpace(item.Title)
		body := truncateRunes(item.Body, bodyLimit)
		if title == "" && body == "" {
			continue
		}
		user.WriteString(fmt.Sprintf("item_%d:\n", i+1))
		if title != "" {
			user.WriteString("title: " + title + "\n")
		}
		if strings.TrimSpace(item.ItemType) != "" {
			user.WriteString("type: " + strings.TrimSpace(item.ItemType) + "\n")
		}
		if body != "" {
			user.WriteString("body: " + body + "\n")
		}
		if strings.TrimSpace(item.SourceURL) != "" {
			user.WriteString("source_url: " + strings.TrimSpace(item.SourceURL) + "\n")
		}
		if len(item.Topics) > 0 {
			user.WriteString("topics: " + strings.Join(item.Topics, ", ") + "\n")
		}
		if strings.TrimSpace(item.GrowthGoal) != "" {
			user.WriteString("growth_goal: " + strings.TrimSpace(item.GrowthGoal) + "\n")
		}
		if strings.TrimSpace(item.CTAPreference) != "" {
			user.WriteString("cta_preference: " + strings.TrimSpace(item.CTAPreference) + "\n")
		}
	}
}

func fitGeneratedTweet(s string, max int) string {
	if max <= 0 {
		return ""
	}
	text := strings.Join(strings.Fields(strings.TrimSpace(s)), " ")
	runes := []rune(text)
	if len(runes) <= max {
		return text
	}
	cut := string(runes[:max])
	if idx := strings.LastIndexAny(cut, " \n\t"); idx > max/2 {
		cut = cut[:idx]
	}
	cut = strings.TrimSpace(cut)
	parts := strings.Fields(cut)
	if len(parts) > 0 && strings.HasPrefix(parts[len(parts)-1], "#") {
		parts = parts[:len(parts)-1]
		cut = strings.Join(parts, " ")
	}
	cut = strings.TrimRight(cut, "#,;:，；：.!?。！？-— ")
	return cut
}
