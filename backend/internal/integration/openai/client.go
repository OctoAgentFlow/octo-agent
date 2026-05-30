package openai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode"
)

type Client struct {
	apiKey      string
	model       string
	baseURL     string
	maxTokens   int
	temperature float32
	httpClient  *http.Client
}

type Config struct {
	APIKey      string
	Model       string
	BaseURL     string
	TimeoutSec  int
	MaxTokens   int
	Temperature float32
}

func NewClient(cfg Config) *Client {
	if cfg.Model == "" {
		cfg.Model = "gpt-4.1-mini"
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.openai.com/v1"
	}
	if cfg.TimeoutSec <= 0 {
		cfg.TimeoutSec = 20
	}
	if cfg.MaxTokens <= 0 {
		cfg.MaxTokens = 120
	}
	if cfg.Temperature <= 0 {
		cfg.Temperature = 0.65
	}
	return &Client{
		apiKey:      strings.TrimSpace(cfg.APIKey),
		model:       strings.TrimSpace(cfg.Model),
		baseURL:     strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/"),
		maxTokens:   cfg.MaxTokens,
		temperature: cfg.Temperature,
		httpClient:  &http.Client{Timeout: time.Duration(cfg.TimeoutSec) * time.Second},
	}
}

func (c *Client) IsConfigured() bool {
	return c != nil && strings.TrimSpace(c.apiKey) != ""
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type TextUsage struct {
	Model                  string `json:"model"`
	InputTokens            int64  `json:"input_tokens"`
	OutputTokens           int64  `json:"output_tokens"`
	TotalTokens            int64  `json:"total_tokens"`
	PromptGuardEnabled     bool   `json:"prompt_guard_enabled,omitempty"`
	SystemLanguage         string `json:"system_language,omitempty"`
	ContextLanguage        string `json:"context_language,omitempty"`
	ExpectedOutputLanguage string `json:"expected_output_language,omitempty"`
	ActualOutputLanguage   string `json:"actual_output_language,omitempty"`
	RetryCount             int64  `json:"retry_count,omitempty"`
}

type TextResult struct {
	Text  string
	Usage TextUsage
}

type chatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Temperature float32       `json:"temperature,omitempty"`
}

type chatCompletionResponse struct {
	Model   string `json:"model"`
	Choices []struct {
		Message ChatMessage `json:"message"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int64 `json:"prompt_tokens"`
		CompletionTokens int64 `json:"completion_tokens"`
		TotalTokens      int64 `json:"total_tokens"`
	} `json:"usage,omitempty"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

func (c *Client) GenerateText(ctx context.Context, messages []ChatMessage) (string, error) {
	result, err := c.GenerateTextWithUsage(ctx, messages)
	if err != nil {
		return "", err
	}
	return result.Text, nil
}

func (c *Client) GenerateTextWithUsage(ctx context.Context, messages []ChatMessage) (TextResult, error) {
	return c.GenerateTextWithUsageMaxTokens(ctx, messages, 0)
}

func (c *Client) GenerateTextWithUsageMaxTokens(ctx context.Context, messages []ChatMessage, maxTokens int) (TextResult, error) {
	if c == nil {
		return TextResult{}, fmt.Errorf("openai client is nil")
	}
	if c.apiKey == "" {
		return TextResult{}, fmt.Errorf("openai api key is empty")
	}
	if len(messages) == 0 {
		return TextResult{}, fmt.Errorf("openai messages are empty")
	}
	if err := ValidatePromptGuard(messages); err != nil {
		return TextResult{}, err
	}
	body := chatCompletionRequest{
		Model:       c.model,
		Messages:    messages,
		MaxTokens:   c.maxTokens,
		Temperature: c.temperature,
	}
	if maxTokens > 0 {
		body.MaxTokens = maxTokens
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return TextResult{}, fmt.Errorf("marshal openai request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return TextResult{}, fmt.Errorf("build openai request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return TextResult{}, fmt.Errorf("call openai: %w", err)
	}
	defer resp.Body.Close()
	respRaw, _ := io.ReadAll(resp.Body)
	var out chatCompletionResponse
	if err := json.Unmarshal(respRaw, &out); err != nil {
		return TextResult{}, fmt.Errorf("decode openai response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if out.Error != nil && strings.TrimSpace(out.Error.Message) != "" {
			return TextResult{}, fmt.Errorf("openai api error: status=%d message=%s", resp.StatusCode, strings.TrimSpace(out.Error.Message))
		}
		return TextResult{}, fmt.Errorf("openai api error: status=%d", resp.StatusCode)
	}
	if len(out.Choices) == 0 {
		return TextResult{}, fmt.Errorf("openai response has no choices")
	}
	text := strings.TrimSpace(out.Choices[0].Message.Content)
	text = strings.Trim(text, "\"“”")
	if text == "" {
		return TextResult{}, fmt.Errorf("openai response is empty")
	}
	usage := TextUsage{Model: firstNonEmpty(out.Model, c.model)}
	if out.Usage != nil {
		usage.InputTokens = out.Usage.PromptTokens
		usage.OutputTokens = out.Usage.CompletionTokens
		usage.TotalTokens = out.Usage.TotalTokens
	}
	return TextResult{Text: text, Usage: usage}, nil
}

func ValidatePromptGuard(messages []ChatMessage) error {
	for _, msg := range messages {
		if strings.TrimSpace(msg.Role) != "system" {
			continue
		}
		if containsCJK(msg.Content) {
			return fmt.Errorf("prompt guard: system prompt must be English-only trusted instructions")
		}
	}
	return nil
}

func containsCJK(text string) bool {
	for _, r := range text {
		if unicode.In(r, unicode.Han, unicode.Hiragana, unicode.Katakana, unicode.Hangul) {
			return true
		}
	}
	return false
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
