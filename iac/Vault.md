# Vault — A 2-Day Crash Course

> **In one sentence:** HashiCorp Vault is a secrets management tool that stores, generates, and controls access to tokens, passwords, certificates, and encryption keys — the single source of truth for every secret in your infrastructure.

---

## Part 0 — Why Vault exists

You've seen the pattern. A developer hardcodes an API key in a config file, commits it to Git, and a month later it leaks. Or your team stores database passwords in a shared wiki page that nobody rotates because "it's too risky to touch." Or you pass secrets as environment variables and they end up in a Docker inspect output, a crash dump, or a CI log. There's no audit trail — you have no idea who accessed what, when, or from where.

These are not edge cases. They're the default state of infrastructure that grew organically. The consequences are data breaches, compliance failures, and on-call incidents that happen at 3am when an expired credential brings down a service.

Vault solves four things at once:

- **Storage** — encrypted at rest, with a pluggable backend (file, Consul, Raft, S3, and more)
- **Access control** — only authenticated, authorized identities can read a secret
- **Audit** — every read, write, and deletion is logged with a full identity trail
- **Lifecycle** — secrets can be generated on demand, given a TTL, automatically rotated, and revoked

The shift in thinking is from "where do I put this password" to "how does my service prove its identity to get the credential it needs, exactly when it needs it."

