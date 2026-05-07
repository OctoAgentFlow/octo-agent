package twitter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const dmConversationWithParticipantEndpoint = "https://api.x.com/2/dm_conversations/with/%s/messages"

type createDMBody struct {
	Text string `json:"text"`
}

type createDMResp struct {
	Data struct {
		DMConversationID string `json:"dm_conversation_id"`
		DMEventID        string `json:"dm_event_id"`
	} `json:"data"`
}

// SendDirectMessage sends a one-to-one DM via X API v2 (Bearer user access token).
func SendDirectMessage(ctx context.Context, accessToken, participantID, text string) (conversationID, eventID string, err error) {
	return SendDirectMessageWithClient(ctx, defaultHTTP, accessToken, participantID, text)
}

// SendDirectMessageWithClient allows injecting an HTTP client (tests).
func SendDirectMessageWithClient(ctx context.Context, client *http.Client, accessToken, participantID, text string) (conversationID, eventID string, err error) {
	token := strings.TrimSpace(accessToken)
	if token == "" {
		return "", "", fmt.Errorf("missing access token")
	}
	participantID = strings.TrimSpace(participantID)
	if participantID == "" {
		return "", "", fmt.Errorf("missing dm participant id")
	}
	message := strings.TrimSpace(text)
	if message == "" {
		return "", "", fmt.Errorf("missing dm text")
	}
	if client == nil {
		client = defaultHTTP
	}
	body, err := json.Marshal(createDMBody{Text: message})
	if err != nil {
		return "", "", err
	}
	endpoint := fmt.Sprintf(dmConversationWithParticipantEndpoint, url.PathEscape(participantID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		var out createDMResp
		if err := json.Unmarshal(raw, &out); err != nil {
			return "", "", fmt.Errorf("decode dm success body: %w", err)
		}
		if strings.TrimSpace(out.Data.DMEventID) == "" {
			return "", "", fmt.Errorf("empty dm event id in response")
		}
		return strings.TrimSpace(out.Data.DMConversationID), strings.TrimSpace(out.Data.DMEventID), nil
	}

	return "", "", newPublishError(resp, raw)
}
