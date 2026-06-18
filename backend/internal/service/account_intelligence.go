package service

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
	"unicode"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
)

const accountIntelligencePostLimit = 30

func (s *AccountService) Intelligence(ctx context.Context, userID, accountID uint, now time.Time) (*dto.AccountIntelligenceResponse, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	acc, err := s.repo.GetConnectedByUserAndAccountID(userID, accountID)
	if err != nil {
		return nil, err
	}
	account, err := s.accountItem(userID, accountID)
	if err != nil {
		return nil, err
	}
	resp := &dto.AccountIntelligenceResponse{
		Account:      *account,
		GeneratedAt:  now.UTC().Format(time.RFC3339),
		SourceStatus: "ready",
		RecentPosts:  []dto.AccountIntelligencePost{},
	}
	if strings.TrimSpace(acc.AccessToken) == "" || strings.TrimSpace(acc.TwitterUserID) == "" {
		resp.SourceStatus = "needs_reauth"
		resp.LimitReason = "The connected account is missing a readable X access token. Reconnect the account before running account intelligence."
		resp.Positioning = fallbackAccountPositioning(acc.DisplayName, acc.Username)
		resp.BotSuggestion = accountBotSuggestion(*acc, resp.Positioning)
		resp.RadarGuidance = accountRadarGuidance(resp.Positioning)
		resp.WeeklyReview = accountWeeklyReview(resp.Positioning, resp.Metrics)
		return resp, nil
	}

	tweets, err := s.listUserRootTweetsForIntelligence(ctx, acc, accountIntelligencePostLimit)
	if err != nil {
		resp.SourceStatus = "limited"
		resp.LimitReason = accountIntelligenceLimitReason(err)
		resp.Positioning = fallbackAccountPositioning(acc.DisplayName, acc.Username)
		resp.BotSuggestion = accountBotSuggestion(*acc, resp.Positioning)
		resp.RadarGuidance = accountRadarGuidance(resp.Positioning)
		resp.WeeklyReview = accountWeeklyReview(resp.Positioning, resp.Metrics)
		return resp, nil
	}
	if len(tweets) == 0 {
		resp.SourceStatus = "empty"
		resp.LimitReason = "No recent original posts were returned by X for this account. Add a few posts first, then rerun account intelligence."
		resp.Positioning = fallbackAccountPositioning(acc.DisplayName, acc.Username)
		resp.BotSuggestion = accountBotSuggestion(*acc, resp.Positioning)
		resp.RadarGuidance = accountRadarGuidance(resp.Positioning)
		resp.WeeklyReview = accountWeeklyReview(resp.Positioning, resp.Metrics)
		return resp, nil
	}

	resp.RecentPosts = accountIntelligencePosts(acc.Username, tweets)
	resp.Metrics = accountIntelligenceMetrics(resp.RecentPosts)
	resp.Positioning = accountPositioning(acc.DisplayName, acc.Username, resp.RecentPosts, resp.Metrics)
	resp.BotSuggestion = accountBotSuggestion(*acc, resp.Positioning)
	resp.RadarGuidance = accountRadarGuidance(resp.Positioning)
	resp.WeeklyReview = accountWeeklyReview(resp.Positioning, resp.Metrics)
	return resp, nil
}

func (s *AccountService) listUserRootTweetsForIntelligence(ctx context.Context, acc *model.TwitterAccount, maxResults int) ([]twitter.UserTweet, error) {
	tweets, err := twitter.ListUserRootTweets(ctx, s.httpClient, acc.AccessToken, acc.TwitterUserID, maxResults)
	if err == nil || !isXUnauthorizedError(err) {
		return tweets, err
	}
	refreshed, refreshErr := s.refreshXAccessToken(ctx, acc)
	if refreshErr != nil {
		if s != nil && s.repo != nil && acc != nil {
			_ = s.repo.MarkNeedsReauth(acc.UserID, acc.ID)
		}
		return nil, fmt.Errorf("%w; token_refresh_failed: %v", err, refreshErr)
	}
	return twitter.ListUserRootTweets(ctx, s.httpClient, refreshed.AccessToken, refreshed.TwitterUserID, maxResults)
}