**Mental model:** Vault is a bank vault with a programmable API. You deposit secrets. Every client — a developer, a CI pipeline, a Kubernetes pod — must authenticate (show ID at the door) before they can reach the teller window. The teller checks their policy (what they're allowed to withdraw), hands over only what they're entitled to, and writes every transaction in a permanent ledger. The vault itself is locked (sealed) when the bank is closed, and only a quorum of keyholders can open it.

```mermaid
graph TD
    A[Developer] -->|userpass / LDAP| V[Vault Server]
    B[CI Pipeline] -->|AppRole / OIDC| V
    C[K8s Pod] -->|ServiceAccount JWT| V
    V -->|KV engine| D[Static Secrets]
    V -->|Database engine| E[Dynamic Creds<br/>Postgres / MySQL]
    V -->|PKI engine| F[TLS Certificates]
    V -->|Transit engine| G[Encryption as a Service]
    V -->|Audit backend| H[Audit Log<br/>file / syslog]
    V -->|Raft / Consul| I[HA Storage]
    J[Cloud KMS<br/>AWS / GCP / Azure] -->|auto-unseal| V
    K[Vault Agent<br/>sidecar] -->|token renewal<br/>secret templating| C
    V -->|policy check| L[HCL Policies]
```

---

## Part 1 — The vocabulary

| Term | What it means |
|---|---|
| **Secret Engine** | A plugin that knows how to store or generate secrets. KV stores static key-value pairs. Database engine generates ephemeral credentials. PKI issues certificates. Transit encrypts data. Each engine is mounted at a path. |
| **Auth Method** | How a client proves its identity. Token, username/password, AppRole, AWS IAM, Kubernetes ServiceAccount, GitHub, LDAP — each is an auth method mounted at a path. |
| **Policy** | An HCL or JSON document that grants or denies capabilities (create, read, update, delete, list, sudo) on paths. Policies are attached to tokens. |
| **Token** | The bearer credential Vault issues after successful authentication. Everything in Vault eventually comes back to a token. Tokens have TTLs, policies, and optional use limits. |
| **Lease** | A time-bound grant on a secret. When a lease expires, the secret is revoked. Dynamic secrets always carry a lease. |
| **Dynamic Secret** | A credential Vault generates on demand for a specific requester with a specific TTL. The database engine creates a unique Postgres user per request; Vault drops that user when the lease expires. |
| **Seal/Unseal** | Vault encrypts its storage with a master key. On startup it is sealed — it knows nothing. Unseal keys (or an auto-unseal provider) are required to decrypt the master key and make Vault operational. |
| **Transit** | A secret engine that provides encryption-as-a-service. Your app sends plaintext; Vault returns ciphertext. The encryption key never leaves Vault. |
| **PKI** | A secret engine that acts as a certificate authority. Issues X.509 certificates with configurable TTLs. Enables short-lived certs as an alternative to long-lived TLS certificates. |
| **Audit Backend** | A log sink — file, syslog, or socket — that receives a structured record of every request and response. Sensitive fields are hashed. You should always have at least one enabled. |

---

## DAY 1 — Store and retrieve secrets

### 1. Install Vault and start dev mode

On macOS with Homebrew:

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/vault
```

On Linux (Debian/Ubuntu):

```bash
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install vault
```

Start in dev mode for local experimentation. Dev mode starts Vault in-memory, auto-unsealed, with a root token printed to stdout. Never run dev mode in production.

```bash
vault server -dev
```

In a second terminal, export the address and root token:

```bash
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='<root token from output>'
vault status
```

`vault status` should show `Sealed: false`.

### 2. Write and read KV secrets

Vault ships with a key-value engine mounted at `secret/` in dev mode. Version 2 (KV v2) adds versioning and soft delete.

```bash
# Write a secret
vault kv put secret/myapp/config db_password="s3cur3" api_key="abc123"

# Read it back
vault kv get secret/myapp/config

# Read a single field
vault kv get -field=db_password secret/myapp/config

# List secrets at a path
vault kv list secret/myapp/

# Update — this creates a new version, old version is retained
vault kv put secret/myapp/config db_password="newpassword" api_key="abc123"

# Read a previous version
vault kv get -version=1 secret/myapp/config

# Delete the latest version (soft delete — metadata retained)
vault kv delete secret/myapp/config

# Permanently destroy a version
vault kv destroy -versions=1 secret/myapp/config
```

Enable KV v2 on a custom path:

```bash
vault secrets enable -path=infra kv-v2
vault kv put infra/database/prod host="db.internal" port="5432"
```

### 3. Auth methods — Token, Userpass, AppRole

**Token auth** is the default. Every other auth method ultimately issues a token.

```bash
# Create a token with a 1-hour TTL
vault token create -ttl=1h

# Create a token with specific policies
vault token create -policy=read-only -ttl=1h

# Look up the current token
vault token lookup

# Revoke a token
vault token revoke <token>
```

**Userpass** is the simplest human-friendly auth method:

```bash
# Enable it
vault auth enable userpass

# Create a user
vault write auth/userpass/users/alice password="correcthorsebattery" policies="read-only"

# Log in — Vault returns a token
vault login -method=userpass username=alice
```

**AppRole** is designed for machine-to-machine auth — a CI runner or a microservice. It uses two credentials: a Role ID (non-sensitive, like a username) and a Secret ID (sensitive, one-time use, short-lived). The machine presents both to get a token.

```bash
# Enable AppRole
vault auth enable approle

# Create a role for a web service
vault write auth/approle/role/web-service \
  secret_id_ttl=10m \
  token_num_uses=10 \
  token_ttl=20m \
  token_max_ttl=30m \
  secret_id_num_uses=40 \
  policies="web-service-policy"

# Fetch the Role ID (distribute this with your app config)
vault read auth/approle/role/web-service/role-id

# Generate a Secret ID (do this at deploy time, not baked into images)
vault write -f auth/approle/role/web-service/secret-id

# Authenticate with both
vault write auth/approle/login \
  role_id="<role-id>" \
  secret_id="<secret-id>"
```

The pattern: your CI pipeline (which authenticates to Vault via its own auth method) wraps a secret ID and injects it into the deployment. The app uses the role ID from config and the secret ID from the injection to authenticate at startup. See `GitHub-Actions.md` and `GitLab-CI.md` for how this connects to pipeline secrets.

### 4. Write policies in HCL

Policies are the permission layer. Without a policy granting access, a token can do nothing.

```hcl
# read-only.hcl — read KV secrets under myapp/
path "secret/data/myapp/*" {
  capabilities = ["read", "list"]
}

# web-service-policy.hcl — read config and DB secrets
path "secret/data/myapp/config" {
  capabilities = ["read"]
}

path "database/creds/web-service" {
  capabilities = ["read"]
}

# Allow the service to renew its own token
path "auth/token/renew-self" {
  capabilities = ["update"]
}
```

Write the policy to Vault:

```bash
vault policy write read-only read-only.hcl
vault policy write web-service-policy web-service-policy.hcl

# List all policies
vault policy list

# Read a policy
vault policy read web-service-policy
```

The `secret/data/` prefix is the KV v2 API path — the data is always at `data/<path>` even though you write with `kv put secret/<path>`. Keep this in mind when writing policies.

### 5. Sealing and unsealing

In production, Vault uses Shamir's Secret Sharing to split the master key into N shares, requiring a threshold K to reconstruct it (e.g., 5 shares, threshold of 3). This is generated at `vault operator init`.

```bash
# Initialize Vault — do this once on a fresh instance
vault operator init -key-shares=5 -key-threshold=3
# Output: 5 unseal keys and 1 root token — store these securely, separately

# Unseal — repeat with 3 different unseal keys
vault operator unseal <unseal-key-1>
vault operator unseal <unseal-key-2>
vault operator unseal <unseal-key-3>

# Seal Vault — immediate lockdown
vault operator seal

# Check status
vault status
```

⚠️ The unseal keys and root token from `vault operator init` are shown exactly once. If you lose them, your data is gone. Store them in separate, secure, offline locations — not in Vault itself.

---

**By end of Day 1 you can:**
- Run a local Vault server and interact with it via CLI
- Write and read KV secrets with versioning
- Enable and configure token, userpass, and AppRole auth methods
- Write HCL policies that grant specific capabilities on specific paths
- Understand sealing, unsealing, and initialization

---

## DAY 2 — Make it real

### 1. Dynamic secrets — database credentials

This is the feature that changes how you think about credentials entirely. Instead of a shared, long-lived password, each service instance gets its own short-lived credential that Vault creates directly in the database and destroys when the lease expires.

```bash
# Enable the database engine
vault secrets enable database

# Configure a Postgres connection (Vault uses this to manage credentials)
vault write database/config/my-postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="web-service" \
  connection_url="postgresql://{{username}}:{{password}}@db.internal:5432/appdb" \
  username="vault" \
  password="vaultpassword"

# Create a role — define the SQL Vault runs to create and revoke creds
vault write database/roles/web-service \
  db_name=my-postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  revocation_statements="DROP ROLE IF EXISTS \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"

# Request a credential — your app or pipeline calls this
vault read database/creds/web-service
```

The output is a unique username, a password, and a lease ID. When the TTL expires, Vault drops the Postgres role. No manual rotation. No shared passwords. Each deployment gets its own identity in the database, which means you can trace any database action back to a specific Vault token and therefore a specific service instance.

### 2. PKI — certificate generation

The PKI engine turns Vault into a certificate authority. Short-lived certificates (hours or days) are safer than long-lived ones (years) because there's less time for a compromised cert to be abused.

```bash
# Enable PKI engine
vault secrets enable pki

# Set a maximum TTL for this CA
vault secrets tune -max-lease-ttl=87600h pki

# Generate the root CA
vault write -field=certificate pki/root/generate/internal \
  common_name="my-org.internal" \
  ttl=87600h > ca.crt

# Configure issuing and CRL URLs
vault write pki/config/urls \
  issuing_certificates="$VAULT_ADDR/v1/pki/ca" \
  crl_distribution_points="$VAULT_ADDR/v1/pki/crl"

# Create a role for issuing certs
vault write pki/roles/internal-services \
  allowed_domains="internal" \
  allow_subdomains=true \
  max_ttl=72h

# Issue a certificate
vault write pki/issue/internal-services \
  common_name="web-service.internal" \
  ttl=24h
```

In practice you use an intermediate CA, not the root, for day-to-day issuance. The root CA cert is kept offline or in a hardware security module; Vault holds the intermediate. See cert-manager in the Kubernetes ecosystem for an integration that automates certificate issuance and renewal in clusters.

### 3. Transit engine — encryption as a service

Your application should not be in the business of managing encryption keys. The Transit engine lets Vault handle encryption and decryption — your app sends plaintext, Vault returns ciphertext. The key never leaves Vault.

```bash
# Enable Transit
vault secrets enable transit

# Create a named encryption key
vault write -f transit/keys/user-data

# Encrypt data — plaintext must be base64-encoded
vault write transit/encrypt/user-data \
  plaintext=$(echo -n "sensitive-value" | base64)
# Returns: vault:v1:ciphertext...

# Decrypt
vault write transit/decrypt/user-data \
  ciphertext="vault:v1:..."
# Returns base64-encoded plaintext — decode with base64 -d

# Rotate the key — new encryptions use v2, old ciphertext still decryptable
vault write -f transit/keys/user-data/rotate

# Rewrap old ciphertext to use new key version
vault write transit/rewrap/user-data \
  ciphertext="vault:v1:..."
```

The `vault:v1:` prefix in ciphertext tells you which key version was used. After rotation, rewrap your old ciphertext so everything is on the current key version. This separates key management from your application code — you don't store keys in your codebase or environment.

### 4. Auto-unseal with cloud KMS

Manual unseal with Shamir keys is operationally painful — every restart requires a human (or a quorum of humans) to provide unseal keys. Auto-unseal delegates this to a cloud KMS. On startup, Vault calls the KMS to decrypt the master key automatically.

For AWS KMS, in your Vault config file:

```hcl
seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "alias/vault-unseal"
}
```

For GCP Cloud KMS:

```hcl
seal "gcpckms" {
  project    = "my-project"
  region     = "global"
  key_ring   = "vault-keyring"
  crypto_key = "vault-unseal"
}
```

The Vault process's IAM role must have permission to call the KMS decrypt operation. You still have Shamir recovery keys as a fallback, but normal restarts are fully automated. This is a prerequisite for running Vault in autoscaling groups or Kubernetes.

### 5. High availability with Raft

Vault's integrated storage backend (Raft) gives you HA without an external Consul cluster. One node is the active leader; the rest are standbys that forward requests to the leader and can promote if it fails.

```hcl
storage "raft" {
  path    = "/opt/vault/data"
  node_id = "vault-1"
}

listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_cert_file = "/etc/vault.d/vault.crt"
  tls_key_file  = "/etc/vault.d/vault.key"
}

api_addr     = "https://vault-1.internal:8200"
cluster_addr = "https://vault-1.internal:8201"
```

Join additional nodes to the cluster:

```bash
vault operator raft join https://vault-1.internal:8200
vault operator raft list-peers
```

For production, three nodes is the minimum for fault tolerance (tolerates one failure). Five nodes tolerates two failures. Run nodes in separate availability zones.

### 6. Kubernetes auth

When your workloads run in Kubernetes, the Kubernetes auth method lets pods authenticate using their ServiceAccount JWT token — no credentials to inject at deploy time. See `Kubernetes.md` for cluster-level context.

```bash
# Enable Kubernetes auth
vault auth enable kubernetes

# Configure it — Vault calls the K8s API to verify ServiceAccount tokens
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc" \
  kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
  token_reviewer_jwt=@/var/run/secrets/kubernetes.io/serviceaccount/token

# Create a role binding a K8s ServiceAccount to a Vault policy
vault write auth/kubernetes/role/web-service \
  bound_service_account_names=web-service \
  bound_service_account_namespaces=production \
  policies=web-service-policy \
  ttl=1h
```

Inside the pod, authenticate:

```bash
vault write auth/kubernetes/login \
  role=web-service \
  jwt=@/var/run/secrets/kubernetes.io/serviceaccount/token
