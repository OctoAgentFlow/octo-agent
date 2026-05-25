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
	Hashtags          []string
	Keywords          []string
	ComplianceNotes   string
	AvoidClaims       []string
	SafetyMode        string
	PrimaryLanguage   string
	LanguageStrategy  string
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
	Hashtags          []string
	Keywords          []string
	ComplianceNotes   string
	AvoidClaims       []string
	SafetyMode        string
	PrimaryLanguage   string
	LanguageStrategy  string
}

type GenerateOAFBotSamplesInput struct {
	Scene             string
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
	Hashtags          []string
	Keywords          []string
	ComplianceNotes   string
	AvoidClaims       []string
	SafetyMode        string
	PrimaryLanguage   string
	LanguageStrategy  string
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

func (s *AIService) GenerateAutoReply(ctx context.Context, in GenerateAutoReplyInput) (string, error) {
	commentText := strings.TrimSpace(in.CommentText)
	if commentText == "" {
		return "", fmt.Errorf("comment text is required")
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
	user.WriteString("Hard rules:\n")
	user.WriteString("- Maximum 220 characters.\n")
	user.WriteString("- Directly respond to the comment; do not answer a different question.\n")
	user.WriteString("- If the comment is negative, stay calm, professional, and non-defensive.\n")
	user.WriteString("- Do not sound like an ad and do not over-direct traffic.\n")
	user.WriteString("- You may ask a light follow-up question if it improves the interaction.\n")
	user.WriteString("- Do not impersonate an official project, exchange, or support account.\n")
	user.WriteString("- Do not insult, harass, or attack users.\n")
	user.WriteString("- Do not ask for seed phrases, private keys, wallet connections, follows, likes, airdrops, or giveaways.\n")
	user.WriteString("- Do not promise returns, profits, token prices, or investment outcomes.\n")
	user.WriteString("- Do not include surrounding quotes.\n")

	text, err := s.openai.GenerateText(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	})
	if err != nil {
		return "", err
	}
	return truncateRunes(strings.TrimSpace(text), 220), nil
}

func (s *AIService) GenerateAutoComment(ctx context.Context, in GenerateAutoCommentInput) (string, error) {
	targetTweet := strings.TrimSpace(in.TargetTweet)
	if targetTweet == "" {
		return "", fmt.Errorf("target tweet is required")
	}
	tone := strings.TrimSpace(in.Tone)
	if tone == "" {
		tone = "Friendly"
	}
	system := strings.Join([]string{
		"You are Octo-Agent Flow's social growth assistant.",
		"Write one concise X/Twitter comment draft for a target tweet.",
		"The goal is to join the conversation naturally and earn exposure, without sounding spammy, generic, or manipulative.",
		"The comment will go into a human review queue before publishing.",
		"Output only the comment text.",
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
	user.WriteString("Hard rules:\n")
	user.WriteString("- Maximum 220 characters.\n")
	user.WriteString("- Prefer short, natural sentences suitable for X comments.\n")
	user.WriteString("- Add a concrete point of view or a light question when useful.\n")
	user.WriteString("- Do not repeat the target tweet verbatim.\n")
	user.WriteString("- Do not sound like an ad and do not over-direct traffic.\n")
	user.WriteString("- Do not use hashtags unless they are already central to the target tweet.\n")
	user.WriteString("- Do not mention that you are an AI.\n")
	user.WriteString("- Do not impersonate the target account, a project official, or an exchange.\n")
	user.WriteString("- Do not ask for follows, likes, airdrops, giveaways, seed phrases, private keys, or wallet connections.\n")
	user.WriteString("- Do not promise returns, profits, token prices, or investment outcomes.\n")
	user.WriteString("- Do not include surrounding quotes.\n")

	text, err := s.openai.GenerateText(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	})
	if err != nil {
		return "", err
	}
	return truncateRunes(strings.TrimSpace(text), 220), nil
}

func (s *AIService) GenerateOAFBotSamples(ctx context.Context, in GenerateOAFBotSamplesInput) (*dto.OAFBotTestGenerateResponse, error) {
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
		Hashtags:          in.Hashtags,
		Keywords:          in.Keywords,
		ComplianceNotes:   in.ComplianceNotes,
		AvoidClaims:       in.AvoidClaims,
	})
	user.WriteString("Safety mode: " + strings.TrimSpace(in.SafetyMode) + "\n")
	writeLanguageConfig(&user, in.PrimaryLanguage, in.LanguageStrategy)
	user.WriteString("No external input context is provided for this sample. If language_strategy is follow_context, use primary_language for this sample.\n")
	user.WriteString("Rules:\n")
	user.WriteString(fmt.Sprintf("- Maximum %d characters.\n", maxChars))
	user.WriteString("- Generate only the requested scene and no other scene.\n")
	user.WriteString("- Output format: plain text only. No JSON. No markdown. No field names.\n")
	user.WriteString("- Avoid forbidden topics and do not mention that you are AI.\n")
	user.WriteString("- Keep the examples specific to the persona.\n")
	user.WriteString("- Do not mention the bot name in the content unless explicitly instructed by the user.\n")

	text, err := s.openai.GenerateText(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	})
	if err != nil {
		return nil, err
	}
	content := extractSceneContent(text, scene)
	content = truncateRunes(stripGeneratedJSONWrapper(content, scene), maxChars)
	out := dto.OAFBotTestGenerateResponse{
		Scene:     scene,
		Content:   content,
		Provider:  s.providerSource(),
		RawResult: strings.TrimSpace(text),
	}
	setSampleSceneContent(&out, scene, content)
	return &out, nil
}

func (s *AIService) GenerateAutoPost(ctx context.Context, in GenerateAutoPostInput) (string, error) {
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
	user.WriteString("Hard rules:\n")
	user.WriteString("- Maximum 260 characters.\n")
	user.WriteString("- Make it useful and specific, not hype.\n")
	user.WriteString("- Do not mention that you are AI.\n")
	user.WriteString("- Do not mention the bot name in generated content unless the user explicitly instructed it in identity_summary, voice_tone, or growth_goal.\n")
	user.WriteString("- Avoid repeating recent posts or using the same opening pattern.\n")
	user.WriteString("- Do not ask for private keys, seed phrases, wallet connections, airdrops, or guaranteed returns.\n")
	user.WriteString("- Avoid forbidden topics if any are listed.\n")

	text, err := s.openai.GenerateText(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	})
	if err != nil {
		return "", err
	}
	return truncateRunes(strings.TrimSpace(text), 260), nil
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
