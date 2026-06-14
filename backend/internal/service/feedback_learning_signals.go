package service

import (
	"fmt"
	"sort"
	"strings"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"
)

type feedbackLearningCounter struct {
	accurate   int
	irrelevant int
	reasons    map[string]int
}

func feedbackLearningSignals(repo *repository.ReviewQueueFeedbackIssueVerdictRepository, prefRepo *repository.OAFBotLearningRulePreferenceRepository, userID uint, botID uint, scene string, limit int) []string {
	return feedbackLearningSignalsFromRules(feedbackLearningRules(repo, prefRepo, userID, botID, scene, limit, nil))
}

func feedbackLearningRules(repo *repository.ReviewQueueFeedbackIssueVerdictRepository, prefRepo *repository.OAFBotLearningRulePreferenceRepository, userID uint, botID uint, scene string, limit int, disabledIssues []string) []dto.OAFBotAppliedLearningRule {
	if repo == nil {
		return nil
	}
	rows, err := repo.ListRecentByUser(userID, 200)
	if err != nil {
		return nil
	}
	scene = normalizeLearningScene(scene)
	disabled := map[string]bool{}
	for _, issue := range disabledIssues {
		issue = strings.ToLower(strings.TrimSpace(issue))
		if issue != "" {
			disabled[issue] = true
		}
	}
	preferences := learningRulePreferenceStatuses(prefRepo, userID, botID)
	for issue, status := range preferences {
		if status == "disabled" || status == "ignored" {
			disabled[issue] = true
		}
	}
	counters := map[string]*feedbackLearningCounter{}
	for _, row := range rows {
		if botID > 0 && row.BotID > 0 && row.BotID != botID {
			continue
		}
		if scene != "" && !learningVerdictMatchesScene(row, scene) {
			continue
		}
		issue := strings.TrimSpace(row.FeedbackIssue)
		if issue == "" {
			continue
		}
		if disabled[issue] {
			continue
		}
		counter := counters[issue]
		if counter == nil {
			counter = &feedbackLearningCounter{reasons: map[string]int{}}
			counters[issue] = counter
		}
		if row.Verdict == "accurate" {
			counter.accurate++
			for _, reason := range decodeStringList(row.Reasons) {
				reason = strings.TrimSpace(reason)
				if reason != "" {
					counter.reasons[reason]++
				}
			}
		} else if row.Verdict == "irrelevant" {
			counter.irrelevant++
		}
	}

	type learnedIssue struct {
		issue      string
		accurate   int
		irrelevant int
		confidence float64
		reasons    []string
	}
	learned := make([]learnedIssue, 0, len(counters))
	for issue, counter := range counters {
		total := counter.accurate + counter.irrelevant
		if total == 0 || counter.accurate == 0 {
			continue
		}
		confidence := float64(counter.accurate) / float64(total)
		if confidence < 0.66 {
			continue
		}
		reasons := topLearningReasons(counter.reasons, 3)
		learned = append(learned, learnedIssue{
			issue:      issue,
			accurate:   counter.accurate,
			irrelevant: counter.irrelevant,
			confidence: confidence,
			reasons:    reasons,
		})
	}
	sort.SliceStable(learned, func(i, j int) bool {
		if learned[i].confidence != learned[j].confidence {
			return learned[i].confidence > learned[j].confidence
		}
		if learned[i].accurate != learned[j].accurate {
			return learned[i].accurate > learned[j].accurate
		}
		return learned[i].issue < learned[j].issue
	})
	if limit <= 0 || limit > 4 {
		limit = 4
	}
	if len(learned) > limit {
		learned = learned[:limit]
	}
	rules := make([]dto.OAFBotAppliedLearningRule, 0, len(learned))
	for _, item := range learned {
		rules = append(rules, dto.OAFBotAppliedLearningRule{
			Issue:             item.issue,
			Confidence:        int(item.confidence*100 + 0.5),
			AccurateJudgments: item.accurate,
			Instruction:       feedbackLearningInstruction(item.issue),
			Evidence:          item.reasons,
			PreferenceStatus:  firstNonEmpty(preferences[item.issue], "enabled"),
		})
	}
	return rules
}

func feedbackLearningSignalsFromRules(rules []dto.OAFBotAppliedLearningRule) []string {
	signals := make([]string, 0, len(rules))
	for _, rule := range rules {
		issue := strings.TrimSpace(rule.Issue)
		if issue == "" {
			continue
		}
		parts := []string{
			"learned_queue_guardrail",
			"issue=" + issue,
			fmt.Sprintf("confidence=%d%%", rule.Confidence),
			fmt.Sprintf("accurate_judgments=%d", rule.AccurateJudgments),
			"instruction=" + strings.TrimSpace(rule.Instruction),
		}
		if len(rule.Evidence) > 0 {
			parts = append(parts, "evidence="+strings.Join(rule.Evidence, " / "))
		}
		signals = append(signals, strings.Join(parts, "; "))
	}
	return signals
}

