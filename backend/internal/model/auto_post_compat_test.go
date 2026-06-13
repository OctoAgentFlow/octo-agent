package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestAutoPostModelsKeepLegacyTableNames(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	for _, tc := range []struct {
		name  string
		model any
		table string
	}{
		{name: "plan", model: &AutoPostPlan{}, table: "auto_post_plans"},
		{name: "draft", model: &AutoPostDraft{}, table: "auto_post_drafts"},
		{name: "generation_run", model: &AutoPostGenerationRun{}, table: "auto_post_generation_runs"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			stmt := &gorm.Statement{DB: db}
			if err := stmt.Parse(tc.model); err != nil {
				t.Fatalf("parse model schema: %v", err)
			}
			if stmt.Schema.Table != tc.table {
				t.Fatalf("table = %q, want %q", stmt.Schema.Table, tc.table)
			}
		})
	}
}
