package service

import (
	"context"
	"fmt"
	"strings"

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
