# Exercise 3: Configure GCS Bucket with Lifecycle Rules

**Goal:** Create a GCS bucket with versioning and lifecycle rules that automatically transition data from Standard to Nearline (90 days) to Coldline (365 days).

## Step 1: Deploy the GCS bucket

```bash
cd projects/07-multi-cloud-app/terraform/gcp
terraform apply -auto-approve                    # creates GCS bucket
```

Expected output:
- `Apply complete!` with output for `gcs_bucket_name`

## Step 2: Upload test data

```bash
echo '{"event":"test","source":"gcp","timestamp":"2024-01-01T00:00:00Z"}' > /tmp/test-event.json
gsutil cp /tmp/test-event.json \
  gs://$(terraform output -raw gcs_bucket_name)/raw/test-event.json
```

Expected output:
- `Copying file:///tmp/test-event.json [Content-Type=application/json]...`
- `Operation completed over 1 objects`

## Step 3: Verify the upload

```bash
gsutil ls gs://$(terraform output -raw gcs_bucket_name)/raw/
```

Expected output:
- `gs://<bucket-name>/raw/test-event.json`

## Step 4: Verify lifecycle rules

```bash
gsutil lifecycle get gs://$(terraform output -raw gcs_bucket_name)
```

Expected output:
- JSON showing two rules: age 90 -> Nearline, age 365 -> Coldline

## Step 5: Verify uniform bucket-level access

```bash
gsutil uniformbucketlevelaccess get \
  gs://$(terraform output -raw gcs_bucket_name)
```

Expected output:
- `Enabled: True` — confirming IAM-only access (no legacy ACLs)

## Verify

```bash
# Compare with the equivalent AWS S3 command from Stage 1
# AWS:  aws s3 ls s3://bucket/raw/
# GCP:  gsutil ls gs://bucket/raw/
gsutil ls gs://$(terraform output -raw gcs_bucket_name)/raw/
```

You should see: the test file listed, lifecycle rules applied, and uniform access enabled. The GCP foundation is complete.
