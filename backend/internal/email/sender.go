package email

import "context"

type EmailSender interface {
	Send(ctx context.Context, message Message) error
}
