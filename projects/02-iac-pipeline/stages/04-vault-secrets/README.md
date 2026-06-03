# Stage 4: Vault Secrets — Dynamic Secrets and Secure Access for FinStack

**Goal:** Run HashiCorp Vault in dev mode, store static secrets in the KV v2 engine, generate dynamic database credentials with automatic rotation, authenticate applications via AppRole, enforce least-privilege policies, run Vault Agent for transparent secret injection, and integrate Vault with Terraform so that FinStack never has a hardcoded password anywhere.

**Prerequisites:** Stages 1–3 completed. Docker running (Vault dev mode and PostgreSQL both run in Docker). Understanding of Terraform modules and state. Familiarity with environment variables and basic Linux filesystem permissions.

**Sample App:** FinStack — the BFSI payment platform. Vault replaces the static `db_password` variable from Stage 1 with short-lived, automatically rotated credentials. By the end of this stage, no secret appears in code, state, or environment files.

> For the full crash course on Vault, see [`Vault.md`](../../../../iac/Vault.md).

---

## 1. Theory

### 1.1 Why Vault? The Secrets Problem

In Stage 1, you passed the database password as a Terraform variable:

```hcl
variable "db_password" {
  default   = "localstack-dev-only"
  sensitive = true
}
```

This is a problem at multiple levels:

| Problem | Impact | Vault Solution |
|---------|--------|---------------|
| **Password in code** | Anyone with repo access sees it | Vault stores secrets outside the codebase |
| **Same password everywhere** | Dev/staging/prod share credentials | Each environment gets its own secrets path |
| **Password never rotates** | Compromised password = permanent breach | Dynamic secrets expire after a configurable TTL |
| **Shared credentials** | All apps use the same DB password | Each app gets unique, short-lived credentials |
| **Password in state** | `terraform.tfstate` contains plaintext secrets | Vault injects at runtime, not at plan time |
| **No audit trail** | Who accessed which secret, when? | Vault logs every single access with HMAC hashing |
| **No revocation** | Credential leaked? Change the password everywhere | Revoke one lease; the credential dies instantly |

In BFSI, the regulator expects: secrets rotated at least every 90 days, unique credentials per application, a full audit trail for every secret access, encryption at rest and in transit, and separation of duties between who administers secrets and who consumes them.

The cost of getting this wrong is not theoretical. A single leaked database credential in a banking system can expose millions of customer records, trigger regulatory fines, and destroy trust. Vault exists to make the secure path the easy path.

**The one idea that unlocks Vault:** Vault is a **secrets broker**. Instead of storing a password and handing copies to applications, Vault generates a unique, short-lived credential for each request. When the credential expires, the application requests a new one. If a credential is compromised, it expires automatically — no incident response scramble to rotate passwords across dozens of services.

**Mental model:** Vault is like a hotel front desk. Instead of giving every guest a master key (shared password), it issues a unique keycard (dynamic credential) that expires at checkout (TTL). If a keycard is lost, it stops working automatically. The front desk logs every keycard issued (audit). And the hotel can instantly deactivate any single keycard without affecting other guests (lease revocation).

---

### 1.2 Architecture — Vault in FinStack

```
┌─────────────────────────────────────────────────────────────────────┐
│                          VAULT SERVER                                │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────────┐  ┌──────────────┐  │
│  │  Secrets Engines  │  │  Auth Methods        │  │  Policies     │  │
│  │                  │  │                      │  │              │  │
│  │  ┌────────────┐  │  │  ┌────────────────┐  │  │  finstack-   │  │
│  │  │ KV v2      │  │  │  │ Token          │  │  │  app-policy  │  │
│  │  │ secret/    │  │  │  │ (root, child)  │  │  │  (read db    │  │
│  │  │ finstack/  │  │  │  └────────────────┘  │  │   creds,     │  │
│  │  │  ├── db    │  │  │  ┌────────────────┐  │  │   read kv)   │  │
│  │  │  ├── api   │  │  │  │ AppRole        │  │  │              │  │
│  │  │  └── tls   │  │  │  │ finstack-app   │  │  │  admin-      │  │
│  │  └────────────┘  │  │  │ cicd-role      │  │  │  policy      │  │
│  │  ┌────────────┐  │  │  └────────────────┘  │  │  (full       │  │
│  │  │ Database   │  │  │  ┌────────────────┐  │  │   access)    │  │
│  │  │ database/  │  │  │  │ Kubernetes     │  │  │              │  │
│  │  │ PostgreSQL │  │  │  │ (production)   │  │  │  cicd-policy │  │
│  │  │ TTL: 1h    │  │  │  └────────────────┘  │  │  (deploy     │  │
│  │  └────────────┘  │  │                      │  │   only)      │  │
│  └──────────────────┘  └──────────────────────┘  └──────────────┘  │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────────┐                     │
│  │  Audit Backend   │  │  Lease Manager       │                     │
│  │                  │  │                      │                     │
│  │  File audit log  │  │  Tracks every cred   │                     │
│  │  Every read,     │  │  issued. Revokes on  │                     │
│  │  write, auth     │  │  TTL expiry. Force-  │                     │
│  │  event logged    │  │  revoke on demand.   │                     │
│  └──────────────────┘  └──────────────────────┘                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
       ┌────────────┐   ┌────────────────┐   ┌────────────────┐
       │ FinStack   │   │  Terraform     │   │  CI/CD         │
       │ App        │   │  (vault        │   │  Pipeline      │
       │            │   │   provider)    │   │                │
       │ Vault Agent│   │  Reads secrets │   │  AppRole login │
       │ sidecar    │   │  at plan/apply │   │  + deploy      │
       │ injects    │   │  time          │   │  secrets       │
       │ secrets    │   │                │   │                │
       └─────┬──────┘   └───────┬────────┘   └───────┬────────┘
             │                  │                     │
             ▼                  ▼                     ▼
       ┌──────────┐      ┌──────────────┐      ┌──────────────┐
       │PostgreSQL│      │  LocalStack  │      │  GitHub       │
       │ (dynamic │      │  (AWS infra) │      │  Actions      │
       │  creds)  │      │              │      │              │
       └──────────┘      └──────────────┘      └──────────────┘
```

