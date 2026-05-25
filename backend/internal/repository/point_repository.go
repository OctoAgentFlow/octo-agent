package repository

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type PointRepository struct{ DB *gorm.DB }

type PointRiskLimits struct {
	Enabled                       bool
	DailyEarnLimit                int64
	MonthlyDiscountLimit          int64
	LargeAdjustmentAlertThreshold int64
	PointExpiryDays               int
}

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

func (r *PointRepository) RedemptionCodes() ([]model.PointRedemptionCode, error) {
	var rows []model.PointRedemptionCode
	err := r.DB.Order("id DESC").Limit(100).Find(&rows).Error
	return rows, err
}

func (r *PointRepository) CreateRedemptionCode(code *model.PointRedemptionCode) error {
	return r.DB.Create(code).Error
}

func (r *PointRepository) RedeemCode(userID uint, rawCode string, now time.Time) error {
	codeValue := strings.ToUpper(strings.TrimSpace(rawCode))
	if codeValue == "" {
		return fmt.Errorf("invalid redemption code")
	}
	return r.DB.Transaction(func(tx *gorm.DB) error {
		var code model.PointRedemptionCode
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ? AND enabled = ?", codeValue, true).First(&code).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("redemption code not found")
			}
			return err
		}
		if code.StartsAt != nil && now.Before(*code.StartsAt) {
			return fmt.Errorf("redemption code is not active")
		}
		if code.EndsAt != nil && now.After(*code.EndsAt) {
			return fmt.Errorf("redemption code expired")
		}
		if code.MaxUses > 0 && code.UsedCount >= code.MaxUses {
			return fmt.Errorf("redemption code has reached its usage limit")
		}
		var userUses int64
		if err := tx.Model(&model.PointRedemptionClaim{}).Where("user_id = ? AND redemption_code_id = ?", userID, code.ID).Count(&userUses).Error; err != nil {
			return err
		}
		perUserUses := code.PerUserUses
		if perUserUses <= 0 {
			perUserUses = 1
		}
		if userUses >= perUserUses {
			return fmt.Errorf("redemption code already used")
		}
		claim := model.PointRedemptionClaim{
			UserID:           userID,
			RedemptionCodeID: code.ID,
			Code:             code.Code,
			Points:           code.Points,
			RedeemedAt:       now.UTC(),
			UniqueKey:        fmt.Sprintf("redeem:%d:%d:%d", userID, code.ID, userUses+1),
		}
		if err := tx.Create(&claim).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.PointRedemptionCode{}).Where("id = ?", code.ID).UpdateColumn("used_count", gorm.Expr("used_count + 1")).Error; err != nil {
			return err
		}
		redeemSeq := userUses + 1
		details := fmt.Sprintf(`{"redemption_code":%q,"redemption_code_id":%d,"redeem_seq":%d}`, code.Code, code.ID, redeemSeq)
		return r.AwardSystemPointsInTx(tx, userID, "redemption", fmt.Sprintf("code:%s:%d", code.Code, redeemSeq), "redemption_code", code.Points, fmt.Sprintf("redemption_code:%d:%d:%d", userID, code.ID, redeemSeq), details)
	})
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