```

### 7. Vault Agent and CSI driver

Your application shouldn't need to know anything about Vault. Vault Agent is a sidecar/daemon that handles authentication, token renewal, and secret templating — writing secrets to files or environment variables that your app reads normally.

Vault Agent config example:

```hcl
auto_auth {
  method "kubernetes" {
    mount_path = "auth/kubernetes"
    config = {
      role = "web-service"
    }
  }

  sink "file" {
    config = {
      path = "/home/vault/.vault-token"
    }
  }
}

template {
  source      = "/etc/vault-agent/config.tmpl"
  destination = "/etc/app/config.env"
  perms       = "0640"
}
```

Template file example:

```
{{ with secret "secret/data/myapp/config" }}
DB_PASSWORD={{ .Data.data.db_password }}
API_KEY={{ .Data.data.api_key }}
{{ end }}
```

The Vault CSI provider integrates with Kubernetes' Secrets Store CSI Driver to mount Vault secrets as files or Kubernetes Secrets. This is the preferred pattern for Kubernetes workloads — your pod spec references a `SecretProviderClass` and the CSI driver handles the rest. See `Kubernetes.md` for the full deployment pattern.

### 8. Audit logging

Without audit logging, you don't know who accessed what. Enable at least one audit backend on day one.

```bash
# Log to file
vault audit enable file file_path=/var/log/vault/audit.log

