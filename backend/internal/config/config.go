package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
	"gopkg.in/yaml.v3"
)

type Config struct {
	API        ServerConfig     `yaml:"api"`
	Admin      ServerConfig     `yaml:"admin"`
	MySQL      MySQLConfig      `yaml:"mysql"`
	Log        LogConfig        `yaml:"log"`
	Email      EmailConfig      `yaml:"email"`
	App        AppConfig        `yaml:"app"`
	JWT        JWTConfig        `yaml:"jwt"`
	AdminAuth  AdminAuthConfig  `yaml:"admin_auth"`
	Alert      AlertConfig      `yaml:"alert"`
	XOAuth     XOAuthConfig     `yaml:"x_oauth"`
	XPublisher XPublisherConfig `yaml:"x_publisher"`
	LLM        LLMConfig        `yaml:"llm"`
	Billing    BillingConfig    `yaml:"billing"`
}

// BillingConfig holds USDT payment settings (loaded from YAML; do not hardcode in code).
type BillingConfig struct {
	OrderTTLMinutes int                  `yaml:"order_ttl_minutes"`
	WebhookSecret   string               `yaml:"webhook_secret"`
	Scanner         BillingScannerConfig `yaml:"scanner"`
	// RpcURLs maps chain id as string (e.g. "56", "1", "728126428") to JSON-RPC HTTP endpoint for payment verification.
	RpcURLs map[string]string `yaml:"rpc_urls"`
	// WssURLs maps chain id as string to WebSocket endpoints for future chain listeners.
	WssURLs map[string]string `yaml:"wss_urls"`
	// ExplorerAPIKeys stores per-explorer API keys for future reconciliation fallbacks.
	ExplorerAPIKeys map[string]string           `yaml:"explorer_api_keys"`
	PaymentMethods  []PaymentMethodConfig       `yaml:"payment_methods"`
	Plans           map[string]BillingPlanEntry `yaml:"plans"`
}

type BillingScannerConfig struct {
	Enabled          bool  `yaml:"enabled"`
	IntervalSeconds  int   `yaml:"interval_seconds"`
	MaxOrdersPerTick int   `yaml:"max_orders_per_tick"`
	BlockLookback    int64 `yaml:"block_lookback"`
}

// PaymentMethodConfig is one USDT payment route.
type PaymentMethodConfig struct {
	Method          string `yaml:"method"`
	Network         string `yaml:"network"`
	ChainID         int64  `yaml:"chain_id"`
	TokenAddress    string `yaml:"token_address"`
	ReceiverAddress string `yaml:"receiver_address"`
	Decimals        int    `yaml:"decimals"`
	IsDefault       bool   `yaml:"is_default"`
	Note            string `yaml:"note"`
}

// BillingPlanEntry defines a purchasable subscription SKU.
type BillingPlanEntry struct {
	Name        string   `yaml:"name"`
	Amount      string   `yaml:"amount"`
	Currency    string   `yaml:"currency"`
	PeriodDays  int      `yaml:"period_days"`
	Description string   `yaml:"description"`
	Features    []string `yaml:"features"`
}

// AppConfig holds cross-cutting app settings (not server bind addresses).
type AppConfig struct {
	// FrontendBaseURL is the origin used after X OAuth callback redirects (e.g. http://localhost:3000).
	FrontendBaseURL string `yaml:"frontend_base_url"`
	OfficialXURL    string `yaml:"official_x_url"`
	TelegramURL     string `yaml:"telegram_url"`
}

// JWTConfig controls access/refresh token signing. Non-local deployments must
// provide a stable secret so service restarts do not invalidate active sessions.
type JWTConfig struct {
	Secret               string `yaml:"secret"`
	AccessExpireSeconds  int64  `yaml:"access_expire_seconds"`
	RefreshExpireSeconds int64  `yaml:"refresh_expire_seconds"`
}

// AdminAuthConfig controls passwordless admin-console login.
type AdminAuthConfig struct {
	Emails         []string `yaml:"emails"`
	CodeTTLSeconds int      `yaml:"code_ttl_seconds"`
}

