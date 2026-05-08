package repository

import (
	"strings"
	"time"

	"octo-agent/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type BillingOrderRepository struct{ DB *gorm.DB }

type BillingOrderListQuery struct {
	Status               string
	ReconciliationStatus string
	ReviewStatus         string
	RefundStatus         string
	Limit                int
	AllUsers             bool
}

type BillingOrderOpsSummary struct {
	Total           int64
	Pending         int64
	Paid            int64
	Failed          int64
	Expired         int64
	Unchecked       int64
	Matched         int64
	Mismatch        int64
	NeedsReview     int64
	ReviewNeeded    int64
	Reviewed        int64
	RefundNone      int64
	RefundRequested int64
	Refunded        int64
	RefundRejected  int64
}

func NewBillingOrderRepository(db *gorm.DB) *BillingOrderRepository {
	return &BillingOrderRepository{DB: db}
}

func (r *BillingOrderRepository) Create(o *model.BillingOrder) error {
	return r.DB.Create(o).Error
}

func (r *BillingOrderRepository) GetByID(id uint) (*model.BillingOrder, error) {
	var o model.BillingOrder
	if err := r.DB.First(&o, id).Error; err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *BillingOrderRepository) GetByUserAndID(userID, id uint) (*model.BillingOrder, error) {
	var o model.BillingOrder
	if err := r.DB.Where("user_id = ? AND id = ?", userID, id).First(&o).Error; err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *BillingOrderRepository) List(userID uint, q BillingOrderListQuery) ([]model.BillingOrder, int64, error) {
	limit := q.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	db := r.DB.Model(&model.BillingOrder{})
	if !q.AllUsers {
		db = db.Where("user_id = ?", userID)
	}
	if v := cleanBillingFilter(q.Status); v != "" {
		db = db.Where("status = ?", v)
	}
	if v := cleanBillingFilter(q.ReconciliationStatus); v != "" {
		db = db.Where("reconciliation_status = ?", v)
	}
	if v := cleanBillingFilter(q.ReviewStatus); v != "" {
		db = db.Where("review_status = ?", v)
	}
	if v := cleanBillingFilter(q.RefundStatus); v != "" {
		db = db.Where("refund_status = ?", v)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var orders []model.BillingOrder
	err := db.
		Order("id DESC").
		Limit(limit).
		Find(&orders).Error
	return orders, total, err
}

func (r *BillingOrderRepository) OpsSummary(userID uint, allUsers bool) (BillingOrderOpsSummary, error) {
	var rows []model.BillingOrder
	db := r.DB.Select("status, reconciliation_status, review_status, refund_status")
	if !allUsers {
		db = db.Where("user_id = ?", userID)
	}
	err := db.Find(&rows).Error
	if err != nil {
		return BillingOrderOpsSummary{}, err
	}
	var out BillingOrderOpsSummary
	for _, row := range rows {
		out.Total++
		switch cleanBillingFilter(row.Status) {
		case "pending":
			out.Pending++
		case "paid":
			out.Paid++
		case "failed":
			out.Failed++
		case "expired":
			out.Expired++
		}
		switch withBillingDefault(row.ReconciliationStatus, "unchecked") {
		case "unchecked":
			out.Unchecked++
		case "matched":
			out.Matched++
		case "mismatch":
			out.Mismatch++
		case "needs_review":
			out.NeedsReview++
		}
		switch withBillingDefault(row.ReviewStatus, "unreviewed") {
		case "review_needed":
			out.ReviewNeeded++
		case "reviewed":
			out.Reviewed++
		}
		switch withBillingDefault(row.RefundStatus, "none") {
		case "none":
			out.RefundNone++
		case "requested":
			out.RefundRequested++
		case "refunded":
			out.Refunded++
		case "rejected":
			out.RefundRejected++
		}
	}
	return out, nil
}

func (r *BillingOrderRepository) ExpireStaleByUser(userID uint, now time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).
		Where("user_id = ? AND status IN ? AND expired_at < ?", userID, []string{"pending", "failed"}, now).
		Updates(map[string]any{
			"status":                "expired",
			"failure_reason":        "order expired before payment confirmation",
			"last_checked_at":       now,
			"reconciliation_status": "needs_review",
			"review_status":         "review_needed",
			"ops_note":              "Order expired before payment confirmation.",
		}).Error
}

func (r *BillingOrderRepository) ExpireStale(now time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).
		Where("status IN ? AND expired_at < ?", []string{"pending", "failed"}, now).
		Updates(map[string]any{
			"status":                "expired",
			"failure_reason":        "order expired before payment confirmation",
			"last_checked_at":       now,
			"reconciliation_status": "needs_review",
			"review_status":         "review_needed",
			"ops_note":              "Order expired before payment confirmation.",
		}).Error
}

