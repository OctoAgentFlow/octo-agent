package repository

import (
	"errors"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
)

var ErrWalletAlreadyBoundToAnotherUser = errors.New("wallet already bound to another user")

type WalletRepository struct {
	DB *gorm.DB
}

func NewWalletRepository(db *gorm.DB) *WalletRepository {
	return &WalletRepository{DB: db}
}

func (r *WalletRepository) CreateChallenge(ch *model.WalletChallenge) error {
	return r.DB.Create(ch).Error
}

func (r *WalletRepository) GetValidChallenge(challengeID string) (*model.WalletChallenge, error) {
	var ch model.WalletChallenge
	err := r.DB.Where("challenge_id = ? AND used_at IS NULL AND expired_at > ?", challengeID, time.Now()).
		First(&ch).Error
	if err != nil {
		return nil, err
	}
	return &ch, nil
}

func (r *WalletRepository) MarkChallengeUsed(id uint) error {
	now := time.Now()
	return r.DB.Model(&model.WalletChallenge{}).Where("id = ? AND used_at IS NULL", id).Update("used_at", &now).Error
}

func (r *WalletRepository) UpsertUserWallet(userID uint, address string, chainID int64) (*model.UserWallet, error) {
	var wallet model.UserWallet
	err := r.DB.Where("address = ? AND chain_id = ?", address, chainID).First(&wallet).Error
	now := time.Now()
	if err == nil {
		if wallet.UserID != userID {
			return nil, ErrWalletAlreadyBoundToAnotherUser
		}
		wallet.UserID = userID
		wallet.IsPrimary = true
		wallet.BoundAt = now
		wallet.UnboundAt = nil
		if saveErr := r.DB.Save(&wallet).Error; saveErr != nil {
			return nil, saveErr
		}
		return &wallet, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	wallet = model.UserWallet{
		UserID:    userID,
		Address:   address,
		ChainID:   chainID,
		IsPrimary: true,
		BoundAt:   now,
	}
	if err = r.DB.Create(&wallet).Error; err != nil {
		return nil, err
	}
	return &wallet, nil
}

func (r *WalletRepository) UnbindUserWallet(userID uint, address string, chainID int64) error {
	now := time.Now()
	q := r.DB.Model(&model.UserWallet{}).Where("user_id = ? AND unbound_at IS NULL", userID)
	if address != "" {
		q = q.Where("address = ?", address)
	}
	if chainID != 0 {
		q = q.Where("chain_id = ?", chainID)
	}
	return q.Updates(map[string]interface{}{
		"unbound_at": now,
		"is_primary": false,
	}).Error
}

func (r *WalletRepository) GetPrimaryWallet(userID uint) (*model.UserWallet, error) {
	var wallet model.UserWallet
	err := r.DB.Where("user_id = ? AND is_primary = ? AND unbound_at IS NULL", userID, true).
		Order("id DESC").
		First(&wallet).Error
	if err != nil {
		return nil, err
	}
	return &wallet, nil
}
