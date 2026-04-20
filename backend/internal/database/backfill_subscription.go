package database

import (
	"gorm.io/gorm"
)

// BackfillLegacySubscriptions sets free_trial + expiry for users missing subscription rows (MySQL).
func BackfillLegacySubscriptions(db *gorm.DB) error {
	return db.Exec(`
UPDATE users
SET
  subscription_plan_code = 'free_trial',
  subscription_status = 'active',
  subscription_expires_at = DATE_ADD(created_at, INTERVAL 7 DAY)
WHERE subscription_expires_at IS NULL
  AND (subscription_plan_code IS NULL OR subscription_plan_code = '')
`).Error
}