func (r *PointRepository) RiskLimits() (PointRiskLimits, error) {
	var cfg model.PointRiskConfig
	err := r.DB.Where("code = ?", "default").First(&cfg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return PointRiskLimits{
			Enabled:                       true,
			DailyEarnLimit:                100,
			MonthlyDiscountLimit:          1000,
			LargeAdjustmentAlertThreshold: 200,
			PointExpiryDays:               365,
		}, nil
	}
	if err != nil {
		return PointRiskLimits{}, err
	}
	return PointRiskLimits{
		Enabled:                       cfg.Enabled,
		DailyEarnLimit:                cfg.DailyEarnLimit,
		MonthlyDiscountLimit:          cfg.MonthlyDiscountLimit,
		LargeAdjustmentAlertThreshold: cfg.LargeAdjustmentAlertThreshold,
		PointExpiryDays:               cfg.PointExpiryDays,
	}, nil
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
		if err := r.createGrant(tx, userID, points, now, "activity", fmt.Sprintf("%s:%s", activityCode, claimKey), activityCode, fmt.Sprintf("grant:earn:%d:%s:%s", userID, activityCode, claimKey), details); err != nil {
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

func (r *PointRepository) AdjustUserPoints(userID uint, points int64, uniqueKey, details string) error {
	if points == 0 {
		return fmt.Errorf("points must not be zero")
	}
	return r.DB.Transaction(func(tx *gorm.DB) error {
		account, err := r.getOrCreateAccount(tx, userID, true)
		if err != nil {
			return err
		}
		if points < 0 && account.Balance < -points {
			return fmt.Errorf("insufficient points")
		}
		account.Balance += points
		if points > 0 {
			account.LifetimeEarned += points
		} else {
			account.LifetimeSpent += -points
		}
		if err := tx.Save(account).Error; err != nil {
			return err
		}
		if points > 0 {
			if err := r.createGrant(tx, userID, points, time.Now().UTC(), "admin", uniqueKey, "", "grant:"+uniqueKey, details); err != nil {
				return err
			}
		} else if err := r.deductAvailableGrants(tx, userID, -points); err != nil {
			return err
		}
		return tx.Create(&model.PointLedgerEntry{
			UserID:       userID,
			EventType:    "adjust",
			Points:       points,
			BalanceAfter: account.Balance,
			FrozenAfter:  account.Frozen,
			UniqueKey:    uniqueKey,
			Details:      details,
		}).Error
	})
}

func (r *PointRepository) AwardSystemPoints(userID uint, sourceType, sourceID, activityCode string, points int64, uniqueKey, details string) error {
	return r.DB.Transaction(func(tx *gorm.DB) error {
		return r.AwardSystemPointsInTx(tx, userID, sourceType, sourceID, activityCode, points, uniqueKey, details)
	})
}

func (r *PointRepository) AwardSystemPointsInTx(tx *gorm.DB, userID uint, sourceType, sourceID, activityCode string, points int64, uniqueKey, details string) error {
	if points <= 0 {
		return fmt.Errorf("points must be positive")
	}
	now := time.Now().UTC()
	var existing int64
	if err := tx.Model(&model.PointLedgerEntry{}).Where("unique_key = ?", uniqueKey).Count(&existing).Error; err != nil {
		return err
	}
	if existing > 0 {
		return nil
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
	if err := r.createGrant(tx, userID, points, now, sourceType, sourceID, activityCode, "grant:"+uniqueKey, details); err != nil {
		return err
	}
	return tx.Create(&model.PointLedgerEntry{
		UserID:       userID,
		ActivityCode: activityCode,
		EventType:    "earn",
		Points:       points,
		BalanceAfter: account.Balance,
		FrozenAfter:  account.Frozen,
		UniqueKey:    uniqueKey,
		Details:      details,
	}).Error
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
	if err := r.freezeAvailableGrants(tx, userID, orderID, points); err != nil {
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
	if err := r.consumeFrozenGrants(tx, userID, orderID, points); err != nil {
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
	if err := r.releaseFrozenGrants(tx, userID, orderID, points); err != nil {
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
	if err := r.createGrant(tx, userID, points, time.Now().UTC(), "refund", fmt.Sprintf("order:%d", orderID), "", fmt.Sprintf("grant:refund_order:%d", orderID), details); err != nil {
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

func (r *PointRepository) createGrant(tx *gorm.DB, userID uint, points int64, now time.Time, sourceType, sourceID, activityCode, uniqueKey, details string) error {
	if points <= 0 {
		return nil
	}
	limits, err := r.RiskLimits()
	if err != nil {
		return err
	}
	var expiresAt *time.Time
	if limits.PointExpiryDays > 0 {
		t := now.UTC().AddDate(0, 0, limits.PointExpiryDays)
		expiresAt = &t
	}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.PointGrant{
		UserID:       userID,
		SourceType:   sourceType,
		SourceID:     sourceID,
		ActivityCode: activityCode,
		TotalPoints:  points,
		Remaining:    points,
		ExpiresAt:    expiresAt,
		UniqueKey:    uniqueKey,
		Details:      details,
	}).Error
}

func (r *PointRepository) freezeAvailableGrants(tx *gorm.DB, userID, orderID uint, points int64) error {
	if err := r.ensureGrantBackfill(tx, userID); err != nil {
		return err
	}
	var grants []model.PointGrant
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("user_id = ? AND remaining > 0 AND expired_at IS NULL", userID).
		Order("CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at ASC, id ASC").
		Find(&grants).Error; err != nil {
		return err
	}
	left := points
	for i := range grants {
		if left <= 0 {
			break
		}
		n := grants[i].Remaining
		if n > left {
			n = left
		}
		grants[i].Remaining -= n
		grants[i].Frozen += n
		if grants[i].Details == "" {
			grants[i].Details = fmt.Sprintf(`{"frozen_for_order_id":%d}`, orderID)
		}
		if err := tx.Save(&grants[i]).Error; err != nil {
			return err
		}
		left -= n
	}
	if left > 0 {
		return fmt.Errorf("insufficient point grants")
	}
	return nil
}

func (r *PointRepository) consumeFrozenGrants(tx *gorm.DB, userID, orderID uint, points int64) error {
	var grants []model.PointGrant
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("user_id = ? AND frozen > 0", userID).
		Order("CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at ASC, id ASC").
		Find(&grants).Error; err != nil {
		return err
	}
	left := points
	for i := range grants {
		if left <= 0 {
			break
		}
		n := grants[i].Frozen
		if n > left {
			n = left
		}
		grants[i].Frozen -= n
		if err := tx.Save(&grants[i]).Error; err != nil {
			return err
		}
		left -= n
	}
	if left > 0 {
		return fmt.Errorf("insufficient frozen point grants for order %d", orderID)
	}
	return nil
}

func (r *PointRepository) releaseFrozenGrants(tx *gorm.DB, userID, orderID uint, points int64) error {
	var grants []model.PointGrant
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("user_id = ? AND frozen > 0", userID).
		Order("CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at ASC, id ASC").
		Find(&grants).Error; err != nil {
		return err
	}
	left := points
	for i := range grants {
		if left <= 0 {
			break
		}
		n := grants[i].Frozen
		if n > left {
			n = left
		}
		grants[i].Frozen -= n
		grants[i].Remaining += n
		if err := tx.Save(&grants[i]).Error; err != nil {
			return err
		}
		left -= n
	}
	if left > 0 {
		return fmt.Errorf("insufficient frozen point grants to release order %d", orderID)
	}
	return nil
}

func (r *PointRepository) deductAvailableGrants(tx *gorm.DB, userID uint, points int64) error {
	if err := r.ensureGrantBackfill(tx, userID); err != nil {
		return err
	}
	var grants []model.PointGrant
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("user_id = ? AND remaining > 0 AND expired_at IS NULL", userID).
		Order("CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at ASC, id ASC").
		Find(&grants).Error; err != nil {
		return err
	}
	left := points
	for i := range grants {
		if left <= 0 {
			break
		}
		n := grants[i].Remaining
		if n > left {
			n = left
		}
		grants[i].Remaining -= n
		if err := tx.Save(&grants[i]).Error; err != nil {
			return err
		}
		left -= n
	}
	if left > 0 {
		return fmt.Errorf("insufficient point grants")
	}
	return nil
}

func (r *PointRepository) ensureGrantBackfill(tx *gorm.DB, userID uint) error {
	var grantCount int64
	if err := tx.Model(&model.PointGrant{}).Where("user_id = ?", userID).Count(&grantCount).Error; err != nil {
		return err
	}
	if grantCount > 0 {
		return nil
	}
	account, err := r.getOrCreateAccount(tx, userID, true)
	if err != nil {
		return err
	}
	accountTotal := account.Balance + account.Frozen
	if accountTotal <= 0 {
		return nil
	}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.PointGrant{
		UserID:      userID,
		SourceType:  "backfill",
		SourceID:    fmt.Sprintf("account:%d", userID),
		TotalPoints: accountTotal,
		Remaining:   account.Balance,
		Frozen:      account.Frozen,
		UniqueKey:   fmt.Sprintf("grant:backfill:%d", userID),
		Details:     `{"reason":"legacy_point_balance_backfill"}`,
	}).Error
}

func (r *PointRepository) ExpirePointGrants(now time.Time, limit int) (int64, error) {
	if limit <= 0 || limit > 1000 {
		limit = 500
	}
	var grants []model.PointGrant
	if err := r.DB.Where("expired_at IS NULL AND remaining > 0 AND expires_at IS NOT NULL AND expires_at <= ?", now.UTC()).
		Order("expires_at ASC, id ASC").
		Limit(limit).
		Find(&grants).Error; err != nil {
		return 0, err
	}
	var expiredTotal int64
	for _, grant := range grants {
		if err := r.DB.Transaction(func(tx *gorm.DB) error {
			var g model.PointGrant
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&g, grant.ID).Error; err != nil {
				return err
			}
			if g.ExpiredAt != nil || g.Remaining <= 0 {
				return nil
			}
			account, err := r.getOrCreateAccount(tx, g.UserID, true)
			if err != nil {
				return err
			}
			points := g.Remaining
			if account.Balance < points {
				points = account.Balance
			}
			if points <= 0 {
				t := now.UTC()
				g.ExpiredAt = &t
				g.Remaining = 0
				return tx.Save(&g).Error
			}
			account.Balance -= points
			if err := tx.Save(account).Error; err != nil {
				return err
			}
			t := now.UTC()
			g.ExpiredAt = &t
			g.Remaining = 0
			if err := tx.Save(&g).Error; err != nil {
				return err
			}
			if err := tx.Create(&model.PointLedgerEntry{
				UserID:       g.UserID,
				EventType:    "expire",
				Points:       points,
				BalanceAfter: account.Balance,
				FrozenAfter:  account.Frozen,
				UniqueKey:    fmt.Sprintf("expire_grant:%d", g.ID),
				Details:      fmt.Sprintf(`{"grant_id":%d,"expires_at":%q}`, g.ID, g.ExpiresAt),
			}).Error; err != nil {
				return err
			}
			expiredTotal += points
			return nil
		}); err != nil {
			return expiredTotal, err
		}
	}
	return expiredTotal, nil
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
