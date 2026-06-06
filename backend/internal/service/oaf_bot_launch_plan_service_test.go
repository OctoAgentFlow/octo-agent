package service

import (
	"context"
	"strings"
	"testing"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newOAFBotLaunchPlanTestService(t *testing.T) (*OAFBotLaunchPlanService, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.OAFBotLaunchPlan{}); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	svc := NewOAFBotLaunchPlanService(repository.NewOAFBotLaunchPlanRepository(db), nil)
	svc.generate = func(_ context.Context, _ dto.OAFBotLaunchPlanRequest) (dto.OAFBotLaunchPlanOutput, error) {
		return dto.OAFBotLaunchPlanOutput{
			AccountPositioning:    "A practical founder/operator X account for AI social operations.",
			RecommendedBotType:    "Founder / operator",
			RecommendedOccupation: "AI social operations founder",
			RecommendedIndustries: []string{"AI", "SaaS", "Web3"},
			ContentThemes:         []string{"Account launch", "OAF Bot workflow", "Review-first operations"},
			SafetyGuardrails:      []string{"No guaranteed growth", "No spam", "No financial promises"},
			SevenDayPlan: []dto.OAFBotLaunchPlanDay{
				{Day: 1, Theme: "Positioning", Action: "Publish the account thesis.", Outcome: "Clear audience fit."},
			},
			FirstPosts: []dto.OAFBotLaunchPlanDraft{
				{Label: "Launch thesis", Content: "Starting an X account is easier when the Bot has a role, memory, and guardrails.", Why: "Shows the operating idea."},
				{Label: "Workflow", Content: "A useful OAF Bot loop: add context, draft posts, review, then let feedback improve the next queue.", Why: "Shows process."},
				{Label: "Safety", Content: "Controlled automation works best when publishing stays review-first and claims stay grounded.", Why: "Shows guardrails."},
				{Label: "Extra", Content: "This extra draft should be dropped.", Why: "Limit test."},
			},
			CommentExamples: []dto.OAFBotLaunchPlanDraft{
				{Label: "Helpful reply", Content: "This is exactly why review-first workflows matter for early accounts.", Why: "Natural interaction."},
				{Label: "Operator angle", Content: "The hard part is keeping a consistent voice while still moving fast.", Why: "Adds perspective."},
				{Label: "Question", Content: "What part of the account workflow is hardest to keep consistent right now?", Why: "Light follow-up."},
			},
			BioSuggestion:    "OAF Bot for X account operations.",
			OperatingCadence: "Generate daily, review before publishing, and let edits improve the Bot.",
			CreateOAFBotCTA:  "Use this plan to create an OAF Bot.",
		}, nil
	}
	return svc, db
}

func TestOAFBotLaunchPlanGeneratesAndPersistsAnonymousPlan(t *testing.T) {
	svc, db := newOAFBotLaunchPlanTestService(t)

	out, err := svc.Generate(context.Background(), dto.OAFBotLaunchPlanRequest{
		Stage:            "start_from_zero",
		AccountType:      "founder_operator",
		ProjectSummary:   "OctoAgentFlow helps teams operate X accounts with OAF Bots.",
		TargetAudience:   "Web3 founders and AI SaaS operators",
		DesiredFollowers: "Operators who need controlled X workflows",
		Industry:         "AI social operations",
		OutputLanguage:   "en",
	})
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if out.Token == "" {
		t.Fatal("expected public token")
	}
	if !strings.Contains(out.CreateOAFBotURL, "/login?next=") || !strings.Contains(out.CreateOAFBotURL, out.Token) {
		t.Fatalf("unexpected create url: %s", out.CreateOAFBotURL)
	}
	if len(out.Plan.FirstPosts) != 3 {
		t.Fatalf("expected exactly 3 first posts, got %d", len(out.Plan.FirstPosts))
	}
	if len(out.Plan.CommentExamples) != 3 {
		t.Fatalf("expected exactly 3 comment examples, got %d", len(out.Plan.CommentExamples))
	}

	var row model.OAFBotLaunchPlan
	if err := db.Where("public_token = ?", out.Token).First(&row).Error; err != nil {
		t.Fatalf("persisted launch plan not found: %v", err)
	}
	if row.UserID != 0 {
		t.Fatalf("expected anonymous plan user_id=0, got %d", row.UserID)
	}
	if !strings.Contains(row.OutputJSON, "Launch thesis") {
		t.Fatalf("expected generated output to be stored, got %s", row.OutputJSON)
	}
}

func TestOAFBotLaunchPlanRequiresProjectSummary(t *testing.T) {
	svc, _ := newOAFBotLaunchPlanTestService(t)

	if _, err := svc.Generate(context.Background(), dto.OAFBotLaunchPlanRequest{}); err == nil {
		t.Fatal("expected missing project summary to fail")
	}
}

func TestOAFBotLaunchPlanCompletesPartialAIOutput(t *testing.T) {
	svc, _ := newOAFBotLaunchPlanTestService(t)
	svc.generate = func(_ context.Context, _ dto.OAFBotLaunchPlanRequest) (dto.OAFBotLaunchPlanOutput, error) {
		return dto.OAFBotLaunchPlanOutput{
			AccountPositioning: "A KOL account for AI social operations.",
			FirstPosts: []dto.OAFBotLaunchPlanDraft{
				{Label: "Only one", Content: "One reviewed post about OAF Bot launch workflows.", Why: "Partial AI output."},
			},
		}, nil
	}

	out, err := svc.Generate(context.Background(), dto.OAFBotLaunchPlanRequest{
		Stage:          "start_from_zero",
		AccountType:    "kol_creator",
		ProjectSummary: "Build a KOL account for OAF Bot operations.",
		OutputLanguage: "en",
	})
	if err != nil {
		t.Fatalf("generate partial output: %v", err)
	}
	if len(out.Plan.FirstPosts) != 3 {
		t.Fatalf("expected fallback to complete 3 first posts, got %d", len(out.Plan.FirstPosts))
	}
	if len(out.Plan.CommentExamples) != 3 {
		t.Fatalf("expected fallback to complete 3 comment examples, got %d", len(out.Plan.CommentExamples))
	}
	if len(out.Plan.SevenDayPlan) != 7 {
		t.Fatalf("expected fallback to complete 7 day plan, got %d", len(out.Plan.SevenDayPlan))
	}
}