func appendFeedbackLearningSignals(base []string, repo *repository.ReviewQueueFeedbackIssueVerdictRepository, prefRepo *repository.OAFBotLearningRulePreferenceRepository, userID uint, botID uint, scene string) []string {
	signals := feedbackLearningSignals(repo, prefRepo, userID, botID, scene, 4)
	if len(signals) == 0 {
		return base
	}
	out := make([]string, 0, len(base)+len(signals))
	out = append(out, base...)
	out = append(out, signals...)
	return out
}

func appendFeedbackLearningSignalsWithRules(base []string, repo *repository.ReviewQueueFeedbackIssueVerdictRepository, prefRepo *repository.OAFBotLearningRulePreferenceRepository, userID uint, botID uint, scene string, disabledIssues []string) ([]string, []dto.OAFBotAppliedLearningRule) {
	rules := feedbackLearningRules(repo, prefRepo, userID, botID, scene, 4, disabledIssues)
	if len(rules) == 0 {
		return base, nil
	}
	out := make([]string, 0, len(base)+len(rules))
	out = append(out, base...)
	out = append(out, feedbackLearningSignalsFromRules(rules)...)
	return out, rules
}

func learningRulePreferenceStatuses(prefRepo *repository.OAFBotLearningRulePreferenceRepository, userID uint, botID uint) map[string]string {
	out := map[string]string{}
	if prefRepo == nil || botID == 0 {
		return out
	}
	rows, err := prefRepo.ListByUserBot(userID, botID)
	if err != nil {
		return out
	}
	for _, row := range rows {
		issue := strings.ToLower(strings.TrimSpace(row.FeedbackIssue))
		status := normalizeLearningRulePreferenceStatus(row.Status)
		if issue != "" {
			out[issue] = status
		}
	}
	return out
}

func normalizeLearningRulePreferenceStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "disabled", "ignored":
		return "disabled"
	default:
		return "enabled"
	}
}

func normalizeLearningScene(scene string) string {
	switch strings.ToLower(strings.TrimSpace(scene)) {
	case "tweet", "post", "auto_post":
		return "tweet"
	case "comment", "auto_comment":
		return "comment"
	case "reply", "auto_reply":
		return "reply"
	case "dm", "auto_dm":
		return "dm"
	default:
		return ""
	}
}

func learningVerdictMatchesScene(row model.ReviewQueueFeedbackIssueVerdict, scene string) bool {
	queueType := strings.ToLower(strings.TrimSpace(row.QueueType))
	switch scene {
	case "tweet":
		return queueType == "post" || queueType == "auto_post"
	case "comment":
		return queueType == "comment" || queueType == "auto_comment"
	case "reply":
		return queueType == "reply" || queueType == "auto_reply"
	case "dm":
		return queueType == "dm" || queueType == "auto_dm"
	default:
		return true
	}
}

func topLearningReasons(counts map[string]int, limit int) []string {
	type reasonCount struct {
		reason string
		count  int
	}
	items := make([]reasonCount, 0, len(counts))
	for reason, count := range counts {
		if strings.TrimSpace(reason) == "" || count <= 0 {
			continue
		}
		items = append(items, reasonCount{reason: reason, count: count})
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].count != items[j].count {
			return items[i].count > items[j].count
		}
		return items[i].reason < items[j].reason
	})
	if limit <= 0 || limit > len(items) {
		limit = len(items)
	}
	reasons := make([]string, 0, limit)
	for _, item := range items[:limit] {
		reasons = append(reasons, truncateRunes(item.reason, 80))
	}
	return reasons
}

func feedbackLearningInstruction(issue string) string {
	switch strings.ToLower(strings.TrimSpace(issue)) {
	case "too_salesy":
		return "Reduce promotional language, avoid hard CTAs or link-heavy copy unless explicitly requested, and make the value concrete and educational."
	case "wrong_tone":
		return "Match the Bot voice and target context; avoid generic hype, stiffness, or tone shifts."
	case "fact_risk":
		return "Avoid unsupported claims, guarantees, performance promises, or unverifiable facts; qualify claims carefully."
	case "missing_context", "weak_context":
		return "Ground the draft in the provided source, target, or content library context; do not invent details or write vague copy."
	case "irrelevant":
		return "Stay tightly related to the target post, audience, and growth goal; avoid unrelated product promotion."
	case "duplicate":
		return "Avoid repeating the same opening, structure, and product explanation; choose a clearly different angle and phrasing."
	case "neutral":
		return "Lower priority for similar opportunities unless the target context, timing, or audience fit is stronger."
	case "ineffective":
		return "Avoid similar weak opportunity patterns; require clearer relevance, stronger context, or better audience fit before drafting."
	case "not_suitable":
		return "Do not recommend manual reply actions for similar signals when the topic is sensitive, off-positioning, or unlikely to support safe growth."
	case "effective":
		return "Prefer similar opportunity patterns when the context is relevant, safe, and aligned with the Bot persona."
	default:
		return "Avoid repeating the pattern that reviewers marked as accurate for this issue."
	}
}
