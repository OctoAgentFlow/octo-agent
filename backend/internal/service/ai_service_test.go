package service

import (
	"strings"
	"testing"
)

func TestFitGeneratedTweetDoesNotCutPartialHashtag(t *testing.T) {
	input := "Streamline your Web3 and SocialFi X operations with persona-driven content generation, reviewable execution queues, and real-time analytics. Keep your voice consistent and workflows safe - explore how automation can boost your team's growth today. #AIAgent #SocialFi"

	got := fitGeneratedTweet(input, 210)

	if strings.Contains(got, "#Soci") || strings.Contains(got, "#Social") {
		t.Fatalf("expected trailing partial hashtag to be removed, got %q", got)
	}
	if strings.HasSuffix(got, "#") {
		t.Fatalf("expected output not to end with a broken hashtag, got %q", got)
	}
	if len([]rune(got)) > 210 {
		t.Fatalf("expected output within max length, got %d runes", len([]rune(got)))
	}
}

func TestFitGeneratedTweetCollapsesWhitespace(t *testing.T) {
	input := "  Managing   X operations\n\nfor Web3 teams.   #Web3  "

	got := fitGeneratedTweet(input, 240)

	if got != "Managing X operations for Web3 teams. #Web3" {
		t.Fatalf("unexpected normalized tweet: %q", got)
	}
}

func TestFitGeneratedTweetKeepsShortContent(t *testing.T) {
	input := "Build safer X automation with reviewable queues and clear analytics. #AIAgent"

	got := fitGeneratedTweet(input, 240)

	if got != input {
		t.Fatalf("expected short content unchanged, got %q", got)
	}
}
