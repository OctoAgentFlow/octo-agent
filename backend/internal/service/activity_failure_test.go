package service

import "testing"

func TestClassifyActivityFailure(t *testing.T) {
	cases := []struct {
		name string
		msg  string
		want string
	}{
		{name: "x auth", msg: "x api 401: Unauthorized", want: "x_auth"},
		{name: "rate limit", msg: "too many requests: rate limit exceeded", want: "rate_limit"},
		{name: "safety", msg: "blocked_keyword: airdrop", want: "safety"},
		{name: "configuration", msg: "missing content pool setup", want: "configuration"},
		{name: "network", msg: "dial tcp timeout", want: "network"},
		{name: "system", msg: "database internal server error", want: "system"},
		{name: "unknown", msg: "something unexpected", want: "unknown"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := classifyActivityFailure("failed", tc.msg); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
	if got := classifyActivityFailure("success", "x api 401: Unauthorized"); got != "" {
		t.Fatalf("success should not have category, got %q", got)
	}
}
