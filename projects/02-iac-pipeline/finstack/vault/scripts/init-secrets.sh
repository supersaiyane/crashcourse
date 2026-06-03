#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Vault Secrets Initialisation — FinStack
#
# Seeds the Vault dev server with the secrets FinStack needs:
#   1. Enables the KV v2 secrets engine
#   2. Stores database credentials
#   3. Stores application secrets
#   4. Creates the finstack-app policy
#   5. Enables AppRole auth and creates a role
#
# Prerequisites:
#   - Vault dev server running (vault server -dev)
#   - VAULT_ADDR and VAULT_TOKEN exported
#
# Usage:
#   export VAULT_ADDR="http://127.0.0.1:8200"
#   export VAULT_TOKEN="root"   # dev mode root token
#   bash scripts/init-secrets.sh
#
# ⚠️  These are SAMPLE secrets for learning. In production:
#     - Use dynamic database credentials (database secrets engine)
#     - Rotate secrets regularly
#     - Never store real credentials in scripts or Git
# -----------------------------------------------------------------------------

set -euo pipefail

# ---------------------------------------------------------------------------
# Colours for output
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if [ -z "${VAULT_ADDR:-}" ]; then
  echo "ERROR: VAULT_ADDR is not set. Export it first:"
  echo "  export VAULT_ADDR='http://127.0.0.1:8200'"
  exit 1
fi

if [ -z "${VAULT_TOKEN:-}" ]; then
  echo "ERROR: VAULT_TOKEN is not set. Export it first:"
  echo "  export VAULT_TOKEN='root'"
  exit 1
fi

info "Vault address: ${VAULT_ADDR}"
vault status || { echo "ERROR: Cannot reach Vault at ${VAULT_ADDR}"; exit 1; }

# ---------------------------------------------------------------------------
# Step 1: Enable KV v2 secrets engine (idempotent)
# ---------------------------------------------------------------------------
info "Enabling KV v2 secrets engine at secret/"
vault secrets enable -path=secret -version=2 kv 2>/dev/null || \
  warn "KV engine already enabled at secret/ (this is fine)"

# ---------------------------------------------------------------------------
# Step 2: Store database credentials
# ⚠️ SAMPLE values only — replace in production
# ---------------------------------------------------------------------------
info "Storing database credentials at secret/finstack/db"
vault kv put secret/finstack/db \
  username="finstack_app" \
  password="CHANGE_ME_IN_PRODUCTION" \
  host="finstack-db.cluster-abc123.ap-south-1.rds.amazonaws.com" \
  port="5432" \
  dbname="finstack_dev" \
  sslmode="require"

# ---------------------------------------------------------------------------
# Step 3: Store application secrets
# ⚠️ SAMPLE values only — replace in production
# ---------------------------------------------------------------------------
info "Storing application secrets at secret/finstack/app"
vault kv put secret/finstack/app \
  jwt_secret="CHANGE_ME_use_a_real_random_key_in_production" \
  encryption_key="CHANGE_ME_32_byte_aes_key_here_00" \
  api_rate_limit="1000" \
  payment_gateway_key="CHANGE_ME_payment_provider_api_key" \
  audit_log_bucket="finstack-dev-audit-logs"

# ---------------------------------------------------------------------------
# Step 4: Apply the FinStack app policy
# ---------------------------------------------------------------------------
info "Writing finstack-app policy"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
vault policy write finstack-app "${SCRIPT_DIR}/../policies/app-policy.hcl"

# ---------------------------------------------------------------------------
# Step 5: Enable AppRole auth method and create a role
# ---------------------------------------------------------------------------
info "Enabling AppRole auth method"
vault auth enable approle 2>/dev/null || \
  warn "AppRole auth already enabled (this is fine)"

info "Creating finstack-app AppRole"
vault write auth/approle/role/finstack-app \
  token_policies="finstack-app" \
  token_ttl="15m" \
  token_max_ttl="1h" \
  secret_id_ttl="24h" \
  secret_id_num_uses=0

# ---------------------------------------------------------------------------
# Output — show how to authenticate with AppRole
# ---------------------------------------------------------------------------
ROLE_ID=$(vault read -field=role_id auth/approle/role/finstack-app/role-id)
info "AppRole role_id: ${ROLE_ID}"

SECRET_ID=$(vault write -field=secret_id -f auth/approle/role/finstack-app/secret-id)
info "AppRole secret_id: ${SECRET_ID}"

echo ""
info "=== Setup complete ==="
info ""
info "Test authentication:"
info "  vault write auth/approle/login role_id=${ROLE_ID} secret_id=${SECRET_ID}"
info ""
info "Read database credentials:"
info "  vault kv get secret/finstack/db"
info ""
info "Read application secrets:"
info "  vault kv get secret/finstack/app"
