package repository

import (
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

type TwitterAccountRepository struct{ DB *gorm.DB }

func NewTwitterAccountRepository(db *gorm.DB) *TwitterAccountRepository {
	return &TwitterAccountRepository{DB: db}
}

func (r *TwitterAccountRepository) ListByUserID(userID uint) ([]model.TwitterAccount, error) {
	var accounts []model.TwitterAccount
	if err := r.DB.Where("user_id = ? AND status <> ?", userID, "disconnected").Order("id DESC").Find(&accounts).Error; err != nil {
		return nil, err
	}
	return accounts, nil
}

func (r *TwitterAccountRepository) CountByUserID(userID uint) (int64, error) {
	var count int64
	if err := r.DB.Model(&model.TwitterAccount{}).Where("user_id = ? AND status <> ?", userID, "disconnected").Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *TwitterAccountRepository) CountByUserIDExcludingIdentity(userID uint, twitterUserID, username string) (int64, error) {
	var count int64
	q := r.DB.Model(&model.TwitterAccount{}).Where("user_id = ? AND status <> ?", userID, "disconnected")
	if twitterUserID != "" && username != "" {
		q = q.Where("NOT (twitter_user_id = ? OR username = ?)", twitterUserID, username)
	} else if twitterUserID != "" {
		q = q.Where("twitter_user_id <> ?", twitterUserID)
	} else if username != "" {
		q = q.Where("username <> ?", username)
	}
	if err := q.Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *TwitterAccountRepository) UpsertByUser(userID uint, account *model.TwitterAccount) (*model.TwitterAccount, error) {
	var existed model.TwitterAccount
	err := r.DB.Where("user_id = ? AND username = ?", userID, account.Username).First(&existed).Error
	now := time.Now()
	if err == nil {
		existed.Platform = "x"
		existed.TwitterUserID = account.TwitterUserID
		existed.DisplayName = account.DisplayName
		existed.AvatarURL = account.AvatarURL
		existed.Status = "connected"
		existed.Followers = account.Followers
		existed.LastSyncedAt = &now
		existed.AccessToken = account.AccessToken
		existed.RefreshToken = account.RefreshToken
		existed.OAuthScopes = account.OAuthScopes
		if saveErr := r.DB.Save(&existed).Error; saveErr != nil {
			return nil, saveErr
		}
		return &existed, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	account.UserID = userID
	account.Platform = "x"
	account.Status = "connected"
	account.LastSyncedAt = &now
	if err := r.DB.Create(account).Error; err != nil {
		return nil, err
	}
	return account, nil
}

// GetConnectedByUserAndAccountID returns a non-disconnected X account for the user, or ErrRecordNotFound.
func (r *TwitterAccountRepository) GetConnectedByUserAndAccountID(userID, accountID uint) (*model.TwitterAccount, error) {
	var a model.TwitterAccount
	err := r.DB.Where("id = ? AND user_id = ? AND status <> ?", accountID, userID, "disconnected").First(&a).Error
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *TwitterAccountRepository) DeleteByUserAndID(userID, id uint) error {
	return r.DB.Model(&model.TwitterAccount{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(map[string]any{
			"status":        "disconnected",
			"access_token":  "",
			"refresh_token": "",
		}).Error
}

func (r *TwitterAccountRepository) MarkNeedsReauth(userID, id uint) error {
	return r.DB.Model(&model.TwitterAccount{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(map[string]any{
			"status":     "needs_reauth",
			"updated_at": time.Now(),
		}).Error
}
