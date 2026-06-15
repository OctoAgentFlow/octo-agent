package subscription

import (
	"math"
	"strings"

	"octo-agent/backend/internal/model"
)

const (
	PlanFreeTrial = "free_trial"
	PlanBasic     = "basic"
	PlanPlus      = "plus"
	PlanPro       = "pro"
	PlanProPlus   = "pro_plus"

	BillingCycleMonthly = "monthly"
	BillingCycleYearly  = "yearly"
)

type PlanLimits struct {
	MaxBots                 int64 `json:"max_bots"`
	MaxTwitterAccounts      int64 `json:"max_twitter_accounts"`
	AIGenerationsMonthly    int64 `json:"ai_generations_monthly"`
	MonthlyXWrites          int64 `json:"monthly_x_writes"`
	MonthlyXURLPosts        int64 `json:"monthly_x_url_posts"`
	MonthlyCostCapCents     int64 `json:"monthly_cost_cap_cents"`
	MonthlyAutoPosts        int64 `json:"monthly_auto_posts"`
	MonthlyAutoReplies      int64 `json:"monthly_auto_replies"`
	MonthlyAutoComments     int64 `json:"monthly_auto_comments"`
	MonthlyAutoDMs          int64 `json:"monthly_auto_dms"`
	AutoCommentTargets      int64 `json:"auto_comment_targets"`
	MonthlyAutoCommentScans int64 `json:"monthly_auto_comment_scans"`
	DailyAutoPosts          int64 `json:"daily_auto_posts"`
	DailyAutoReplies        int64 `json:"daily_auto_replies"`
	DailyAutoComments       int64 `json:"daily_auto_comments"`
	DailyAutoDMs            int64 `json:"daily_auto_dms"`
	AnalyticsDays           int64 `json:"analytics_days"`
	TeamSeats               int64 `json:"team_seats"`
	FullPersonaFields       bool  `json:"full_persona_fields"`
	AutoDMImport            bool  `json:"auto_dm_import"`
	AdvancedBotStrategy     bool  `json:"advanced_bot_strategy"`
	BulkReview              bool  `json:"bulk_review"`
	BotPerformance          bool  `json:"bot_performance"`
	DataExport              bool  `json:"data_export"`
	MultiBotMatrix          bool  `json:"multi_bot_matrix"`
	ABTesting               bool  `json:"ab_testing"`
	AdvancedFlowBuilder     bool  `json:"advanced_flow_builder"`
	AdvancedRiskRules       bool  `json:"advanced_risk_rules"`
	PrioritySupport         bool  `json:"priority_support"`
}

type PlanFeature struct {
	Key       string `json:"key"`
	Label     string `json:"label"`
	Available bool   `json:"available"`
	MinPlan   string `json:"min_plan,omitempty"`
}

type PlanDefinition struct {
	Code         string        `json:"code"`
	Name         string        `json:"name"`
	MonthlyPrice int           `json:"monthly_price"`
	YearlyPrice  int           `json:"yearly_price"`
	Currency     string        `json:"currency"`
	Audience     string        `json:"audience"`
	Badge        string        `json:"badge,omitempty"`
	Description  string        `json:"description"`
	Limits       PlanLimits    `json:"limits"`
	Benefits     []string      `json:"benefits"`
	Features     []PlanFeature `json:"features"`
}

