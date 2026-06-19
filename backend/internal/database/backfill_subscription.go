package database

import (
	"gorm.io/gorm"
)

// BackfillLegacySubscriptions keeps legacy free-tier rows aligned with permanently free access (MySQL).
func BackfillLegacySubscriptions(db *gorm.DB) error {
	if err := db.Exec(`
UPDATE users
SET
  subscription_plan_code = 'free_trial',
  subscription_status = 'active',
  subscription_expires_at = NULL
WHERE subscription_expires_at IS NULL
  AND (subscription_plan_code IS NULL OR subscription_plan_code = '')
`).Error; err != nil {
		return err
	}

	return db.Exec(`
UPDATE users
SET
  subscription_status = 'active',
  subscription_expires_at = NULL
WHERE subscription_plan_code = 'free_trial'
`).Error
}
