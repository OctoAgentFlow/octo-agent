package router

import (
	"testing"

	"octo-agent/backend/internal/controller"

	"github.com/gin-gonic/gin"
)

func TestRegisterContentDraftsMirrorsAutoPostRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	v1 := r.Group("/api/v1")
	c := controller.NewAutoPostController(nil)

	RegisterAutoPost(v1, c)
	RegisterContentDrafts(v1, c)

	routes := map[string]bool{}
	for _, route := range r.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	for _, endpoint := range []struct {
		method string
		path   string
	}{
		{method: "GET", path: "/plans"},
		{method: "POST", path: "/plans"},
		{method: "GET", path: "/plans/:id"},
		{method: "PUT", path: "/plans/:id"},
		{method: "POST", path: "/plans/:id/generate"},
		{method: "POST", path: "/plans/:id/run-now"},
		{method: "GET", path: "/runs"},
		{method: "GET", path: "/drafts"},
		{method: "PATCH", path: "/drafts/:id"},
		{method: "POST", path: "/drafts/:id/rewrite"},
		{method: "POST", path: "/drafts/:id/approve"},
		{method: "POST", path: "/drafts/:id/prepare-publish"},
		{method: "POST", path: "/drafts/:id/reject"},
	} {
		oldPath := endpoint.method + " /api/v1/auto-post" + endpoint.path
		newPath := endpoint.method + " /api/v1/content-drafts" + endpoint.path
		if !routes[oldPath] {
			t.Fatalf("missing legacy route %s", oldPath)
		}
		if !routes[newPath] {
			t.Fatalf("missing content draft alias route %s", newPath)
		}
	}
}