**How the pieces connect:**

1. **Vault Server** stores and generates secrets. In dev mode, it runs in-memory with a known root token. In production, it runs with auto-unseal, HA, and persistent storage.
2. **Secrets Engines** are mounted at paths. KV v2 at `secret/` for static secrets. Database engine at `database/` for dynamic credentials. Each engine is independent.
3. **Auth Methods** verify identity. Token auth is the base layer. AppRole is for machines. Kubernetes auth is for pods. OIDC is for humans.
4. **Policies** bind to tokens and restrict which paths a token can access. A token without a policy can do nothing.
5. **Audit Backend** logs every request and response with HMAC-hashed sensitive values.
6. **Vault Agent** runs as a sidecar, auto-authenticates, and renders secrets into files or environment variables so the application does not need to know Vault exists.

---

### 1.3 Core Concepts

#### Secrets Engines

A secrets engine is a component that stores, generates, or encrypts data. Each engine is mounted at a path and operates independently.

| Engine | Purpose | Example | FinStack Use |
|--------|---------|---------|-------------|
| **KV v2** | Static key-value secrets with versioning | API keys, config values | API keys, TLS certificates |
| **Database** | Dynamic, short-lived database credentials | PostgreSQL, MySQL, MongoDB | FinStack DB access |
| **PKI** | Dynamic TLS certificates | Service-to-service mTLS | Internal service TLS |
| **Transit** | Encryption as a service (no secret leaves Vault) | Encrypt PII before DB write | Encrypt PAN/Aadhaar data |
| **AWS** | Dynamic IAM credentials | Short-lived AWS access keys | S3 access from FinStack |
| **SSH** | Dynamic SSH certificates | Time-limited SSH access | Bastion host access |

**KV v2** stores secrets with versioning, soft-delete, metadata, and check-and-set (CAS) for safe concurrent writes:

```bash
# Write a secret (creates version 1)
vault kv put secret/finstack/db \
  username=finstack_app \
  password=s3cur3_p@ss \
  host=finstack-dev-db.ap-south-1.rds.amazonaws.com \
  port=5432 \
  dbname=finstack

# Read the latest version
vault kv get secret/finstack/db
# Expected output:
# ====== Secret Path ======
# secret/data/finstack/db
# ====== Metadata ======
# Key              Value
# ---              -----
# created_time     2026-06-02T10:15:30.123456Z
# version          1
# ====== Data ======
# Key         Value
# ---         -----
# dbname      finstack
# host        finstack-dev-db.ap-south-1.rds.amazonaws.com
# password    s3cur3_p@ss
# port        5432
# username    finstack_app

# Read a specific field only
vault kv get -field=password secret/finstack/db
# Output: s3cur3_p@ss

# Read as JSON (useful for scripting)
vault kv get -format=json secret/finstack/db | jq -r '.data.data.password'

# Read a specific version
vault kv get -version=1 secret/finstack/db

# List all secrets under a path
vault kv list secret/finstack/
# Output:
# Keys
# ----
# db
# api
# tls
```

**Key insight about KV v2 paths:** The API path for KV v2 inserts `data/` between the mount and the secret path. When you run `vault kv put secret/finstack/db`, the actual API path is `secret/data/finstack/db`. This matters for policies — you must use `secret/data/finstack/*` in policy paths, not `secret/finstack/*`.

**Database engine** generates credentials on demand:

