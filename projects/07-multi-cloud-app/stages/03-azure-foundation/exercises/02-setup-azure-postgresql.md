# Exercise 2: Deploy Azure PostgreSQL Flexible Server

**Goal:** Create a PostgreSQL Flexible Server with VNet integration (delegated subnet + Private DNS zone), and verify connectivity from an AKS pod with SSL.

## Step 1: Set the database password

```bash
export TF_VAR_db_password="$(openssl rand -base64 24)"   # generate secure password
```

## Step 2: Deploy PostgreSQL Flexible Server

```bash
cd projects/07-multi-cloud-app/terraform/azure
terraform apply -auto-approve                    # creates PostgreSQL — takes 5-10 minutes
```

Expected output:
- `azurerm_postgresql_flexible_server.main: Creating...`
- `Apply complete!` with output for `postgres_fqdn`

## Step 3: Verify VNet integration

```bash
az postgres flexible-server show \
  --resource-group cloudplatform-rg \
  --name cloudplatform-postgres \
  --query "network.delegatedSubnetResourceId" --output tsv
```

Expected output:
- A subnet resource ID containing `db-subnet` — confirming VNet integration

## Step 4: Connect from an AKS pod

```bash
PG_FQDN=$(terraform output -raw postgres_fqdn)
kubectl run pg-test --rm -it --image=postgres:16-alpine -- \
  psql "host=${PG_FQDN} dbname=analytics user=dbadmin password=${TF_VAR_db_password} sslmode=require"
```

Inside psql:
```sql
SELECT version();                                -- expect PostgreSQL 16
SHOW ssl;                                        -- expect "on"
\conninfo                                        -- verify SSL and private FQDN
\q                                               -- exit
```

## Verify

```bash
terraform output postgres_fqdn                  # should show a .postgres.database.azure.com FQDN
az postgres flexible-server show \
  --resource-group cloudplatform-rg \
  --name cloudplatform-postgres \
  --query "network.publicNetworkAccess" --output tsv
```

You should see: `Disabled` for public access — confirming the server is private only. Proceed to Exercise 3 for Blob Storage.
