package service

import (
	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/pkg/subscription"
)

func planLimitsToDTO(l subscription.PlanLimits) dto.PlanLimitsData {
	return dto.PlanLimitsData{
		MaxBots:                 l.MaxBots,
		MaxTwitterAccounts:      l.MaxTwitterAccounts,
		AIGenerationsMonthly:    l.AIGenerationsMonthly,
		MonthlyXWrites:          l.MonthlyXWrites,
		MonthlyXURLPosts:        l.MonthlyXURLPosts,
		MonthlyCostCapCents:     l.MonthlyCostCapCents,
		MonthlyAutoPosts:        l.MonthlyAutoPosts,
		MonthlyAutoReplies:      l.MonthlyAutoReplies,
		MonthlyAutoComments:     l.MonthlyAutoComments,
		MonthlyAutoDMs:          l.MonthlyAutoDMs,
		AutoCommentTargets:      l.AutoCommentTargets,
		MonthlyAutoCommentScans: l.MonthlyAutoCommentScans,
		DailyAutoPosts:          l.DailyAutoPosts,
		DailyAutoReplies:        l.DailyAutoReplies,
		DailyAutoComments:       l.DailyAutoComments,
		DailyAutoDMs:            l.DailyAutoDMs,
		AnalyticsDays:           l.AnalyticsDays,
		TeamSeats:               l.TeamSeats,
		FullPersonaFields:       l.FullPersonaFields,
		AutoDMImport:            l.AutoDMImport,
		AdvancedBotStrategy:     l.AdvancedBotStrategy,
		BulkReview:              l.BulkReview,
		BotPerformance:          l.BotPerformance,
		DataExport:              l.DataExport,
		MultiBotMatrix:          l.MultiBotMatrix,
		ABTesting:               l.ABTesting,
		AdvancedFlowBuilder:     l.AdvancedFlowBuilder,
		AdvancedRiskRules:       l.AdvancedRiskRules,
		PrioritySupport:         l.PrioritySupport,
	}
}

func planFeaturesToDTO(items []subscription.PlanFeature) []dto.PlanFeatureData {
	out := make([]dto.PlanFeatureData, 0, len(items))
	for _, item := range items {
		out = append(out, dto.PlanFeatureData{
			Key:       item.Key,
			Label:     item.Label,
			Available: item.Available,
			MinPlan:   item.MinPlan,
		})
	}
	return out
}
