package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
	"gopkg.in/yaml.v3"
)

type Config struct {
	API   ServerConfig `yaml:"api"`
	Admin ServerConfig `yaml:"admin"`
	MySQL MySQLConfig  `yaml:"mysql"`
	Log   LogConfig    `yaml:"log"`
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

	if v := os.Getenv("MYSQL_PASSWORD"); v != "" {
		cfg.MySQL.Password = v
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
	return &cfg, nil
}
