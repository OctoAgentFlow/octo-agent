package twitter

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	userTweetsPath   = "https://api.x.com/2/users/"
	searchRecentPath = "https://api.x.com/2/tweets/search/recent"
)

// ConversationReply is a direct reply to a root tweet (not from the root author).
type ConversationReply struct {
	TweetID        string
	AuthorID       string
	AuthorUsername string
	Text           string
	CreatedAt      time.Time
}

type XUser struct {
	ID          string
	Username    string
	DisplayName string
}

type UserTweet struct {
	ID              string
	AuthorID        string
	Text            string
	CreatedAt       time.Time
	LikeCount       int64
	ReplyCount      int64
	RetweetCount    int64
	QuoteCount      int64
	BookmarkCount   int64
	ImpressionCount int64
}

type userLookupAPIResp struct {
	Data struct {
		ID       string `json:"id"`
		Username string `json:"username"`
		Name     string `json:"name"`
	} `json:"data"`
}

type userTweetsAPIResp struct {
	Data []struct {
		ID            string `json:"id"`
		AuthorID      string `json:"author_id"`
		Text          string `json:"text"`
		CreatedAt     string `json:"created_at"`
		PublicMetrics struct {
			RetweetCount    int64 `json:"retweet_count"`
			ReplyCount      int64 `json:"reply_count"`
			LikeCount       int64 `json:"like_count"`
			QuoteCount      int64 `json:"quote_count"`
			BookmarkCount   int64 `json:"bookmark_count"`
			ImpressionCount int64 `json:"impression_count"`
		} `json:"public_metrics"`
	} `json:"data"`
}

type searchRecentAPIResp struct {
	Data     []tweetSearchData `json:"data"`
	Includes *struct {
		Users []struct {
			ID       string `json:"id"`
			Username string `json:"username"`
		} `json:"users"`
	} `json:"includes"`
	Meta *struct {
		NextToken   string `json:"next_token"`
		ResultCount int    `json:"result_count"`
	} `json:"meta"`
}

type tweetSearchData struct {
	ID               string `json:"id"`
	AuthorID         string `json:"author_id"`
	Text             string `json:"text"`
	CreatedAt        string `json:"created_at"`
	ReferencedTweets []struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	} `json:"referenced_tweets"`
}

// LookupUserByUsername resolves a public X username into a user id using a user OAuth token.
func LookupUserByUsername(ctx context.Context, client *http.Client, accessToken, username string) (*XUser, error) {
	username = strings.TrimSpace(strings.TrimPrefix(username, "@"))
	if username == "" {
		return nil, fmt.Errorf("missing username")
	}
	if client == nil {
		client = defaultHTTP
	}
	token := strings.TrimSpace(accessToken)
	if token == "" {
		return nil, fmt.Errorf("missing access token")
	}
	u := "https://api.x.com/2/users/by/username/" + url.PathEscape(username)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
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
	var out userLookupAPIResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode user lookup: %w", err)
	}
	if strings.TrimSpace(out.Data.ID) == "" {
		return nil, fmt.Errorf("x user not found")
	}
	return &XUser{
		ID:          strings.TrimSpace(out.Data.ID),
		Username:    strings.TrimSpace(out.Data.Username),
		DisplayName: strings.TrimSpace(out.Data.Name),
	}, nil
}

// ListUserRootTweetIDs returns recent top-level tweet ids for the given X user id (newest first from API).
func ListUserRootTweetIDs(ctx context.Context, client *http.Client, accessToken, twitterUserID string, maxResults int) ([]string, error) {
	tweets, err := ListUserRootTweets(ctx, client, accessToken, twitterUserID, maxResults)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(tweets))
	for _, tw := range tweets {
		if tw.ID != "" {
			ids = append(ids, tw.ID)
		}
	}
	return ids, nil
}

