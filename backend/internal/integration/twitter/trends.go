package twitter

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const trendsByWOEIDEndpoint = "https://api.x.com/2/trends/by/woeid/%s"

type TrendTopic struct {
	Name       string
	TweetCount int64
	Raw        string
}

type trendAPIItem struct {
	TrendName  string `json:"trend_name"`
	Name       string `json:"name"`
	TweetCount int64  `json:"tweet_count"`
}

type trendsAPIResp struct {
	Data []trendAPIItem `json:"data"`
}

func ListTrendsByWOEID(ctx context.Context, bearerToken, woeid string, maxTrends int) ([]TrendTopic, error) {
	return ListTrendsByWOEIDWithClient(ctx, defaultHTTP, bearerToken, woeid, maxTrends)
}

func ListTrendsByWOEIDWithClient(ctx context.Context, client *http.Client, bearerToken, woeid string, maxTrends int) ([]TrendTopic, error) {
	token := strings.TrimSpace(bearerToken)
	if token == "" {
		return nil, fmt.Errorf("missing x trends bearer token")
	}
	woeid = strings.TrimSpace(woeid)
	if woeid == "" {
		return nil, fmt.Errorf("missing trends woeid")
	}
	if maxTrends <= 0 || maxTrends > 50 {
		maxTrends = 20
	}
	if client == nil {
		client = defaultHTTP
	}
	endpoint := fmt.Sprintf(trendsByWOEIDEndpoint, url.PathEscape(woeid))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	q := req.URL.Query()
	q.Set("max_trends", strconv.Itoa(maxTrends))
	q.Set("trend.fields", "tweet_count")
	req.URL.RawQuery = q.Encode()
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, newPublishError(resp, raw)
	}
	var out trendsAPIResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode trends response: %w", err)
	}
	topics := make([]TrendTopic, 0, len(out.Data))
	for _, item := range out.Data {
		name := strings.TrimSpace(item.TrendName)
		if name == "" {
			name = strings.TrimSpace(item.Name)
		}
		if name == "" {
			continue
		}
		itemRaw, _ := json.Marshal(item)
		topics = append(topics, TrendTopic{
			Name:       name,
			TweetCount: item.TweetCount,
			Raw:        string(itemRaw),
		})
	}
	return topics, nil
}