func accountIntelligenceLimitReason(err error) string {
	if err == nil {
		return ""
	}
	msg := strings.TrimSpace(err.Error())
	lower := strings.ToLower(msg)
	if strings.Contains(lower, "token_refresh_failed") || strings.Contains(lower, "unauthorized") || strings.Contains(lower, "401") {
		return "X authorization expired or was revoked. Reconnect the X account, then rerun Account Intelligence."
	}
	return "X returned a limited response for recent posts. The report falls back to profile-level positioning until the token or X API window is available: " + msg
}

func accountIntelligencePosts(username string, tweets []twitter.UserTweet) []dto.AccountIntelligencePost {
	items := make([]dto.AccountIntelligencePost, 0, len(tweets))
	for _, tweet := range tweets {
		engagements := tweet.LikeCount + tweet.ReplyCount + tweet.RetweetCount + tweet.QuoteCount + tweet.BookmarkCount
		impressions := tweet.ImpressionCount
		rate := 0.0
		if impressions > 0 {
			rate = roundFloat(float64(engagements)/float64(impressions), 4)
		}
		score := accountPostScore(impressions, engagements, rate)
		createdAt := ""
		if !tweet.CreatedAt.IsZero() {
			createdAt = tweet.CreatedAt.UTC().Format(time.RFC3339)
		}
		items = append(items, dto.AccountIntelligencePost{
			ID:              tweet.ID,
			Text:            tweet.Text,
			URL:             accountTweetURL(username, tweet.ID),
			CreatedAt:       createdAt,
			LikeCount:       tweet.LikeCount,
			ReplyCount:      tweet.ReplyCount,
			RetweetCount:    tweet.RetweetCount,
			QuoteCount:      tweet.QuoteCount,
			BookmarkCount:   tweet.BookmarkCount,
			ImpressionCount: tweet.ImpressionCount,
			Engagements:     engagements,
			EngagementRate:  rate,
			Score:           score,
			Topics:          accountTextTopics(tweet.Text, 4),
		})
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].CreatedAt != items[j].CreatedAt {
			return items[i].CreatedAt > items[j].CreatedAt
		}
		return items[i].ID > items[j].ID
	})
	return items
}

func accountIntelligenceMetrics(posts []dto.AccountIntelligencePost) dto.AccountIntelligenceMetrics {
	metrics := dto.AccountIntelligenceMetrics{PostCount: len(posts)}
	bestScore := -1
	for _, post := range posts {
		metrics.TotalImpressions += post.ImpressionCount
		metrics.TotalEngagements += post.Engagements
		if post.ImpressionCount > 0 {
			metrics.PostsWithImpressions++
		}
		if post.Score > bestScore {
			bestScore = post.Score
			metrics.BestPostID = post.ID
			metrics.BestPostURL = post.URL
			metrics.BestPostText = limitString(post.Text, 260)
			metrics.BestPostScore = post.Score
		}
	}
	if len(posts) > 0 {
		metrics.AverageImpressions = int64(math.Round(float64(metrics.TotalImpressions) / float64(len(posts))))
	}
	if metrics.TotalImpressions > 0 {
		metrics.AverageEngagementRate = roundFloat(float64(metrics.TotalEngagements)/float64(metrics.TotalImpressions), 4)
	}
	return metrics
}

