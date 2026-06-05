# Exercise 3: Set Up RDS PostgreSQL and S3 Bucket

**Goal:** Deploy RDS PostgreSQL and an S3 bucket, test database connectivity from an EKS pod, and verify S3 encryption.

## Step 1: Set the database password

```bash
export TF_VAR_db_password="$(openssl rand -base64 24)"   # generate secure password
echo "Password set (not displayed for security)"
```

Expected output:
- No password displayed — it is stored in the environment variable only

## Step 2: Deploy RDS and S3

```bash
cd projects/07-multi-cloud-app/terraform/aws
terraform apply -auto-approve                    # creates RDS + S3 — takes 5-8 minutes
```

Expected output:
- `aws_db_instance.postgres: Creating...` (wait 5-8 minutes)
- `Apply complete!` with outputs for `rds_endpoint` and `s3_bucket_name`

## Step 3: Test database connectivity from EKS

```bash
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
kubectl run pg-test --rm -it --image=postgres:16-alpine -- \
  psql "host=${RDS_ENDPOINT} dbname=analytics user=dbadmin password=${TF_VAR_db_password}"
```

Inside psql, run:
```sql
SELECT version();                                -- expect PostgreSQL 16.2
\dt                                              -- expect empty table list
\q                                               -- exit
```

## Step 4: Upload and verify S3 data

```bash
echo '{"event":"test","source":"aws"}' > /tmp/test-event.json
aws s3 cp /tmp/test-event.json \
  s3://$(terraform output -raw s3_bucket_name)/raw/test-event.json

aws s3 ls s3://$(terraform output -raw s3_bucket_name)/raw/
```

Expected output:
- `upload: /tmp/test-event.json to s3://...`
- File listing showing `test-event.json`

## Step 5: Verify encryption

```bash
aws s3api head-object \
  --bucket $(terraform output -raw s3_bucket_name) \
  --key raw/test-event.json \
  --query "ServerSideEncryption" --output text   # expect aws:kms
```

Expected output:
- `aws:kms` — confirming KMS encryption at rest

## Verify

```bash
terraform output rds_endpoint                    # should show an RDS FQDN
terraform output s3_bucket_name                  # should show bucket name with account ID suffix
```

You should see: RDS endpoint resolves, S3 bucket exists with KMS encryption. The AWS foundation is complete.