```bash
# Enable the database secrets engine
vault secrets enable database

# Configure the PostgreSQL connection
vault write database/config/finstack-db \
  plugin_name=postgresql-database-plugin \
  allowed_roles="finstack-app,finstack-readonly" \
  connection_url="postgresql://{{username}}:{{password}}@localhost:5432/finstack?sslmode=disable" \
  username="vault_admin" \
  password="vault_admin_password"

# Create a role for the FinStack application
vault write database/roles/finstack-app \
  db_name=finstack-db \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; \
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  revocation_statements="REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM \"{{name}}\"; \
    DROP ROLE IF EXISTS \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"

# Generate credentials — every call returns a NEW username/password
vault read database/creds/finstack-app
# Expected output:
# Key                Value
# ---                -----
# lease_id           database/creds/finstack-app/abc123def456
# lease_duration     1h
# lease_renewable    true
# password           A1B2-c3d4-E5F6-g7h8
# username           v-approle-finstack-a-abc123def
```

**Why this matters for BFSI:** Every credential has a `lease_id`. You can revoke it instantly. If the FinStack app is compromised, revoke its lease — the credential dies immediately. No scramble to change a shared password across 15 services.

#### Authentication Methods

| Method | Use Case | Identity Source | FinStack Use |
|--------|----------|----------------|-------------|
| **Token** | Direct access, root operations | Vault-generated token | Admin, Terraform |
| **AppRole** | Machine-to-machine | role_id + secret_id | FinStack app, CI/CD |
| **OIDC** | Human users via SSO | Identity provider (Okta, Azure AD) | SRE team access |
| **Kubernetes** | Pods in K8s clusters | ServiceAccount JWT | Production FinStack pods |
| **AWS IAM** | EC2/Lambda | AWS instance metadata | AWS-hosted services |
| **TLS Certificates** | Mutual TLS | Client certificate | Service mesh |

**AppRole** is recommended for applications and CI/CD pipelines:

```
┌──────────────────────────────────────────────────────────────┐
│                     AppRole Auth Flow                         │
│                                                              │
│  1. Admin creates role + policy                              │
│     vault write auth/approle/role/finstack-app ...           │
│                                                              │
│  2. Deploy system stores role_id (stable, like a username)   │
│     vault read auth/approle/role/finstack-app/role-id        │
│                                                              │
│  3. Deploy system generates secret_id (rotated, like a pwd) │
│     vault write -f auth/approle/role/finstack-app/secret-id  │
│                                                              │
│  4. App combines both to login                               │
│     vault write auth/approle/login \                         │
│       role_id=<role_id> secret_id=<secret_id>                │
│     → Returns a Vault token with attached policies           │
│                                                              │
│  5. App uses token to read secrets                           │
│     VAULT_TOKEN=<token> vault kv get secret/finstack/db      │
│     → Vault checks policy, returns data, logs access         │
└──────────────────────────────────────────────────────────────┘
```

- **role_id** — stable identifier, like a username. Stored in the application configuration or injected by the orchestrator.
- **secret_id** — short-lived, like a password. Generated per deployment, optionally with a use-limit (e.g., can only be used once).

**Why two pieces?** Separation of concerns. The orchestrator (Terraform, Ansible, CI/CD) knows the role_id and generates a fresh secret_id per deployment. The application receives both and authenticates. Neither the orchestrator alone nor the application alone can access secrets.

#### Policies — Least Privilege

Policies are written in HCL and define what a token can do at each path:

```hcl
# finstack-app-policy.hcl — the FinStack application can:
# 1. Read its own KV secrets
# 2. Generate database credentials
# 3. Nothing else

# Read static secrets for finstack
path "secret/data/finstack/*" {
  capabilities = ["read", "list"]
}

# Read metadata (for version info)
path "secret/metadata/finstack/*" {
  capabilities = ["read", "list"]
}

# Generate dynamic database credentials
path "database/creds/finstack-app" {
  capabilities = ["read"]
}

# Renew its own token
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Look up its own token info
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

# Deny everything else — explicit, not implicit
path "sys/*" {
  capabilities = ["deny"]
}

path "secret/data/admin/*" {
  capabilities = ["deny"]
}
```

**Policy capabilities:**

| Capability | HTTP Verb | Meaning |
|-----------|-----------|---------|
| `create` | POST | Create new data at a path |
| `read` | GET | Read data at a path |
| `update` | PUT/POST | Modify existing data |
| `delete` | DELETE | Delete data |
| `list` | LIST | List keys at a path |
| `deny` | — | Explicit deny (overrides all others) |
| `sudo` | — | Access root-protected paths |

**Policy evaluation:** Vault uses a default-deny model. If no policy grants access to a path, the request is denied. `deny` is an explicit override that wins even if another policy grants access at the same path.

#### Audit Logging

Every Vault operation is logged. The audit log includes the request, the response, and the authentication details — but sensitive values are HMAC-hashed so you can verify access patterns without exposing secrets.

