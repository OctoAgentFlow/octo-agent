package service

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"octo-agent/backend/internal/integration/twitter"
)

func TestClassifyAutoDMFailureRateLimit(t *testing.T) {
	now := time.Date(2026, 5, 7, 10, 0, 0, 0, time.UTC)
	failure := classifyAutoDMFailure(&twitter.PublishError{
		StatusCode:  http.StatusTooManyRequests,
		Message:     "rate limit",
		RateLimited: true,
		RetryAfter:  2 * time.Minute,
	}, now)
	if failure.Category != "rate_limited" || !failure.Retryable {
		t.Fatalf("unexpected failure: %#v", failure)
	}
	if failure.RetryAfterAt == nil || !failure.RetryAfterAt.Equal(now.Add(2*time.Minute)) {
		t.Fatalf("unexpected retry at: %#v", failure.RetryAfterAt)
	}
}

func TestClassifyAutoDMFailureValidation(t *testing.T) {
	failure := classifyAutoDMFailure(newAutoDMFailureError("blocked_keyword", "blocked"), time.Now())
	if failure.Category != "blocked_keyword" || failure.Retryable {
		t.Fatalf("unexpected failure: %#v", failure)
	}
}

func TestClassifyAutoDMFailureNetwork(t *testing.T) {
	now := time.Date(2026, 5, 7, 10, 0, 0, 0, time.UTC)
	failure := classifyAutoDMFailure(errors.New("dial tcp timeout"), now)
	if failure.Category != "network_or_unknown" || !failure.Retryable {
		t.Fatalf("unexpected failure: %#v", failure)
	}
	if failure.RetryAfterAt == nil || !failure.RetryAfterAt.Equal(now.Add(10*time.Minute)) {
		t.Fatalf("unexpected retry at: %#v", failure.RetryAfterAt)
	}
}
