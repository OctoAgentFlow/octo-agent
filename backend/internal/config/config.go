package config

import (
	"fmt"
	"os"
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
	AdminAuth  AdminAuthConfig  `yaml:"admin_auth"`
	XOAuth     XOAuthConfig     `yaml:"x_oauth"`
	XPublisher XPublisherConfig `yaml:"x_publisher"`
	LLM        LLMConfig        `yaml:"llm"`
	Billing    BillingConfig    `yaml:"billing"`
}

// BillingConfig holds USDT payment settings (loaded from YAML; do not hardcode in code).
type BillingConfig struct {
	OrderTTLMinutes int    `yaml:"order_ttl_minutes"`
	WebhookSecret   string `yaml:"webhook_secret"`
	// RpcURLs maps chain id as string (e.g. "56", "1") to JSON-RPC HTTP endpoint for EVM verification.
	RpcURLs map[string]string `yaml:"rpc_urls"`
	// WssURLs maps chain id as string to WebSocket endpoints for future chain listeners.
	WssURLs map[string]string `yaml:"wss_urls"`
	// ExplorerAPIKeys stores per-explorer API keys for future reconciliation fallbacks.
	ExplorerAPIKeys map[string]string           `yaml:"explorer_api_keys"`
	PaymentMethods  []PaymentMethodConfig       `yaml:"payment_methods"`
	Plans           map[string]BillingPlanEntry `yaml:"plans"`
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

// AdminAuthConfig controls passwordless admin-console login.
type AdminAuthConfig struct {
	Emails         []string `yaml:"emails"`
	CodeTTLSeconds int      `yaml:"code_ttl_seconds"`
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
	RealPublishEnabled        bool `yaml:"real_publish_enabled"`
	ManualPublishEnabled      bool `yaml:"manual_publish_enabled"`
	PerAccountDailyLimit      int  `yaml:"per_account_daily_limit"`
	PerAccountMinIntervalSecs int  `yaml:"per_account_min_interval_seconds"`
	DryRun                    bool `yaml:"dry_run"`
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
	if cfg.Billing.RpcURLs == nil {
		cfg.Billing.RpcURLs = map[string]string{}
	}
	if cfg.Billing.WssURLs == nil {
		cfg.Billing.WssURLs = map[string]string{}
	}
	if cfg.Billing.ExplorerAPIKeys == nil {
		cfg.Billing.ExplorerAPIKeys = map[string]string{}
	}
	return &cfg, nil
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
