package alert

import (
	"context"
	"sync"
	"time"

	"octo-agent/backend/internal/config"

	"go.uber.org/zap"
)

var (
	defaultMu      sync.RWMutex
	defaultService *Service
)

type Service struct {
	cfg            config.AlertConfig
	notifier       Notifier
	mu             sync.Mutex
	dedupeWindow   time.Duration
	maxPerMinute   int
	dedupe         map[string]time.Time
	minuteCounters map[string]int
}

func Configure(cfg config.AlertConfig) {
	defaultMu.Lock()
	defer defaultMu.Unlock()
	defaultService = NewService(cfg)
}

func Default() *Service {
	defaultMu.RLock()
	defer defaultMu.RUnlock()
	return defaultService
}

func Notify(ctx context.Context, event Event) {
	svc := Default()
	if svc == nil {
		return
	}
	svc.Notify(ctx, event)
}

func NotifySync(ctx context.Context, event Event) error {
	svc := Default()
	if svc == nil {
		return nil
	}
	return svc.NotifySync(ctx, event)
}

func (s *Service) Notify(ctx context.Context, event Event) {
	if s == nil {
		return
	}
	go func() {
		if err := s.NotifySync(ctx, event); err != nil {
			zap.L().Warn("alert: notify failed", zap.Error(err))
		}
	}()
}

func (s *Service) NotifySync(ctx context.Context, event Event) error {
	if s == nil || !s.cfg.Enabled {
		return nil
	}
	event = normalizeEvent(ctx, s.cfg, event)
	if !levelEnabled(event.Level, s.cfg.Levels) {
		return nil
	}
	if suppressed, reason := s.suppressed(event); suppressed {
		zap.L().Warn("alert: suppressed",
			zap.String("reason", reason),
			zap.String("level", event.Level),
			zap.String("category", event.Category),
			zap.String("title", event.Title))
		return nil
	}
	notifyCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.notifier.Notify(notifyCtx, event)
}

func (s *Service) suppressed(event Event) (bool, string) {
	now := time.Now()
	key := dedupeKey(event)
	minute := now.UTC().Format("200601021504")

	s.mu.Lock()
	defer s.mu.Unlock()

	for k, ts := range s.dedupe {
		if now.Sub(ts) > s.dedupeWindow*2 {
			delete(s.dedupe, k)
		}
	}
	for k := range s.minuteCounters {
		if k != minute {
			delete(s.minuteCounters, k)
		}
	}
	if last, ok := s.dedupe[key]; ok && now.Sub(last) < s.dedupeWindow {
		return true, "dedupe_window"
	}
	if s.maxPerMinute > 0 && s.minuteCounters[minute] >= s.maxPerMinute {
		return true, "rate_limit"
	}
	s.dedupe[key] = now
	s.minuteCounters[minute]++
	return false, ""
}

type NoopNotifier struct{}

func (NoopNotifier) Notify(context.Context, Event) error {
	return nil
}
