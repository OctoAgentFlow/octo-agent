package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"octo-agent/backend/internal/config"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

var appLogger *zap.Logger

func Init(cfg config.LogConfig, defaultOutputPath string) (*zap.Logger, error) {
	outputPath := cfg.OutputPath
	if outputPath == "" {
		outputPath = defaultOutputPath
	}
	if outputPath == "" {
		outputPath = "logs/app.log"
	}

	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return nil, fmt.Errorf("create log directory failed: %w", err)
	}

	level := parseLevel(cfg.Level)
	encoder := buildEncoder(cfg.Encoding)
	writer := zapcore.AddSync(&lumberjack.Logger{
		Filename:   outputPath,
		MaxSize:    cfg.MaxSize,
		MaxBackups: cfg.MaxBackups,
		MaxAge:     cfg.MaxAge,
		Compress:   cfg.Compress,
	})

	core := zapcore.NewCore(encoder, writer, level)
	appLogger = zap.New(core, zap.AddCaller(), zap.AddStacktrace(zapcore.ErrorLevel))
	zap.ReplaceGlobals(appLogger)

	return appLogger, nil
}

func Sync() {
	if appLogger != nil {
		_ = appLogger.Sync()
	}
}

func parseLevel(raw string) zapcore.Level {
	switch strings.ToLower(raw) {
	case "debug":
		return zapcore.DebugLevel
	case "info":
		return zapcore.InfoLevel
	case "warn", "warning":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	default:
		return zapcore.InfoLevel
	}
}

func buildEncoder(encoding string) zapcore.Encoder {
	encCfg := zapcore.EncoderConfig{
		TimeKey:        "time",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "caller",
		MessageKey:     "msg",
		StacktraceKey:  "stacktrace",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    zapcore.LowercaseLevelEncoder,
		EncodeTime:     zapcore.TimeEncoderOfLayout(time.RFC3339),
		EncodeDuration: zapcore.SecondsDurationEncoder,
		EncodeCaller:   zapcore.ShortCallerEncoder,
	}
	if strings.EqualFold(encoding, "console") {
		return zapcore.NewConsoleEncoder(encCfg)
	}
	return zapcore.NewJSONEncoder(encCfg)
}
