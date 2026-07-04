# Backend Configuration

The checked-in YAML files are public-safe examples with placeholder values.

For local development:

1. Copy `backend/configs/.env.example` to `backend/configs/.env`.
2. Set `mysql.data_source` in:
   - `config.local.api.yaml`
   - `config.local.admin.yaml`
   - `config.local.yaml` when using the compatibility fallback.
3. Keep private values in ignored local files or your deployment secret store.

Do not commit production DSNs, API keys, OAuth secrets, JWT secrets, webhook
secrets, bearer tokens, wallet private keys, or production payment addresses.
