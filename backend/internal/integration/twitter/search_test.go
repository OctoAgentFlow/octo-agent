package twitter

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestLookupTweetsByIDsWithClient(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method != http.MethodGet {
			t.Fatalf("method = %s", req.Method)
		}
		if got := req.URL.Path; got != "/2/tweets" {
			t.Fatalf("path = %s", got)
		}
		if got := req.URL.Query().Get("ids"); got != "1,2" {
			t.Fatalf("ids = %s", got)
		}
		if got := req.URL.Query().Get("tweet.fields"); !strings.Contains(got, "public_metrics") || !strings.Contains(got, "created_at") {
			t.Fatalf("tweet.fields = %s", got)
		}
		if got := req.URL.Query().Get("expansions"); got != "author_id" {
			t.Fatalf("expansions = %s", got)
		}
		if got := req.URL.Query().Get("user.fields"); !strings.Contains(got, "public_metrics") {
			t.Fatalf("user.fields = %s", got)
		}
		if got := req.Header.Get("Authorization"); got != "Bearer token" {
			t.Fatalf("authorization = %s", got)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body: io.NopCloser(strings.NewReader(`{
				"data":[{"id":"1","text":"hello","author_id":"u1","created_at":"2026-06-14T16:00:00Z","public_metrics":{"reply_count":2,"retweet_count":3,"like_count":5,"quote_count":1,"bookmark_count":4,"impression_count":1200}}],
				"includes":{"users":[{"id":"u1","username":"alice","name":"Alice","public_metrics":{"followers_count":900}}]}
			}`)),
		}, nil
	})}

	items, err := LookupTweetsByIDsWithClient(context.Background(), client, "token", []string{"1", "2", "1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items len = %d", len(items))
	}
	got := items[0]
	if got.ID != "1" || got.AuthorUsername != "alice" || got.FollowersCount != 900 || got.ImpressionCount != 1200 {
		t.Fatalf("unexpected item: %#v", got)
	}
}
