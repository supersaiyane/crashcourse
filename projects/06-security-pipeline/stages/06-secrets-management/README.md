# Stage 6: Secrets Management

**Goal:** Replace hardcoded database passwords with dynamic secrets from HashiCorp Vault — short-lived credentials that are automatically rotated, audited, and revoked.

**Prerequisites:** Stage 5 complete. Vault CLI installed. Docker (for running Vault locally).

---

## 1. Theory (What & Why)

### The problem with static secrets

Most applications store database passwords in environment variables or Kubernetes Secrets. These passwords are long-lived (same password for months), shared (every pod uses the same one), unaudited (no record of who accessed it), and hard to rotate (changing means updating every consumer simultaneously).

In banking, this is a compliance nightmare. RBI and PRA require credential rotation and access auditing. Static passwords fail both requirements.

### What Vault provides

| Capability | What it does | Banking use case |
|-----------|-------------|-----------------|
| **Dynamic secrets** | Generates unique, short-lived credentials on demand | Each pod gets its own DB password, valid for 1 hour |
| **Lease management** | Credentials expire automatically | No stale passwords after pod termination |
| **Audit logging** | Every secret access logged with identity, timestamp, path | "Who accessed production DB creds at 03:00?" |
| **Secret rotation** | Rotates root credentials without downtime | Monthly rotation without deployment changes |
| **SSH certificates** | Short-lived SSH certs instead of permanent keys | "Give developer X 4-hour access to server Y" |

### How dynamic database secrets work

```text
1. SecureBank pod starts
2. Pod requests credentials from Vault (via sidecar or init container)
3. Vault creates a NEW PostgreSQL user with a random password
4. Vault returns the credentials with a 1-hour TTL
5. Pod uses the credentials to connect to PostgreSQL
6. After 1 hour, Vault revokes the user
7. Pod renews the lease (or gets new credentials)
```

Every pod gets unique credentials. If one pod is compromised, only its credentials are exposed — and they expire in an hour.

---

## 2. Hands-On: Vault for SecureBank

### 2.1 Start Vault in dev mode

```bash
docker run -d --name vault \
  -p 8200:8200 \
  -e VAULT_DEV_ROOT_TOKEN_ID=securebank-root \
  -e VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200 \
  hashicorp/vault:1.17

export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=securebank-root
```

### 2.2 Enable the database secrets engine

```bash
vault secrets enable database

vault write database/config/securebank-db \
  plugin_name=postgresql-database-plugin \
  connection_url="postgresql://{{username}}:{{password}}@postgres:5432/securebank?sslmode=disable" \
  allowed_roles="securebank-api" \
  username="admin" \
  password="admin-password"
```

### 2.3 Create a role for the API

```bash
vault write database/roles/securebank-api \
  db_name=securebank-db \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"
```

### 2.4 Generate dynamic credentials

```bash
vault read database/creds/securebank-api
# Key             Value
# lease_id        database/creds/securebank-api/abc123
# lease_duration  1h
# username        v-token-securebank-api-xyz789
# password        A1B2C3-random-password
```

Every call generates a new username and password. After 1 hour, Vault revokes the PostgreSQL user.

### 2.5 Enable audit logging

```bash
vault audit enable file file_path=/vault/logs/audit.log
```

Every secret access, authentication, and policy check is logged.

### 2.6 KV secrets for static configuration

For non-database secrets (API keys, encryption keys):

```bash
vault kv put secret/securebank/config \
  encryption_key="aes-256-key-here" \
  webhook_secret="stripe-webhook-secret"

vault kv get secret/securebank/config
```

### 2.7 AppRole authentication

In production, pods authenticate using AppRole (not a root token):

```bash
vault auth enable approle

vault write auth/approle/role/securebank-api \
  secret_id_ttl=10m \
  token_ttl=20m \
  token_max_ttl=30m \
  policies="securebank-api"
```

### 2.8 SSH certificate authority

Use Vault as an SSH CA instead of distributing SSH keys:

```bash
vault secrets enable -path=ssh-client-signer ssh
vault write ssh-client-signer/config/ca generate_signing_key=true

vault write ssh-client-signer/sign/securebank-ops \
  public_key=@~/.ssh/id_ed25519.pub \
  valid_principals="ubuntu" \
  ttl=4h
```

The developer gets a certificate that expires in 4 hours.

---

## 3. Key patterns

### Vault Agent sidecar

In Kubernetes, use the Vault Agent Injector:

```yaml
metadata:
  annotations:
    vault.hashicorp.com/agent-inject: "true"
    vault.hashicorp.com/role: "securebank-api"
    vault.hashicorp.com/agent-inject-secret-db: "database/creds/securebank-api"
```

### Emergency revocation

If a pod is compromised:

```bash
vault lease revoke database/creds/securebank-api/abc123
# PostgreSQL user is deleted immediately
```

### BFSI context

RBI Cyber Security Framework requires credential rotation and access auditing. Vault dynamic secrets with audit logging satisfies both. During an audit: "Show me credential rotation evidence for the last 90 days" — Vault audit logs provide it.

---

## 4. Common mistakes

- **Using the root token in production:** Use AppRole or Kubernetes auth instead.
- **Not enabling audit logging:** Without it, you cannot answer "who accessed this secret?"
- **TTL too long:** 24-hour TTLs defeat the purpose. Use 1 hour for API credentials.
- **Hardcoding Vault address:** Use environment variables or Kubernetes service discovery.
- **Not testing lease renewal:** If your app does not renew, credentials expire mid-request.

---

## Exercises

1. [Exercise 1 — Dynamic database credentials](exercises/01-dynamic-creds.md)
2. [Exercise 2 — AppRole authentication](exercises/02-approle.md)
3. [Exercise 3 — SSH certificates](exercises/03-ssh-certs.md)

**Next stage:** [07-security-pipeline](../07-security-pipeline/README.md) — the full automated security pipeline.
