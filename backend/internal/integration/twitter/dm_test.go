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

func TestListDirectMessageEventsWithParticipantClient(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method != http.MethodGet {
			t.Fatalf("method = %s", req.Method)
		}
		if got := req.URL.Path; got != "/2/dm_conversations/with/123/dm_events" {
			t.Fatalf("path = %s", got)
		}
		if got := req.URL.Query().Get("max_results"); got != "50" {
			t.Fatalf("max_results = %s", got)
		}
		if got := req.URL.Query().Get("dm_event.fields"); !strings.Contains(got, "sender_id") || !strings.Contains(got, "text") {
			t.Fatalf("dm_event.fields = %s", got)
		}
		if got := req.Header.Get("Authorization"); got != "Bearer token" {
			t.Fatalf("authorization = %s", got)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"data":[{"id":"evt-2","event_type":"MessageCreate","created_at":"2026-05-29T05:00:00.000Z","dm_conversation_id":"conv-1","sender_id":"123","text":"hello back","participant_ids":["123","456"]}]}`)),
		}, nil
	})}

	events, err := ListDirectMessageEventsWithParticipantClient(context.Background(), client, "token", "123", 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 {
		t.Fatalf("events len = %d", len(events))
	}
	if events[0].ID != "evt-2" || events[0].SenderID != "123" || events[0].Text != "hello back" {
		t.Fatalf("unexpected event: %#v", events[0])
	}
}
