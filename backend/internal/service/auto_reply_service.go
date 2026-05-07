package service

import (
	"context"
	"errors"
	"math/rand/v2"
	"strings"
	"time"

	"octo-agent/backend/internal/integration/twitter"
	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/pkg/requestid"
	"octo-agent/backend/internal/pkg/subscription"
	"octo-agent/backend/internal/repository"

	"go.uber.org/zap"
)

var autoReplyTemplates = []string{
	"Thanks for your comment!",
	"Appreciate you stopping by!",
	"Thanks for chiming in!",
	"Great to hear from you—thank you!",
	"Thanks for the reply!",
}

const (
	autoReplyPreviewRunes = 160
	replyReservationStale = 30 * time.Minute
)

type AutoReplyService struct {
	accountRepo    *repository.TwitterAccountRepository
	automationRepo *repository.AutomationRepository
	activityRepo   *repository.ActivityRepository
	replyResRepo   *repository.ReplyReservationRepository
	userRepo       *repository.UserRepository
}

func NewAutoReplyService(
	accountRepo *repository.TwitterAccountRepository,
	automationRepo *repository.AutomationRepository,
	activityRepo *repository.ActivityRepository,
	replyResRepo *repository.ReplyReservationRepository,
	userRepo *repository.UserRepository,
) *AutoReplyService {
	return &AutoReplyService{
		accountRepo:    accountRepo,
		automationRepo: automationRepo,
		activityRepo:   activityRepo,
		replyResRepo:   replyResRepo,
		userRepo:       userRepo,
	}
}

func pickAutoReplyTemplate() string {
	return autoReplyTemplates[rand.IntN(len(autoReplyTemplates))]
}

func truncateReplyPreview(s string, maxRunes int) string {
	s = strings.TrimSpace(s)
	if maxRunes <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= maxRunes {
		return s
	}
	return string(r[:maxRunes]) + "…"
}

func replyAuthorDisplay(username string) string {
	u := strings.TrimSpace(strings.TrimPrefix(username, "@"))
	if u == "" {
		return "@user"
	}
	return "@" + u
}

// RunTick processes users with reply automation enabled (one successful reply per user max per tick).
func (s *AutoReplyService) RunTick(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if s.replyResRepo != nil {
		if n, err := s.replyResRepo.DeleteOrphansWithoutActivity(time.Now().Add(-replyReservationStale)); err != nil {
			zap.L().Warn("auto reply: cleanup orphan reservations failed", zap.Error(err))
		} else if n > 0 {
			zap.L().Info("auto reply: removed orphan reservations", zap.Int64("rows", n))
		}
	}
	ids, err := s.automationRepo.ListUserIDsWithReplyAutomationEnabled(100)
	if err != nil {
		zap.L().Warn("auto reply: list users failed", zap.Error(err))
		return
	}
	for _, uid := range ids {
		runCtx := requestid.NewContext(ctx, "scheduler")
		if err := s.runOnceForUser(runCtx, uid); err != nil {
			zap.L().Warn("auto reply: user tick failed", zap.Uint("user_id", uid), zap.Error(err))
		}
	}
}

