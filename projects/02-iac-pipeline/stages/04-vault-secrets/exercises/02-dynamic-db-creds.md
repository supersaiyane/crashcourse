# Exercise 2: Dynamic Database Credentials — Short-Lived PostgreSQL Access

**Goal:** Enable the database secrets engine, configure it against the PostgreSQL container, create a role with a 1-hour TTL, generate dynamic credentials, verify they work, and revoke them.

**Time:** 30 minutes

**Prerequisites:** Exercise 1 completed. Vault and PostgreSQL running. Environment variables set.

---

## Step 1: Enable the database secrets engine

```bash
vault secrets enable database

# Verify
vault secrets list | grep database
# database/    database    ...
```

---

## Step 2: Configure the PostgreSQL connection

```bash
vault write database/config/finstack-db \
  plugin_name=postgresql-database-plugin \
  allowed_roles="finstack-app" \
  connection_url="postgresql://{{username}}:{{password}}@host.docker.internal:5432/finstack?sslmode=disable" \
  username="vault_admin" \
  password="vault_admin_password"
```

> If `host.docker.internal` does not resolve (Linux without Docker Desktop), use the container IP or the Docker network name `finstack-postgres`.

---

## Step 3: Create a role

```bash
vault write database/roles/finstack-app \
  db_name=finstack-db \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; \
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  revocation_statements="REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM \"{{name}}\"; \
    DROP ROLE IF EXISTS \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"
```

---

## Step 4: Generate dynamic credentials

```bash
vault read database/creds/finstack-app
```

Expected output:

```
Key                Value
---                -----
lease_id           database/creds/finstack-app/aBcDeFgHiJkL
lease_duration     1h
lease_renewable    true
password           A1B2-c3d4-E5F6-g7h8
username           v-root-finstack-a-aBcDeFgH
```

Run it again — you get a different username and password each time. That is the point.

---

## Step 5: Test the credentials

```bash
# Use the generated username and password from Step 4
psql -h localhost -U <generated_username> -d finstack -c "SELECT current_user;"
# Enter the generated password when prompted
# Output should show the dynamic username
```

---

## Step 6: Check the lease

```bash
vault lease lookup <lease_id_from_step_4>
# Shows TTL remaining, renewable status, and issue time
```

---

## Step 7: Revoke the credential

```bash
vault lease revoke <lease_id_from_step_4>

# Try connecting again — it fails
psql -h localhost -U <generated_username> -d finstack -c "SELECT 1;"
# FATAL: role "v-root-finstack-a-aBcDeFgH" does not exist
```

The credential is gone. Vault ran the revocation SQL (`DROP ROLE`) immediately.

---

## You're done when

- Each `vault read database/creds/finstack-app` returns a unique username/password
- You can connect to PostgreSQL with the generated credentials
- `vault lease revoke` immediately kills the credential (the DB role is dropped)
- You understand why dynamic credentials with a 1h TTL are safer than a static password that never changes
