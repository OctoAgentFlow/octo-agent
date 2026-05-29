package service

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/subscription"
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

func TestParseAutoDMImportRow(t *testing.T) {
	recipientID, username, segment, skip, rowErr := parseAutoDMImportRow([]string{"1234567890", "alice", "partner"})
	if skip || rowErr != "" || recipientID != "1234567890" || username != "@alice" || segment != "partner" {
		t.Fatalf("unexpected valid row parse: id=%q username=%q segment=%q skip=%v err=%q", recipientID, username, segment, skip, rowErr)
	}

	_, _, _, skip, rowErr = parseAutoDMImportRow([]string{"recipient_user_id", "username"})
	if !skip || rowErr != "" {
		t.Fatalf("header row should be silently skipped: skip=%v err=%q", skip, rowErr)
	}

	_, _, _, skip, rowErr = parseAutoDMImportRow([]string{"not-a-user", "alice"})
	if !skip || rowErr == "" {
		t.Fatalf("invalid recipient id should be reported: skip=%v err=%q", skip, rowErr)
	}
}

func TestMissingDMSendScopesRequiresTweetRead(t *testing.T) {
	missing := missingDMSendScopes("dm.read dm.write users.read")
	if len(missing) != 1 || missing[0] != "tweet.read" {
		t.Fatalf("expected tweet.read to be required, got %#v", missing)
	}
	if got := missingDMSendScopes("dm.read dm.write tweet.read users.read"); len(got) != 0 {
		t.Fatalf("expected no missing scopes, got %#v", got)
	}
}

func TestAutoDMOptInSource(t *testing.T) {
	for _, source := range []string{"inbound_dm", "campaign_keyword", "manual_consent", "manual_consent_import", "site_form", "task"} {
		if !isAutoDMOptInSource(source) {
			t.Fatalf("expected %s to be accepted as opt-in source", source)
		}
	}
	for _, source := range []string{"", "csv_import", "scraped_list", "public_reply"} {
		if isAutoDMOptInSource(source) {
			t.Fatalf("expected %s to be rejected as opt-in source", source)
		}
	}
}

func TestAutoDMConservativeDailySendLimit(t *testing.T) {
	cases := []struct {
		plan string
		want int64
	}{
		{subscription.PlanFreeTrial, 0},
		{subscription.PlanBasic, 5},
		{subscription.PlanPlus, 20},
		{subscription.PlanPro, 80},
		{subscription.PlanProPlus, 150},
	}
	for _, tc := range cases {
		if got := autoDMConservativeDailySendLimit(&model.User{SubscriptionPlanCode: tc.plan}); got != tc.want {
			t.Fatalf("plan %s daily send limit = %d, want %d", tc.plan, got, tc.want)
		}
	}
}
