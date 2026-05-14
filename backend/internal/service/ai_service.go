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
	TargetUsername  string
	TargetTweet     string
	Tone            string
	BlockedWords    []string
	HasBot          bool
	Name            string
	Occupation      string
	Industry        string
	AgeRange        string
	Gender          string
	Education       string
	MBTI            string
	PersonalityTags []string
	IdentitySummary string
	VoiceTone       string
	Topics          []string
	ForbiddenTopics []string
	GrowthGoal      string
	SafetyMode      string
}

type GenerateAutoReplyInput struct {
	CommentAuthor   string
	RootTweet       string
	CommentText     string
	Tone            string
	BlockedWords    []string
	HasBot          bool
	Name            string
	Occupation      string
	Industry        string
	AgeRange        string
	Gender          string
	Education       string
	MBTI            string
	PersonalityTags []string
	IdentitySummary string
	VoiceTone       string
	Topics          []string
	ForbiddenTopics []string
	GrowthGoal      string
	SafetyMode      string
}

type GenerateOAFBotSamplesInput struct {
	Name            string
	Occupation      string
	Industry        string
	AgeRange        string
	Gender          string
	Education       string
	MBTI            string
	PersonalityTags []string
	IdentitySummary string
	VoiceTone       string
	Topics          []string
	ForbiddenTopics []string
	GrowthGoal      string
	SafetyMode      string
}

type GenerateAutoPostInput struct {
	AccountHandle   string
	Topic           string
	HasBot          bool
	Name            string
	Occupation      string
	Industry        string
	AgeRange        string
	Gender          string
	Education       string
	MBTI            string
	PersonalityTags []string
	IdentitySummary string
	VoiceTone       string
	Topics          []string
	ForbiddenTopics []string
	GrowthGoal      string
	SafetyMode      string
}

func NewAIService(openaiClient *openaiint.Client) *AIService {
	return &AIService{openai: openaiClient}
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
		user.WriteString("safety_mode: " + strings.TrimSpace(in.SafetyMode) + "\n")
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
		user.WriteString("safety_mode: " + strings.TrimSpace(in.SafetyMode) + "\n")
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
	tone := strings.TrimSpace(in.VoiceTone)
	if tone == "" {
		tone = "clear, helpful and confident"
	}
	system := strings.Join([]string{
		"You are Octo-Agent Flow's OAF Bot persona simulator.",
		"Generate safe example content for an AI social persona on X/Twitter.",
		"Return strict JSON with keys tweet, reply, dm. Do not include markdown fences.",
	}, " ")

	var user strings.Builder
	user.WriteString("Persona name: " + name + "\n")
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
	user.WriteString("Safety mode: " + strings.TrimSpace(in.SafetyMode) + "\n")
	user.WriteString("Rules:\n")
	user.WriteString("- tweet max 240 characters.\n")
	user.WriteString("- reply max 180 characters.\n")
	user.WriteString("- dm max 220 characters.\n")
	user.WriteString("- Avoid forbidden topics and do not mention that you are AI.\n")
	user.WriteString("- Keep the examples specific to the persona.\n")

	text, err := s.openai.GenerateText(ctx, []openaiint.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user.String()},
	})
	if err != nil {
		return nil, err
	}
	var out dto.OAFBotTestGenerateResponse
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		return &dto.OAFBotTestGenerateResponse{
			Tweet: truncateRunes(strings.TrimSpace(text), 240),
			Reply: truncateRunes(fmt.Sprintf("%s brings a practical angle here. I'd add one more point: durable growth comes from consistent useful interaction, not one-off spikes.", name), 180),
			DM:    truncateRunes(fmt.Sprintf("Hey, this is %s. I liked your recent thoughts and wanted to connect around practical social growth workflows.", name), 220),
		}, nil
	}
	out.Tweet = truncateRunes(out.Tweet, 240)
	out.Reply = truncateRunes(out.Reply, 180)
	out.DM = truncateRunes(out.DM, 220)
	return &out, nil
}

func (s *AIService) GenerateAutoPost(ctx context.Context, in GenerateAutoPostInput) (string, error) {
	handle := strings.TrimSpace(in.AccountHandle)
	if handle == "" {
		handle = "@account"
	}
	system := strings.Join([]string{
		"You are Octo-Agent Flow's Auto Post content generator.",
		"Write one original X/Twitter post for the provided account.",
		"Output only the post text. Do not include markdown, labels, or surrounding quotes.",
	}, " ")

	var user strings.Builder
	user.WriteString("Account: " + handle + "\n")
	if strings.TrimSpace(in.Topic) != "" {
		user.WriteString("User requested topic: " + strings.TrimSpace(in.Topic) + "\n")
	}
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
		user.WriteString("safety_mode: " + strings.TrimSpace(in.SafetyMode) + "\n")
	} else {
		user.WriteString("No OAF Bot is bound to this account. Use the default Octo-Agent Flow voice: practical, clear, useful, and non-spammy.\n")
	}
	user.WriteString("Hard rules:\n")
	user.WriteString("- Maximum 260 characters.\n")
	user.WriteString("- Make it useful and specific, not hype.\n")
	user.WriteString("- Do not mention that you are AI.\n")
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
