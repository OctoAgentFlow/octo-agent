package alert

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/pkg/requestid"
)

const (
	LevelCritical = "critical"
	LevelError    = "error"
	LevelWarning  = "warning"
	LevelInfo     = "info"

	CategorySystem     = "system"
	CategoryHTTP       = "http"
	CategoryScheduler  = "scheduler"
	CategoryPublishing = "publishing"
	CategoryBilling    = "billing"
	CategoryXAPI       = "x_api"
	CategoryLLM        = "llm"
	CategoryDB         = "db"
)

type Event struct {
	Level       string
	Category    string
	Title       string
	Message     string
	Environment string
	Service     string
	RequestID   string
	UserID      uint
	AccountID   uint
	ResourceID  uint
	Error       error
	Fields      map[string]any
	OccurredAt  time.Time
}

type Notifier interface {
	Notify(ctx context.Context, event Event) error
}

func NewService(cfg config.AlertConfig) *Service {
	notifier := Notifier(NoopNotifier{})
	if strings.TrimSpace(cfg.Lark.WebhookURL) != "" {
		notifier = NewLarkNotifier(cfg.Lark.WebhookURL, cfg.Lark.Secret)
	}
	return &Service{
		cfg:            cfg,
		notifier:       notifier,
		dedupeWindow:   time.Duration(cfg.RateLimit.DedupeWindowSeconds) * time.Second,
		maxPerMinute:   cfg.RateLimit.MaxPerMinute,
		dedupe:         make(map[string]time.Time),
		minuteCounters: make(map[string]int),
	}
}

func normalizeEvent(ctx context.Context, cfg config.AlertConfig, event Event) Event {
	event.Level = normalizeLevel(event.Level)
	if strings.TrimSpace(event.Category) == "" {
		event.Category = CategorySystem
	}
	if strings.TrimSpace(event.Title) == "" {
		event.Title = "Octo-Agent alert"
	}
	if strings.TrimSpace(event.Environment) == "" {
		event.Environment = cfg.Environment
	}
	if strings.TrimSpace(event.Service) == "" {
		event.Service = cfg.Service
	}
	if strings.TrimSpace(event.RequestID) == "" && ctx != nil {
		event.RequestID = requestid.FromContext(ctx)
	}
	if event.OccurredAt.IsZero() {
		event.OccurredAt = time.Now().UTC()
	}
	if strings.TrimSpace(event.Message) == "" && event.Error != nil {
		event.Message = event.Error.Error()
	}
	event.Message = truncate(event.Message, 1200)
	return event
}

func normalizeLevel(level string) string {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case LevelCritical:
		return LevelCritical
	case LevelError:
		return LevelError
	case "warn", LevelWarning:
		return LevelWarning
	case LevelInfo:
		return LevelInfo
	default:
		return LevelError
	}
}

func levelEnabled(level string, levels config.AlertLevelsConfig) bool {
	switch normalizeLevel(level) {
	case LevelCritical:
		return levels.Critical
	case LevelError:
		return levels.Error
	case LevelWarning:
		return levels.Warning
	case LevelInfo:
		return levels.Info
	default:
		return true
	}
}

func dedupeKey(event Event) string {
	parts := []string{
		event.Environment,
		event.Service,
		event.Level,
		event.Category,
		event.Title,
		fmt.Sprint(event.UserID),
		fmt.Sprint(event.AccountID),
		fmt.Sprint(event.ResourceID),
	}
	if event.Error != nil {
		parts = append(parts, truncate(event.Error.Error(), 160))
	} else {
		parts = append(parts, truncate(event.Message, 160))
	}
	return strings.Join(parts, "|")
}

func truncate(s string, maxRunes int) string {
	if maxRunes <= 0 {
		return ""
	}
	r := []rune(strings.TrimSpace(s))
	if len(r) <= maxRunes {
		return string(r)
	}
	return string(r[:maxRunes]) + "..."
}

func errorString(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.Canceled) {
		return "context canceled"
	}
	return truncate(err.Error(), 1200)
}