func Catalog() []PlanDefinition {
	return []PlanDefinition{
		{
			Code:         PlanBasic,
			Name:         "Starter",
			MonthlyPrice: 12,
			YearlyPrice:  120,
			Currency:     "USDT",
			Audience:     "Single founder, creator, or early project account",
			Description:  "Start one safe manual X growth workflow with Exposure Radar, reply drafts, and content memory.",
			Limits: PlanLimits{
				MaxBots:                 1,
				MaxTwitterAccounts:      1,
				AIGenerationsMonthly:    500,
				MonthlyXWrites:          100,
				MonthlyXURLPosts:        5,
				MonthlyCostCapCents:     600,
				MonthlyAutoPosts:        120,
				MonthlyAutoReplies:      300,
				MonthlyAutoComments:     300,
				MonthlyAutoDMs:          300,
				AutoCommentTargets:      200,
				MonthlyAutoCommentScans: 30,
				DailyAutoPosts:          4,
				DailyAutoReplies:        10,
				DailyAutoComments:       10,
				DailyAutoDMs:            10,
				AnalyticsDays:           30,
				TeamSeats:               1,
			},
			Benefits: []string{
				"1 OAF Bot",
				"1 X account",
				"300 opportunity drafts / month",
				"200 content memory items",
				"Reply and content draft capacity for one account",
				"30 radar refreshes / month",
				"30-day Analytics",
			},
		},
		{
			Code:         PlanPlus,
			Name:         "Growth",
			MonthlyPrice: 39,
			YearlyPrice:  390,
			Currency:     "USDT",
			Audience:     "Web3 and SaaS teams operating several social accounts",
			Badge:        "Most Popular",
			Description:  "Run a small-team opportunity workflow with strategy recommendations, memory, and learning capacity.",
			Limits: PlanLimits{
				MaxBots:                 3,
				MaxTwitterAccounts:      3,
				AIGenerationsMonthly:    2500,
				MonthlyXWrites:          400,
				MonthlyXURLPosts:        20,
				MonthlyCostCapCents:     1950,
				MonthlyAutoPosts:        600,
				MonthlyAutoReplies:      1500,
				MonthlyAutoComments:     1500,
				MonthlyAutoDMs:          1500,
				AutoCommentTargets:      1000,
				MonthlyAutoCommentScans: 200,
				DailyAutoPosts:          20,
				DailyAutoReplies:        50,
				DailyAutoComments:       50,
				DailyAutoDMs:            50,
				AnalyticsDays:           30,
				TeamSeats:               1,
				FullPersonaFields:       true,
				AutoDMImport:            true,
			},
			Benefits: []string{
				"3 OAF Bots",
				"3 X accounts",
				"1,500 opportunity drafts / month",
				"1,000 content memory items",
				"Strategy recommendations and learning signals",
				"Exposure Radar refresh budget",
				"30-day Analytics",
			},
		},
		{
			Code:         PlanPro,
			Name:         "Operator",
			MonthlyPrice: 99,
			YearlyPrice:  990,
			Currency:     "USDT",
			Audience:     "Dedicated operators and multi-account teams",
			Badge:        "Best for Teams",
			Description:  "Scale a real handling desk with team review, analytics, exports, and deeper learning capacity.",
			Limits: PlanLimits{
				MaxBots:                 10,
				MaxTwitterAccounts:      10,
				AIGenerationsMonthly:    8000,
				MonthlyXWrites:          1200,
				MonthlyXURLPosts:        50,
				MonthlyCostCapCents:     4950,
				MonthlyAutoPosts:        1800,
				MonthlyAutoReplies:      5000,
				MonthlyAutoComments:     5000,
				MonthlyAutoDMs:          5000,
				AutoCommentTargets:      5000,
				MonthlyAutoCommentScans: 800,
				DailyAutoPosts:          60,
				DailyAutoReplies:        170,
				DailyAutoComments:       170,
				DailyAutoDMs:            170,
				AnalyticsDays:           90,
				TeamSeats:               3,
				FullPersonaFields:       true,
				AutoDMImport:            true,
				AdvancedBotStrategy:     true,
				BulkReview:              true,
				BotPerformance:          true,
				DataExport:              true,
			},
			Benefits: []string{
				"10 OAF Bots",
				"10 X accounts",
				"5,000 opportunity drafts / month",
				"5,000 content memory items",
				"Team handling desk and bulk review",
				"Bot performance analytics and data export",
				"3 team seats, 90-day Analytics and data export",
			},
		},
		{
			Code:         PlanProPlus,
			Name:         "Agency",
			MonthlyPrice: 249,
			YearlyPrice:  2490,
			Currency:     "USDT",
			Audience:     "Agencies, KOL matrices, and high-frequency account operations",
			Description:  "Run multiple clients or account matrices with advanced safety controls, exports, and priority support.",
			Limits: PlanLimits{
				MaxBots:                 30,
				MaxTwitterAccounts:      30,
				AIGenerationsMonthly:    20000,
				MonthlyXWrites:          2500,
				MonthlyXURLPosts:        120,
				MonthlyCostCapCents:     12450,
				MonthlyAutoPosts:        6000,
				MonthlyAutoReplies:      15000,
				MonthlyAutoComments:     15000,
				MonthlyAutoDMs:          15000,
				AutoCommentTargets:      20000,
				MonthlyAutoCommentScans: 2400,
				DailyAutoPosts:          200,
				DailyAutoReplies:        500,
				DailyAutoComments:       500,
				DailyAutoDMs:            500,
				AnalyticsDays:           365,
				TeamSeats:               10,
				FullPersonaFields:       true,
				AutoDMImport:            true,
				AdvancedBotStrategy:     true,
				BulkReview:              true,
				BotPerformance:          true,
				DataExport:              true,
				MultiBotMatrix:          true,
				ABTesting:               true,
				AdvancedFlowBuilder:     true,
				AdvancedRiskRules:       true,
				PrioritySupport:         true,
			},
			Benefits: []string{
				"30 OAF Bots",
				"30 X accounts",
				"15,000 opportunity drafts / month",
				"20,000 content memory items",
				"Client or matrix-level workflows",
				"Advanced safety rules and exports",
				"10 team seats, 365-day Analytics and priority support",
			},
		},
	}
}

