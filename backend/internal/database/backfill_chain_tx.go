package database

import (
	"gorm.io/gorm"
)

// BackfillBillingChainTx inserts billing_chain_tx rows for orders that were paid before the table existed.
func BackfillBillingChainTx(db *gorm.DB) error {
	return db.Exec(`
INSERT IGNORE INTO billing_chain_txes (chain_id, tx_hash, order_id, created_at, updated_at)
SELECT chain_id, LOWER(TRIM(tx_hash)), id, NOW(3), NOW(3)
FROM billing_orders
WHERE status = 'paid' AND tx_hash IS NOT NULL AND TRIM(tx_hash) <> ''
`).Error
}
