package repository

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestContentDraftRepositoryConstructorsWrapLegacyRepositories(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	planRepo := NewContentDraftPlanRepository(db)
	if planRepo == nil || planRepo.DB != db {
		t.Fatalf("content draft plan repository did not keep DB handle")
	}
	if _, ok := any(planRepo).(*AutoPostPlanRepository); !ok {
		t.Fatalf("content draft plan repository is not an AutoPostPlanRepository alias")
	}

	draftRepo := NewContentDraftRepository(db)
	if draftRepo == nil || draftRepo.DB != db {
		t.Fatalf("content draft repository did not keep DB handle")
	}
	if _, ok := any(draftRepo).(*AutoPostDraftRepository); !ok {
		t.Fatalf("content draft repository is not an AutoPostDraftRepository alias")
	}

	runRepo := NewContentDraftGenerationRunRepository(db)
	if runRepo == nil || runRepo.DB != db {
		t.Fatalf("content draft generation run repository did not keep DB handle")
	}
	if _, ok := any(runRepo).(*AutoPostGenerationRunRepository); !ok {
		t.Fatalf("content draft generation run repository is not an AutoPostGenerationRunRepository alias")
	}

	legacyQuery := AutoPostGenerationRunListQuery{UserID: 123, Status: "completed", Page: 2, PageSize: 20}
	var semanticQuery ContentDraftGenerationRunListQuery = legacyQuery
	if semanticQuery.UserID != legacyQuery.UserID || semanticQuery.Status != legacyQuery.Status {
		t.Fatalf("content draft generation run query alias lost field values")
	}
}
