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
	TargetUsername string
	TargetTweet    string
	Tone           string
	BlockedWords   []string
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

func NewAIService(openaiClient *openaiint.Client) *AIService {
	return &AIService{openai: openaiClient}
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
		"Write one concise X/Twitter comment that can be posted as a reply to a target account's new tweet.",
		"The goal is to join the conversation naturally and earn exposure, without sounding spammy, generic, or manipulative.",
		"Output only the comment text.",
	}, " ")

	var user strings.Builder
	user.WriteString("Target account: @")
	user.WriteString(strings.TrimPrefix(strings.TrimSpace(in.TargetUsername), "@"))
	user.WriteString("\n")
	user.WriteString("Target tweet:\n")
	user.WriteString(targetTweet)
	user.WriteString("\n\n")
	user.WriteString("Tone: ")
	user.WriteString(tone)
	user.WriteString("\n")
	if len(in.BlockedWords) > 0 {
		user.WriteString("Avoid these words or topics: ")
		user.WriteString(strings.Join(in.BlockedWords, ", "))
		user.WriteString("\n")
	}
	user.WriteString("Hard rules:\n")
	user.WriteString("- Maximum 220 characters.\n")
	user.WriteString("- Do not use hashtags unless they are already central to the target tweet.\n")
	user.WriteString("- Do not mention that you are an AI.\n")
	user.WriteString("- Do not ask for follows, likes, airdrops, giveaways, seed phrases, private keys, or wallet connections.\n")
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
