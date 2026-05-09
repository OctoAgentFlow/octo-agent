package email

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"octo-agent/backend/internal/config"

	"go.uber.org/zap"
)

var ErrResendConfigMissing = errors.New("resend config missing required fields")

const resendEmailsEndpoint = "https://api.resend.com/emails"

type ResendSender struct {
	client *http.Client
	apiKey string
	from   string
}

type resendEmailRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Text    string   `json:"text,omitempty"`
	HTML    string   `json:"html,omitempty"`
}

func NewResendSender(cfg config.ResendConfig) (*ResendSender, error) {
	from := strings.TrimSpace(cfg.FromEmail)
	if strings.TrimSpace(cfg.APIKey) == "" || from == "" {
		return nil, ErrResendConfigMissing
	}
	if _, err := mail.ParseAddress(from); err != nil {
		return nil, fmt.Errorf("invalid resend from_email: %w", err)
	}
	return &ResendSender{
		client: &http.Client{Timeout: 10 * time.Second},
		apiKey: cfg.APIKey,
		from:   from,
	}, nil
}

func (s *ResendSender) Send(ctx context.Context, message Message) error {
	to := strings.TrimSpace(message.To)
	if to == "" || strings.TrimSpace(message.Subject) == "" {
		return ErrEmailArgInvalid
	}
	if _, err := mail.ParseAddress(to); err != nil {
		return ErrEmailArgInvalid
	}
	if strings.TrimSpace(message.Text) == "" && strings.TrimSpace(message.HTML) == "" {
		return ErrEmailArgInvalid
	}

	body, err := json.Marshal(resendEmailRequest{
		From:    s.from,
		To:      []string{to},
		Subject: message.Subject,
		Text:    message.Text,
		HTML:    message.HTML,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resendEmailsEndpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		zap.L().Error("resend send email failed", zap.String("to", to), zap.Error(err))
		return fmt.Errorf("resend send email failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err := fmt.Errorf("resend send email failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
		zap.L().Error("resend send email failed", zap.String("to", to), zap.Int("status", resp.StatusCode), zap.Error(err))
		return err
	}

	zap.L().Info("resend send email success", zap.String("to", to), zap.String("from", s.from))
	return nil
}
