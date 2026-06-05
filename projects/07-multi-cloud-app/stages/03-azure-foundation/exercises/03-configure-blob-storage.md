# Exercise 3: Configure Azure Blob Storage

**Goal:** Create a Storage Account and Blob container with versioning, TLS 1.2, and a lifecycle policy that moves data to Cool (30 days) then Archive (90 days).

## Step 1: Deploy Storage Account

```bash
cd projects/07-multi-cloud-app/terraform/azure
terraform apply -auto-approve                    # creates storage account + container
```

Expected output:
- `Apply complete!` with output for `storage_account_name`

## Step 2: Upload test data

```bash
STORAGE_ACCOUNT=$(terraform output -raw storage_account_name)
echo '{"event":"test","source":"azure","timestamp":"2024-01-01T00:00:00Z"}' > /tmp/test-event.json
az storage blob upload \
  --account-name ${STORAGE_ACCOUNT} \
  --container-name analytics-data \
  --name raw/test-event.json \
  --file /tmp/test-event.json \
  --auth-mode login                              # authenticate via Entra ID
```

Expected output:
- `Finished[#######] 100.0000%`

## Step 3: List blobs and check access tier

```bash
az storage blob list \
  --account-name ${STORAGE_ACCOUNT} \
  --container-name analytics-data \
  --output table                                 # should show raw/test-event.json

az storage blob show \
  --account-name ${STORAGE_ACCOUNT} \
  --container-name analytics-data \
  --name raw/test-event.json \
  --query "properties.blobTier" --output tsv     # expect Hot
```

Expected output:
- Blob listed as `BlockBlob`
- Access tier: `Hot`

## Step 4: Verify lifecycle policy

```bash
az storage account management-policy show \
  --account-name ${STORAGE_ACCOUNT} \
  --resource-group cloudplatform-rg \
  --query "policy.rules[].definition.actions" --output json
```

Expected output:
- JSON showing `tierToCool` at 30 days and `tierToArchive` at 90 days

## Verify

```bash
az storage account show \
  --name ${STORAGE_ACCOUNT} \
  --query "minimumTlsVersion" --output tsv       # expect TLS1_2
```

You should see: `TLS1_2` — confirming modern TLS enforcement. The Azure foundation is complete with VNet, AKS, PostgreSQL, and Blob Storage all operational.
