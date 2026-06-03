# Exercise 3: AppRole Authentication — Machine Identity for FinStack

**Goal:** Enable AppRole auth, write a least-privilege policy, create a role for the FinStack application, authenticate with role_id + secret_id, and verify the resulting token can only access allowed paths.

**Time:** 30 minutes

**Prerequisites:** Exercises 1 and 2 completed. KV secrets and database engine configured.

---

## Step 1: Write the FinStack application policy

Create a file `finstack-app-policy.hcl`:

```hcl
# Read static secrets for finstack
path "secret/data/finstack/*" {
  capabilities = ["read", "list"]
}

# Read version metadata
path "secret/metadata/finstack/*" {
  capabilities = ["read", "list"]
}

# Generate dynamic database credentials
path "database/creds/finstack-app" {
  capabilities = ["read"]
}

# Renew own token
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Deny everything else explicitly
path "sys/*" {
  capabilities = ["deny"]
}
```

Upload it to Vault:

```bash
vault policy write finstack-app-policy finstack-app-policy.hcl

# Verify
vault policy read finstack-app-policy
```

---

## Step 2: Enable AppRole and create a role

```bash
vault auth enable approle

vault write auth/approle/role/finstack-app \
  token_policies="finstack-app-policy" \
  token_ttl=1h \
  token_max_ttl=4h \
  secret_id_ttl=10m \
  secret_id_num_uses=1
```

Key settings:
- `token_ttl=1h` — token expires after 1 hour
- `secret_id_ttl=10m` — the secret_id must be used within 10 minutes
- `secret_id_num_uses=1` — single-use secret_id prevents replay attacks

---

## Step 3: Get role_id and generate secret_id

```bash
vault read auth/approle/role/finstack-app/role-id
# Note the role_id value

vault write -f auth/approle/role/finstack-app/secret-id
# Note the secret_id value
```

---

## Step 4: Authenticate (simulate the application)

```bash
vault write auth/approle/login \
  role_id=<role_id_from_step_3> \
  secret_id=<secret_id_from_step_3>
```

Expected output:

```
Key                     Value
---                     -----
token                   hvs.CAESIG...
token_accessor          ...
token_duration          1h
token_policies          ["default" "finstack-app-policy"]
```

Save the token:

```bash
export APP_TOKEN=<token_from_above>
```

---

## Step 5: Use the token to read allowed secrets

```bash
# Read KV secret — should succeed
VAULT_TOKEN=$APP_TOKEN vault kv get -field=password secret/finstack/db
# Output: initial_s3cur3_pass

# Generate dynamic DB credentials — should succeed
VAULT_TOKEN=$APP_TOKEN vault read database/creds/finstack-app
# Output: new username and password
```

---

## Step 6: Verify denied paths

```bash
# Try to write a secret — should be denied
VAULT_TOKEN=$APP_TOKEN vault kv put secret/finstack/db password=hacked
# Error: permission denied

# Try to read outside finstack/ — should be denied
VAULT_TOKEN=$APP_TOKEN vault kv get secret/admin/master-key
# Error: permission denied

# Try to list policies — should be denied
VAULT_TOKEN=$APP_TOKEN vault policy list
# Error: permission denied
```

The token can only do what the policy allows. This is least privilege in action.

---

## Step 7: Verify single-use secret_id

Try to authenticate again with the same secret_id:

```bash
# Generate a new secret_id first (the old one was consumed)
vault write -f auth/approle/role/finstack-app/secret-id
# Use it once — succeeds
# Try the same secret_id again — fails with "invalid secret id"
```

Single-use secret_ids prevent replay attacks. Each deployment gets a fresh secret_id.

---

## You're done when

- `vault write auth/approle/login` returns a token with `finstack-app-policy`
- The token can read `secret/finstack/db` and `database/creds/finstack-app`
- The token is denied when writing secrets or reading outside `finstack/*`
- You can explain why role_id and secret_id are separated: the deployer knows one, the app receives the other, neither alone grants access
