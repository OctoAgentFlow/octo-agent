package service

import (
	"path/filepath"
	"testing"
	"time"

	"octo-agent/backend/internal/dto"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newPointTestService(t *testing.T) (*PointService, *gorm.DB) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "points.sqlite")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&model.UserPointAccount{},
		&model.PointLedgerEntry{},
		&model.PointGrant{},
		&model.PointActivity{},
		&model.PointActivityClaim{},
		&model.PointRiskConfig{},
		&model.OAFBot{},
		&model.TwitterAccount{},
		&model.ContentLibraryItem{},
		&model.ActivityLog{},
	); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	repo := repository.NewPointRepository(db)
	svc := NewPointService(
		repo,
		repository.NewOAFBotRepository(db),
		repository.NewTwitterAccountRepository(db),
		repository.NewContentLibraryRepository(db),
		repository.NewActivityRepository(db),
	)
	return svc, db
}

func TestPointCenterIncludesProductActivities(t *testing.T) {
	svc, _ := newPointTestService(t)
	got, err := svc.Center(1)
	if err != nil {
		t.Fatalf("center: %v", err)
	}
	codes := map[string]bool{}
	for _, activity := range got.Activities {
		codes[activity.Code] = true
	}
	for _, code := range []string{"add_source_material", "generate_daily_x_queue", "review_daily_x_queue", "activate_daily_x_queue"} {
		if !codes[code] {
			t.Fatalf("expected activity %s in point center", code)
		}
	}
}

func TestPointProductActivitiesRequireRealProductSignals(t *testing.T) {
	svc, db := newPointTestService(t)
	userID := uint(9)

	before, err := svc.Center(userID)
	if err != nil {
		t.Fatalf("center before: %v", err)
	}
	if pointActivityByCode(before.Activities, "add_source_material").Claimable {
		t.Fatal("source material activity should not be claimable before adding source material")
	}
	if pointActivityByCode(before.Activities, "generate_daily_x_queue").Claimable {
		t.Fatal("daily queue generation activity should not be claimable before generation")
	}
	if pointActivityByCode(before.Activities, "review_daily_x_queue").Claimable {
		t.Fatal("daily queue review activity should not be claimable before review actions")
	}
	if pointActivityByCode(before.Activities, "activate_daily_x_queue").Claimable {
		t.Fatal("daily queue activation activity should not be claimable before activation")
	}

	now := time.Now().UTC()
	if err := db.Create(&model.ContentLibraryItem{UserID: userID, Title: "Source", ItemType: "note", Status: "active"}).Error; err != nil {
		t.Fatalf("create content: %v", err)
	}
	for _, previewKey := range []string{
		"activity.preview.dailyXQueueGenerated",
		"activity.preview.dailyXQueueDraftEdited",
		"activity.preview.dailyXQueueDraftApproved",
		"activity.preview.dailyXQueueDraftCopied",
		"daily_x_queue_activated",
	} {
		if err := db.Create(&model.ActivityLog{
			UserID:     userID,
			Type:       "post",
			Status:     "success",
			PreviewKey: previewKey,
			ExecutedAt: now,
		}).Error; err != nil {
			t.Fatalf("create activity %s: %v", previewKey, err)
		}
	}

	after, err := svc.Center(userID)
	if err != nil {
		t.Fatalf("center after: %v", err)
	}
	for _, code := range []string{"add_source_material", "generate_daily_x_queue", "review_daily_x_queue", "activate_daily_x_queue"} {
		if !pointActivityByCode(after.Activities, code).Claimable {
			t.Fatalf("expected %s to be claimable after product signal", code)
		}
	}
}

func TestPointClaimProductActivityIsIdempotentPerPeriod(t *testing.T) {
	svc, db := newPointTestService(t)
	userID := uint(10)
	if err := db.Create(&model.ActivityLog{
		UserID:     userID,
		Type:       "post",
		Status:     "success",
		PreviewKey: "activity.preview.dailyXQueueGenerated",
		ExecutedAt: time.Now().UTC(),
	}).Error; err != nil {
		t.Fatalf("create generation activity: %v", err)
	}

	if _, err := svc.Claim(userID, dto.PointClaimRequest{ActivityCode: "generate_daily_x_queue"}); err != nil {
		t.Fatalf("claim daily queue generation: %v", err)
	}
	if _, err := svc.Claim(userID, dto.PointClaimRequest{ActivityCode: "generate_daily_x_queue"}); err == nil {
		t.Fatal("expected duplicate same-day claim to fail")
	}
}

func pointActivityByCode(items []dto.PointActivityData, code string) dto.PointActivityData {
	for _, item := range items {
		if item.Code == code {
			return item
		}
	}
	return dto.PointActivityData{}
}