// ListUserRootTweets returns recent top-level tweets for the given X user id (newest first from API).
func ListUserRootTweets(ctx context.Context, client *http.Client, accessToken, twitterUserID string, maxResults int) ([]UserTweet, error) {
	twitterUserID = strings.TrimSpace(twitterUserID)
	if twitterUserID == "" {
		return nil, fmt.Errorf("missing twitter user id")
	}
	if maxResults <= 0 {
		maxResults = 5
	}
	if maxResults < 5 {
		maxResults = 5
	}
	if maxResults > 50 {
		maxResults = 50
	}
	if client == nil {
		client = defaultHTTP
	}
	token := strings.TrimSpace(accessToken)
	if token == "" {
		return nil, fmt.Errorf("missing access token")
	}

	u, err := url.Parse(userTweetsPath + url.PathEscape(twitterUserID) + "/tweets")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("max_results", strconv.Itoa(maxResults))
	q.Set("exclude", "retweets,replies")
	q.Set("tweet.fields", "author_id,created_at,text,public_metrics")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
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
	var out userTweetsAPIResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode user tweets: %w", err)
	}
	tweets := make([]UserTweet, 0, len(out.Data))
	for _, row := range out.Data {
		id := strings.TrimSpace(row.ID)
		if id == "" {
			continue
		}
		var at time.Time
		if ts := strings.TrimSpace(row.CreatedAt); ts != "" {
			if parsed, err := time.Parse(time.RFC3339, ts); err == nil {
				at = parsed.UTC()
			}
		}
		tweets = append(tweets, UserTweet{
			ID:              id,
			AuthorID:        strings.TrimSpace(row.AuthorID),
			Text:            strings.TrimSpace(row.Text),
			CreatedAt:       at,
			LikeCount:       row.PublicMetrics.LikeCount,
			ReplyCount:      row.PublicMetrics.ReplyCount,
			RetweetCount:    row.PublicMetrics.RetweetCount,
			QuoteCount:      row.PublicMetrics.QuoteCount,
			BookmarkCount:   row.PublicMetrics.BookmarkCount,
			ImpressionCount: row.PublicMetrics.ImpressionCount,
		})
	}
	return tweets, nil
}

// ListDirectRepliesFromOthers returns direct replies to rootTweetID where author is not myTwitterUserID.
func ListDirectRepliesFromOthers(ctx context.Context, client *http.Client, accessToken, rootTweetID, myTwitterUserID string) ([]ConversationReply, error) {
	rootTweetID = strings.TrimSpace(rootTweetID)
	myTwitterUserID = strings.TrimSpace(myTwitterUserID)
	if rootTweetID == "" || myTwitterUserID == "" {
		return nil, fmt.Errorf("missing root or user id")
	}
	if client == nil {
		client = defaultHTTP
	}
	token := strings.TrimSpace(accessToken)
	if token == "" {
		return nil, fmt.Errorf("missing access token")
	}

	query := "conversation_id:" + rootTweetID
	var collected []ConversationReply
	var nextToken string
	for page := 0; page < 4; page++ {
		u, err := url.Parse(searchRecentPath)
		if err != nil {
			return nil, err
		}
		q := u.Query()
		q.Set("query", query)
		q.Set("max_results", "100")
		q.Set("tweet.fields", "author_id,created_at,referenced_tweets,conversation_id,text")
		q.Set("expansions", "author_id")
		q.Set("user.fields", "username")
		if nextToken != "" {
			q.Set("next_token", nextToken)
		}
		u.RawQuery = q.Encode()

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, newPublishError(resp, raw)
		}
		var out searchRecentAPIResp
		if err := json.Unmarshal(raw, &out); err != nil {
			return nil, fmt.Errorf("decode search recent: %w", err)
		}
		userNames := map[string]string{}
		if out.Includes != nil {
			for _, u := range out.Includes.Users {
				id := strings.TrimSpace(u.ID)
				if id == "" {
					continue
				}
				userNames[id] = strings.TrimSpace(u.Username)
			}
		}
		for _, tw := range out.Data {
			if !isDirectReplyToRoot(tw, rootTweetID) {
				continue
			}
			aid := strings.TrimSpace(tw.AuthorID)
			if aid == "" || aid == myTwitterUserID {
				continue
			}
			uname := userNames[aid]
			if uname == "" {
				uname = "user"
			}
			var at time.Time
			if ts := strings.TrimSpace(tw.CreatedAt); ts != "" {
				if t, err := time.Parse(time.RFC3339, ts); err == nil {
					at = t.UTC()
				}
			}
			collected = append(collected, ConversationReply{
				TweetID:        strings.TrimSpace(tw.ID),
				AuthorID:       aid,
				AuthorUsername: uname,
				Text:           strings.TrimSpace(tw.Text),
				CreatedAt:      at,
			})
		}
		if out.Meta == nil || strings.TrimSpace(out.Meta.NextToken) == "" {
			break
		}
		nextToken = strings.TrimSpace(out.Meta.NextToken)
	}

	sort.Slice(collected, func(i, j int) bool {
		if collected[i].CreatedAt.Equal(collected[j].CreatedAt) {
			return collected[i].TweetID < collected[j].TweetID
		}
		if collected[i].CreatedAt.IsZero() {
			return false
		}
		if collected[j].CreatedAt.IsZero() {
			return true
		}
		return collected[i].CreatedAt.Before(collected[j].CreatedAt)
	})
	return collected, nil
}

func isDirectReplyToRoot(tw tweetSearchData, rootTweetID string) bool {
	for _, ref := range tw.ReferencedTweets {
		if strings.EqualFold(strings.TrimSpace(ref.Type), "replied_to") && strings.TrimSpace(ref.ID) == rootTweetID {
			return true
		}
	}
	return false
}
