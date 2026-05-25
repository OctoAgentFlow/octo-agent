package repository

import (
	"errors"
	"fmt"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type PointRepository struct{ DB *gorm.DB }

func NewPointRepository(db *gorm.DB) *PointRepository {
	return &PointRepository{DB: db}
}

func (r *PointRepository) Account(userID uint) (*model.UserPointAccount, error) {
	return r.getOrCreateAccount(r.DB, userID, false)
}

func (r *PointRepository) Ledger(userID uint, limit int) ([]model.PointLedgerEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var rows []model.PointLedgerEntry
	err := r.DB.Where("user_id = ?", userID).Order("id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *PointRepository) Claims(userID uint) ([]model.PointActivityClaim, error) {
	var rows []model.PointActivityClaim
	err := r.DB.Where("user_id = ?", userID).Order("id DESC").Limit(100).Find(&rows).Error
	return rows, err
}

func (r *PointRepository) EarnActivity(userID uint, activityCode, claimKey string, points int64, now time.Time, details string) error {
	if points <= 0 {
		return fmt.Errorf("points must be positive")
	}
	return r.DB.Transaction(func(tx *gorm.DB) error {
		claim := model.PointActivityClaim{
			UserID:       userID,
			ActivityCode: activityCode,
			ClaimKey:     claimKey,
			Points:       points,
			Status:       "claimed",
			ClaimedAt:    now.UTC(),
		}
		if err := tx.Create(&claim).Error; err != nil {
			return err
		}
		account, err := r.getOrCreateAccount(tx, userID, true)
		if err != nil {
			return err
		}
		account.Balance += points
		account.LifetimeEarned += points
		if err := tx.Save(account).Error; err != nil {
			return err
		}
		return tx.Create(&model.PointLedgerEntry{
			UserID:       userID,
			ActivityCode: activityCode,
			EventType:    "earn",
			Points:       points,
			BalanceAfter: account.Balance,
			FrozenAfter:  account.Frozen,
			UniqueKey:    fmt.Sprintf("earn:%d:%s:%s", userID, activityCode, claimKey),
			Details:      details,
		}).Error
	})
}

func (r *PointRepository) FreezeForOrder(tx *gorm.DB, userID, orderID uint, points int64, details string) error {
	if points <= 0 {
		return nil
	}
	account, err := r.getOrCreateAccount(tx, userID, true)
	if err != nil {
		return err
	}
	if account.Balance < points {
		return fmt.Errorf("insufficient points")
	}
	account.Balance -= points
	account.Frozen += points
	if err := tx.Save(account).Error; err != nil {
		return err
	}
	return tx.Create(&model.PointLedgerEntry{
		UserID:       userID,
		OrderID:      orderID,
		EventType:    "freeze",
		Points:       points,
		BalanceAfter: account.Balance,
		FrozenAfter:  account.Frozen,
		UniqueKey:    fmt.Sprintf("freeze_order:%d", orderID),
		Details:      details,
	}).Error
}

func (r *PointRepository) ConsumeFrozenForOrder(tx *gorm.DB, userID, orderID uint, points int64, details string) error {
	if points <= 0 {
		return nil
	}
	account, err := r.getOrCreateAccount(tx, userID, true)
	if err != nil {
		return err
	}
	if account.Frozen < points {
		return fmt.Errorf("insufficient frozen points")
	}
	account.Frozen -= points
	account.LifetimeSpent += points
	if err := tx.Save(account).Error; err != nil {
		return err
	}
	return tx.Create(&model.PointLedgerEntry{
		UserID:       userID,
		OrderID:      orderID,
		EventType:    "consume",
		Points:       points,
		BalanceAfter: account.Balance,
		FrozenAfter:  account.Frozen,
		UniqueKey:    fmt.Sprintf("consume_order:%d", orderID),
		Details:      details,
	}).Error
}

func (r *PointRepository) ReleaseFrozenForOrder(tx *gorm.DB, userID, orderID uint, points int64, details string) error {
	if points <= 0 {
		return nil
	}
	var existing int64
	if err := tx.Model(&model.PointLedgerEntry{}).Where("unique_key = ?", fmt.Sprintf("release_order:%d", orderID)).Count(&existing).Error; err != nil {
		return err
	}
	if existing > 0 {
		return nil
	}
	account, err := r.getOrCreateAccount(tx, userID, true)
	if err != nil {
		return err
	}
	if account.Frozen < points {
		points = account.Frozen
	}
	if points <= 0 {
		return nil
	}
	account.Frozen -= points
	account.Balance += points
	if err := tx.Save(account).Error; err != nil {
		return err
	}
	return tx.Create(&model.PointLedgerEntry{
		UserID:       userID,
		OrderID:      orderID,
		EventType:    "release",
		Points:       points,
		BalanceAfter: account.Balance,
		FrozenAfter:  account.Frozen,
		UniqueKey:    fmt.Sprintf("release_order:%d", orderID),
		Details:      details,
	}).Error
}

func (r *PointRepository) ReleaseExpiredOrderPoints(userID uint) error {
	db := r.DB.Where("status = ? AND points_used > 0", "expired")
	if userID > 0 {
		db = db.Where("user_id = ?", userID)
	}
	var orders []model.BillingOrder
	if err := db.Find(&orders).Error; err != nil {
		return err
	}
	for _, order := range orders {
		if err := r.DB.Transaction(func(tx *gorm.DB) error {
			return r.ReleaseFrozenForOrder(tx, order.UserID, order.ID, order.PointsUsed, fmt.Sprintf(`{"reason":"order_expired","order_id":%d}`, order.ID))
		}); err != nil {
			return err
		}
	}
	return nil
}

func (r *PointRepository) ReleaseExpiredOrderPointsByID(userID, orderID uint) error {
	var order model.BillingOrder
	q := r.DB.Where("id = ? AND status = ? AND points_used > 0", orderID, "expired")
	if userID > 0 {
		q = q.Where("user_id = ?", userID)
	}
	if err := q.First(&order).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	return r.DB.Transaction(func(tx *gorm.DB) error {
		return r.ReleaseFrozenForOrder(tx, order.UserID, order.ID, order.PointsUsed, fmt.Sprintf(`{"reason":"order_expired","order_id":%d}`, order.ID))
	})
}

func (r *PointRepository) getOrCreateAccount(tx *gorm.DB, userID uint, lock bool) (*model.UserPointAccount, error) {
	if tx == nil {
		tx = r.DB
	}
	var account model.UserPointAccount
	db := tx
	if lock {
		db = db.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	err := db.Where("user_id = ?", userID).First(&account).Error
	if err == nil {
		return &account, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	account = model.UserPointAccount{UserID: userID}
	if err := tx.Create(&account).Error; err != nil {
		return nil, err
	}
	if lock {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&account).Error; err != nil {
			return nil, err
		}
	}
	return &account, nil
}