func accountPositioning(displayName, username string, posts []dto.AccountIntelligencePost, metrics dto.AccountIntelligenceMetrics) dto.AccountPositioningSnapshot {
	topicScores := map[string]int{}
	han, latin := 0, 0
	totalLength := 0
	questionCount := 0
	for _, post := range posts {
		totalLength += len([]rune(post.Text))
		if strings.Contains(post.Text, "?") || strings.Contains(post.Text, "？") {
			questionCount++
		}
		for _, r := range post.Text {
			if unicode.Is(unicode.Han, r) {
				han++
			} else if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
				latin++
			}
		}
		for _, topic := range post.Topics {
			topicScores[topic] += 2
		}
		for _, topic := range accountTextTopics(post.Text, 8) {
			topicScores[topic]++
		}
	}
	topics := topAccountTopics(topicScores, 8)
	if len(topics) == 0 {
		topics = []string{"product updates", "operator notes", "community context"}
	}
	primaryLanguage := "en"
	if han > latin/2 && han > 0 {
		primaryLanguage = "zh-CN"
	}
	avgLength := 0
	if len(posts) > 0 {
		avgLength = totalLength / len(posts)
	}
	voiceTone := "concise operator voice"
	if avgLength >= 180 {
		voiceTone = "context-rich operator voice"
	} else if questionCount >= len(posts)/3 && questionCount > 0 {
		voiceTone = "conversational question-led voice"
	}
	confidence := 35 + radarMinInt(35, len(posts)*3)
	if metrics.PostsWithImpressions > 0 {
		confidence += 15
	}
	if len(topics) >= 3 {
		confidence += 10
	}
	confidence = radarMinInt(95, confidence)
	stage := "warming_up"
	if metrics.TotalImpressions >= 10000 || metrics.TotalEngagements >= 300 {
		stage = "finding_repeatable_signals"
	}
	if metrics.PostCount >= 20 && metrics.AverageEngagementRate >= 0.03 {
		stage = "ready_to_systematize"
	}
	pillars := topics
	if len(pillars) > 4 {
		pillars = pillars[:4]
	}
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = "@" + strings.TrimPrefix(username, "@")
	}
	return dto.AccountPositioningSnapshot{
		Confidence:         confidence,
		PrimaryLanguage:    primaryLanguage,
		PositioningSummary: fmt.Sprintf("%s currently reads as a %s account around %s.", name, voiceTone, strings.Join(pillars, ", ")),
		AudienceGuess:      accountAudienceGuess(topics),
		VoiceTone:          voiceTone,
		MaturityStage:      stage,
		DetectedTopics:     topics,
		ContentPillars:     pillars,
		Strengths:          accountPositioningStrengths(metrics, topics),
		Risks:              accountPositioningRisks(metrics, posts),
	}
}

func fallbackAccountPositioning(displayName, username string) dto.AccountPositioningSnapshot {
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = "@" + strings.TrimPrefix(username, "@")
	}
	return dto.AccountPositioningSnapshot{
		Confidence:         35,
		PrimaryLanguage:    "en",
		PositioningSummary: name + " needs a first pass based on recent original posts before the system can personalize strategy with confidence.",
		AudienceGuess:      "Builders, operators, and people already familiar with the account context.",
		VoiceTone:          "practical operator voice",
		MaturityStage:      "needs_recent_content",
		DetectedTopics:     []string{"product updates", "operator notes", "community context"},
		ContentPillars:     []string{"product updates", "operator notes", "community context"},
		Strengths:          []string{"Account binding is available, so the workflow can become personalized after recent posts are readable."},
		Risks:              []string{"Not enough recent post data is available to infer repeatable positioning yet."},
	}
}

func accountBotSuggestion(acc model.TwitterAccount, positioning dto.AccountPositioningSnapshot) dto.OAFBotUpsertRequest {
	name := strings.TrimSpace(acc.DisplayName)
	if name == "" {
		name = strings.TrimPrefix(acc.Username, "@")
	}
	if name == "" {
		name = "Account"
	}
	topics := compactAccountStrings(positioning.DetectedTopics, 8)
	pillars := compactAccountStrings(positioning.ContentPillars, 5)
	return dto.OAFBotUpsertRequest{
		Name:                 limitString(name+" OAF Bot", 96),
		TwitterAccountID:     acc.ID,
		Occupation:           "X account operator",
		Industry:             limitString(strings.Join(pillars, ", "), 128),
		PersonalityTags:      []string{"practical", "context-aware", "review-first"},
		IdentitySummary:      positioning.PositioningSummary,
		VoiceTone:            positioning.VoiceTone,
		Topics:               topics,
		ForbiddenTopics:      []string{"spammy promotion", "guaranteed growth claims", "unverified financial claims"},
		GrowthGoal:           "Build a safer manual growth workflow: identify fitting opportunities, write context-aware replies, save learnings, and review outcomes.",
		TargetAudience:       positioning.AudienceGuess,
		ContentPillars:       pillars,
		ContentObjectives:    "Increase consistency, clarify account positioning, and turn high-signal conversations into reusable content memory.",
		CTAPolicy:            "Use soft CTA only after giving contextual value. Avoid repetitive promotional replies.",
		ComplianceNotes:      "Keep human review before publishing. Avoid claims that imply guaranteed reach, financial return, or platform manipulation.",
		AvoidClaims:          []string{"guaranteed growth", "guaranteed engagement", "fully automated growth"},
		SafetyMode:           "balanced",
		PrimaryLanguage:      positioning.PrimaryLanguage,
		LanguageStrategy:     "follow_context",
		TrendRegions:         []string{"1", "23424977"},
		TrendCategories:      topics,
		AllowGeneralTrends:   false,
		SensitiveTrendPolicy: "review_only",
	}
}

