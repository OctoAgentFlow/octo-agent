package config

import "testing"

func TestNormalizeConfigService(t *testing.T) {
	cases := []struct {
		value string
		want  string
	}{
		{value: "", want: ""},
		{value: "api", want: "api"},
		{value: " admin ", want: "admin"},
		{value: "admin-api", want: "admin"},
	}

	for _, tc := range cases {
		got, err := normalizeConfigService(tc.value)
		if err != nil {
			t.Fatalf("normalizeConfigService(%q) returned error: %v", tc.value, err)
		}
		if got != tc.want {
			t.Fatalf("normalizeConfigService(%q) = %q, want %q", tc.value, got, tc.want)
		}
	}
}

func TestNormalizeConfigServiceRejectsUnknown(t *testing.T) {
	if _, err := normalizeConfigService("api-front"); err == nil {
		t.Fatal("expected unsupported service error")
	}
}

func TestConfigFilePath(t *testing.T) {
	if got := configFilePath("test", ""); got != "configs/config.test.yaml" {
		t.Fatalf("legacy path = %q", got)
	}
	if got := configFilePath("test", "api"); got != "configs/config.test.api.yaml" {
		t.Fatalf("api path = %q", got)
	}
	if got := configFilePath("test", "admin"); got != "configs/config.test.admin.yaml" {
		t.Fatalf("admin path = %q", got)
	}
}
