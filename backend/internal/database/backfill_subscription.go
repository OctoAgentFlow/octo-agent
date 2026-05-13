package database

import (
	"fmt"

	"octo-agent/backend/internal/pkg/subscription"

	"gorm.io/gorm"
)

// BackfillLegacySubscriptions keeps legacy free-trial rows aligned with the current trial window (MySQL).
func BackfillLegacySubscriptions(db *gorm.DB) error {
	trialDays := subscription.DefaultTrialDays
	if err := db.Exec(fmt.Sprintf(`
UPDATE users
SET
  subscription_plan_code = 'free_trial',
  subscription_status = 'active',
  subscription_expires_at = DATE_ADD(created_at, INTERVAL %d DAY)
WHERE subscription_expires_at IS NULL
  AND (subscription_plan_code IS NULL OR subscription_plan_code = '')
`, trialDays)).Error; err != nil {
		return err
	}

	return db.Exec(fmt.Sprintf(`
UPDATE users
SET
  subscription_status = 'active',
  subscription_expires_at = DATE_ADD(created_at, INTERVAL %d DAY)
WHERE subscription_plan_code = 'free_trial'
  AND subscription_expires_at IS NOT NULL
  AND subscription_expires_at < DATE_ADD(created_at, INTERVAL %d DAY)
  AND UTC_TIMESTAMP() < DATE_ADD(created_at, INTERVAL %d DAY)
`, trialDays, trialDays, trialDays)).Error
}