func (r *BillingOrderRepository) ExpireStaleByID(id uint, now time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).
		Where("id = ? AND status IN ? AND expired_at < ?", id, []string{"pending", "failed"}, now).
		Updates(map[string]any{
			"status":                "expired",
			"failure_reason":        "order expired before payment confirmation",
			"last_checked_at":       now,
			"reconciliation_status": "needs_review",
			"review_status":         "review_needed",
			"ops_note":              "Order expired before payment confirmation.",
		}).Error
}

func (r *BillingOrderRepository) ExpireStaleByUserAndID(userID, id uint, now time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).
		Where("user_id = ? AND id = ? AND status IN ? AND expired_at < ?", userID, id, []string{"pending", "failed"}, now).
		Updates(map[string]any{
			"status":                "expired",
			"failure_reason":        "order expired before payment confirmation",
			"last_checked_at":       now,
			"reconciliation_status": "needs_review",
			"review_status":         "review_needed",
			"ops_note":              "Order expired before payment confirmation.",
		}).Error
}

func (r *BillingOrderRepository) MarkFailed(id uint, txHash, reason string, checkedAt time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).Where("id = ?", id).Updates(map[string]any{
		"status":                "failed",
		"tx_hash":               txHash,
		"failure_reason":        reason,
		"last_checked_at":       checkedAt,
		"reconciliation_status": "mismatch",
		"review_status":         "review_needed",
	}).Error
}

func (r *BillingOrderRepository) MarkPaid(id uint, txHash string, paidAt time.Time) error {
	return r.DB.Model(&model.BillingOrder{}).Where("id = ?", id).Updates(map[string]any{
		"status":                "paid",
		"tx_hash":               txHash,
		"paid_at":               paidAt,
		"failure_reason":        "",
		"last_checked_at":       paidAt,
		"reconciliation_status": "matched",
		"review_status":         "reviewed",
		"reviewed_at":           paidAt,
	}).Error
}

func (r *BillingOrderRepository) UpdateOpsState(operatorUserID, id uint, action string, updates map[string]any) (*model.BillingOrder, error) {
	err := r.DB.Transaction(func(tx *gorm.DB) error {
		var order model.BillingOrder
		if err := tx.Clauses(clauseLockingUpdate()).Where("id = ?", id).First(&order).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.BillingOrder{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return err
		}
		var updated model.BillingOrder
		if err := tx.First(&updated, id).Error; err != nil {
			return err
		}
		audit := model.BillingOrderAudit{
			OrderID:                      order.ID,
			UserID:                       order.UserID,
			OperatorUserID:               operatorUserID,
			Action:                       action,
			PreviousOrderStatus:          order.Status,
			NewOrderStatus:               updated.Status,
			PreviousReconciliationStatus: withBillingDefault(order.ReconciliationStatus, "unchecked"),
			NewReconciliationStatus:      withBillingDefault(updated.ReconciliationStatus, "unchecked"),
			PreviousReviewStatus:         withBillingDefault(order.ReviewStatus, "unreviewed"),
			NewReviewStatus:              withBillingDefault(updated.ReviewStatus, "unreviewed"),
			PreviousRefundStatus:         withBillingDefault(order.RefundStatus, "none"),
			NewRefundStatus:              withBillingDefault(updated.RefundStatus, "none"),
			PreviousRefundReason:         order.RefundReason,
			NewRefundReason:              updated.RefundReason,
			PreviousOpsNote:              order.OpsNote,
			NewOpsNote:                   updated.OpsNote,
		}
		return tx.Create(&audit).Error
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(id)
}

func (r *BillingOrderRepository) ListAuditsByOrder(orderID uint, limit int) ([]model.BillingOrderAudit, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var rows []model.BillingOrderAudit
	err := r.DB.Where("order_id = ?", orderID).Order("id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func cleanBillingFilter(v string) string {
	return strings.ToLower(strings.TrimSpace(v))
}

func withBillingDefault(v, fallback string) string {
	if cleaned := cleanBillingFilter(v); cleaned != "" {
		return cleaned
	}
	return fallback
}

func clauseLockingUpdate() clause.Locking {
	return clause.Locking{Strength: "UPDATE"}
}
