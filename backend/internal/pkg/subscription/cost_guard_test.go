package subscription

import "testing"

func TestCatalogEstimatedCostStaysBelowHalfRevenue(t *testing.T) {
	unit := DefaultUnitCosts()
	for _, plan := range Catalog() {
		estimate := EstimatePlanCost(plan, unit)
		if estimate.EstimatedCostCents > estimate.MaxAllowedCents {
			t.Fatalf(
				"%s estimated cost %.2fc exceeds 50%% revenue cap %.2fc (openai=%.2fc x_write=%.2fc x_url=%.2fc)",
				estimate.PlanCode,
				estimate.EstimatedCostCents,
				estimate.MaxAllowedCents,
				estimate.OpenAICostCents,
				estimate.XWriteCostCents,
				estimate.XURLPostCostCents,
			)
		}
		if plan.Limits.MonthlyCostCapCents > 0 && float64(plan.Limits.MonthlyCostCapCents) > estimate.MaxAllowedCents {
			t.Fatalf("%s monthly cost cap %dc exceeds 50%% revenue cap %.2fc", plan.Code, plan.Limits.MonthlyCostCapCents, estimate.MaxAllowedCents)
		}
		if plan.Limits.MonthlyXWrites <= 0 {
			t.Fatalf("%s must define monthly real X write quota", plan.Code)
		}
	}
}
