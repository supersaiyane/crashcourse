# Exercise 2: Set Up Cloud SQL PostgreSQL

**Goal:** Create a Cloud SQL PostgreSQL instance with private IP only (no public access), and verify connectivity from a GKE pod.

## Step 1: Set the database password

```bash
export TF_VAR_db_password="$(openssl rand -base64 24)"   # generate secure password
```

## Step 2: Deploy Cloud SQL

```bash
cd projects/07-multi-cloud-app/terraform/gcp
terraform apply -auto-approve                    # creates Cloud SQL — takes 5-10 minutes
```

Expected output:
- `google_sql_database_instance.postgres: Creating...`
- `Apply complete!` with output for `cloudsql_private_ip`

## Step 3: Verify private IP only

```bash
gcloud sql instances describe cloudplatform-postgres \
  --format="value(ipAddresses[].type)"           # should show PRIVATE only
```

Expected output:
- `PRIVATE` — no `PRIMARY` (public) IP assigned

## Step 4: Connect from a GKE pod

```bash
CLOUDSQL_IP=$(terraform output -raw cloudsql_private_ip)
kubectl run pg-test --rm -it --image=postgres:16-alpine -- \
  psql "host=${CLOUDSQL_IP} dbname=analytics user=dbadmin password=${TF_VAR_db_password}"
```

Inside psql:
```sql
SELECT version();                                -- expect PostgreSQL 16
\conninfo                                        -- verify private IP connection
\q                                               -- exit
```

## Verify

```bash
terraform output cloudsql_private_ip             # should show a 10.x.x.x private IP
gcloud sql instances describe cloudplatform-postgres \
  --format="value(settings.ipConfiguration.ipv4Enabled)"
```

You should see: a private IP and `ipv4Enabled: False` — confirming no public access. Proceed to Exercise 3 for GCS.
