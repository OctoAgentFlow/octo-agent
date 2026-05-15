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

type chatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Temperature float32       `json:"temperature,omitempty"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message ChatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

func (c *Client) GenerateText(ctx context.Context, messages []ChatMessage) (string, error) {
	if c == nil {
		return "", fmt.Errorf("openai client is nil")
	}
	if c.apiKey == "" {
		return "", fmt.Errorf("openai api key is empty")
	}
	if len(messages) == 0 {
		return "", fmt.Errorf("openai messages are empty")
	}
	body := chatCompletionRequest{
		Model:       c.model,
		Messages:    messages,
		MaxTokens:   c.maxTokens,
		Temperature: c.temperature,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal openai request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return "", fmt.Errorf("build openai request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("call openai: %w", err)
	}
	defer resp.Body.Close()
	respRaw, _ := io.ReadAll(resp.Body)
	var out chatCompletionResponse
	if err := json.Unmarshal(respRaw, &out); err != nil {
		return "", fmt.Errorf("decode openai response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if out.Error != nil && strings.TrimSpace(out.Error.Message) != "" {
			return "", fmt.Errorf("openai api error: status=%d message=%s", resp.StatusCode, strings.TrimSpace(out.Error.Message))
		}
		return "", fmt.Errorf("openai api error: status=%d", resp.StatusCode)
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("openai response has no choices")
	}
	text := strings.TrimSpace(out.Choices[0].Message.Content)
	text = strings.Trim(text, "\"“”")
	if text == "" {
		return "", fmt.Errorf("openai response is empty")
	}
	return text, nil
}
