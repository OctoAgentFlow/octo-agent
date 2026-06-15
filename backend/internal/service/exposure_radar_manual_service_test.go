package service

import (
	"context"
	"testing"

	"octo-agent/backend/internal/dto"
)

func TestExposureRadarManualServiceResolvePublishingResultParsesURLWithoutToken(t *testing.T) {
	svc := NewExposureRadarManualService(nil)

	result, err := svc.ResolvePublishingResult(context.Background(), dto.ExposureRadarResultLookupRequest{
		PublishedURL: "https://x.com/octo_agent_flow/status/1234567890123456789?s=20",
	})
	if err != nil {
		t.Fatalf("ResolvePublishingResult returned error: %v", err)
	}
	if result.CommentTweetID != "1234567890123456789" {
		t.Fatalf("CommentTweetID = %q, want parsed tweet id", result.CommentTweetID)
	}
	if result.Status != "token_missing" {
		t.Fatalf("Status = %q, want token_missing", result.Status)
	}
	if result.MetricsFetched {
		t.Fatal("MetricsFetched = true, want false without bearer token")
	}
}

func TestExposureRadarManualServiceResolvePublishingResultBuildsURLFromID(t *testing.T) {
	svc := NewExposureRadarManualService(nil)

	result, err := svc.ResolvePublishingResult(context.Background(), dto.ExposureRadarResultLookupRequest{
		CommentTweetID: "9876543210",
	})
	if err != nil {
		t.Fatalf("ResolvePublishingResult returned error: %v", err)
	}
	if result.PublishedURL != "https://x.com/i/web/status/9876543210" {
		t.Fatalf("PublishedURL = %q, want canonical X status URL", result.PublishedURL)
	}
}

func TestExposureRadarManualServiceResolvePublishingResultRejectsMissingID(t *testing.T) {
	svc := NewExposureRadarManualService(nil)

	if _, err := svc.ResolvePublishingResult(context.Background(), dto.ExposureRadarResultLookupRequest{
		PublishedURL: "https://x.com/octo_agent_flow",
	}); err == nil {
		t.Fatal("ResolvePublishingResult returned nil error for URL without tweet id")
	}
}
