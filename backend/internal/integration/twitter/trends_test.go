package twitter

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestListTrendsByWOEIDWithClient(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method != http.MethodGet {
			t.Fatalf("method = %s", req.Method)
		}
		if got := req.URL.Path; got != "/2/trends/by/woeid/1" {
			t.Fatalf("path = %s", got)
		}
		if got := req.URL.Query().Get("max_trends"); got != "20" {
			t.Fatalf("max_trends = %s", got)
		}
		if got := req.URL.Query().Get("trend.fields"); got != "tweet_count" {
			t.Fatalf("trend.fields = %s", got)
		}
		if got := req.Header.Get("Authorization"); got != "Bearer token" {
			t.Fatalf("authorization = %s", got)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"data":[{"trend_name":"AI Agents","tweet_count":12000},{"name":"NBA Finals","tweet_count":9000}]}`)),
		}, nil
	})}

	topics, err := ListTrendsByWOEIDWithClient(context.Background(), client, "token", "1", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(topics) != 2 {
		t.Fatalf("topics len = %d", len(topics))
	}
	if topics[0].Name != "AI Agents" || topics[0].TweetCount != 12000 {
		t.Fatalf("unexpected first topic: %#v", topics[0])
	}
	if topics[1].Name != "NBA Finals" || !strings.Contains(topics[1].Raw, "NBA Finals") {
		t.Fatalf("unexpected second topic: %#v", topics[1])
	}
}
