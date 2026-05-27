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
	MaxBots              int64 `json:"max_bots"`
	MaxTwitterAccounts   int64 `json:"max_twitter_accounts"`
	AIGenerationsMonthly int64 `json:"ai_generations_monthly"`
	MonthlyXWrites       int64 `json:"monthly_x_writes"`
	MonthlyXURLPosts     int64 `json:"monthly_x_url_posts"`
	MonthlyCostCapCents  int64 `json:"monthly_cost_cap_cents"`
	MonthlyAutoPosts     int64 `json:"monthly_auto_posts"`
	MonthlyAutoReplies   int64 `json:"monthly_auto_replies"`
	MonthlyAutoComments  int64 `json:"monthly_auto_comments"`
	MonthlyAutoDMs       int64 `json:"monthly_auto_dms"`
	DailyAutoPosts       int64 `json:"daily_auto_posts"`
	DailyAutoReplies     int64 `json:"daily_auto_replies"`
	DailyAutoComments    int64 `json:"daily_auto_comments"`
	DailyAutoDMs         int64 `json:"daily_auto_dms"`
	AnalyticsDays        int64 `json:"analytics_days"`
	TeamSeats            int64 `json:"team_seats"`
	FullPersonaFields    bool  `json:"full_persona_fields"`
	AutoDMImport         bool  `json:"auto_dm_import"`
	AdvancedBotStrategy  bool  `json:"advanced_bot_strategy"`
	BulkReview           bool  `json:"bulk_review"`
	BotPerformance       bool  `json:"bot_performance"`
	DataExport           bool  `json:"data_export"`
	MultiBotMatrix       bool  `json:"multi_bot_matrix"`
	ABTesting            bool  `json:"ab_testing"`
	AdvancedFlowBuilder  bool  `json:"advanced_flow_builder"`
	AdvancedRiskRules    bool  `json:"advanced_risk_rules"`
	PrioritySupport      bool  `json:"priority_support"`
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
			Name:         "Basic",
			MonthlyPrice: 8,
			YearlyPrice:  77,
			Currency:     "USDT",
			Audience:     "Single creator or early project account",
			Description:  "Start one OAF Bot with core social automation quotas.",
			Limits: PlanLimits{
				MaxBots:              1,
				MaxTwitterAccounts:   1,
				AIGenerationsMonthly: 500,
				MonthlyXWrites:       100,
				MonthlyXURLPosts:     5,
				MonthlyCostCapCents:  400,
				MonthlyAutoPosts:     60,
				MonthlyAutoReplies:   480,
				MonthlyAutoComments:  240,
				MonthlyAutoDMs:       480,
				DailyAutoPosts:       2,
				DailyAutoReplies:     16,
				DailyAutoComments:    8,
				DailyAutoDMs:         16,
				AnalyticsDays:        7,
				TeamSeats:            1,
			},
			Benefits: []string{
				"1 OAF Bot",
				"1 X account",
				"500 AI generations / month",
				"100 real X writes / month",
				"Monthly Auto Post 60, Auto Reply 480, Auto Comment 240, Auto DM 480",
				"7-day basic Analytics",
			},
		},
		{
			Code:         PlanPlus,
			Name:         "Plus",
			MonthlyPrice: 29,
			YearlyPrice:  279,
			Currency:     "USDT",
			Audience:     "Small teams running several growth accounts",
			Badge:        "Most Popular",
			Description:  "Unlock full persona fields and more monthly automation capacity.",
			Limits: PlanLimits{
				MaxBots:              3,
				MaxTwitterAccounts:   3,
				AIGenerationsMonthly: 2500,
				MonthlyXWrites:       400,
				MonthlyXURLPosts:     20,
				MonthlyCostCapCents:  1450,
				MonthlyAutoPosts:     300,
				MonthlyAutoReplies:   3000,
				MonthlyAutoComments:  1500,
				MonthlyAutoDMs:       3000,
				DailyAutoPosts:       10,
				DailyAutoReplies:     100,
				DailyAutoComments:    50,
				DailyAutoDMs:         100,
				AnalyticsDays:        30,
				TeamSeats:            1,
				FullPersonaFields:    true,
				AutoDMImport:         true,
			},
			Benefits: []string{
				"3 OAF Bots",
				"3 X accounts",
				"2,500 AI generations / month",
				"400 real X writes / month",
				"Full persona fields",
				"Auto DM list import",
				"30-day Analytics",
			},
		},
		{
			Code:         PlanPro,
			Name:         "Pro",
			MonthlyPrice: 79,
			YearlyPrice:  759,
			Currency:     "USDT",
			Audience:     "Content teams and multi-account operators",
			Badge:        "Best for Teams",
			Description:  "Scale bot operations with review, analytics and export capabilities.",
			Limits: PlanLimits{
				MaxBots:              10,
				MaxTwitterAccounts:   10,
				AIGenerationsMonthly: 8000,
				MonthlyXWrites:       1200,
				MonthlyXURLPosts:     50,
				MonthlyCostCapCents:  3950,
				MonthlyAutoPosts:     1500,
				MonthlyAutoReplies:   15000,
				MonthlyAutoComments:  9000,
				MonthlyAutoDMs:       15000,
				DailyAutoPosts:       50,
				DailyAutoReplies:     500,
				DailyAutoComments:    300,
				DailyAutoDMs:         500,
				AnalyticsDays:        90,
				TeamSeats:            3,
				FullPersonaFields:    true,
				AutoDMImport:         true,
				AdvancedBotStrategy:  true,
				BulkReview:           true,
				BotPerformance:       true,
				DataExport:           true,
			},
			Benefits: []string{
				"10 OAF Bots",
				"10 X accounts",
				"8,000 AI generations / month",
				"1,200 real X writes / month",
				"Advanced bot strategy",
				"Bulk review and bot performance analytics",
				"3 team seats, 90-day Analytics and data export",
			},
		},
		{
			Code:         PlanProPlus,
			Name:         "Pro+",
			MonthlyPrice: 199,
			YearlyPrice:  1910,
			Currency:     "USDT",
			Audience:     "High-frequency matrix operations",
			Description:  "Run a larger AI social agent matrix with advanced growth controls.",
			Limits: PlanLimits{
				MaxBots:              30,
				MaxTwitterAccounts:   30,
				AIGenerationsMonthly: 20000,
				MonthlyXWrites:       2500,
				MonthlyXURLPosts:     120,
				MonthlyCostCapCents:  9950,
				MonthlyAutoPosts:     6000,
				MonthlyAutoReplies:   60000,
				MonthlyAutoComments:  30000,
				MonthlyAutoDMs:       60000,
				DailyAutoPosts:       200,
				DailyAutoReplies:     2000,
				DailyAutoComments:    1000,
				DailyAutoDMs:         2000,
				AnalyticsDays:        365,
				TeamSeats:            10,
				FullPersonaFields:    true,
				AutoDMImport:         true,
				AdvancedBotStrategy:  true,
				BulkReview:           true,
				BotPerformance:       true,
				DataExport:           true,
				MultiBotMatrix:       true,
				ABTesting:            true,
				AdvancedFlowBuilder:  true,
				AdvancedRiskRules:    true,
				PrioritySupport:      true,
			},
			Benefits: []string{
				"30 OAF Bots",
				"30 X accounts",
				"20,000 AI generations / month",
				"2,500 real X writes / month",
				"Multi-bot matrix operation and A/B testing",
				"Advanced Flow Builder and risk rules",
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
		MaxBots:              1,
		MaxTwitterAccounts:   FreeTrialTwitterAccountLimit,
		AIGenerationsMonthly: 100,
		MonthlyXWrites:       10,
		MonthlyXURLPosts:     0,
		MonthlyCostCapCents:  0,
		MonthlyAutoPosts:     30,
		MonthlyAutoReplies:   150,
		MonthlyAutoComments:  90,
		MonthlyAutoDMs:       150,
		DailyAutoPosts:       1,
		DailyAutoReplies:     5,
		DailyAutoComments:    3,
		DailyAutoDMs:         5,
		AnalyticsDays:        7,
		TeamSeats:            1,
	}
}

func featuresForLimits(l PlanLimits) []PlanFeature {
	return []PlanFeature{
		{Key: "full_persona_fields", Label: "Full persona fields", Available: l.FullPersonaFields, MinPlan: PlanPlus},
		{Key: "auto_dm_import", Label: "Auto DM list import", Available: l.AutoDMImport, MinPlan: PlanPlus},
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
