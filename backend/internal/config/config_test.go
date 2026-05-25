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

func TestApplyJWTConfigRequiresStableSecretOutsideLocal(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	t.Setenv("JWT_ACCESS_EXPIRE_SECONDS", "")
	t.Setenv("JWT_REFRESH_EXPIRE_SECONDS", "")

	if err := applyJWTConfig("test", &JWTConfig{}); err == nil {
		t.Fatal("expected missing jwt secret to fail for test environment")
	}
}

func TestApplyJWTConfigAllowsLocalFallback(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	t.Setenv("JWT_ACCESS_EXPIRE_SECONDS", "")
	t.Setenv("JWT_REFRESH_EXPIRE_SECONDS", "")

	var cfg JWTConfig
	if err := applyJWTConfig("local", &cfg); err != nil {
		t.Fatalf("expected local jwt fallback, got error: %v", err)
	}
	if cfg.Secret == "" {
		t.Fatal("expected local fallback secret")
	}
	if cfg.RefreshExpireSeconds < cfg.AccessExpireSeconds {
		t.Fatal("expected refresh expiry to be >= access expiry")
	}
}

func TestApplyJWTConfigUsesFixedSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	t.Setenv("JWT_ACCESS_EXPIRE_SECONDS", "")
	t.Setenv("JWT_REFRESH_EXPIRE_SECONDS", "")

	cfg := JWTConfig{
		Secret:               "stable-test-secret",
		AccessExpireSeconds:  60,
		RefreshExpireSeconds: 120,
	}
	if err := applyJWTConfig("test", &cfg); err != nil {
		t.Fatalf("expected fixed test secret to pass, got error: %v", err)
	}
	if cfg.Secret != "stable-test-secret" {
		t.Fatalf("unexpected secret %q", cfg.Secret)
	}
}

func TestApplyAlertConfigDefaultsServiceAndLimits(t *testing.T) {
	t.Setenv("ALERT_ENABLED", "")
	t.Setenv("ALERT_ENVIRONMENT", "")
	t.Setenv("ALERT_SERVICE", "")
	t.Setenv("LARK_ALERT_WEBHOOK_URL", "")
	t.Setenv("LARK_ALERT_SECRET", "")

	var cfg AlertConfig
	applyAlertConfig("test", "api", &cfg)
	if cfg.Environment != "test" {
		t.Fatalf("environment = %q, want test", cfg.Environment)
	}
	if cfg.Service != "backend-api" {
		t.Fatalf("service = %q, want backend-api", cfg.Service)
	}
	if cfg.RateLimit.DedupeWindowSeconds != 300 {
		t.Fatalf("dedupe window = %d, want 300", cfg.RateLimit.DedupeWindowSeconds)
	}
	if cfg.RateLimit.MaxPerMinute != 10 {
		t.Fatalf("max per minute = %d, want 10", cfg.RateLimit.MaxPerMinute)
	}
	if !cfg.Levels.Critical || !cfg.Levels.Error || !cfg.Levels.Warning || cfg.Levels.Info {
		t.Fatalf("unexpected default levels: %+v", cfg.Levels)
	}
}

func TestApplyAlertConfigUsesEnvironmentOverrides(t *testing.T) {
	t.Setenv("ALERT_ENABLED", "true")
	t.Setenv("ALERT_ENVIRONMENT", "prod")
	t.Setenv("ALERT_SERVICE", "backend-worker")
	t.Setenv("LARK_ALERT_WEBHOOK_URL", "https://example.com/lark")
	t.Setenv("LARK_ALERT_SECRET", "secret")

	var cfg AlertConfig
	applyAlertConfig("test", "api", &cfg)
	if !cfg.Enabled {
		t.Fatal("expected alert enabled")
	}
	if cfg.Environment != "prod" {
		t.Fatalf("environment = %q, want prod", cfg.Environment)
	}
	if cfg.Service != "backend-worker" {
		t.Fatalf("service = %q, want backend-worker", cfg.Service)
	}
	if cfg.Lark.WebhookURL != "https://example.com/lark" {
		t.Fatalf("webhook = %q", cfg.Lark.WebhookURL)
	}
	if cfg.Lark.Secret != "secret" {
		t.Fatalf("secret = %q", cfg.Lark.Secret)
	}
}