func accountRadarGuidance(positioning dto.AccountPositioningSnapshot) dto.AccountRadarGuidance {
	topics := compactAccountStrings(positioning.DetectedTopics, 8)
	if len(topics) == 0 {
		topics = []string{"product", "growth", "operator"}
	}
	return dto.AccountRadarGuidance{
		FitKeywords:      topics,
		AvoidKeywords:    []string{"giveaway", "airdrop", "guaranteed", "price prediction", "spam"},
		PreferredRegions: accountPreferredRegions(positioning.PrimaryLanguage),
		OpportunityFitRules: []string{
			"Prioritize posts where the account can add a concrete operator insight.",
			"Prefer rising posts with real public metrics over topic-only leads.",
			"Skip opportunities that require forced promotion or unrelated product mentions.",
		},
		RecommendedActions: []string{
			"Open Exposure Radar with this account selected.",
			"Generate one reply draft, inspect the original thread, then publish manually on X.",
			"Backfill the published reply URL so future ranking learns from outcomes.",
		},
	}
}

func accountWeeklyReview(positioning dto.AccountPositioningSnapshot, metrics dto.AccountIntelligenceMetrics) dto.AccountWeeklyReview {
	wins := []string{}
	if metrics.BestPostID != "" {
		wins = append(wins, fmt.Sprintf("Best recent post scored %d based on public metrics and engagement.", metrics.BestPostScore))
	}
	if len(positioning.ContentPillars) > 0 {
		wins = append(wins, "Detected repeatable content pillars: "+strings.Join(positioning.ContentPillars, ", ")+".")
	}
	if len(wins) == 0 {
		wins = append(wins, "The account is connected and ready for a positioning baseline.")
	}
	return dto.AccountWeeklyReview{
		Headline: "Use the next week to make the account more legible and repeatable.",
		Wins:     wins,
		Risks:    positioning.Risks,
		NextActions: []string{
			"Publish or save 3-5 posts around the strongest detected content pillars.",
			"Use Exposure Radar only for opportunities that match the positioning keywords.",
			"Record reply outcomes so the system can learn which angles actually work.",
		},
	}
}

func accountTweetURL(username, tweetID string) string {
	tweetID = strings.TrimSpace(tweetID)
	if tweetID == "" {
		return ""
	}
	username = strings.TrimPrefix(strings.TrimSpace(username), "@")
	if username == "" {
		return "https://x.com/i/web/status/" + tweetID
	}
	return "https://x.com/" + username + "/status/" + tweetID
}

func accountPostScore(impressions, engagements int64, rate float64) int {
	score := 35
	if impressions > 0 {
		score += radarMinInt(30, int(math.Log10(float64(impressions)+1)*8))
	}
	if engagements > 0 {
		score += radarMinInt(25, int(math.Log10(float64(engagements)+1)*12))
	}
	if rate >= 0.05 {
		score += 10
	} else if rate >= 0.025 {
		score += 5
	}
	return radarMaxInt(0, radarMinInt(100, score))
}

func accountTextTopics(text string, limit int) []string {
	if limit <= 0 {
		limit = 5
	}
	counts := map[string]int{}
	for _, token := range accountTokens(text) {
		if accountStopWords[token] {
			continue
		}
		if len([]rune(token)) < 2 {
			continue
		}
		counts[token]++
	}
	return topAccountTopics(counts, limit)
}

func accountTokens(text string) []string {
	text = strings.ToLower(text)
	out := []string{}
	var current []rune
	flush := func() {
		if len(current) == 0 {
			return
		}
		out = append(out, string(current))
		current = nil
	}
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.Is(unicode.Han, r) || r == '_' {
			current = append(current, r)
			continue
		}
		flush()
	}
	flush()
	return out
}

