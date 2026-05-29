package service

import (
	"errors"
	"testing"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"
)

func TestIsUnlimitedXPublisherAccount(t *testing.T) {
	cfg := config.XPublisherConfig{
		UnlimitedUserEmails:       []string{"owner@example.com"},
		UnlimitedAccountUsernames: []string{"octo_agent_flow"},
	}

	if !isUnlimitedXPublisherAccount(cfg, &model.User{Email: "OWNER@example.com"}, &model.TwitterAccount{}) {
		t.Fatal("expected email whitelist to match case-insensitively")
	}
	if !isUnlimitedXPublisherAccount(cfg, &model.User{}, &model.TwitterAccount{Username: "@Octo_Agent_Flow"}) {
		t.Fatal("expected username whitelist to ignore @ and case")
	}
	if isUnlimitedXPublisherAccount(cfg, &model.User{Email: "user@example.com"}, &model.TwitterAccount{Username: "other"}) {
		t.Fatal("expected non-whitelisted account not to match")
	}
}

func TestShouldAutoPublishRealJob(t *testing.T) {
	postJob := &model.PublishJob{SourceType: repository.PublishSourcePost}
	commentJob := &model.PublishJob{SourceType: repository.PublishSourceComment}
	dmJob := &model.PublishJob{SourceType: repository.PublishSourceDM}

	if !shouldAutoPublishRealJob(postJob, config.XPublisherConfig{RealPublishEnabled: true}) {
		t.Fatal("expected auto post jobs to use real publishing when enabled")
	}
	if !shouldAutoPublishRealJob(postJob, config.XPublisherConfig{DryRun: true}) {
		t.Fatal("expected auto post jobs to use dry-run publishing when dry run is enabled")
	}
	if shouldAutoPublishRealJob(postJob, config.XPublisherConfig{}) {
		t.Fatal("expected auto post jobs to remain simulated when real publishing is disabled")
	}
	if !shouldAutoPublishRealJob(commentJob, config.XPublisherConfig{RealPublishEnabled: true}) {
		t.Fatal("expected auto comment jobs to use real publishing when enabled")
	}
	if shouldAutoPublishRealJob(dmJob, config.XPublisherConfig{RealPublishEnabled: true}) {
		t.Fatal("expected unsupported jobs to remain on the simulated scheduler path")
	}
}

func TestClassifyXPublishFailure(t *testing.T) {
	category, retryable, alertable := classifyXPublishFailure(
		errors.New("x api 403: Reply to this conversation is not allowed because you have not been mentioned"),
		repository.PublishSourceComment,
	)
	if category != "x_reply_restricted" || retryable || !alertable {
		t.Fatalf("unexpected restricted reply classification: %s retryable=%v alertable=%v", category, retryable, alertable)
	}

	category, retryable, alertable = classifyXPublishFailure(
		errors.New("x api 403: Quoting this post is not allowed because you have not been mentioned or are not part of the conversation thread"),
		repository.PublishSourceComment,
	)
	if category != "x_reply_restricted" || retryable || !alertable {
		t.Fatalf("unexpected restricted quote classification: %s retryable=%v alertable=%v", category, retryable, alertable)
	}

	category, retryable, alertable = classifyXPublishFailure(errors.New("x api 500: upstream failed"), repository.PublishSourceComment)
	if category != "x_api_publish_failed" || !retryable || !alertable {
		t.Fatalf("unexpected generic publish classification: %s retryable=%v alertable=%v", category, retryable, alertable)
	}
}
