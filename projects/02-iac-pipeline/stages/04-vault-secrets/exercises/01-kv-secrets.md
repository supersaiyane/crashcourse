# Exercise 1: KV v2 Secrets — Store and Version FinStack Credentials

**Goal:** Enable the KV v2 secrets engine, store FinStack database credentials, read them back, create a second version, and rollback to the original.

**Time:** 20 minutes

**Prerequisites:** Vault and PostgreSQL running via `docker compose up -d`. Environment variables set:

```bash
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='root-token-finstack'
```

---

## Step 1: Verify KV v2 is enabled

Dev mode enables KV v2 at `secret/` by default. Confirm:

```bash
vault secrets list
# Look for:
# secret/    kv           kv_version:2    ...
```

If it is missing (non-dev server), enable it:

```bash
vault secrets enable -path=secret -version=2 kv
```

---

## Step 2: Store FinStack DB credentials (version 1)

```bash
vault kv put secret/finstack/db \
  username=finstack_app \
  password=initial_s3cur3_pass \
  host=localhost \
  port=5432 \
  dbname=finstack
```

Expected output:

```
=== Secret Path ===
secret/data/finstack/db

======= Metadata =======
Key                Value
---                -----
created_time       2026-06-02T...
version            1
```

---

## Step 3: Read the secret

```bash
# Full secret
vault kv get secret/finstack/db

# Single field
vault kv get -field=password secret/finstack/db
# Output: initial_s3cur3_pass

# As JSON (useful for scripting)
vault kv get -format=json secret/finstack/db | jq -r '.data.data.password'

# List all secrets under finstack/
vault kv list secret/finstack/
```

---

## Step 4: Create version 2 (rotate the password)

```bash
vault kv put secret/finstack/db \
  username=finstack_app \
  password=rotated_n3w_pass \
  host=localhost \
  port=5432 \
  dbname=finstack
```

Verify:

```bash
vault kv get -field=password secret/finstack/db
# Output: rotated_n3w_pass

# Version 1 is still available
vault kv get -version=1 -field=password secret/finstack/db
# Output: initial_s3cur3_pass
```

---

## Step 5: View version metadata

```bash
vault kv metadata get secret/finstack/db
# Shows all versions with creation times and deletion status
```

---

## Step 6: Rollback to version 1

```bash
vault kv rollback -version=1 secret/finstack/db
# This creates version 3, which is a copy of version 1

vault kv get -field=password secret/finstack/db
# Output: initial_s3cur3_pass   (back to the original)
```

Rollback does not rewrite history. It creates a new version whose contents match the version you rolled back to. `vault kv metadata get` will show 3 versions.

---

## Step 7: Soft-delete and restore

```bash
# Soft-delete the latest version
vault kv delete secret/finstack/db

# Try to read — returns no data
vault kv get secret/finstack/db

# Restore it
vault kv undelete -versions=3 secret/finstack/db

# Confirm restored
vault kv get -field=password secret/finstack/db
# Output: initial_s3cur3_pass
```

---

## You're done when

- `vault kv get -field=password secret/finstack/db` returns `initial_s3cur3_pass`
- `vault kv metadata get secret/finstack/db` shows 3 versions
- You can explain why the API path uses `secret/data/` (this matters when writing policies)
- You understand that rollback creates a new version rather than rewriting history