func (s *AutoReplyService) runOnceForUser(ctx context.Context, userID uint) error {
	rid := requestid.FromContext(ctx)
	if rid == "" {
		rid = "scheduler"
	}
	base := []zap.Field{zap.String("request_id", rid), zap.Uint("user_id", userID)}
	now := time.Now().UTC()

	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	if err := subscription.AssertUserMayProduceContent(u, now); err != nil {
		zap.L().Debug("auto reply: skip (subscription)", append(base, zap.Error(err))...)
		return nil
	}

	if hit, why := s.replyLimitsExceeded(userID, now); hit {
		zap.L().Debug("auto reply: skip (limits)", append(base, zap.String("reason", why))...)
		return nil
	}

	accts, err := s.accountRepo.ListByUserID(userID)
	if err != nil {
		return err
	}
	for _, acc := range accts {
		twid := strings.TrimSpace(acc.TwitterUserID)
		tok := strings.TrimSpace(acc.AccessToken)
		if twid == "" || tok == "" {
			continue
		}
		handle := formatXAccountHandle(acc.Username)
		rootIDs, err := twitter.ListUserRootTweetIDs(ctx, nil, tok, twid, 8)
		if err != nil {
			zap.L().Warn("auto reply: list user tweets failed", append(base,
				zap.Uint("x_account_id", acc.ID),
				zap.String("account_handle", handle),
				zap.Error(err))...)
			continue
		}
		for _, rootID := range rootIDs {
			replies, err := twitter.ListDirectRepliesFromOthers(ctx, nil, tok, rootID, twid)
			if err != nil {
				zap.L().Warn("auto reply: conversation search failed", append(base,
					zap.String("root_tweet_id", rootID),
					zap.String("account_handle", handle),
					zap.Error(err))...)
				continue
			}
			for _, c := range replies {
				if c.TweetID == "" {
					continue
				}
				ok, err := s.activityRepo.HasSuccessfulReplyToRefTweet(userID, c.TweetID)
				if err != nil {
					return err
				}
				if ok {
					continue
				}
				if s.replyResRepo != nil {
					acquired, err := s.replyResRepo.TryAcquire(userID, c.TweetID)
					if err != nil {
						return err
					}
					if !acquired {
						continue
					}
				}
				template := pickAutoReplyTemplate()
				toUser := replyAuthorDisplay(c.AuthorUsername)
				toPrev := truncateReplyPreview(c.Text, autoReplyPreviewRunes)
				outPrev := truncateReplyPreview(template, autoReplyPreviewRunes)
				at := time.Now().UTC()
				tweetID, apiErr := twitter.CreateReplyTweet(ctx, tok, template, c.TweetID)
				if apiErr != nil {
					if s.replyResRepo != nil {
						_ = s.replyResRepo.Release(userID, c.TweetID)
					}
					msg := truncateErrMsg(apiErr.Error())
					var pub *twitter.PublishError
					if errors.As(apiErr, &pub) {
						msg = truncateErrMsg(pub.Error())
					}
					log := &model.ActivityLog{
						UserID:              userID,
						XAccountID:          acc.ID,
						Type:                "reply",
						Status:              "failed",
						PreviewKey:          "activity.preview.replyFailed",
						AccountHandle:       handle,
						ExecutedAt:          at,
						ErrorMessage:        msg,
						ReplyCommentTweetID: c.TweetID,
						ReplyToUsername:     toUser,
						ReplyToTextPreview:  toPrev,
						ReplyTextPreview:    outPrev,
					}
					if err := s.activityRepo.DB.Create(log).Error; err != nil {
						return err
					}
					zap.L().Warn("auto reply: x api rejected", append(base,
						zap.String("account_handle", handle),
						zap.String("comment_tweet_id", c.TweetID),
						zap.String("detail", msg))...)
					return nil
				}
				ref := c.TweetID
				log := &model.ActivityLog{
					UserID:              userID,
					XAccountID:          acc.ID,
					Type:                "reply",
					Status:              "success",
					PreviewKey:          "activity.preview.replySuccess",
					AccountHandle:       handle,
					ExecutedAt:          at,
					RefTweetID:          &ref,
					ReplyCommentTweetID: c.TweetID,
					ReplyToUsername:     toUser,
					ReplyToTextPreview:  toPrev,
					ReplyTextPreview:    outPrev,
				}
				if err := s.activityRepo.DB.Create(log).Error; err != nil {
					if s.replyResRepo != nil {
						_ = s.replyResRepo.Release(userID, c.TweetID)
					}
					return err
				}
				zap.L().Info("auto reply: published", append(base,
					zap.String("account_handle", handle),
					zap.String("comment_tweet_id", c.TweetID),
					zap.String("reply_tweet_id", tweetID),
				)...)
				return nil
			}
		}
	}
	return nil
}

func (s *AutoReplyService) replyLimitsExceeded(userID uint, now time.Time) (hit bool, reason string) {
	cfg, err := s.automationRepo.GetByUserAndType(userID, repository.AutomationTypeReply)
	if err != nil {
		return false, ""
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	nDay, err := s.activityRepo.CountReplySuccessBetween(userID, dayStart, now)
	if err != nil {
		zap.L().Warn("auto reply: count daily successes failed", zap.Uint("user_id", userID), zap.Error(err))
		return false, ""
	}
	if cfg.FrequencyDailyLimit > 0 && int(nDay) >= cfg.FrequencyDailyLimit {
		return true, "daily_limit"
	}
	hourAgo := now.Add(-time.Hour)
	nHour, err := s.activityRepo.CountReplySuccessBetween(userID, hourAgo, now)
	if err != nil {
		zap.L().Warn("auto reply: count hourly successes failed", zap.Uint("user_id", userID), zap.Error(err))
		return false, ""
	}
	if cfg.SafetyMaxPerHour > 0 && int(nHour) >= cfg.SafetyMaxPerHour {
		return true, "hourly_limit"
	}
	return false, ""
}
