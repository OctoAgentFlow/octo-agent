package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"octo-agent/backend/internal/config"
	"octo-agent/backend/internal/database"
	"octo-agent/backend/internal/dto"
	appLogger "octo-agent/backend/internal/pkg/logger"
	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/repository"
	"octo-agent/backend/internal/service"
)

type refreshOutput struct {
	Enabled       bool            `json:"enabled"`
	Region        string          `json:"region"`
	AttemptedAt   string          `json:"attempted_at"`
	DurationMs    int64           `json:"duration_ms"`
	SkippedReason string          `json:"skipped_reason,omitempty"`
	Results       []regionRefresh `json:"results"`
}

type regionRefresh struct {
	Region      string             `json:"region"`
	Refreshed   bool               `json:"refreshed"`
	Error       string             `json:"error,omitempty"`
	DurationMs  int64              `json:"duration_ms"`
	Diagnostics diagnosticSnapshot `json:"diagnostics"`
}

type diagnosticSnapshot struct {
	Status                 string   `json:"status"`
	SourceType             string   `json:"source_type"`
	SourceStatus           string   `json:"source_status"`
	ReturnedCount          int      `json:"returned_count"`
	OwnedSignalCount       int64    `json:"owned_signal_count"`
	OwnedInWindowCount     int64    `json:"owned_in_window_count"`
	OwnedUnderFanLimit     int64    `json:"owned_under_fan_limit"`
	OwnedOverFanLimit      int64    `json:"owned_over_fan_limit"`
	VisiblePoolCount       int64    `json:"visible_pool_count"`
	WindowRealViewCount    int64    `json:"window_real_view_count"`
	WindowPriorSampleCount int64    `json:"window_prior_sample_count"`
	MaxImpressionCount     int64    `json:"max_impression_count"`
	MaxViewsPerMinute      float64  `json:"max_views_per_minute"`
	HotViewsGap            int64    `json:"hot_views_gap"`
	HotVelocityGap         float64  `json:"hot_velocity_gap"`
	RealViewCoverage       float64  `json:"real_view_coverage"`
	SamplingCoverage       float64  `json:"sampling_coverage"`
	TopMissingReason       string   `json:"top_missing_reason,omitempty"`
	TopMissingDetail       string   `json:"top_missing_detail,omitempty"`
	LatestOwnedSignalAt    string   `json:"latest_owned_signal_at,omitempty"`
	FreshnessSeconds       int64    `json:"freshness_seconds"`
	ConfiguredHotMinViews  int64    `json:"configured_hot_min_views"`
	ConfiguredHotVelocity  float64  `json:"configured_hot_min_velocity"`
	ConfiguredStrongViews  int64    `json:"configured_strong_hot_min_views"`
	ConfiguredStrongSpeed  float64  `json:"configured_strong_hot_min_velocity"`
	HotOpportunityCount    int      `json:"hot_opportunity_count"`
	RisingOpportunityCount int      `json:"rising_opportunity_count"`
	NeedsSamplingCount     int      `json:"needs_sampling_count"`
	TopicLeadCount         int      `json:"topic_lead_count"`
	RealImpressionCount    int      `json:"real_impression_count"`
	FirstSampleCount       int      `json:"first_sample_count"`
	HighScoreCount         int      `json:"high_score_count"`
	Issues                 []string `json:"issues,omitempty"`
	Suggestions            []string `json:"suggestions,omitempty"`
}

func main() {
	regionFlag := flag.String("region", "all", "refresh region: all, en, or zh")
	hoursFlag := flag.Int("hours", 4, "diagnostic Radar window in hours")
	maxFansFlag := flag.Int64("max-fans", 10000, "diagnostic Radar max author fans")
	limitFlag := flag.Int("limit", 20, "diagnostic Radar item limit")
	minHotFlag := flag.Int("min-hot-count", 0, "diagnostic Radar minimum hot count filter")
	flag.Parse()

	startedAt := time.Now()
	attemptedAt := time.Now().UTC()
	regions, normalized, err := refreshRegions(*regionFlag)
	if err != nil {
		log.Fatal(err)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config failed: %v", err)
	}
	logCfg := cfg.Log
	logCfg.OutputPath = "logs/exposure-refresh.log"
	if _, err := appLogger.Init(logCfg, "logs/exposure-refresh.log"); err != nil {
		log.Fatalf("init logger failed: %v", err)
	}
	defer appLogger.Sync()

	db, err := database.NewMySQL(cfg)
	if err != nil {
		log.Fatalf("connect db failed: %v", err)
	}
	if sqlDB, err := db.DB(); err == nil {
		defer sqlDB.Close()
	}

	trendService := service.NewTrendService(
		repository.NewTrendTopicRepository(db),
		repository.NewExposureTweetSignalRepository(db),
		repository.NewTrendFeedbackRepository(db),
		repository.NewOAFBotRepository(db),
		repository.NewContentDraftPlanRepository(db),
		repository.NewContentLibraryRepository(db),
		cfg.XTrends,
	)

	out := refreshOutput{
		Enabled:     true,
		Region:      normalized,
		AttemptedAt: attemptedAt.Format(time.RFC3339),
		Results:     []regionRefresh{},
	}
	if ok, reason := trendService.ExposureRefreshReadiness(); !ok {
		out.Enabled = false
		out.SkippedReason = reason
		out.DurationMs = time.Since(startedAt).Milliseconds()
		writeJSON(out)
		os.Exit(2)
	}

	ctx := requestid.NewContext(context.Background(), "manual-exposure-refresh-cli")
	hadError := false
	for _, region := range regions {
		result := runRegionRefresh(ctx, trendService, region, attemptedAt, dto.ExposureRadarQuery{
			Region:      region,
			Hours:       *hoursFlag,
			MaxFans:     *maxFansFlag,
			MinHotCount: *minHotFlag,
			Limit:       *limitFlag,
		})
		if result.Error != "" {
			hadError = true
		}
		out.Results = append(out.Results, result)
	}
	out.DurationMs = time.Since(startedAt).Milliseconds()
	writeJSON(out)
	if hadError {
		os.Exit(1)
	}
}

