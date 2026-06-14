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
	"time"
)

const (
	recentSearchEndpoint = "https://api.x.com/2/tweets/search/recent"
	tweetLookupEndpoint  = "https://api.x.com/2/tweets"
)

type TweetSearchItem struct {
	ID              string
	Text            string
	AuthorID        string
	AuthorUsername  string
	AuthorName      string
	FollowersCount  int64
	CreatedAt       time.Time
	LikeCount       int64
	ReplyCount      int64
	RetweetCount    int64
	QuoteCount      int64
	BookmarkCount   int64
	ImpressionCount int64
	Raw             string
}

type recentSearchResp struct {
	Data     []tweetSearchAPIItem `json:"data"`
	Includes struct {
		Users []tweetSearchUser `json:"users"`
	} `json:"includes"`
}

type tweetSearchAPIItem struct {
	ID            string `json:"id"`
	Text          string `json:"text"`
	AuthorID      string `json:"author_id"`
	CreatedAt     string `json:"created_at"`
	PublicMetrics struct {
		RetweetCount    int64 `json:"retweet_count"`
		ReplyCount      int64 `json:"reply_count"`
		LikeCount       int64 `json:"like_count"`
		QuoteCount      int64 `json:"quote_count"`
		BookmarkCount   int64 `json:"bookmark_count"`
		ImpressionCount int64 `json:"impression_count"`
	} `json:"public_metrics"`
}

type tweetSearchUser struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Username      string `json:"username"`
	PublicMetrics struct {
		FollowersCount int64 `json:"followers_count"`
	} `json:"public_metrics"`
}

func SearchRecentTweets(ctx context.Context, bearerToken, query string, maxResults int) ([]TweetSearchItem, error) {
	return SearchRecentTweetsWithClient(ctx, defaultHTTP, bearerToken, query, maxResults)
}

func LookupTweetsByIDs(ctx context.Context, bearerToken string, ids []string) ([]TweetSearchItem, error) {
	return LookupTweetsByIDsWithClient(ctx, defaultHTTP, bearerToken, ids)
}

func SearchRecentTweetsWithClient(ctx context.Context, client *http.Client, bearerToken, query string, maxResults int) ([]TweetSearchItem, error) {
	token := strings.TrimSpace(bearerToken)
	if token == "" {
		return nil, fmt.Errorf("missing x bearer token")
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("missing recent search query")
	}
	if maxResults <= 0 {
		maxResults = 10
	}
	if maxResults < 10 {
		maxResults = 10
	}
	if maxResults > 100 {
		maxResults = 100
	}
	if client == nil {
		client = defaultHTTP
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, recentSearchEndpoint, nil)
	if err != nil {
		return nil, err
	}
	q := req.URL.Query()
	q.Set("query", query)
	q.Set("max_results", strconv.Itoa(maxResults))
	q.Set("sort_order", "recency")
	q.Set("tweet.fields", "author_id,created_at,public_metrics,lang")
	q.Set("expansions", "author_id")
	q.Set("user.fields", "username,name,public_metrics")
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
	var out recentSearchResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode recent search response: %w", err)
	}
	return parseTweetSearchItems(out), nil
}

func LookupTweetsByIDsWithClient(ctx context.Context, client *http.Client, bearerToken string, ids []string) ([]TweetSearchItem, error) {
	token := strings.TrimSpace(bearerToken)
	if token == "" {
		return nil, fmt.Errorf("missing x bearer token")
	}
	ids = compactTweetIDs(ids, 100)
	if len(ids) == 0 {
		return nil, nil
	}
	if client == nil {
		client = defaultHTTP
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, tweetLookupEndpoint, nil)
	if err != nil {
		return nil, err
	}
	q := req.URL.Query()
	q.Set("ids", strings.Join(ids, ","))
	q.Set("tweet.fields", "author_id,created_at,public_metrics,lang")
	q.Set("expansions", "author_id")
	q.Set("user.fields", "username,name,public_metrics")
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
	var out recentSearchResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode tweet lookup response: %w", err)
	}
	return parseTweetSearchItems(out), nil
}

func parseTweetSearchItems(out recentSearchResp) []TweetSearchItem {
	users := map[string]tweetSearchUser{}
	for _, user := range out.Includes.Users {
		users[user.ID] = user
	}
	items := make([]TweetSearchItem, 0, len(out.Data))
	for _, row := range out.Data {
		if strings.TrimSpace(row.ID) == "" {
			continue
		}
		createdAt, _ := time.Parse(time.RFC3339, row.CreatedAt)
		user := users[row.AuthorID]
		rowRaw, _ := json.Marshal(row)
		items = append(items, TweetSearchItem{
			ID:              row.ID,
			Text:            row.Text,
			AuthorID:        row.AuthorID,
			AuthorUsername:  user.Username,
			AuthorName:      user.Name,
			FollowersCount:  user.PublicMetrics.FollowersCount,
			CreatedAt:       createdAt,
			LikeCount:       row.PublicMetrics.LikeCount,
			ReplyCount:      row.PublicMetrics.ReplyCount,
			RetweetCount:    row.PublicMetrics.RetweetCount,
			QuoteCount:      row.PublicMetrics.QuoteCount,
			BookmarkCount:   row.PublicMetrics.BookmarkCount,
			ImpressionCount: row.PublicMetrics.ImpressionCount,
			Raw:             string(rowRaw),
		})
	}
	return items
}

func compactTweetIDs(ids []string, limit int) []string {
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	out := make([]string, 0, minInt(limit, len(ids)))
	seen := map[string]bool{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func RecentSearchLiveURL(query string) string {
	return "https://x.com/search?q=" + url.QueryEscape(query) + "&src=typed_query&f=live"
}