func NormalizePlanCode(code string) string {
	switch strings.ToLower(strings.TrimSpace(code)) {
	case "", PlanFreeTrial:
		return PlanFreeTrial
	case PlanBasic, "basic_monthly", "basic_yearly":
		return PlanBasic
	case PlanPlus, "plus_monthly", "plus_yearly":
		return PlanPlus
	case PlanPro, "pro_monthly", "pro_yearly":
		return PlanPro
	case PlanProPlus, "pro+", "pro_plus_monthly", "pro_plus_yearly":
		return PlanProPlus
	default:
		return strings.ToLower(strings.TrimSpace(code))
	}
}

func NormalizeBillingCycle(cycle string) string {
	switch strings.ToLower(strings.TrimSpace(cycle)) {
	case BillingCycleYearly, "annual", "annually", "year":
		return BillingCycleYearly
	default:
		return BillingCycleMonthly
	}
}

func FindPlan(code string) (PlanDefinition, bool) {
	norm := NormalizePlanCode(code)
	for _, p := range Catalog() {
		if p.Code == norm {
			p.Features = featuresForLimits(p.Limits)
			return p, true
		}
	}
	return PlanDefinition{}, false
}

func PriceForCycle(plan PlanDefinition, cycle string) int {
	if NormalizeBillingCycle(cycle) == BillingCycleYearly {
		if plan.YearlyPrice > 0 {
			return plan.YearlyPrice
		}
		return int(math.Round(float64(plan.MonthlyPrice) * 12 * 0.8))
	}
	return plan.MonthlyPrice
}

func LimitsForPlan(code string) PlanLimits {
	if p, ok := FindPlan(code); ok {
		return p.Limits
	}
	return FreeTrialLimits()
}

func LimitsForUser(u *model.User) PlanLimits {
	if u == nil {
		return FreeTrialLimits()
	}
	return LimitsForPlan(u.SubscriptionPlanCode)
}

func FreeTrialLimits() PlanLimits {
	return PlanLimits{
		MaxBots:                 1,
		MaxTwitterAccounts:      FreeTrialTwitterAccountLimit,
		AIGenerationsMonthly:    100,
		MonthlyXWrites:          10,
		MonthlyXURLPosts:        0,
		MonthlyCostCapCents:     0,
		MonthlyAutoPosts:        30,
		MonthlyAutoReplies:      50,
		MonthlyAutoComments:     50,
		MonthlyAutoDMs:          50,
		AutoCommentTargets:      50,
		MonthlyAutoCommentScans: 20,
		DailyAutoPosts:          1,
		DailyAutoReplies:        5,
		DailyAutoComments:       5,
		DailyAutoDMs:            5,
		AnalyticsDays:           7,
		TeamSeats:               1,
	}
}

func featuresForLimits(l PlanLimits) []PlanFeature {
	return []PlanFeature{
		{Key: "full_persona_fields", Label: "Full persona fields", Available: l.FullPersonaFields, MinPlan: PlanPlus},
		{Key: "auto_dm_import", Label: "Content memory and review list management", Available: l.AutoDMImport, MinPlan: PlanPlus},
		{Key: "advanced_bot_strategy", Label: "Advanced bot strategy", Available: l.AdvancedBotStrategy, MinPlan: PlanPro},
		{Key: "bulk_review", Label: "Bulk review", Available: l.BulkReview, MinPlan: PlanPro},
		{Key: "bot_performance", Label: "Bot performance analytics", Available: l.BotPerformance, MinPlan: PlanPro},
		{Key: "data_export", Label: "Data export", Available: l.DataExport, MinPlan: PlanPro},
		{Key: "multi_bot_matrix", Label: "Multi-bot matrix operation", Available: l.MultiBotMatrix, MinPlan: PlanProPlus},
		{Key: "ab_testing", Label: "A/B testing", Available: l.ABTesting, MinPlan: PlanProPlus},
		{Key: "advanced_flow_builder", Label: "Advanced Flow Builder", Available: l.AdvancedFlowBuilder, MinPlan: PlanProPlus},
		{Key: "advanced_risk_rules", Label: "Advanced risk rules", Available: l.AdvancedRiskRules, MinPlan: PlanProPlus},
		{Key: "priority_support", Label: "Priority support", Available: l.PrioritySupport, MinPlan: PlanProPlus},
	}
}