func refreshRegions(raw string) ([]string, string, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "all":
		return []string{"en", "zh"}, "all", nil
	case "en", "english":
		return []string{"en"}, "en", nil
	case "zh", "cn", "chinese":
		return []string{"zh"}, "zh", nil
	default:
		return nil, "", fmt.Errorf("invalid region %q, expected all, en, or zh", raw)
	}
}

func runRegionRefresh(ctx context.Context, trends *service.TrendService, region string, now time.Time, query dto.ExposureRadarQuery) regionRefresh {
	startedAt := time.Now()
	result := regionRefresh{Region: region}
	if err := trends.ForceRefreshExposureSignals(ctx, region, now); err != nil {
		result.Error = err.Error()
		result.DurationMs = time.Since(startedAt).Milliseconds()
		return result
	}
	result.Refreshed = true
	radar, err := trends.ExposureRadar(ctx, 0, query, time.Now().UTC())
	if err != nil {
		result.Error = err.Error()
	} else if radar != nil {
		result.Diagnostics = summarizeDiagnostics(radar)
	}
	result.DurationMs = time.Since(startedAt).Milliseconds()
	return result
}

func summarizeDiagnostics(radar *dto.ExposureRadarResponse) diagnosticSnapshot {
	diag := radar.Diagnostics
	issues := make([]string, 0, len(diag.Issues))
	for _, issue := range diag.Issues {
		if issue.Code == "" {
			continue
		}
		if issue.Severity != "" {
			issues = append(issues, issue.Severity+":"+issue.Code)
		} else {
			issues = append(issues, issue.Code)
		}
	}
	return diagnosticSnapshot{
		Status:                 diag.Status,
		SourceType:             diag.SourceType,
		SourceStatus:           diag.SourceStatus,
		ReturnedCount:          diag.ReturnedCount,
		OwnedSignalCount:       diag.OwnedSignalCount,
		OwnedInWindowCount:     diag.OwnedInWindowCount,
		OwnedUnderFanLimit:     diag.OwnedUnderFanLimit,
		OwnedOverFanLimit:      diag.OwnedOverFanLimit,
		VisiblePoolCount:       diag.VisiblePoolCount,
		WindowRealViewCount:    diag.WindowRealViewCount,
		WindowPriorSampleCount: diag.WindowPriorSampleCount,
		MaxImpressionCount:     diag.MaxImpressionCount,
		MaxViewsPerMinute:      diag.MaxViewsPerMinute,
		HotViewsGap:            diag.HotViewsGap,
		HotVelocityGap:         diag.HotVelocityGap,
		RealViewCoverage:       diag.RealViewCoverage,
		SamplingCoverage:       diag.SamplingCoverage,
		TopMissingReason:       diag.TopMissingReason,
		TopMissingDetail:       diag.TopMissingDetail,
		LatestOwnedSignalAt:    diag.LatestOwnedSignalAt,
		FreshnessSeconds:       diag.FreshnessSeconds,
		ConfiguredHotMinViews:  diag.ConfiguredHotMinViews,
		ConfiguredHotVelocity:  diag.ConfiguredHotVelocity,
		ConfiguredStrongViews:  diag.ConfiguredStrongViews,
		ConfiguredStrongSpeed:  diag.ConfiguredStrongSpeed,
		HotOpportunityCount:    diag.HotOpportunityCount,
		RisingOpportunityCount: diag.RisingOpportunityCount,
		NeedsSamplingCount:     diag.NeedsSamplingCount,
		TopicLeadCount:         diag.TopicLeadCount,
		RealImpressionCount:    diag.RealImpressionCount,
		FirstSampleCount:       diag.FirstSampleCount,
		HighScoreCount:         diag.HighScoreCount,
		Issues:                 issues,
		Suggestions:            diag.Suggestions,
	}
}

func writeJSON(value any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(value); err != nil {
		log.Fatalf("encode output failed: %v", err)
	}
}