```bash
# Enable file audit backend
vault audit enable file file_path=/vault/logs/audit.log

# What an audit entry looks like (simplified):
# {
#   "type": "response",
#   "auth": {
#     "accessor": "hmac-sha256:abc123",
#     "policies": ["finstack-app-policy"],
#     "metadata": { "role_name": "finstack-app" }
#   },
#   "request": {
#     "path": "database/creds/finstack-app",
#     "operation": "read"
#   },
#   "response": {
#     "data": {
#       "username": "hmac-sha256:def456",
#       "password": "hmac-sha256:ghi789"
#     }
#   }
# }
```

For BFSI compliance, this means you can answer: "Which application accessed which secret, at what time, authenticated how, with which policy?" — without the audit log itself becoming a security risk.

#### Leases and TTLs

Every dynamic secret has a lease — a contract that says "this credential is valid for X duration." When the lease expires, Vault revokes the credential.

```
┌──────────────────────────────────────────────────────────┐
│                  Lease Lifecycle                          │
│                                                          │
│  Generate    ──▶  Active     ──▶  Expiring   ──▶  Revoked│
│  (read creds)    (TTL counting)  (grace period)  (DROP   │
│                                                   ROLE)  │
│                       │                                  │
│                       ▼                                  │
│                  Renew (extend TTL up to max_ttl)        │
│                                                          │
│  default_ttl = 1h    max_ttl = 24h                       │
│  FinStack requests creds → valid for 1h                  │
│  Can renew up to 24h total → then must re-authenticate   │
└──────────────────────────────────────────────────────────┘
```

```bash
# Renew a lease (extend the TTL)
vault lease renew database/creds/finstack-app/abc123def456

# Revoke a specific lease (credential dies immediately)
vault lease revoke database/creds/finstack-app/abc123def456

# Revoke ALL leases for a path (emergency: revoke all FinStack DB creds)
vault lease revoke -prefix database/creds/finstack-app
```

**BFSI scenario:** It is salary-day, the FinStack payment service is processing 50,000 transactions, and you discover a credential may have been exposed. With static passwords, you face a dilemma — change the password and break the running service, or leave the vulnerability open. With Vault, you revoke the specific lease, the compromised credential dies instantly, and the application automatically requests a new one. Zero downtime, zero exposure window.

---

### 1.4 Vault Agent — Transparent Secret Injection

Vault Agent is a daemon that runs alongside your application. It handles authentication, secret retrieval, and token renewal so the application does not need to know Vault exists.

```
┌──────────────────────────────────────────────────────────────┐
│                     Application Host / Pod                    │
│                                                              │
│  ┌──────────────┐         ┌──────────────────────────┐       │
│  │ Vault Agent  │         │  FinStack App            │       │
│  │              │         │                          │       │
│  │ 1. Auto-auth │         │  Reads /app/secrets/db   │       │
│  │    (AppRole) │         │  as a normal file.       │       │
│  │              │         │  Knows nothing about     │       │
│  │ 2. Fetch     │────────▶│  Vault.                  │       │
│  │    secrets   │  writes │                          │       │
│  │              │  file   │  DB_HOST=...             │       │
│  │ 3. Render    │         │  DB_USER=...             │       │
│  │    templates │         │  DB_PASS=...             │       │
│  │              │         │                          │       │
│  │ 4. Renew     │         └──────────────────────────┘       │
│  │    token +   │                                            │
│  │    leases    │                                            │
│  └──────┬───────┘                                            │
│         │                                                    │
└─────────┼────────────────────────────────────────────────────┘
          │ HTTPS
          ▼
   ┌──────────────┐
   │ Vault Server │
   └──────────────┘
```

**Vault Agent config (vault-agent.hcl):**

```hcl
vault {
  address = "http://vault:8200"
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/app/config/role-id"
      secret_id_file_path = "/app/config/secret-id"
      remove_secret_id_file_after_reading = true  # Security: delete after use
    }
  }

  sink "file" {
    config = {
      path = "/app/secrets/.vault-token"
      mode = 0640
    }
  }
}

template {
  source      = "/app/templates/db-creds.tpl"
  destination = "/app/secrets/db-creds.env"
  perms       = 0640

  # Re-render when the secret changes (lease renewal)
  command = "pkill -HUP finstack-app"  # Signal app to reload
}
```

**Template file (db-creds.tpl):**

```
{{ with secret "database/creds/finstack-app" -}}
DB_HOST=finstack-dev-db.ap-south-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=finstack
DB_USER={{ .Data.username }}
DB_PASS={{ .Data.password }}
{{- end }}
```

Vault Agent renders this template into a file that the application reads as a normal environment/config file. When the lease is about to expire, Vault Agent fetches new credentials, re-renders the template, and optionally signals the application to reload.

**Why Vault Agent matters:** Your application code has zero Vault dependency. It reads a file. This means:
- You can test locally with a static file.
- You can swap Vault for another secret manager without changing application code.
- The authentication complexity (AppRole, token renewal, lease management) is handled by infrastructure, not application developers.

---

### 1.5 Vault + Terraform Integration

The Vault provider for Terraform reads secrets at plan/apply time:

