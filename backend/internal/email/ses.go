package email

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"octo-agent/backend/internal/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ses"
	"github.com/aws/aws-sdk-go-v2/service/ses/types"
	"go.uber.org/zap"
)

var (
	ErrSESConfigMissing = errors.New("ses config missing required fields")
	ErrEmailArgInvalid  = errors.New("email arguments invalid")
)

type SESSender struct {
	client *ses.Client
	from   string
	region string
}

func NewSESSender(cfg config.SESConfig) (*SESSender, error) {
	if strings.TrimSpace(cfg.Region) == "" ||
		strings.TrimSpace(cfg.AccessKeyID) == "" ||
		strings.TrimSpace(cfg.SecretAccessKey) == "" ||
		strings.TrimSpace(cfg.FromEmail) == "" {
		return nil, ErrSESConfigMissing
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID,
			cfg.SecretAccessKey,
			"",
		)),
	)
	if err != nil {
		return nil, fmt.Errorf("load ses aws config failed: %w", err)
	}

	return &SESSender{
		client: ses.NewFromConfig(awsCfg),
		from:   cfg.FromEmail,
		region: cfg.Region,
	}, nil
}

func (s *SESSender) Send(ctx context.Context, message Message) error {
	if strings.TrimSpace(message.To) == "" || strings.TrimSpace(message.Subject) == "" {
		return ErrEmailArgInvalid
	}
	if strings.TrimSpace(message.Text) == "" && strings.TrimSpace(message.HTML) == "" {
		return ErrEmailArgInvalid
	}

	body := &types.Body{}
	if strings.TrimSpace(message.Text) != "" {
		body.Text = &types.Content{Data: aws.String(message.Text), Charset: aws.String("UTF-8")}
	}
	if strings.TrimSpace(message.HTML) != "" {
		body.Html = &types.Content{Data: aws.String(message.HTML), Charset: aws.String("UTF-8")}
	}

	_, err := s.client.SendEmail(ctx, &ses.SendEmailInput{
		Source: aws.String(s.from),
		Destination: &types.Destination{
			ToAddresses: []string{message.To},
		},
		Message: &types.Message{
			Subject: &types.Content{Data: aws.String(message.Subject), Charset: aws.String("UTF-8")},
			Body:    body,
		},
	})
	if err != nil {
		zap.L().Error("ses send email failed",
			zap.String("to", message.To),
			zap.String("from", s.from),
			zap.String("region", s.region),
			zap.Error(err),
		)
		return fmt.Errorf("ses send email failed: %w", err)
	}

	zap.L().Info("ses send email success",
		zap.String("to", message.To),
		zap.String("from", s.from),
		zap.String("region", s.region),
	)
	return nil
}
