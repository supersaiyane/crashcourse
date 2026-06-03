# -----------------------------------------------------------------------------
# Vault Policy — FinStack Application
#
# Grants the payment API (and other FinStack services) the minimum permissions
# needed to read database credentials and application secrets.
#
# Principle: least privilege. The app can READ secrets but never WRITE, LIST
# the root path, or access other tenants' secrets.
#
# Apply this policy:
#   vault policy write finstack-app policies/app-policy.hcl
#
# Assign to AppRole:
#   vault write auth/approle/role/finstack-app \
#     token_policies="finstack-app" \
#     token_ttl=15m \
#     token_max_ttl=1h
# -----------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Database credentials — read-only
# Path: secret/data/finstack/db
# ---------------------------------------------------------------------------
path "secret/data/finstack/db" {
  capabilities = ["read"]
}

# ---------------------------------------------------------------------------
# Application secrets — read-only
# Path: secret/data/finstack/app
# (API keys, encryption keys, feature flags)
# ---------------------------------------------------------------------------
path "secret/data/finstack/app" {
  capabilities = ["read"]
}

# ---------------------------------------------------------------------------
# Allow the app to renew its own token (keeps sessions alive)
# ---------------------------------------------------------------------------
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# ---------------------------------------------------------------------------
# Allow the app to look up its own token metadata
# ---------------------------------------------------------------------------
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

# ---------------------------------------------------------------------------
# Dynamic database credentials (if using the database secrets engine)
# The app requests short-lived PostgreSQL credentials on demand.
# ---------------------------------------------------------------------------
path "database/creds/finstack-readonly" {
  capabilities = ["read"]
}

path "database/creds/finstack-readwrite" {
  capabilities = ["read"]
}