# Log to syslog
vault audit enable syslog

# List enabled backends
vault audit list

# Disable
vault audit disable file/
```

⚠️ If all audit backends fail (e.g., disk full), Vault stops processing requests by default. This is a safety feature — you'd rather have an outage than unaudited access. Monitor your audit log destination.

Audit log entries are JSON. Sensitive values (tokens, passwords) are HMAC-SHA256 hashed. You can verify whether a specific token appeared in the logs by computing the HMAC yourself using the audit log's salt.

### 9. Secret rotation and lease management

For dynamic secrets, rotation is automatic — leases expire and credentials are revoked. For static secrets (KV), you need a rotation strategy.

```bash
# List leases for dynamic secrets
vault list sys/leases/lookup/database/creds/web-service/

# Renew a lease (if the TTL hasn't hit max_ttl)
vault lease renew database/creds/web-service/<lease-id>

# Revoke a lease immediately
vault lease revoke database/creds/web-service/<lease-id>

# Revoke all leases under a prefix — useful for incident response
vault lease revoke -prefix database/creds/web-service/

# Force rotation of a static secret (KV v2)
vault kv put secret/myapp/config db_password="$(openssl rand -base64 32)"
```

For automated rotation of static credentials, Vault Enterprise has a static roles feature for the database engine that rotates credentials on a schedule. In open-source Vault, build a rotation job using `vault write database/rotate-root/<config-name>` or use external tooling.

---

## Worked example — Dynamic database credentials for a microservice

The scenario: a `payments` service running in Kubernetes needs to connect to Postgres. You want each pod to have its own short-lived credentials, automatically revoked when the pod terminates.

**Step 1 — Configure the database engine:**

```bash
vault write database/config/payments-db \
  plugin_name=postgresql-database-plugin \
  allowed_roles="payments-service" \
  connection_url="postgresql://{{username}}:{{password}}@payments-db.internal:5432/payments" \
  username="vault_manager" \
  password="$(cat /run/secrets/vault_manager_password)"
```

**Step 2 — Define the role:**

```bash
vault write database/roles/payments-service \
  db_name=payments-db \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT, INSERT, UPDATE ON payments, transactions TO \"{{name}}\";" \
  revocation_statements="REVOKE ALL ON ALL TABLES IN SCHEMA public FROM \"{{name}}\"; DROP ROLE IF EXISTS \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="4h"
```

**Step 3 — Write the policy:**

```hcl
# payments-policy.hcl
path "database/creds/payments-service" {
  capabilities = ["read"]
}
path "auth/token/renew-self" {
  capabilities = ["update"]
}
path "sys/leases/renew" {
  capabilities = ["update"]
}
```

```bash
vault policy write payments-policy payments-policy.hcl
```

**Step 4 — Bind the Kubernetes ServiceAccount:**

```bash
vault write auth/kubernetes/role/payments-service \
  bound_service_account_names=payments-service \
  bound_service_account_namespaces=payments \
  policies=payments-policy \
  ttl=1h