type AlertConfig struct {
	Enabled     bool                 `yaml:"enabled"`
	Environment string               `yaml:"environment"`
	Service     string               `yaml:"service"`
	Lark        LarkAlertConfig      `yaml:"lark"`
	RateLimit   AlertRateLimitConfig `yaml:"rate_limit"`
	Levels      AlertLevelsConfig    `yaml:"levels"`
}

type LarkAlertConfig struct {
	WebhookURL string `yaml:"webhook_url"`
	Secret     string `yaml:"secret"`
}

type AlertRateLimitConfig struct {
	DedupeWindowSeconds int `yaml:"dedupe_window_seconds"`
	MaxPerMinute        int `yaml:"max_per_minute"`
}

type AlertLevelsConfig struct {
	Critical bool `yaml:"critical"`
	Error    bool `yaml:"error"`
	Warning  bool `yaml:"warning"`
	Info     bool `yaml:"info"`
}

// XOAuthConfig holds X (Twitter) OAuth 2.0 PKCE settings for account linking.
type XOAuthConfig struct {
	ClientID     string `yaml:"client_id"`
	ClientSecret string `yaml:"client_secret"`
	RedirectURI  string `yaml:"redirect_uri"`
	StateSecret  string `yaml:"state_secret"`
	Scopes       string `yaml:"scopes"`
}

// XPublisherConfig controls manual real publishing through the unified publishing pipeline.
type XPublisherConfig struct {
	RealPublishEnabled        bool     `yaml:"real_publish_enabled"`
	ManualPublishEnabled      bool     `yaml:"manual_publish_enabled"`
	PerAccountDailyLimit      int      `yaml:"per_account_daily_limit"`
	PerAccountMinIntervalSecs int      `yaml:"per_account_min_interval_seconds"`
	UnlimitedUserEmails       []string `yaml:"unlimited_user_emails"`
	UnlimitedAccountUsernames []string `yaml:"unlimited_account_usernames"`
	DryRun                    bool     `yaml:"dry_run"`
}

// LLMConfig is the shared LLM provider configuration for current and future AI features.
type LLMConfig struct {
	DefaultProvider string       `yaml:"default_provider"`
	OpenAI          OpenAIConfig `yaml:"openai"`
}

type OpenAIConfig struct {
	APIKey      string  `yaml:"api_key"`
	Model       string  `yaml:"model"`
	BaseURL     string  `yaml:"base_url"`
	TimeoutSec  int     `yaml:"timeout_sec"`
	MaxTokens   int     `yaml:"max_tokens"`
	Temperature float32 `yaml:"temperature"`
}

type ServerConfig struct {
	Host string `yaml:"host"`
	Port int    `yaml:"port"`
}

func (s ServerConfig) Address() string {
	return fmt.Sprintf("%s:%d", s.Host, s.Port)
}

type MySQLConfig struct {
	DataSource   string `yaml:"data_source"`
	MaxIdleConns int    `yaml:"max_idle_conns"`
	MaxOpenConns int    `yaml:"max_open_conns"`
	MaxLifetime  int    `yaml:"max_lifetime"`
	MaxIdleTime  int    `yaml:"max_idletime"`

	Host      string `yaml:"host"`
	Port      int    `yaml:"port"`
	User      string `yaml:"user"`
	Password  string `yaml:"password"`
	DBName    string `yaml:"db_name"`
	Charset   string `yaml:"charset"`
	ParseTime bool   `yaml:"parse_time"`
	Loc       string `yaml:"loc"`
}

type LogConfig struct {
	Level           string `yaml:"level"`
	Encoding        string `yaml:"encoding"`
	OutputPath      string `yaml:"output_path"`
	APIOutputPath   string `yaml:"api_output_path"`
	AdminOutputPath string `yaml:"admin_output_path"`
	MaxSize         int    `yaml:"max_size"`
	MaxBackups      int    `yaml:"max_backups"`
	MaxAge          int    `yaml:"max_age"`
	Compress        bool   `yaml:"compress"`
}

type EmailConfig struct {
	Provider string       `yaml:"provider"`
	Local    LocalConfig  `yaml:"local"`
	Resend   ResendConfig `yaml:"resend"`
	SES      SESConfig    `yaml:"ses"`
}

type LocalConfig struct {
	ExposeCode bool `yaml:"expose_code"`
}

