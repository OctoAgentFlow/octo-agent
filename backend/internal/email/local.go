package email

import (
	"context"
	"regexp"
	"strings"

	"go.uber.org/zap"
)

var verificationCodePattern = regexp.MustCompile(`\b\d{6}\b`)

type LocalSender struct{}

func NewLocalSender() *LocalSender {
	return &LocalSender{}
}

func (s *LocalSender) Send(ctx context.Context, message Message) error {
	if strings.TrimSpace(message.To) == "" || strings.TrimSpace(message.Subject) == "" {
		return ErrEmailArgInvalid
	}
	code := verificationCodePattern.FindString(message.Text)
	zap.L().Info("local email accepted",
		zap.String("to", message.To),
		zap.String("subject", message.Subject),
		zap.String("verification_code", code),
	)
	return nil
}
