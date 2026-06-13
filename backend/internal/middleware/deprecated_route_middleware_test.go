package middleware

import (
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
