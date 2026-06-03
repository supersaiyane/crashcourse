# Exercise 3: State Management — Remote Backend, Import, and Recovery

**Goal:** Configure a remote S3 backend with DynamoDB locking on LocalStack, practise state operations (import, move, remove), and recover from a deliberately corrupted state file.

**Time:** 45 minutes

---

## Part A: Migrate to a Remote Backend

### Step 1: Create the Backend Infrastructure

The backend (S3 bucket + DynamoDB table) must exist before Terraform can use it. Create them manually using the AWS CLI against LocalStack:

```bash
# Create the state bucket
aws --endpoint-url=http://localhost:4566 s3 mb s3://finstack-terraform-state

# Create the lock table
aws --endpoint-url=http://localhost:4566 dynamodb create-table \
  --table-name finstack-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

### Step 2: Add the Backend Configuration

Create `environments/backend.tf`:

```hcl
terraform {
  backend "s3" {
    bucket         = "finstack-terraform-state"
    key            = "environments/dev/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "finstack-terraform-locks"

    # LocalStack overrides
    endpoint                    = "http://localhost:4566"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    force_path_style            = true
    access_key                  = "test"
    secret_key                  = "test"
  }
}
```

### Step 3: Migrate State

```bash
terraform init -migrate-state
```

Terraform will ask if you want to migrate your local state to the new backend. Type `yes`.

Expected output:

```
Initializing the backend...
Do you want to migrate all workspaces to "s3"?

Successfully configured the backend "s3"! Terraform will automatically
use this backend unless the backend configuration changes.
```

### Step 4: Verify

```bash
# State is now remote — local file should be empty or gone
ls -la terraform.tfstate

# Verify state is accessible
terraform state list
```

The local `terraform.tfstate` file should be empty (0 bytes) or removed. All state is now in S3.

---

## Part B: Import an Existing Resource

### Step 5: Create a Resource Outside Terraform

Create an S3 bucket manually (simulating a resource someone created in the console):

```bash
aws --endpoint-url=http://localhost:4566 s3 mb s3://finstack-audit-logs
```

### Step 6: Write the Terraform Config for It

Add to `environments/main.tf` (or a new file `audit.tf`):

```hcl
resource "aws_s3_bucket" "audit_logs" {
  bucket = "finstack-audit-logs"

  tags = merge(local.common_tags, {
    Name = "finstack-audit-logs"
  })
}
```

### Step 7: Import

```bash
terraform import aws_s3_bucket.audit_logs finstack-audit-logs
```

Expected output:

```
aws_s3_bucket.audit_logs: Importing from ID "finstack-audit-logs"...
aws_s3_bucket.audit_logs: Import successful!

Import successful! The resources that were imported are shown above.
```

### Step 8: Plan After Import

```bash
terraform plan
```

The plan may show tag changes (the manually created bucket had no tags). This is expected — Terraform is now bringing it into alignment with your desired state.

Apply to converge:

```bash
terraform apply
```

---

## Part C: State Move and Remove

### Step 9: Rename a Resource in State

Suppose you want to rename `aws_s3_bucket.audit_logs` to `aws_s3_bucket.audit`:

```bash
terraform state mv aws_s3_bucket.audit_logs aws_s3_bucket.audit
```

Update your `.tf` file to match the new name, then run:

```bash
terraform plan
```

Expected: 0 changes (the rename is state-only; the actual bucket is untouched).

### Step 10: Remove a Resource from State

Remove the audit bucket from state without destroying the real bucket:

```bash
terraform state rm aws_s3_bucket.audit
```

Expected:

```
Removed aws_s3_bucket.audit
Successfully removed 1 resource instance(s).
```

Now `terraform plan` will not show this bucket. It still exists in LocalStack — Terraform just doesn't know about it anymore.

This is useful when you want to stop managing a resource with Terraform without destroying it.

---

## Part D: Deliberate Corruption and Recovery

### Step 11: Back Up the State

```bash
terraform state pull > state-backup.json
```

### Step 12: Corrupt the State

```bash
# Pull state, break it, push it back
terraform state pull | python3 -c "
import sys, json
state = json.load(sys.stdin)
state['serial'] = -1                    # Invalid serial
state['lineage'] = 'corrupted'          # Wrong lineage
print(json.dumps(state))
" > corrupted.json

terraform state push -force corrupted.json
```

### Step 13: Observe the Problem

```bash
terraform plan
```

You'll see unexpected behaviour — Terraform may try to recreate resources or report errors.

### Step 14: Recover

Restore from backup:

```bash
terraform state push -force state-backup.json
```

Verify:

```bash
terraform plan
```

Expected: 0 changes (state is back to normal).

**Alternative recovery:** If you don't have a backup, re-import every resource:

```bash
terraform import module.vpc.aws_vpc.this vpc-xxxxxxxxx
terraform import module.s3.aws_s3_bucket.this finstack-dev-statements
# ... repeat for each resource
```

This is painful. Keep backups. Use a versioned S3 bucket for state.

---

## You're Done When

- [x] State is stored remotely in S3 with DynamoDB locking
- [x] You successfully imported a manually created resource
- [x] You moved and removed resources in state without destroying real infrastructure
- [x] You corrupted and recovered state from a backup
- [x] You understand why state locking and versioning are non-negotiable in teams

## Common Mistakes

- **Forgetting to create the backend bucket first** — Terraform cannot initialise if the bucket doesn't exist
- **Not using `-migrate-state`** — running `init` without it loses your existing state
- **Force-pushing state without a backup** — no recovery path
- **Importing the wrong resource ID** — the ID must match exactly what the cloud API returns
- **Not updating `.tf` after `state mv`** — the resource name in code must match state
