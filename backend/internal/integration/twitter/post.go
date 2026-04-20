package twitter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var defaultHTTP = &http.Client{Timeout: 60 * time.Second}

const tweetsEndpoint = "https://api.x.com/2/tweets"

type createTweetBody struct {
	Text  string            `json:"text"`
	Reply *createTweetReply `json:"reply,omitempty"`
}

type createTweetReply struct {
	InReplyToTweetID string `json:"in_reply_to_tweet_id"`
}

type createTweetResp struct {
	Data struct {
		ID string `json:"id"`
	} `json:"data"`
}

type apiErrorEnvelope struct {
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
}

// PublishError is returned for non-2xx X API responses (implements error).
type PublishError struct {
	StatusCode  int
	Message     string
	RateLimited bool
	RetryAfter  time.Duration
}

func (e *PublishError) Error() string {
	if e != nil && strings.TrimSpace(e.Message) != "" {
		return e.Message
	}
	return fmt.Sprintf("x api error (status %d)", e.StatusCode)
}

// CreateTweet posts a single tweet via X API v2 (Bearer user access token).
func CreateTweet(ctx context.Context, accessToken, text string) (tweetID string, err error) {
	return CreateTweetWithClient(ctx, defaultHTTP, accessToken, text)
}

// CreateTweetWithClient allows injecting an HTTP client (tests).
func CreateTweetWithClient(ctx context.Context, client *http.Client, accessToken, text string) (tweetID string, err error) {
	token := strings.TrimSpace(accessToken)
	if token == "" {
		return "", fmt.Errorf("missing access token")
	}
	if client == nil {
		client = defaultHTTP
	}
	body, err := json.Marshal(createTweetBody{Text: text, Reply: nil})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tweetsEndpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		var out createTweetResp
		if err := json.Unmarshal(raw, &out); err != nil {
			return "", fmt.Errorf("decode success body: %w", err)
		}
		if out.Data.ID == "" {
			return "", fmt.Errorf("empty tweet id in response")
		}
		return out.Data.ID, nil
	}

	return "", newPublishError(resp, raw)
}

// CreateReplyTweet posts a reply to an existing tweet (X API v2).
func CreateReplyTweet(ctx context.Context, accessToken, text, inReplyToTweetID string) (tweetID string, err error) {
	return CreateReplyTweetWithClient(ctx, defaultHTTP, accessToken, text, inReplyToTweetID)
}

// CreateReplyTweetWithClient allows injecting an HTTP client (tests).
func CreateReplyTweetWithClient(ctx context.Context, client *http.Client, accessToken, text, inReplyToTweetID string) (tweetID string, err error) {
	token := strings.TrimSpace(accessToken)
	if token == "" {
		return "", fmt.Errorf("missing access token")
	}
	parent := strings.TrimSpace(inReplyToTweetID)
	if parent == "" {
		return "", fmt.Errorf("missing in_reply_to_tweet_id")
	}
	if client == nil {
		client = defaultHTTP
	}
	body, err := json.Marshal(createTweetBody{
		Text: strings.TrimSpace(text),
		Reply: &createTweetReply{
			InReplyToTweetID: parent,
		},
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tweetsEndpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		var out createTweetResp
		if err := json.Unmarshal(raw, &out); err != nil {
			return "", fmt.Errorf("decode success body: %w", err)
		}
		if out.Data.ID == "" {
			return "", fmt.Errorf("empty tweet id in response")
		}
		return out.Data.ID, nil
	}

	return "", newPublishError(resp, raw)
}

func newPublishError(resp *http.Response, raw []byte) *PublishError {
	msg := parseXAPIErrorBody(raw, resp.StatusCode)
	pe := &PublishError{
		StatusCode: resp.StatusCode,
		Message:    msg,
	}
	low := strings.ToLower(msg)
	if resp.StatusCode == http.StatusTooManyRequests {
		pe.RateLimited = true
	} else if strings.Contains(low, "rate limit") || strings.Contains(low, "too many requests") {
		pe.RateLimited = true
	}
	if ra := resp.Header.Get("Retry-After"); ra != "" {
		if sec, err := strconv.Atoi(strings.TrimSpace(ra)); err == nil && sec > 0 {
			pe.RetryAfter = time.Duration(sec) * time.Second
		}
	}
	return pe
}

func parseXAPIErrorBody(raw []byte, status int) string {
	var env apiErrorEnvelope
	if err := json.Unmarshal(raw, &env); err == nil {
		if len(env.Errors) > 0 && strings.TrimSpace(env.Errors[0].Message) != "" {
			return fmt.Sprintf("x api %d: %s", status, strings.TrimSpace(env.Errors[0].Message))
		}
		if strings.TrimSpace(env.Detail) != "" {
			return fmt.Sprintf("x api %d: %s", status, strings.TrimSpace(env.Detail))
		}
		if strings.TrimSpace(env.Title) != "" {
			return fmt.Sprintf("x api %d: %s", status, strings.TrimSpace(env.Title))
		}
	}
	s := strings.TrimSpace(string(raw))
	if s == "" {
		return fmt.Sprintf("x api returned %d", status)
	}
	if len(s) > 500 {
		s = s[:500] + "…"
	}
	return fmt.Sprintf("x api %d: %s", status, s)
}