```hcl
# providers.tf
terraform {
  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "~> 4.0"
    }
  }
}

provider "vault" {
  address = "http://localhost:8200"
  # Token from VAULT_TOKEN env var — never hardcode
}
```

**Reading KV secrets in Terraform:**

```hcl
# Read the FinStack DB credentials from Vault KV
data "vault_kv_secret_v2" "db" {
  mount = "secret"
  name  = "finstack/db"
}

# Use them in the RDS module
module "rds" {
  source      = "../modules/rds"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.private_subnet_ids
  db_password = data.vault_kv_secret_v2.db.data["password"]
  db_username = data.vault_kv_secret_v2.db.data["username"]
}
```

**Reading dynamic database credentials in Terraform:**

```hcl
# Generate a dynamic credential (new on every apply)
data "vault_generic_secret" "db_creds" {
  path = "database/creds/finstack-app"
}

output "db_username" {
  value     = data.vault_generic_secret.db_creds.data["username"]
  sensitive = true
}
```

**⚠️ Important:** Dynamic credentials generated during `terraform plan` or `terraform apply` are real credentials with a lease. If Terraform reads a dynamic credential and then the apply fails, that credential is still active until its TTL expires. In CI/CD, wrap apply in error handling that revokes leases on failure.

**No hardcoded passwords anywhere.** The password moves from:

```
Stage 1:  variable "db_password" { default = "..." }      ← in code
Stage 4:  data "vault_kv_secret_v2" "db" { ... }          ← from Vault at runtime
```

The Terraform state file still contains the secret value after apply (because Terraform records all attributes). This is why you encrypt state at rest (S3 SSE) and restrict access. Vault does not eliminate the state-file risk — it eliminates the code-and-config risk.

---

### 1.6 Dev Mode vs Production — What Changes

| Aspect | Dev Mode (this stage) | Production |
|--------|----------------------|------------|
| **Storage** | In-memory (lost on restart) | Consul, Raft, or integrated storage |
| **Seal** | Auto-unsealed | Shamir keys or auto-unseal (AWS KMS, Azure Key Vault) |
| **Root token** | Known, printed at start | Generated once, then revoked |
| **TLS** | Disabled (HTTP) | Mandatory (HTTPS with valid certificate) |
| **HA** | Single node | 3 or 5 node cluster with leader election |
| **Audit** | Optional | Mandatory — at least two audit backends |
| **Init** | Automatic | Manual `vault operator init` with key shares |

Dev mode is perfect for learning and local development. Never run dev mode in production — the root token is known, storage is ephemeral, and there is no TLS.

---

### 1.7 The Secret Lifecycle in FinStack — End to End

Here is the complete flow of a secret from creation to consumption:

```
┌─────────────────────────────────────────────────────────────────────┐
│                  SECRET LIFECYCLE — FINSTACK                         │
│                                                                     │
│  1. STORE (admin/Terraform)                                         │
│     vault kv put secret/finstack/db password=...                    │
│     OR: Vault database engine auto-generates credentials            │
│                                                                     │
│  2. PROTECT (policy)                                                │
│     path "secret/data/finstack/*" { capabilities = ["read"] }       │
│     Only finstack-app-policy can read this path                     │
│                                                                     │
│  3. AUTHENTICATE (AppRole)                                          │
│     App presents role_id + secret_id → gets a scoped token          │
│                                                                     │
│  4. RETRIEVE (app or Vault Agent)                                   │
│     Token reads secret/finstack/db or database/creds/finstack-app   │
│     Vault checks policy, returns data, writes audit log             │
│                                                                     │
│  5. USE (application)                                               │
│     App connects to PostgreSQL with the retrieved credentials       │
│                                                                     │
│  6. EXPIRE (lease manager)                                          │
│     After TTL, Vault revokes the credential                         │
│     App requests new credentials (Vault Agent automates this)       │
│                                                                     │
│  7. AUDIT (compliance)                                              │
│     Every step above is logged: who, what, when, how                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Hands-On Setup

### 2.1 Start Vault and PostgreSQL

Create a Docker Compose file to run Vault in dev mode alongside PostgreSQL:

```yaml
# docker-compose.yml
services:
  vault:
    image: hashicorp/vault:1.17
    container_name: finstack-vault
    ports:
      - "8200:8200"
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: "root-token-finstack"
      VAULT_DEV_LISTEN_ADDRESS: "0.0.0.0:8200"
    cap_add:
      - IPC_LOCK                  # Prevents secrets from being swapped to disk
    networks:
      - finstack

  postgres:
    image: postgres:16
    container_name: finstack-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: finstack
      POSTGRES_USER: vault_admin
      POSTGRES_PASSWORD: vault_admin_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - finstack

volumes:
  pgdata:

networks:
  finstack:
    driver: bridge
```

```bash
# Start the services
docker compose up -d

# Expected output:
# ✔ Container finstack-vault     Started
# ✔ Container finstack-postgres  Started

