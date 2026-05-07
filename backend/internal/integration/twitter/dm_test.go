package twitter

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestSendDirectMessageWithClient(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method != http.MethodPost {
			t.Fatalf("method = %s", req.Method)
		}
		if got := req.URL.String(); got != "https://api.x.com/2/dm_conversations/with/123/messages" {
			t.Fatalf("url = %s", got)
		}
		if got := req.Header.Get("Authorization"); got != "Bearer token" {
			t.Fatalf("authorization = %s", got)
		}
		raw, err := io.ReadAll(req.Body)
		if err != nil {
			t.Fatal(err)
		}
		if got := strings.TrimSpace(string(raw)); got != `{"text":"hello"}` {
			t.Fatalf("body = %s", got)
		}
		return &http.Response{
			StatusCode: http.StatusCreated,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"data":{"dm_conversation_id":"conv-1","dm_event_id":"evt-1"}}`)),
		}, nil
	})}

	conversationID, eventID, err := SendDirectMessageWithClient(context.Background(), client, "token", "123", "hello")
	if err != nil {
		t.Fatal(err)
	}
	if conversationID != "conv-1" || eventID != "evt-1" {
		t.Fatalf("unexpected ids: %q %q", conversationID, eventID)
	}
}
