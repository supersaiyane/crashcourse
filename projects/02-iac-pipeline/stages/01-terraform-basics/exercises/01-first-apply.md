# Exercise 1: First Apply — VPC and S3 on LocalStack

**Goal:** Run the full Terraform lifecycle — init, plan, apply, output, destroy — against LocalStack. Create a VPC and an encrypted S3 bucket for FinStack.

**Time:** 30 minutes

---

## Step 1: Start LocalStack

```bash
cd finstack
docker compose up -d
```

Verify it's running:

```bash
docker compose ps
```

Expected output:

```
NAME         SERVICE      STATUS     PORTS
localstack   localstack   running    0.0.0.0:4566->4566/tcp
vault        vault        running    0.0.0.0:8200->8200/tcp
```

Set your shell environment for LocalStack:

```bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ap-south-1
export AWS_ENDPOINT_URL=http://localhost:4566
```

---

## Step 2: Write the Configuration

Navigate to the Terraform environments directory:

```bash
cd finstack/terraform/environments
```

Create `providers.tf`:

```hcl
# providers.tf — configure the AWS provider for LocalStack
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region                      = "ap-south-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    s3  = "http://localhost:4566"
    ec2 = "http://localhost:4566"
    sts = "http://localhost:4566"
  }
}
```

Create `variables.tf`:

```hcl
# variables.tf — inputs for this environment
variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "project" {
  description = "Project name used in resource naming"
  type        = string
  default     = "finstack"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}
```

Create `main.tf`:

```hcl
# main.tf — FinStack infrastructure
locals {
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# --- VPC ---
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true        # Required for EKS
  enable_dns_support   = true        # Required for RDS

  tags = merge(local.common_tags, {
    Name = "${var.project}-vpc"
  })
}

# Public subnets
resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)  # 10.0.0.0/24, 10.0.1.0/24
  availability_zone = "ap-south-1${count.index == 0 ? "a" : "b"}"

  map_public_ip_on_launch = true     # Public subnets get public IPs

  tags = merge(local.common_tags, {
    Name = "${var.project}-public-${count.index}"
    Tier = "public"
  })
}

# Private subnets
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 100)  # 10.0.100.0/24, 10.0.101.0/24
  availability_zone = "ap-south-1${count.index == 0 ? "a" : "b"}"

  tags = merge(local.common_tags, {
    Name = "${var.project}-private-${count.index}"
    Tier = "private"
  })
}

# --- S3 Bucket ---
resource "aws_s3_bucket" "statements" {
  bucket = "${var.project}-${var.environment}-statements"

  tags = merge(local.common_tags, {
    Name = "${var.project}-statements"
  })
}

# Block all public access — mandatory for BFSI
resource "aws_s3_bucket_public_access_block" "statements" {
  bucket = aws_s3_bucket.statements.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "statements" {
  bucket = aws_s3_bucket.statements.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"       # KMS in real AWS; AES256 for LocalStack
    }
  }
}
```

Create `outputs.tf`:

```hcl
# outputs.tf — expose key values
output "vpc_id" {
  description = "The ID of the FinStack VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = aws_subnet.private[*].id
}

output "bucket_name" {
  description = "Name of the statements S3 bucket"
  value       = aws_s3_bucket.statements.id
}
```

---

## Step 3: Init

```bash
terraform init
```

Expected output (key lines):

```
Initializing the backend...
Initializing provider plugins...
- Installing hashicorp/aws v5.x.x...
- Installed hashicorp/aws v5.x.x

Terraform has been successfully initialized!
```

This downloaded the AWS provider plugin and created the `.terraform/` directory.

---

## Step 4: Plan

```bash
terraform plan
```

Expected output (summary):

```
Plan: 7 to add, 0 to change, 0 to destroy.

Changes to Outputs:
  + bucket_name        = "finstack-dev-statements"
  + private_subnet_ids = [...]
  + public_subnet_ids  = [...]
  + vpc_id             = (known after apply)
```

Read the plan carefully. It shows:
- 1 VPC
- 2 public subnets + 2 private subnets
- 1 S3 bucket + public access block + encryption config
- 7 resources total, 0 changes, 0 destroys

This is the safety net. Nothing has been created yet.

---

## Step 5: Apply

```bash
terraform apply
```

Terraform shows the plan again and asks for confirmation. Type `yes`.

Expected output (tail):

```
Apply complete! Resources: 7 added, 0 changed, 0 destroyed.

Outputs:

bucket_name = "finstack-dev-statements"
private_subnet_ids = [
  "subnet-xxxxxxxxx",
  "subnet-yyyyyyyyy",
]
public_subnet_ids = [
  "subnet-aaaaaaaaa",
  "subnet-bbbbbbbbb",
]
vpc_id = "vpc-123456789"
```

---

## Step 6: Verify

Query specific outputs:

```bash
terraform output vpc_id
terraform output bucket_name
```

Inspect the full state:

```bash
terraform show
```

List all managed resources:

```bash
terraform state list
```

Expected:

```
aws_s3_bucket.statements
aws_s3_bucket_public_access_block.statements
aws_s3_bucket_server_side_encryption_configuration.statements
aws_subnet.private[0]
aws_subnet.private[1]
aws_subnet.public[0]
aws_subnet.public[1]
aws_vpc.main
```

Run plan again — it should show no changes (desired = current):

```bash
terraform plan
```

Expected:

```
No changes. Your infrastructure matches the configuration.
```

---

## Step 7: Destroy

```bash
terraform destroy
```

Type `yes` to confirm. All 7 resources will be removed.

---

## Step 8: Verify Cleanup

```bash
terraform state list
```

Expected: empty (no resources).

---

## You're Done When

- [x] You ran the full lifecycle: init, plan, apply, output, show, destroy
- [x] `terraform plan` showed 0 changes after apply (idempotent)
- [x] You can explain what each command does
- [x] You understand that `terraform.tfstate` is the source of truth
- [x] The S3 bucket was created with public access blocked and encryption enabled

## Common Mistakes

- **Forgetting to export LocalStack env vars** — Terraform tries to reach real AWS and fails
- **Not reading the plan** — blindly typing `yes` defeats the safety net
- **Committing `terraform.tfstate` to Git** — it contains resource IDs and potentially secrets; add it to `.gitignore`
- **Committing `.terraform/`** — this is a local cache of providers; add it to `.gitignore`