# Verify Vault is running
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='root-token-finstack'

vault status
# Expected output:
# Key             Value
# ---             -----
# Seal Type       shamir
# Initialized     true
# Sealed          false         ← dev mode auto-unseals
# ...
# Storage Type    inmem         ← in-memory, data lost on restart
```

**You're done when:**
- `vault status` shows `Sealed: false`
- `docker ps` shows both containers running
- You can connect to PostgreSQL: `psql -h localhost -U vault_admin -d finstack`

---

### 2.2 Configure the Vault CLI

```bash
# Set these in your shell profile for the session
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='root-token-finstack'

# Verify
vault token lookup
# Expected output:
# Key                 Value
# ---                 -----
# accessor            ...
# display_name        token-root
# policies            [root]
# ...
```

The root token can do anything. In production, you generate child tokens with limited policies and revoke the root token. In this stage, we use it for setup and then switch to AppRole.

---

## 3. Hands-On Exercises

The exercises are in the `exercises/` directory. Complete them in order — each builds on the previous.

### Exercise 1: KV Secrets

**File:** `exercises/01-kv-secrets.md`

Store and retrieve FinStack secrets using the KV v2 engine. Explore versioning, rollback, and soft-delete.

**Key commands you'll learn:**

```bash
vault kv put secret/finstack/db ...     # Write a secret
vault kv get secret/finstack/db         # Read the latest version
vault kv get -version=1 secret/finstack/db  # Read a specific version
vault kv rollback -version=1 secret/finstack/db  # Rollback
vault kv delete secret/finstack/db      # Soft-delete
vault kv undelete -versions=2 secret/finstack/db  # Restore
vault kv metadata get secret/finstack/db  # View version history
```

**What you'll build:**

```
secret/
└── finstack/
    └── db
        ├── version 1: username=finstack_app, password=initial_pass
        ├── version 2: username=finstack_app, password=rotated_pass  ← soft-deleted
        └── version 3: (rollback to version 1)
```

**You're done when:**
- You can write, read, and list KV secrets
- You've created multiple versions and rolled back to an earlier one
- You understand the difference between `secret/data/` and `secret/metadata/` paths
- `vault kv get -field=password secret/finstack/db` returns the expected value

Estimated time: 20 minutes.

---

### Exercise 2: Dynamic Database Credentials

**File:** `exercises/02-dynamic-db-creds.md`

Enable the database secrets engine, configure it against the PostgreSQL container, create a role with a 1-hour TTL, generate credentials, and verify they work and expire.

**Key commands you'll learn:**

```bash
vault secrets enable database
vault write database/config/finstack-db ...
vault write database/roles/finstack-app ...
vault read database/creds/finstack-app
vault lease lookup <lease_id>
vault lease revoke <lease_id>
```

**What you'll build:**

```
┌─────────────┐    generate creds    ┌──────────────┐
│ Vault       │ ──────────────────▶  │ PostgreSQL   │
│ database/   │    CREATE ROLE ...   │              │
│ engine      │ ◀──────────────────  │ finstack db  │
│             │    username/password  │              │
└─────────────┘                      └──────────────┘
       │
       │  returns to client:
       │  username: v-approle-finstack-a-abc123
       │  password: A1B2-c3d4-E5F6-g7h8
       │  lease_duration: 1h
       │  lease_id: database/creds/finstack-app/abc123
       ▼
┌─────────────┐
│ FinStack    │
│ App         │
│ connects    │
│ to Postgres │
│ with these  │
│ creds       │
└─────────────┘
```

**You're done when:**
- `vault read database/creds/finstack-app` returns a unique username and password each time
- You can connect to PostgreSQL with the generated credentials
- `vault lease revoke <lease_id>` immediately invalidates the credential
- You understand why 1h TTL + automatic revocation is better than a static password for BFSI

Estimated time: 30 minutes.

---

### Exercise 3: AppRole Authentication

**File:** `exercises/03-approle-auth.md`

Enable AppRole auth, create a role bound to the FinStack policy, authenticate with role_id + secret_id, and verify the resulting token can only access allowed paths.

**Key commands you'll learn:**

```bash
vault auth enable approle
vault policy write finstack-app-policy policy.hcl
vault write auth/approle/role/finstack-app ...
vault read auth/approle/role/finstack-app/role-id
vault write -f auth/approle/role/finstack-app/secret-id
vault write auth/approle/login role_id=... secret_id=...
```

**What you'll build:**

```
┌────────────────────────────────────────────────────────────┐
│                 AppRole Auth Flow                           │
│                                                            │
│  Admin:                                                    │
│    1. Create policy (finstack-app-policy)                  │
│    2. Create AppRole (finstack-app)                        │
│    3. Bind policy to role                                  │
│                                                            │
│  Application:                                              │
│    4. Present role_id + secret_id                          │
│    5. Receive scoped token                                 │
│    6. Use token to read secret/finstack/db   ✓ allowed     │
│    7. Try to read secret/admin/master-key    ✗ denied      │
│    8. Try to write secret/finstack/db        ✗ denied      │
└────────────────────────────────────────────────────────────┘
```

**You're done when:**
- AppRole authentication returns a token with the correct policies
- The token can read `secret/finstack/db` and `database/creds/finstack-app`
- The token is denied when accessing paths outside its policy
- You can explain why role_id and secret_id are separated (security model)

Estimated time: 30 minutes.

---

## 4. Putting It Together — Vault + Terraform for FinStack

After completing the three exercises, you can integrate Vault with Terraform so that the RDS module from Stage 1 reads its password from Vault instead of a variable.

### 4.1 The Terraform Vault Provider

```hcl
# providers.tf — add alongside the AWS provider
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "~> 4.0"
    }
  }
}

