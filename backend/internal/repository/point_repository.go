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

func (r *PointRepository) Activities(now time.Time) ([]model.PointActivity, error) {
	now = now.UTC()
	var rows []model.PointActivity
	err := r.DB.
		Where("enabled = ?", true).
		Where("(starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)", now, now).
		Order("sort_order ASC, id ASC").
		Find(&rows).Error
	return rows, err
}

func (r *PointRepository) EarnedPointsInPeriod(userID uint, start, end time.Time) (int64, error) {
	var total int64
	err := r.DB.Model(&model.PointLedgerEntry{}).
		Select("COALESCE(SUM(points), 0)").
		Where("user_id = ? AND event_type = ? AND created_at >= ? AND created_at < ?", userID, "earn", start.UTC(), end.UTC()).
		Scan(&total).Error
	return total, err
}

func (r *PointRepository) DiscountPointsInPeriod(userID uint, start, end time.Time) (int64, error) {
	var frozen int64
	if err := r.DB.Model(&model.PointLedgerEntry{}).
		Select("COALESCE(SUM(points), 0)").
		Where("user_id = ? AND event_type = ? AND created_at >= ? AND created_at < ?", userID, "freeze", start.UTC(), end.UTC()).
		Scan(&frozen).Error; err != nil {
		return 0, err
	}
	var restored int64
	if err := r.DB.Model(&model.PointLedgerEntry{}).
		Select("COALESCE(SUM(points), 0)").
		Where("user_id = ? AND event_type IN ? AND created_at >= ? AND created_at < ?", userID, []string{"release", "refund"}, start.UTC(), end.UTC()).
		Scan(&restored).Error; err != nil {
		return 0, err
	}
	if frozen <= restored {
		return 0, nil
	}
	return frozen - restored, nil
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

func (r *PointRepository) RefundConsumedForOrder(tx *gorm.DB, userID, orderID uint, points int64, details string) error {
	if points <= 0 {
		return nil
	}
	var existing int64
	if err := tx.Model(&model.PointLedgerEntry{}).Where("unique_key = ?", fmt.Sprintf("refund_order:%d", orderID)).Count(&existing).Error; err != nil {
		return err
	}
	if existing > 0 {
		return nil
	}
	var consumed int64
	if err := tx.Model(&model.PointLedgerEntry{}).Where("unique_key = ?", fmt.Sprintf("consume_order:%d", orderID)).Count(&consumed).Error; err != nil {
		return err
	}
	if consumed == 0 {
		return r.ReleaseFrozenForOrder(tx, userID, orderID, points, details)
	}
	account, err := r.getOrCreateAccount(tx, userID, true)
	if err != nil {
		return err
	}
	account.Balance += points
	if account.LifetimeSpent > points {
		account.LifetimeSpent -= points
	} else {
		account.LifetimeSpent = 0
	}
	if err := tx.Save(account).Error; err != nil {
		return err
	}
	return tx.Create(&model.PointLedgerEntry{
		UserID:       userID,
		OrderID:      orderID,
		EventType:    "refund",
		Points:       points,
		BalanceAfter: account.Balance,
		FrozenAfter:  account.Frozen,
		UniqueKey:    fmt.Sprintf("refund_order:%d", orderID),
		Details:      details,
	}).Error
}

func (r *PointRepository) ReleaseExpiredOrderPoints(userID uint) error {
	return r.ReleaseOrderPointsByStatus(userID, []string{"expired", "cancelled", "refunded"}, "order_closed")
}

func (r *PointRepository) ReleaseExpiredOrderPointsByID(userID, orderID uint) error {
	return r.ReleaseOrderPointsByID(userID, orderID, []string{"expired", "cancelled", "refunded"}, "order_closed")
}

func (r *PointRepository) ReleaseOrderPointsByStatus(userID uint, statuses []string, reason string) error {
	if len(statuses) == 0 {
		return nil
	}
	db := r.DB.Where("status IN ? AND points_used > 0", statuses)
	if userID > 0 {
		db = db.Where("user_id = ?", userID)
	}
	var orders []model.BillingOrder
	if err := db.Find(&orders).Error; err != nil {
		return err
	}
	for _, order := range orders {
		if err := r.DB.Transaction(func(tx *gorm.DB) error {
			return r.restoreOrderPoints(tx, order, reason)
		}); err != nil {
			return err
		}
	}
	return nil
}

func (r *PointRepository) ReleaseOrderPointsByID(userID, orderID uint, statuses []string, reason string) error {
	if len(statuses) == 0 {
		return nil
	}
	var order model.BillingOrder
	q := r.DB.Where("id = ? AND status IN ? AND points_used > 0", orderID, statuses)
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
		return r.restoreOrderPoints(tx, order, reason)
	})
}

func (r *PointRepository) restoreOrderPoints(tx *gorm.DB, order model.BillingOrder, reason string) error {
	details := fmt.Sprintf(`{"reason":%q,"order_id":%d,"status":%q}`, reason, order.ID, order.Status)
	if order.Status == "refunded" {
		return r.RefundConsumedForOrder(tx, order.UserID, order.ID, order.PointsUsed, details)
	}
	return r.ReleaseFrozenForOrder(tx, order.UserID, order.ID, order.PointsUsed, details)
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
