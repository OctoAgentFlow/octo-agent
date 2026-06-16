package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestDeprecatedRouteAddsHeadersAndAllowsRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(DeprecatedRoute("auto-comments", "/api/v1/exposure-radar/drafts"))
	router.GET("/legacy", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/legacy", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
	if got := rec.Header().Get("Deprecation"); got != "true" {
		t.Fatalf("expected Deprecation header true, got %q", got)
	}
	if got := rec.Header().Get("X-Octo-Deprecated-Route"); got != "auto-comments" {
		t.Fatalf("expected deprecated route header, got %q", got)
	}
	if got := rec.Header().Get("X-Octo-Replacement-Route"); got != "/api/v1/exposure-radar/drafts" {
		t.Fatalf("expected replacement route header, got %q", got)
	}
	if got := rec.Body.String(); got != "ok" {
		t.Fatalf("expected handler to continue, got body %q", got)
	}
}

func TestProtectedLegacyAutomationRouteBlocksByDefault(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(ProtectedLegacyAutomationRoute("auto-replies", "/api/v1/exposure-radar/drafts"))
	router.GET("/legacy", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/legacy", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected status %d, got %d", http.StatusGone, rec.Code)
	}
	if got := rec.Header().Get("Deprecation"); got != "true" {
		t.Fatalf("expected Deprecation header true, got %q", got)
	}
	if got := rec.Header().Get("X-Octo-Deprecated-Route"); got != "auto-replies" {
		t.Fatalf("expected deprecated route header, got %q", got)
	}
	if got := rec.Header().Get("X-Octo-Legacy-Route-Blocked"); got != "true" {
		t.Fatalf("expected blocked header true, got %q", got)
	}
	var body struct {
		ErrorCode string `json:"error_code"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.ErrorCode != "legacy_automation_route_disabled" {
		t.Fatalf("expected legacy error code, got %q", body.ErrorCode)
	}
}

func TestProtectedLegacyAutomationRouteAllowsEmergencyOptIn(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("OCTO_ALLOW_LEGACY_AUTOMATION_ROUTES", "true")

	router := gin.New()
	router.Use(ProtectedLegacyAutomationRoute("auto-dm", ""))
	router.GET("/legacy", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/legacy", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
	if got := rec.Header().Get("Deprecation"); got != "true" {
		t.Fatalf("expected Deprecation header true, got %q", got)
	}
	if got := rec.Header().Get("X-Octo-Legacy-Route-Blocked"); got != "" {
		t.Fatalf("expected no blocked header, got %q", got)
	}
	if got := rec.Body.String(); got != "ok" {
		t.Fatalf("expected handler to continue, got body %q", got)
	}
}
