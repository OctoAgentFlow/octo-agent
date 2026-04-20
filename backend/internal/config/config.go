package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"gopkg.in/yaml.v3"
)

type Config struct {
	API    ServerConfig   `yaml:"api"`
	Admin  ServerConfig   `yaml:"admin"`
	MySQL  MySQLConfig    `yaml:"mysql"`
	Log    LogConfig      `yaml:"log"`
	Email  EmailConfig    `yaml:"email"`
	App    AppConfig      `yaml:"app"`
	XOAuth XOAuthConfig   `yaml:"x_oauth"`
	Billing BillingConfig `yaml:"billing"`
}

// BillingConfig holds USDT payment settings (loaded from YAML; do not hardcode in code).
type BillingConfig struct {
	OrderTTLMinutes int    `yaml:"order_ttl_minutes"`
	WebhookSecret   string `yaml:"webhook_secret"`
	// RpcURLs maps chain id as string (e.g. "56", "1") to JSON-RPC HTTP endpoint for EVM verification.
	RpcURLs        map[string]string           `yaml:"rpc_urls"`
	PaymentMethods []PaymentMethodConfig       `yaml:"payment_methods"`
	Plans          map[string]BillingPlanEntry `yaml:"plans"`
}

// PaymentMethodConfig is one USDT route (MVP: BEP20 only).
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
}

// XOAuthConfig holds X (Twitter) OAuth 2.0 PKCE settings for account linking.
type XOAuthConfig struct {
	ClientID     string `yaml:"client_id"`
	ClientSecret string `yaml:"client_secret"`
	RedirectURI  string `yaml:"redirect_uri"`
	StateSecret  string `yaml:"state_secret"`
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
	Provider string    `yaml:"provider"`
	SES      SESConfig `yaml:"ses"`
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

	path := fmt.Sprintf("configs/config.%s.yaml", env)
	if _, err := os.Stat(path); err != nil {
		return nil, fmt.Errorf("config file not found for APP_ENV=%s: %s", env, path)
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
		cfg.Email.Provider = "ses"
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
	if cfg.Billing.OrderTTLMinutes <= 0 {
		cfg.Billing.OrderTTLMinutes = 30
	}
	if cfg.Billing.RpcURLs == nil {
		cfg.Billing.RpcURLs = map[string]string{}
	}
	return &cfg, nil
}