```

**Step 5 — Deploy Vault Agent as a sidecar:**

The Vault Agent authenticates using the pod's ServiceAccount token, fetches database credentials, and writes them to a shared in-memory volume that the `payments` container reads as environment variables. The agent renews the token and re-fetches credentials before they expire.

**What you get:** Every pod has a unique Postgres user. When you `kubectl delete pod`, Vault eventually revokes the lease and Postgres drops the user. If a pod is compromised, you revoke its specific lease immediately — `vault lease revoke <lease-id>` — with zero impact on other running pods. See `Docker.md` for the equivalent pattern using Vault Agent as a standalone sidecar in Compose stacks.

---

## Common pitfalls

- **Never store the root token anywhere persistent.** Generate it at init, use it to set up auth methods and policies, then revoke it. Use a dedicated admin token with a tight policy for ongoing operations. If you need it again, use `vault operator generate-root`.

- **Unseal key hygiene is non-negotiable.** Split unseal keys across people or locations. Store them offline. Practice recovery before you need it in a crisis. A Shamir key in the same S3 bucket as your Vault data offers no protection.

- **Lease expiry surprises applications.** Dynamic credentials have TTLs. If your app holds a database connection past the lease expiry, the Postgres user is dropped and the connection dies. Design your connection pool to handle reconnects, and have the app or Vault Agent renew leases proactively.

- **KV v1 vs v2 path confusion.** KV v2 stores data at `secret/data/<path>` but you interact with it using `vault kv` commands at `secret/<path>`. Policies must reference `secret/data/<path>`. Getting this wrong produces cryptic permission denied errors.

- **Forgetting to enable audit logging on day one.** You cannot reconstruct an audit trail retroactively. Enable it before the first real secret is written.

- **Mounting the same engine path twice.** If you `vault secrets enable -path=secret kv-v2` on a cluster that already has `secret/` mounted, you'll get an error — or worse, you'll overwrite data if you disable and re-enable. Always check `vault secrets list` before enabling.

- **Token TTL vs max TTL.** A token can be renewed up to `max_ttl` from creation, not from last renewal. A token with a 1h TTL and 24h max TTL can be renewed up to 24 hours after it was created, not 24 hours after each renewal. This catches people off guard in long-running processes.

- **Namespace and path sprawl.** It's easy to mount dozens of engines with overlapping purposes. Document your path conventions early (`secret/<team>/<service>/<environment>`) and enforce them with policy.

- **Not testing unsealing after auto-unseal configuration.** Auto-unseal is only as reliable as your KMS IAM permissions. Test a full restart cycle in staging before relying on it in production.

- **Audit log destination failures.** As noted above, Vault blocks all requests if audit backends are unavailable. Alert on audit log write failures before they cause an outage.

---

## Quick command reference

### Secrets

```bash
vault secrets list                          # list mounted engines
vault secrets enable -path=<path> <engine>  # mount an engine
vault secrets disable <path>/               # unmount
vault kv put <path> key=value               # write KV secret
vault kv get <path>                         # read KV secret
vault kv get -field=<key> <path>            # read single field
vault kv list <path>                        # list keys
vault kv delete <path>                      # soft delete (v2)
vault kv undelete -versions=<n> <path>      # restore deleted version
vault kv destroy -versions=<n> <path>       # permanent destroy
vault kv metadata get <path>                # version metadata
vault read <path>                           # read any engine path
vault write <path> key=value                # write any engine path
vault lease renew <lease-id>                # renew a lease
vault lease revoke <lease-id>               # revoke a lease
vault lease revoke -prefix <path>/          # revoke all under path
```

### Auth

```bash
vault auth list                             # list auth methods
vault auth enable <method>                  # enable an auth method
vault auth disable <path>/                  # disable
vault login -method=<method> [params]       # authenticate
vault token create -policy=<p> -ttl=<t>    # create token
vault token lookup [token]                  # inspect token
vault token renew [token]                   # renew token
vault token revoke <token>                  # revoke token
vault write auth/approle/role/<name> ...    # configure AppRole
vault read auth/approle/role/<name>/role-id # get Role ID
vault write -f auth/approle/role/<name>/secret-id  # generate Secret ID
```

### Policy

```bash
vault policy list                           # list policies
vault policy write <name> <file.hcl>        # create/update policy
vault policy read <name>                    # show policy
vault policy delete <name>                  # delete policy
vault token capabilities <path>             # what can current token do at path
```

### Operator

```bash
vault operator init -key-shares=5 -key-threshold=3   # initialize
vault operator unseal <key>                           # unseal step
vault operator seal                                   # seal immediately
vault operator step-down                              # step down as leader
vault operator raft list-peers                        # HA cluster peers
vault operator raft join <leader-addr>                # join cluster
vault operator generate-root -init                    # start root token gen
vault operator rotate                                 # rotate encryption key
vault audit enable file file_path=<path>              # enable audit log
vault audit list                                      # list audit backends
vault audit disable <path>/                           # disable audit backend
```

### Server

```bash
vault server -config=<file>    # start server with config file
vault server -dev              # start in dev mode (never production)
vault status                   # cluster status, seal state, version
```

---

## Top 10 Interview Questions

<details>
<summary><strong>Q: What is the difference between static and dynamic secrets in Vault?</strong></summary>

Static secrets are key-value pairs you write manually and rotate on your own schedule (KV engine). Dynamic secrets are generated on demand with a TTL — Vault creates a unique credential (e.g., a Postgres user) per request and automatically revokes it when the lease expires. Dynamic secrets eliminate shared, long-lived passwords and give you per-client identity in the database.

</details>

<details>
<summary><strong>Q: Explain the seal/unseal process and why it exists.</strong></summary>

Vault encrypts all storage with a master key. On startup, Vault is sealed — it cannot read its own data. Unsealing requires a quorum of Shamir key shares (e.g., 3 of 5) to reconstruct the master key. This ensures no single person or compromised key can access the vault. In production, auto-unseal via cloud KMS replaces the manual process while preserving the security model.

</details>

<details>
<summary><strong>Q: How does AppRole authentication work and when would you use it?</strong></summary>

AppRole uses two credentials: a Role ID (non-sensitive, like a username) and a Secret ID (sensitive, short-lived, often single-use). A machine presents both to get a Vault token. You use it for service-to-Vault authentication — your CI pipeline generates a Secret ID at deploy time and injects it into the service, which combines it with its baked-in Role ID to authenticate at startup.

</details>

<details>
<summary><strong>Q: What is the Transit engine and how does it differ from storing encrypted data in KV?</strong></summary>

The Transit engine provides encryption-as-a-service — your application sends plaintext, Vault returns ciphertext, and the encryption key never leaves Vault. With KV, you store the secret itself in Vault. Transit is for encrypting data your application stores elsewhere (a database field, a file), while KV is for centralizing the secrets themselves. Transit also supports key rotation and re-wrapping without exposing the key material.

</details>

<details>
<summary><strong>Q: How do you handle Vault in a Kubernetes environment?</strong></summary>

Enable the Kubernetes auth method so pods authenticate using their ServiceAccount JWT — no injected credentials needed. Use the Vault Agent Injector (a mutating webhook) to automatically add a sidecar that handles token renewal and writes secrets to shared volumes. Alternatively, the Vault CSI Provider mounts secrets as files via the Secrets Store CSI Driver. The pod never calls the Vault API directly.

</details>

<details>
<summary><strong>Q: What happens when a dynamic secret lease expires while an application is using it?</strong></summary>

Vault revokes the credential in the backend system (e.g., drops the Postgres user). Any active database connections using that credential will fail on the next query. Applications must be designed to handle reconnects, and Vault Agent or the application itself should renew leases proactively before expiry. Setting appropriate TTLs and max TTLs is critical to avoid mid-request credential revocation.

</details>

<details>
<summary><strong>Q: Why is audit logging critical in Vault, and what happens if audit backends fail?</strong></summary>

Audit logging records every request and response with full identity context, providing a tamper-evident trail for compliance and incident investigation. If all configured audit backends become unavailable (e.g., disk full), Vault stops processing all requests by design — it refuses to operate without an audit trail. This is a safety feature, but it means you must monitor audit log destinations and alert on write failures.

</details>

<details>
<summary><strong>Q: Explain Vault's policy system and the principle of least privilege.</strong></summary>

Policies are HCL documents that grant or deny capabilities (create, read, update, delete, list, sudo) on specific paths. Every token has one or more policies attached. Without an explicit allow, access is denied by default. You follow least privilege by granting each service only the paths and capabilities it needs — a payments service reads `database/creds/payments` and nothing else. The `root` policy bypasses all checks and should be revoked after initial setup.

</details>

<details>
<summary><strong>Q: How do you set up Vault for high availability?</strong></summary>

Use the integrated Raft storage backend with a minimum of three nodes across separate availability zones. One node is the active leader handling all writes; standbys forward requests and can promote if the leader fails. Auto-unseal via cloud KMS ensures nodes recover from restarts without human intervention. For larger deployments, five nodes tolerate two simultaneous failures.

</details>

<details>
<summary><strong>Q: How would you rotate the root token and manage break-glass access?</strong></summary>

After initial setup, revoke the root token with `vault token revoke`. For emergency access, use `vault operator generate-root` which requires a quorum of unseal key holders to produce a new root token — this is your break-glass procedure. Day-to-day administration should use dedicated admin tokens with tightly scoped policies, not root. Document and rehearse the root token generation process so it works under pressure.

</details>

---

## Next steps after Day 2

- **`Terraform.md`** — Manage Vault configuration (mounts, policies, auth methods, roles) as code using the Vault Terraform provider. Store Terraform state in a Vault-secured backend.

- **`Kubernetes.md`** — Deploy Vault on Kubernetes using the official Helm chart, configure Vault Agent Injector for automatic sidecar injection, and set up the Vault CSI Provider for file-based secret delivery to pods.

- **`Docker.md`** — Use Vault Agent as a sidecar in Docker Compose stacks for local development parity with production secret delivery patterns.

- **`GitHub-Actions.md`** — Authenticate GitHub Actions workflows to Vault using OIDC (no stored secrets in GitHub), retrieve secrets during CI, and inject them into build and deploy steps.

- **`GitLab-CI.md`** — Use GitLab's native Vault integration (`secrets:` keyword) or the Vault CLI in pipelines to fetch secrets at job runtime using JWT auth.

- **Consul** — If you need Vault's HA storage backed by Consul rather than Raft, or if you use Consul for service mesh and want Vault to issue short-lived certificates for mTLS between services.

- **cert-manager** — In Kubernetes, cert-manager's Vault issuer uses the PKI engine to automatically provision and rotate TLS certificates for ingress controllers and internal services.

---

## Recommended learning resources

**YouTube channels & playlists:**
- [HashiCorp — HashiConf Vault Talks](https://www.youtube.com/@HashiCorp) — official sessions on secrets engines, auth methods, and production architecture
- [Ned in the Cloud — Vault Deep Dives](https://www.youtube.com/@NedintheCloud) — practical walkthroughs of dynamic secrets, transit encryption, and HA setup
- [KodeKloud — Vault for Beginners](https://www.youtube.com/@KodeKloud) — hands-on labs covering seal/unseal, policies, and AppRole auth
- [TechWorld with Nana — Vault Crash Course](https://www.youtube.com/@TechWorldwithNana) — beginner-friendly introduction to secrets management concepts
- [Spacelift — Secrets Management Patterns](https://www.youtube.com/@spacelift-io) — Vault in the context of IaC and CI/CD pipelines

**Official docs & blogs:**
- [Vault Documentation](https://developer.hashicorp.com/vault/docs) — secrets engines, auth methods, and operational guides
- [HashiCorp Blog — Vault](https://www.hashicorp.com/blog/products/vault) — release announcements, zero-trust patterns, and production case studies
- [HashiCorp Learn — Vault Tutorials](https://developer.hashicorp.com/vault/tutorials) — step-by-step guides from first secret to production HA clusters

**The mantra:** Every secret has an owner, a TTL, and an audit trail — if it doesn't, it isn't a secret, it's a liability.