type ResendConfig struct {
	APIKey    string `yaml:"api_key"`
	FromEmail string `yaml:"from_email"`
}

type SESConfig struct {
	Region          string `yaml:"region"`
	AccessKeyID     string `yaml:"access_key_id"`
	SecretAccessKey string `yaml:"secret_access_key"`
	FromEmail       string `yaml:"from_email"`
}

// SMTPConfig is kept for compatibility with legacy code paths.
type SMTPConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
	From     string `yaml:"from"`
}

func (m MySQLConfig) DSN() string {
	if m.DataSource != "" {
		return m.DataSource
	}
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=%s&parseTime=%t&loc=%s", m.User, m.Password, m.Host, m.Port, m.DBName, m.Charset, m.ParseTime, m.Loc)
}

func Load() (*Config, error) {
	_ = godotenv.Load("configs/.env")

	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "local"
	}

	service, err := normalizeConfigService(os.Getenv("APP_SERVICE"))
	if err != nil {
		return nil, err
	}
	path := configFilePath(env, service)
	if _, err := os.Stat(path); err != nil {
		if service == "" {
			return nil, fmt.Errorf("config file not found for APP_ENV=%s: %s", env, path)
		}
		return nil, fmt.Errorf("config file not found for APP_ENV=%s APP_SERVICE=%s: %s", env, service, path)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	// Backward compatibility for legacy config key.
	if cfg.API.Host == "" && cfg.API.Port == 0 {
		type legacy struct {
			Server ServerConfig `yaml:"server"`
		}
		var old legacy
		if err := yaml.Unmarshal(data, &old); err == nil && old.Server.Port != 0 {
			cfg.API = old.Server
		}
	}
	if cfg.API.Host == "" {
		cfg.API.Host = "0.0.0.0"
	}
	if cfg.API.Port == 0 {
		cfg.API.Port = 8080
	}
	if cfg.Admin.Host == "" {
		cfg.Admin.Host = "0.0.0.0"
	}
	if cfg.Admin.Port == 0 {
		cfg.Admin.Port = 8081
	}

	if cfg.Log.Level == "" {
		cfg.Log.Level = "debug"
	}
	if cfg.Log.Encoding == "" {
		cfg.Log.Encoding = "json"
	}
	if cfg.Log.MaxSize == 0 {
		cfg.Log.MaxSize = 100
	}
	if cfg.Log.MaxBackups == 0 {
		cfg.Log.MaxBackups = 30
	}
	if cfg.Log.MaxAge == 0 {
		cfg.Log.MaxAge = 7
	}
	if cfg.Log.APIOutputPath == "" {
		cfg.Log.APIOutputPath = "logs/api.log"
	}
	if cfg.Log.AdminOutputPath == "" {
		cfg.Log.AdminOutputPath = "logs/admin.log"
	}
	if cfg.Email.Provider == "" {
		if env == "local" || env == "test" {
			cfg.Email.Provider = "local"
		} else {
			cfg.Email.Provider = "resend"
		}
	}
	if v := strings.TrimSpace(os.Getenv("EMAIL_PROVIDER")); v != "" {
		cfg.Email.Provider = v
	}
	if v := strings.TrimSpace(os.Getenv("RESEND_API_KEY")); v != "" {
		cfg.Email.Resend.APIKey = v
	}
	if v := strings.TrimSpace(os.Getenv("RESEND_FROM_EMAIL")); v != "" {
		cfg.Email.Resend.FromEmail = normalizeResendFromEmail(v)
	}
	if cfg.Email.Resend.FromEmail == "" {
		cfg.Email.Resend.FromEmail = "Octo Agent <no-reply@mail.octo-agent.com>"
	}
	if cfg.Email.SES.Region == "" {
		cfg.Email.SES.Region = "ap-southeast-1"
	}
	if cfg.Email.SES.FromEmail == "" {
		cfg.Email.SES.FromEmail = "no-reply@mail.octo-agent.com"
	}
	if strings.TrimSpace(cfg.App.FrontendBaseURL) == "" {
		cfg.App.FrontendBaseURL = "http://localhost:3000"
	}
	if err := applyJWTConfig(env, &cfg.JWT); err != nil {
		return nil, err
	}
	if cfg.LLM.DefaultProvider == "" {
		cfg.LLM.DefaultProvider = "openai"
	}
	if cfg.LLM.OpenAI.Model == "" {
		cfg.LLM.OpenAI.Model = "gpt-4.1-mini"
	}
	if cfg.LLM.OpenAI.BaseURL == "" {
		cfg.LLM.OpenAI.BaseURL = "https://api.openai.com/v1"
	}
	if cfg.LLM.OpenAI.TimeoutSec <= 0 {
		cfg.LLM.OpenAI.TimeoutSec = 20
	}
	if cfg.LLM.OpenAI.MaxTokens <= 0 {
		cfg.LLM.OpenAI.MaxTokens = 120
	}
	if cfg.LLM.OpenAI.Temperature <= 0 {
		cfg.LLM.OpenAI.Temperature = 0.65
	}
	if v := strings.TrimSpace(os.Getenv("LLM_PROVIDER")); v != "" {
		cfg.LLM.DefaultProvider = v
	}
	if v := strings.TrimSpace(os.Getenv("OPENAI_API_KEY")); v != "" {
		cfg.LLM.OpenAI.APIKey = v
	}
	if strings.HasPrefix(strings.TrimSpace(cfg.LLM.OpenAI.APIKey), "TODO_") {
		cfg.LLM.OpenAI.APIKey = ""
	}
	if v := strings.TrimSpace(os.Getenv("OPENAI_MODEL")); v != "" {
		cfg.LLM.OpenAI.Model = v
	}
	if v := strings.TrimSpace(os.Getenv("OPENAI_BASE_URL")); v != "" {
		cfg.LLM.OpenAI.BaseURL = strings.TrimRight(v, "/")
	}
	if cfg.AdminAuth.CodeTTLSeconds <= 0 {
		cfg.AdminAuth.CodeTTLSeconds = 300
	}
	applyAlertConfig(env, service, &cfg.Alert)
	if cfg.XPublisher.PerAccountDailyLimit <= 0 {
		cfg.XPublisher.PerAccountDailyLimit = 20
	}
	if cfg.XPublisher.PerAccountMinIntervalSecs <= 0 {
		cfg.XPublisher.PerAccountMinIntervalSecs = 300
	}
	if !cfg.XPublisher.ManualPublishEnabled && !cfg.XPublisher.RealPublishEnabled && !cfg.XPublisher.DryRun {
		cfg.XPublisher.ManualPublishEnabled = true
		cfg.XPublisher.DryRun = true
	}
	if cfg.Billing.OrderTTLMinutes <= 0 {
		cfg.Billing.OrderTTLMinutes = 30
	}
	if cfg.Billing.Scanner.IntervalSeconds <= 0 {
		cfg.Billing.Scanner.IntervalSeconds = 60
	}
	if cfg.Billing.Scanner.MaxOrdersPerTick <= 0 {
		cfg.Billing.Scanner.MaxOrdersPerTick = 100
	}
	if cfg.Billing.Scanner.BlockLookback <= 0 {
		cfg.Billing.Scanner.BlockLookback = 7200
	}
	if cfg.Billing.RpcURLs == nil {
		cfg.Billing.RpcURLs = map[string]string{}
	}
	if cfg.Billing.WssURLs == nil {
		cfg.Billing.WssURLs = map[string]string{}
	}
	if cfg.Billing.ExplorerAPIKeys == nil {
		cfg.Billing.ExplorerAPIKeys = map[string]string{}
	}
	if err := applyExternalSecretConfig(env, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func applyExternalSecretConfig(env string, cfg *Config) error {
	if cfg == nil {
		return nil
	}
	if v := strings.TrimSpace(os.Getenv("MYSQL_DSN")); v != "" {
		cfg.MySQL.DataSource = v
	}
	if v := strings.TrimSpace(os.Getenv("X_OAUTH_CLIENT_ID")); v != "" {
		cfg.XOAuth.ClientID = v
	}
	if v := strings.TrimSpace(os.Getenv("X_OAUTH_CLIENT_SECRET")); v != "" {
		cfg.XOAuth.ClientSecret = v
	}
	if v := strings.TrimSpace(os.Getenv("X_OAUTH_STATE_SECRET")); v != "" {
		cfg.XOAuth.StateSecret = v
	}
	if v := strings.TrimSpace(os.Getenv("X_OAUTH_SCOPES")); v != "" {
		cfg.XOAuth.Scopes = v
	}
	if v := strings.TrimSpace(os.Getenv("BILLING_WEBHOOK_SECRET")); v != "" {
		cfg.Billing.WebhookSecret = v
	}
	if v := strings.TrimSpace(os.Getenv("BILLING_ETHERSCAN_API_KEY")); v != "" {
		cfg.Billing.ExplorerAPIKeys["etherscan"] = v
	}
	applyMapEnvOverrides(cfg.Billing.RpcURLs, "BILLING_RPC_URL_")
	applyMapEnvOverrides(cfg.Billing.WssURLs, "BILLING_WSS_URL_")
	applyMapEnvOverrides(cfg.Billing.ExplorerAPIKeys, "BILLING_EXPLORER_API_KEY_")
	applyPaymentMethodEnvOverrides(cfg.Billing.PaymentMethods)

	if env == "local" || env == "test" {
		return nil
	}
	required := map[string]string{
		"mysql.data_source/MYSQL_DSN":                 cfg.MySQL.DataSource,
		"x_oauth.client_id/X_OAUTH_CLIENT_ID":         cfg.XOAuth.ClientID,
		"x_oauth.client_secret/X_OAUTH_CLIENT_SECRET": cfg.XOAuth.ClientSecret,
		"x_oauth.state_secret/X_OAUTH_STATE_SECRET":   cfg.XOAuth.StateSecret,
	}
	if strings.EqualFold(cfg.Email.Provider, "resend") {
		required["email.resend.api_key/RESEND_API_KEY"] = cfg.Email.Resend.APIKey
	}
	if strings.EqualFold(cfg.LLM.DefaultProvider, "openai") {
		required["llm.openai.api_key/OPENAI_API_KEY"] = cfg.LLM.OpenAI.APIKey
	}
	if cfg.Billing.Scanner.Enabled {
		required["billing.webhook_secret/BILLING_WEBHOOK_SECRET"] = cfg.Billing.WebhookSecret
	}
	for name, value := range required {
		if isMissingSecret(value) {
			return fmt.Errorf("%s is required for APP_ENV=%s", name, env)
		}
	}
	return nil
}

func applyMapEnvOverrides(target map[string]string, prefix string) {
	if target == nil {
		return
	}
	for _, item := range os.Environ() {
		k, v, ok := strings.Cut(item, "=")
		if !ok || !strings.HasPrefix(k, prefix) {
			continue
		}
		key := strings.TrimPrefix(k, prefix)
		key = strings.ReplaceAll(key, "_", "-")
		if strings.TrimSpace(key) != "" && strings.TrimSpace(v) != "" {
			target[key] = strings.TrimSpace(v)
		}
	}
}

func applyPaymentMethodEnvOverrides(items []PaymentMethodConfig) {
	for i := range items {
		network := strings.ToUpper(strings.TrimSpace(items[i].Network))
		if network == "" {
			continue
		}
		if v := strings.TrimSpace(os.Getenv("BILLING_" + network + "_TOKEN_ADDRESS")); v != "" {
			items[i].TokenAddress = v
		}
		if v := strings.TrimSpace(os.Getenv("BILLING_" + network + "_RECEIVER_ADDRESS")); v != "" {
			items[i].ReceiverAddress = v
		}
	}
}

func isMissingSecret(value string) bool {
	v := strings.TrimSpace(value)
	return v == "" || strings.HasPrefix(v, "TODO_") || strings.Contains(v, "TODO_")
}

func applyAlertConfig(env string, service string, cfg *AlertConfig) {
	if cfg == nil {
		return
	}
	if v := strings.TrimSpace(os.Getenv("ALERT_ENABLED")); v != "" {
		cfg.Enabled = parseBool(v)
	}
	if v := strings.TrimSpace(os.Getenv("ALERT_ENVIRONMENT")); v != "" {
		cfg.Environment = v
	}
	if strings.TrimSpace(cfg.Environment) == "" {
		cfg.Environment = env
	}
	if v := strings.TrimSpace(os.Getenv("ALERT_SERVICE")); v != "" {
		cfg.Service = v
	}
	if strings.TrimSpace(cfg.Service) == "" {
		if service == "" {
			cfg.Service = "backend-api"
		} else {
			cfg.Service = "backend-" + service
		}
	}
	if v := strings.TrimSpace(os.Getenv("LARK_ALERT_WEBHOOK_URL")); v != "" {
		cfg.Lark.WebhookURL = v
	}
	if v := strings.TrimSpace(os.Getenv("LARK_ALERT_SECRET")); v != "" {
		cfg.Lark.Secret = v
	}
	if cfg.RateLimit.DedupeWindowSeconds <= 0 {
		cfg.RateLimit.DedupeWindowSeconds = 300
	}
	if cfg.RateLimit.MaxPerMinute <= 0 {
		cfg.RateLimit.MaxPerMinute = 10
	}
	if !cfg.Levels.Critical && !cfg.Levels.Error && !cfg.Levels.Warning && !cfg.Levels.Info {
		cfg.Levels.Critical = true
		cfg.Levels.Error = true
		cfg.Levels.Warning = true
	}
}

func parseBool(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "y", "on", "enabled":
		return true
	default:
		return false
	}
}

func applyJWTConfig(env string, cfg *JWTConfig) error {
	const (
		defaultAccessExpireSeconds  int64 = 7200
		defaultRefreshExpireSeconds int64 = 2592000
	)

	secret := strings.TrimSpace(cfg.Secret)
	if v := strings.TrimSpace(os.Getenv("JWT_SECRET")); v != "" {
		secret = v
	}
	if strings.HasPrefix(secret, "TODO_") {
		secret = ""
	}
	if secret == "" {
		if env != "local" {
			return fmt.Errorf("jwt.secret is required for APP_ENV=%s; set a stable test/prod secret", env)
		}
		secret = "octo-agent-local-secret"
	}
	cfg.Secret = secret
	_ = os.Setenv("JWT_SECRET", secret)

	accessExp := cfg.AccessExpireSeconds
	if v := strings.TrimSpace(os.Getenv("JWT_ACCESS_EXPIRE_SECONDS")); v != "" {
		if parsed, err := strconv.ParseInt(v, 10, 64); err == nil && parsed > 0 {
			accessExp = parsed
		}
	}
	if accessExp <= 0 {
		accessExp = defaultAccessExpireSeconds
	}
	cfg.AccessExpireSeconds = accessExp
	_ = os.Setenv("JWT_ACCESS_EXPIRE_SECONDS", strconv.FormatInt(accessExp, 10))

	refreshExp := cfg.RefreshExpireSeconds
	if v := strings.TrimSpace(os.Getenv("JWT_REFRESH_EXPIRE_SECONDS")); v != "" {
		if parsed, err := strconv.ParseInt(v, 10, 64); err == nil && parsed > 0 {
			refreshExp = parsed
		}
	}
	if refreshExp <= 0 {
		refreshExp = defaultRefreshExpireSeconds
	}
	if refreshExp < accessExp {
		return fmt.Errorf("jwt.refresh_expire_seconds must be greater than or equal to jwt.access_expire_seconds")
	}
	cfg.RefreshExpireSeconds = refreshExp
	_ = os.Setenv("JWT_REFRESH_EXPIRE_SECONDS", strconv.FormatInt(refreshExp, 10))
	return nil
}

func normalizeConfigService(v string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "":
		return "", nil
	case "api":
		return "api", nil
	case "admin", "admin-api":
		return "admin", nil
	default:
		return "", fmt.Errorf("unsupported APP_SERVICE=%s, expected api or admin", v)
	}
}

func configFilePath(env, service string) string {
	if service == "" {
		return fmt.Sprintf("configs/config.%s.yaml", env)
	}
	return fmt.Sprintf("configs/config.%s.%s.yaml", env, service)
}

func normalizeResendFromEmail(v string) string {
	v = strings.TrimSpace(v)
	if v == "" || strings.Contains(v, "@") {
		return v
	}
	return fmt.Sprintf("Octo Agent <no-reply@%s>", v)
}
