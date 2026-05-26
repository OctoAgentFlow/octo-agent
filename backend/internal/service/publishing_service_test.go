package service

import (
	"testing"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/model"
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
