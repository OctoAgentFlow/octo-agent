package service

import "strings"

func isValidActivityFailureCategory(category string) bool {
	switch category {
	case "x_auth", "rate_limit", "safety", "configuration", "network", "system", "unknown":
		return true
	default:
		return false
	}
}

func classifyActivityFailure(status string, message string) string {
	if strings.TrimSpace(strings.ToLower(status)) != "failed" {
		return ""
	}
	text := strings.ToLower(strings.TrimSpace(message))
	if text == "" {
		return "unknown"
	}
	if containsAny(text, "unauthorized", "401", "oauth", "token", "credential", "reauth", "authorization", "forbidden") {
		return "x_auth"
	}
	if containsAny(text, "rate limit", "too many requests", "429", "retry after") {
		return "rate_limit"
	}
	if containsAny(text, "blocked_keyword", "blocked keyword", "risk", "sensitive", "safety", "policy", "rejected") {
		return "safety"
	}
	if containsAny(text, "missing", "not configured", "no account", "setup", "capability", "permission", "empty", "disabled") {
		return "configuration"
	}
	if containsAny(text, "timeout", "connection", "dial tcp", "network", "dns", "tls") {
		return "network"
	}
	if containsAny(text, "panic", "database", " sql", "internal", "server error", "500", "bad gateway") {
		return "system"
	}
	return "unknown"
}

func containsAny(text string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(text, needle) {
			return true
		}
	}
	return false
}
