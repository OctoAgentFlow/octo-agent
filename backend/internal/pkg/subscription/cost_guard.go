package subscription

type UnitCostCents struct {
	OpenAIInputPerMillion  float64
	OpenAIOutputPerMillion float64
	XWrite                 float64
	XURLPost               float64
	AvgInputTokensPerGen   float64
	AvgOutputTokensPerGen  float64
}

type CostEstimate struct {
	PlanCode            string
	MonthlyRevenueCents int64
	MaxAllowedCents     float64
	EstimatedCostCents  float64
	OpenAICostCents     float64
	XWriteCostCents     float64
	XURLPostCostCents   float64
}

func DefaultUnitCosts() UnitCostCents {
	return UnitCostCents{
		OpenAIInputPerMillion:  40,
		OpenAIOutputPerMillion: 160,
		XWrite:                 1.5,
		XURLPost:               20,
		AvgInputTokensPerGen:   3000,
		AvgOutputTokensPerGen:  120,
	}
}

func EstimatePlanCost(plan PlanDefinition, unit UnitCostCents) CostEstimate {
	revenue := int64(PriceForCycle(plan, BillingCycleMonthly) * 100)
	openAI := float64(plan.Limits.AIGenerationsMonthly) * ((unit.AvgInputTokensPerGen*unit.OpenAIInputPerMillion + unit.AvgOutputTokensPerGen*unit.OpenAIOutputPerMillion) / 1_000_000)
	xWrite := float64(plan.Limits.MonthlyXWrites) * unit.XWrite
	xURL := float64(plan.Limits.MonthlyXURLPosts) * unit.XURLPost
	return CostEstimate{
		PlanCode:            plan.Code,
		MonthlyRevenueCents: revenue,
		MaxAllowedCents:     float64(revenue) * 0.5,
		EstimatedCostCents:  openAI + xWrite + xURL,
		OpenAICostCents:     openAI,
		XWriteCostCents:     xWrite,
		XURLPostCostCents:   xURL,
	}
}
