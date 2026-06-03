# Exercise 1: DRY Config — Root Configuration and First Module

**Goal:** Write the root `terragrunt.hcl` with automatic backend and provider generation, create the dev environment, and deploy the VPC module through Terragrunt.

**Time:** 30 minutes

---

## Step 1: Install Terragrunt

```bash
# macOS
brew install terragrunt

# Verify
terragrunt --version
```

---

## Step 2: Write the Root Configuration

Create `finstack/terragrunt/terragrunt.hcl`:

```hcl
# Root terragrunt.hcl — shared config for all environments and modules

# Auto-generate backend configuration
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket         = "finstack-terraform-state"
    key            = "${path_relative_to_include()}/terraform.tfstate"
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

# Auto-generate provider configuration
generate "provider" {
  path      = "providers.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
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
    s3       = "http://localhost:4566"
    ec2      = "http://localhost:4566"
    sts      = "http://localhost:4566"
    iam      = "http://localhost:4566"
    rds      = "http://localhost:4566"
    dynamodb = "http://localhost:4566"
  }
}
EOF
}
```

---

## Step 3: Create the Dev Environment

Create `finstack/terragrunt/environments/dev/env.hcl`:

```hcl
# Environment-level variables for dev
locals {
  environment = "dev"
  project     = "finstack"
  vpc_cidr    = "10.0.0.0/16"
}
```

---

## Step 4: Create the VPC Module Config

Create `finstack/terragrunt/environments/dev/vpc/terragrunt.hcl`:

```hcl
# VPC module configuration for dev environment
include "root" {
  path = find_in_parent_folders()
}

# Read environment variables from parent env.hcl
locals {
  env_vars = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

# Point to the Terraform module source
terraform {
  source = "../../../../terraform/modules/vpc"
}

# Pass inputs to the Terraform module
inputs = {
  project     = local.env_vars.locals.project
  environment = local.env_vars.locals.environment
  vpc_cidr    = local.env_vars.locals.vpc_cidr
  azs         = ["ap-south-1a", "ap-south-1b"]

  common_tags = {
    Project     = local.env_vars.locals.project
    Environment = local.env_vars.locals.environment
    ManagedBy   = "terragrunt"
  }
}
```

---

## Step 5: Create the S3 Module Config

Create `finstack/terragrunt/environments/dev/s3/terragrunt.hcl`:

```hcl
# S3 module configuration for dev environment
include "root" {
  path = find_in_parent_folders()
}

locals {
  env_vars = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

terraform {
  source = "../../../../terraform/modules/s3"
}

inputs = {
  project     = local.env_vars.locals.project
  environment = local.env_vars.locals.environment

  common_tags = {
    Project     = local.env_vars.locals.project
    Environment = local.env_vars.locals.environment
    ManagedBy   = "terragrunt"
  }
}
```

---

## Step 6: Ensure Backend Infrastructure Exists

If you haven't already (from Stage 1 Exercise 3):

```bash
aws --endpoint-url=http://localhost:4566 s3 mb s3://finstack-terraform-state
aws --endpoint-url=http://localhost:4566 dynamodb create-table \
  --table-name finstack-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

---

## Step 7: Init and Apply the VPC

```bash
cd finstack/terragrunt/environments/dev/vpc
terragrunt init
terragrunt plan
```

Expected: Terragrunt generates `backend.tf` and `providers.tf` in a temp directory, then runs `terraform plan` showing VPC resources.

```bash
terragrunt apply
```

Type `yes`. The VPC is created and state is stored at `environments/dev/vpc/terraform.tfstate` in S3.

Verify outputs:

```bash
terragrunt output
```

---

## Step 8: Apply the S3 Module

```bash
cd ../s3
terragrunt apply
```

---

## Step 9: Verify State Paths

```bash
aws --endpoint-url=http://localhost:4566 s3 ls s3://finstack-terraform-state/ --recursive
```

Expected:

```
environments/dev/vpc/terraform.tfstate
environments/dev/s3/terraform.tfstate
```

Each module has its own state file — generated automatically from the directory path.

---

## You're Done When

- [x] `terragrunt plan` in `environments/dev/vpc/` shows VPC resources
- [x] State is stored at `environments/dev/vpc/terraform.tfstate` in S3
- [x] No `providers.tf` or `backend.tf` in your source — both are auto-generated
- [x] Changing the provider version requires editing only the root `terragrunt.hcl`
- [x] You understand how `find_in_parent_folders()` drives inheritance

## Common Mistakes

- **Not having the S3 bucket and DynamoDB table** — Terragrunt cannot auto-create the backend
- **Wrong `source` path** — relative paths in `terraform.source` are relative to the `terragrunt.hcl` file, not the working directory
- **Missing `include` block** — without it, the root config is not inherited
- **Forgetting `find_in_parent_folders("env.hcl")`** — the function name must match the actual filename