func TestApplyExternalSecretConfigOverridesSensitiveValues(t *testing.T) {
	t.Setenv("MYSQL_DSN", "user:pass@tcp(localhost:3306)/octo")
	t.Setenv("X_OAUTH_CLIENT_ID", "x-client")
	t.Setenv("X_OAUTH_CLIENT_SECRET", "x-secret")
	t.Setenv("X_OAUTH_STATE_SECRET", "state-secret")
	t.Setenv("BILLING_WEBHOOK_SECRET", "billing-secret")
	t.Setenv("BILLING_RPC_URL_56", "https://rpc.example")
	t.Setenv("BILLING_BEP20_TOKEN_ADDRESS", "0xToken")
	t.Setenv("BILLING_BEP20_RECEIVER_ADDRESS", "0xReceiver")

	cfg := Config{
		Billing: BillingConfig{
			Scanner: BillingScannerConfig{Enabled: true},
			RpcURLs: map[string]string{
				"56": "old",
			},
			PaymentMethods: []PaymentMethodConfig{
				{Network: "BEP20", TokenAddress: "old-token", ReceiverAddress: "old-receiver"},
			},
		},
	}
	if err := applyExternalSecretConfig("test", &cfg); err != nil {
		t.Fatalf("applyExternalSecretConfig returned error: %v", err)
	}
	if cfg.MySQL.DataSource != "user:pass@tcp(localhost:3306)/octo" {
		t.Fatalf("mysql dsn = %q", cfg.MySQL.DataSource)
	}
	if cfg.XOAuth.ClientID != "x-client" || cfg.XOAuth.ClientSecret != "x-secret" || cfg.XOAuth.StateSecret != "state-secret" {
		t.Fatalf("unexpected x oauth config: %+v", cfg.XOAuth)
	}
	if cfg.Billing.WebhookSecret != "billing-secret" {
		t.Fatalf("webhook secret = %q", cfg.Billing.WebhookSecret)
	}
	if cfg.Billing.RpcURLs["56"] != "https://rpc.example" {
		t.Fatalf("rpc override = %q", cfg.Billing.RpcURLs["56"])
	}
	if cfg.Billing.PaymentMethods[0].TokenAddress != "0xToken" || cfg.Billing.PaymentMethods[0].ReceiverAddress != "0xReceiver" {
		t.Fatalf("payment method override failed: %+v", cfg.Billing.PaymentMethods[0])
	}
}

func TestApplyExternalSecretConfigRequiresProdSecrets(t *testing.T) {
	t.Setenv("MYSQL_DSN", "")
	t.Setenv("X_OAUTH_CLIENT_ID", "")
	t.Setenv("X_OAUTH_CLIENT_SECRET", "")
	t.Setenv("X_OAUTH_STATE_SECRET", "")
	t.Setenv("BILLING_WEBHOOK_SECRET", "")

	cfg := Config{
		Email: EmailConfig{Provider: "local"},
		MySQL: MySQLConfig{DataSource: "TODO_MYSQL_DSN"},
		XOAuth: XOAuthConfig{
			ClientID:     "TODO_X_CLIENT_ID",
			ClientSecret: "TODO_X_CLIENT_SECRET",
			StateSecret:  "TODO_X_STATE_SECRET",
		},
		Billing: BillingConfig{Scanner: BillingScannerConfig{Enabled: false}},
	}
	if err := applyExternalSecretConfig("prod", &cfg); err == nil {
		t.Fatal("expected prod TODO secrets to fail")
	}
}