provider "vault" {
  address = var.vault_address
  # Token from VAULT_TOKEN environment variable
  # Never put the token in .tf files
}
```

### 4.2 Reading Secrets in Terraform

```hcl
# vault-secrets.tf
data "vault_kv_secret_v2" "finstack_db" {
  mount = "secret"
  name  = "finstack/db"
}

locals {
  db_credentials = {
    username = data.vault_kv_secret_v2.finstack_db.data["username"]
    password = data.vault_kv_secret_v2.finstack_db.data["password"]
    host     = data.vault_kv_secret_v2.finstack_db.data["host"]
    port     = data.vault_kv_secret_v2.finstack_db.data["port"]
    dbname   = data.vault_kv_secret_v2.finstack_db.data["dbname"]
  }
}

module "rds" {
  source      = "../modules/rds"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.private_subnet_ids
  db_username = local.db_credentials.username
  db_password = local.db_credentials.password
}
```

### 4.3 The Before and After

```
BEFORE (Stage 1):
  terraform.tfvars:      db_password = "static-password-in-file"
  terraform.tfstate:     db_password = "static-password-in-file"  (plaintext)
  git history:           db_password visible in every commit

AFTER (Stage 4):
  terraform.tfvars:      vault_address = "http://vault:8200"      (not a secret)
  terraform.tfstate:     db_password = "value-from-vault"          (still in state — encrypt state)
  git history:           no secrets anywhere
  Vault audit log:       "Terraform read secret/finstack/db at 10:15 UTC"
