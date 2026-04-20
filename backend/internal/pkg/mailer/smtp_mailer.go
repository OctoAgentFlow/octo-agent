package mailer

import (
	"bytes"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"net"
	netmail "net/mail"
	"net/smtp"
	"strings"
	"time"

	"octo-agent/backend/internal/config"

	"go.uber.org/zap"
	gomail "gopkg.in/mail.v2"
)

type Mailer interface {
	Send(to, subject, body string) error
}

type SMTPMailer struct {
	cfg config.SMTPConfig
}

const smtpStepTimeout = 10 * time.Second

func NewSMTPMailer(cfg config.SMTPConfig) *SMTPMailer {
	return &SMTPMailer{cfg: cfg}
}

func (m *SMTPMailer) Send(to, subject, body string) error {
	logger := zap.L().With(
		zap.String("smtp_host", m.cfg.Host),
		zap.Int("smtp_port", m.cfg.Port),
		zap.String("smtp_from", m.cfg.From),
		zap.String("smtp_to", to),
	)
	logger.Info("smtp send started")

	msg := gomail.NewMessage()
	msg.SetHeader("From", m.cfg.From)
	msg.SetHeader("To", to)
	msg.SetHeader("Subject", subject)
	msg.SetHeader("Date", time.Now().UTC().Format(time.RFC1123Z))
	msg.SetHeader("Message-ID", buildMessageID(m.cfg.From))
	msg.SetHeader("X-Mailer", "Octo-Agent Mailer/1.0")
	msg.SetBody("text/plain; charset=UTF-8", body)

	serverAddr := fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.Port)
	dialer := net.Dialer{Timeout: smtpStepTimeout}
	conn, err := dialer.Dial("tcp", serverAddr)
	if err != nil {
		return fmt.Errorf("dial smtp failed: %w", err)
	}
	defer func() { _ = conn.Close() }()
	_ = conn.SetDeadline(time.Now().Add(smtpStepTimeout))

	client, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		return fmt.Errorf("create smtp client failed: %w", err)
	}

	if ok, _ := client.Extension("STARTTLS"); !ok {
		return fmt.Errorf("smtp server does not support STARTTLS")
	}
	if err := client.StartTLS(&tls.Config{
		ServerName: m.cfg.Host,
		MinVersion: tls.VersionTLS12,
	}); err != nil {
		return fmt.Errorf("starttls failed: %w", err)
	}
	_ = conn.SetDeadline(time.Now().Add(smtpStepTimeout))
	logger.Info("smtp starttls ok")

	if m.cfg.Username != "" {
		auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth failed: %w", err)
		}
		_ = conn.SetDeadline(time.Now().Add(smtpStepTimeout))
		logger.Info("smtp auth ok", zap.String("smtp_username", m.cfg.Username))
	}

	from := m.cfg.From
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp mail from failed: %w", err)
	}
	_ = conn.SetDeadline(time.Now().Add(smtpStepTimeout))
	logger.Info("smtp mail from accepted")
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt to failed: %w", err)
	}
	_ = conn.SetDeadline(time.Now().Add(smtpStepTimeout))
	logger.Info("smtp rcpt to accepted")

	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data failed: %w", err)
	}
	_ = conn.SetDeadline(time.Now().Add(smtpStepTimeout))
	logger.Info("smtp data channel opened")

	var buf bytes.Buffer
	_, err = msg.WriteTo(&buf)
	if err != nil {
		return fmt.Errorf("format message failed: %w", err)
	}
	logger.Info("smtp message payload prepared",
		zap.String("smtp_subject", subject),
		zap.Int("message_size_bytes", buf.Len()),
	)
	_, err = writer.Write(buf.Bytes())
	if err != nil {
		return fmt.Errorf("write message failed: %w", err)
	}
	_ = conn.SetDeadline(time.Now().Add(smtpStepTimeout))
	logger.Info("smtp message payload written")
	if err := writer.Close(); err != nil {
		return fmt.Errorf("smtp close data writer failed: %w", err)
	}
	_ = conn.SetDeadline(time.Now().Add(smtpStepTimeout))
	logger.Info("smtp data channel closed")
	if err := client.Quit(); err != nil {
		return fmt.Errorf("smtp quit failed: %w", err)
	}
	logger.Info("smtp send accepted by provider")
	return nil
}

func buildMessageID(from string) string {
	domain := "octo-agent.local"
	if addr, err := netmail.ParseAddress(from); err == nil {
		if parts := strings.Split(addr.Address, "@"); len(parts) == 2 && parts[1] != "" {
			domain = parts[1]
		}
	}
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("<%d@%s>", time.Now().UnixNano(), domain)
	}
	return fmt.Sprintf("<%d.%s@%s>", time.Now().UnixNano(), hex.EncodeToString(b[:]), domain)
}