var accountStopWords = map[string]bool{
	"the": true, "and": true, "for": true, "you": true, "with": true, "this": true, "that": true, "from": true, "are": true, "was": true, "have": true, "has": true, "but": true, "not": true,
	"our": true, "your": true, "just": true, "into": true, "about": true, "when": true, "what": true, "why": true, "how": true, "can": true, "will": true, "all": true,
	"一个": true, "我们": true, "这个": true, "不是": true, "可以": true, "因为": true, "如果": true, "就是": true, "还是": true, "没有": true,
}

func topAccountTopics(scores map[string]int, limit int) []string {
	type topicScore struct {
		Topic string
		Score int
	}
	rows := make([]topicScore, 0, len(scores))
	for topic, score := range scores {
		topic = strings.Trim(strings.TrimSpace(topic), "#@")
		if topic == "" || accountStopWords[topic] {
			continue
		}
		rows = append(rows, topicScore{Topic: topic, Score: score})
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].Score != rows[j].Score {
			return rows[i].Score > rows[j].Score
		}
		return rows[i].Topic < rows[j].Topic
	})
	if len(rows) > limit {
		rows = rows[:limit]
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		out = append(out, row.Topic)
	}
	return out
}

func accountAudienceGuess(topics []string) string {
	joined := strings.ToLower(strings.Join(topics, " "))
	switch {
	case strings.Contains(joined, "web3") || strings.Contains(joined, "crypto") || strings.Contains(joined, "token"):
		return "Web3 builders, community operators, and early adopters tracking product and market context."
	case strings.Contains(joined, "ai") || strings.Contains(joined, "agent"):
		return "AI builders, agent product teams, and operators who care about practical workflows."
	case strings.Contains(joined, "saas") || strings.Contains(joined, "product"):
		return "SaaS founders, product builders, and growth operators looking for practical execution signals."
	default:
		return "Builders, operators, and community members who respond to concrete context rather than broad promotion."
	}
}

func accountPositioningStrengths(metrics dto.AccountIntelligenceMetrics, topics []string) []string {
	out := []string{}
	if metrics.PostCount >= 10 {
		out = append(out, "Enough recent original posts exist for a usable positioning baseline.")
	}
	if metrics.PostsWithImpressions > 0 {
		out = append(out, "Public impression data is available for at least part of the recent content set.")
	}
	if len(topics) >= 3 {
		out = append(out, "The account already has repeatable topic signals that can guide Radar filtering.")
	}
	if len(out) == 0 {
		out = append(out, "The account has a connected profile and can start building repeatable content memory.")
	}
	return out
}

func accountPositioningRisks(metrics dto.AccountIntelligenceMetrics, posts []dto.AccountIntelligencePost) []string {
	risks := []string{}
	if metrics.PostCount < 8 {
		risks = append(risks, "Recent original content sample is small, so positioning confidence is still limited.")
	}
	if metrics.PostsWithImpressions == 0 {
		risks = append(risks, "No public impression counts were returned, so performance advice relies on engagement and content shape.")
	}
	if metrics.AverageEngagementRate > 0 && metrics.AverageEngagementRate < 0.01 {
		risks = append(risks, "Recent engagement rate is low; prioritize clearer hooks and more specific reply angles.")
	}
	if accountRepeatedShortPosts(posts) {
		risks = append(risks, "Several recent posts are very short; the account may need more context-rich proof posts before heavy opportunity work.")
	}
	if len(risks) == 0 {
		risks = append(risks, "Avoid overusing Radar replies; keep manual review and context fit as the constraint.")
	}
	return risks
}

func accountRepeatedShortPosts(posts []dto.AccountIntelligencePost) bool {
	if len(posts) < 4 {
		return false
	}
	short := 0
	for _, post := range posts {
		if len([]rune(strings.TrimSpace(post.Text))) < 40 {
			short++
		}
	}
	return short >= len(posts)/2
}

func accountPreferredRegions(primaryLanguage string) []string {
	if strings.EqualFold(primaryLanguage, "zh-CN") || strings.HasPrefix(strings.ToLower(primaryLanguage), "zh") {
		return []string{"zh", "en"}
	}
	return []string{"en", "zh"}
}

func compactAccountStrings(values []string, limit int) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
}

func roundFloat(value float64, precision int) float64 {
	if precision < 0 {
		precision = 0
	}
	pow := math.Pow(10, float64(precision))
	return math.Round(value*pow) / pow
}
