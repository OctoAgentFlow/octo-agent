package requestid

import "context"

type contextKey struct{}

var idKey contextKey

// NewContext returns parent with the HTTP request ID attached.
func NewContext(parent context.Context, id string) context.Context {
	if parent == nil {
		parent = context.Background()
	}
	return context.WithValue(parent, idKey, id)
}

// FromContext returns the request ID, or empty string if unset.
func FromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	v, _ := ctx.Value(idKey).(string)
	return v
}
