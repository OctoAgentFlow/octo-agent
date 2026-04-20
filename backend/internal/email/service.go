package email

import (
	"context"
	"fmt"
	"strings"
)

type Service struct {
	sender EmailSender
}

func NewService(sender EmailSender) *Service {
	return &Service{sender: sender}
}

func (s *Service) SendVerificationCode(ctx context.Context, email string, code string) error {
	if s == nil || s.sender == nil {
		return fmt.Errorf("email service sender not initialized")
	}
	if strings.TrimSpace(email) == "" || strings.TrimSpace(code) == "" {
		return ErrEmailArgInvalid
	}

	subject := "Your Verification Code"
	textBody := fmt.Sprintf(
		"Your verification code is: %s\n\nThis code expires in 5 minutes.\n\nFor your security, please do not share this code with anyone.",
		code,
	)
	htmlBody := buildVerificationCodeHTML(code)

	return s.sender.Send(ctx, Message{
		To:      email,
		Subject: subject,
		Text:    textBody,
		HTML:    htmlBody,
	})
}

func buildVerificationCodeHTML(code string) string {
	return fmt.Sprintf(`<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Verification Code</title>
</head>
<body style="margin:0;padding:0;background:#070b18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#e7ecff;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%%" style="background:#070b18;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%%" style="max-width:560px;background:linear-gradient(180deg,#101833 0%%,#0b1228 100%%);border:1px solid rgba(116,155,255,0.24);border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 20px 28px;">
              <p style="margin:0 0 10px 0;font-size:12px;line-height:18px;letter-spacing:0.08em;color:#9fb2ff;text-transform:uppercase;">Octo-Agent Security</p>
              <h1 style="margin:0 0 10px 0;font-size:24px;line-height:32px;font-weight:700;color:#ffffff;">Your Verification Code</h1>
              <p style="margin:0;font-size:14px;line-height:22px;color:#c7d3ff;">
                Use the code below to continue. It will expire in 5 minutes.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 8px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%%" style="border-radius:14px;background:linear-gradient(90deg,#3b82f6 0%%,#8b5cf6 100%%);">
                <tr>
                  <td align="center" style="padding:14px 8px;">
                    <span style="display:inline-block;font-size:32px;line-height:36px;letter-spacing:0.22em;font-weight:700;color:#ffffff;">%s</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px 28px;">
              <p style="margin:0;font-size:13px;line-height:20px;color:#9eb0e8;">
                If you did not request this code, please ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px 28px 28px;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#7f91c9;">
                For your security, never share this code with anyone.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`, code)
}