```

The state file still contains the secret after apply — this is a known limitation of Terraform. Mitigate it by encrypting state at rest (S3 SSE-KMS), restricting access to the state bucket, and using dynamic credentials where possible (they expire even if the state file is compromised).

---

## 5. Common Pitfalls

- **Using the root token in production.** The root token is for initial setup only. Generate child tokens with specific policies, then revoke the root token with `vault token revoke <root-token>`. In dev mode, the root token is fine for learning.

- **Forgetting the `data/` segment in KV v2 policy paths.** You write `vault kv put secret/finstack/db`, but the policy path must be `secret/data/finstack/db`. Without `data/`, the policy grants nothing and every read is denied. This is the single most common Vault policy mistake.

- **Setting max_ttl too high on dynamic credentials.** A 24h max_ttl means a compromised credential can be active for up to 24 hours even if you detect the breach at hour 1 — unless you actively revoke it. For BFSI, keep max_ttl as short as your application can tolerate (1–4 hours) and implement lease renewal.

- **Not handling credential rotation in the application.** If Vault Agent is not in use, the application must request new credentials before the current lease expires. If it does not, database connections fail silently. Use a connection pool that validates connections and implement a retry-with-new-credentials pattern.

- **Running dev mode with real secrets.** Dev mode stores everything in memory. Restart the container and all secrets, policies, and configurations vanish. Use dev mode only for learning and testing. For any environment that matters, use persistent storage.

- **Storing the Vault token in environment files committed to Git.** `VAULT_TOKEN=root-token-finstack` in a `.env` file pushed to GitHub is the same mistake as storing the database password directly. Use CI/CD secrets injection (GitHub Actions secrets, GitLab masked variables) or Vault Agent.

- **Not enabling audit logging.** Without audit, you cannot answer "who accessed the production database credentials at 3am?" Enable at least two audit backends (file + syslog) so that if one fails, Vault continues operating. Vault blocks all operations if all audit backends are down — this is by design to prevent unaudited access.

- **Granting `sudo` capability casually.** `sudo` allows access to root-protected endpoints like `sys/policy` and `auth/token/create`. An AppRole with `sudo` on `sys/*` is effectively a root token. Restrict `sudo` to admin policies only.

---

## 6. Summary

### What You Learned

| Concept | Key Insight |
|---------|-------------|
| **KV v2 engine** | Static secrets with versioning, rollback, and soft-delete — replaces .env files and hardcoded values |
| **Database engine** | Dynamic credentials generated on demand with automatic expiry — each app gets unique, short-lived access |
| **AppRole** | Machine authentication via role_id (stable) + secret_id (rotated) — separation of concerns |
| **Policies** | HCL-based least-privilege access control with default-deny — the `data/` segment in KV v2 paths matters |
| **Leases and TTLs** | Every dynamic secret has a lease that can be renewed or revoked — compromised creds die automatically |
| **Vault Agent** | Sidecar that handles auth, retrieval, and template rendering — app reads a file, knows nothing about Vault |
| **Terraform integration** | Vault provider reads secrets at apply time — no passwords in code or `.tfvars` |
| **Audit logging** | Every operation logged with HMAC-hashed values — BFSI compliance requirement |

### Vault Cheat Sheet

```bash
# ── Server ──────────────────────────────────────────────────────────
vault server -dev                            # Start dev server (in-memory)
vault server -dev -dev-root-token-id="root"  # Dev server with known token
vault status                                 # Check seal status, HA, storage
vault operator init                          # Initialise production vault
vault operator unseal                        # Unseal with key share

# ── KV v2 Secrets ──────────────────────────────────────────────────
vault kv put secret/path key=val key2=val2   # Write (creates new version)
vault kv get secret/path                     # Read latest version
vault kv get -field=key secret/path          # Read one field
vault kv get -version=N secret/path          # Read specific version
vault kv get -format=json secret/path        # Read as JSON
vault kv list secret/                        # List paths
vault kv delete secret/path                  # Soft-delete latest version
vault kv undelete -versions=N secret/path    # Restore soft-deleted version
vault kv rollback -version=N secret/path     # Rollback to version N
vault kv metadata get secret/path            # View version history
vault kv metadata delete secret/path         # Permanently delete all versions

# ── Database Engine ────────────────────────────────────────────────
vault secrets enable database                # Enable at database/
vault secrets enable -path=db database       # Enable at custom path
vault write database/config/name \           # Configure DB connection
  plugin_name=postgresql-database-plugin \
  connection_url="postgresql://..." \
  allowed_roles="role1,role2" \
  username="admin" password="pass"
vault write database/roles/name \            # Create role
  db_name=config_name \
  creation_statements="CREATE ROLE ..." \
  default_ttl="1h" max_ttl="24h"
vault read database/creds/name              # Generate dynamic credentials
vault write -f database/rotate-root/name    # Rotate the root password

# ── Leases ─────────────────────────────────────────────────────────
vault lease lookup <lease_id>               # Check lease details
vault lease renew <lease_id>                # Extend TTL
vault lease renew -increment=2h <lease_id>  # Extend by specific duration
vault lease revoke <lease_id>               # Revoke one credential
vault lease revoke -prefix database/creds/  # Revoke all under prefix

# ── Auth: AppRole ──────────────────────────────────────────────────
vault auth enable approle                   # Enable AppRole auth
vault write auth/approle/role/name \        # Create role
  token_policies="policy1,policy2" \
  token_ttl=1h token_max_ttl=4h \
  secret_id_ttl=10m secret_id_num_uses=1
vault read auth/approle/role/name/role-id   # Get role_id
vault write -f auth/approle/role/name/secret-id  # Generate secret_id
vault write auth/approle/login \            # Authenticate
  role_id=<role_id> secret_id=<secret_id>

# ── Policies ───────────────────────────────────────────────────────
vault policy write name policy.hcl          # Create/update policy from file
vault policy read name                      # View policy
vault policy list                           # List all policies
vault policy delete name                    # Delete policy

# ── Audit ──────────────────────────────────────────────────────────
vault audit enable file file_path=/path/to/audit.log  # Enable file audit
vault audit enable syslog                   # Enable syslog audit
vault audit list                            # List audit backends
vault audit disable file/                   # Disable audit backend

# ── Token ──────────────────────────────────────────────────────────
vault token create -policy=name             # Create child token
vault token lookup                          # Look up current token
vault token lookup <token>                  # Look up specific token
vault token revoke <token>                  # Revoke token
vault token renew                           # Renew current token
```

### Next Steps

You've completed Stage 4. FinStack's secrets are now managed by Vault — static secrets in KV v2, dynamic database credentials with automatic rotation, and AppRole authentication with least-privilege policies. Next:

- **Stage 5 (OPA)** — enforce BFSI compliance policies on Terraform plans and Vault configurations
- **Stage 6 (Ansible)** — inject Vault secrets into Ansible playbooks for configuration management
- **Stage 7 (CI/CD)** — authenticate GitHub Actions to Vault via OIDC for zero-secret CI/CD pipelines

**Further learning:**
- Vault Agent injector for Kubernetes (sidecar pattern in production)
- Transit engine for encryption-as-a-service (encrypt PII before database writes)
- PKI engine for dynamic TLS certificates (mTLS between FinStack services)
- Vault namespaces for multi-tenant secret management (enterprise feature)
- Sentinel policies for Vault (enterprise — policy-as-code for Vault operations)
- See [`Vault.md`](../../../../iac/Vault.md) for the complete Vault crash course
