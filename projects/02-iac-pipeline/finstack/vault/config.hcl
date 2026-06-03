# -----------------------------------------------------------------------------
# Vault Server Configuration — FinStack (Dev Mode)
#
# This config is for local development and learning. It runs Vault in dev
# mode with an in-memory backend (no data persists across restarts).
#
# For production, you would use:
#   - Raft or Consul storage backend
#   - TLS enabled with real certificates
#   - Auto-unseal via AWS KMS
#   - Audit logging to a persistent destination
#
# Usage:
#   vault server -config=config.hcl
#
# Or just use dev mode (simpler for learning):
#   vault server -dev -dev-listen-address="0.0.0.0:8200"
# -----------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Listener — HTTP for dev (TLS disabled)
# ⚠️ In production, always enable TLS
# ---------------------------------------------------------------------------
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true                  # dev only — enable TLS in production
}

# ---------------------------------------------------------------------------
# Storage — in-memory for dev
# In production, use raft or consul:
#   storage "raft" {
#     path    = "/opt/vault/data"
#     node_id = "vault-1"
#   }
# ---------------------------------------------------------------------------
storage "inmem" {}

# ---------------------------------------------------------------------------
# General settings
# ---------------------------------------------------------------------------

# UI — enable the web interface at http://localhost:8200/ui
ui = true

# Disable mlock for dev (containers / macOS don't support it)
# ⚠️ In production on Linux, set this to false
disable_mlock = true

# API address — how Vault advertises itself
api_addr = "http://127.0.0.1:8200"

# Telemetry — expose Prometheus metrics at /v1/sys/metrics
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname         = true
}

# Log level — debug for learning, info or warn for production
log_level = "info"

# Max lease TTL — cap how long any secret can live
max_lease_ttl     = "24h"
default_lease_ttl = "1h"
