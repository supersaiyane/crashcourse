# Exercise 3: Dependencies — Cross-Module Wiring with run-all

**Goal:** Add RDS and IAM modules to the dev environment with `dependency` blocks that read VPC and S3 outputs. Deploy the full four-module stack with `run-all apply` and verify Terragrunt applies them in the correct order.

**Time:** 45 minutes

**Prerequisites:** Exercise 2 complete (dev environment with VPC and S3 deployed).

---

## Step 1: Understand the Dependency Graph

Before writing any code, map the dependencies:

```
        ┌─────────┐
        │   VPC   │  ← no dependencies, applied first
        └────┬────┘
             │
     ┌───────┼───────┐
     ▼       │       ▼
┌────────┐   │  ┌────────┐
│  S3    │   │  │  RDS   │  ← depends on VPC (needs vpc_id, private_subnet_ids)
└───┬────┘   │  └────────┘
    │        │
    ▼        │
┌────────────┘
│  IAM   │  ← depends on S3 (needs bucket_arn for policy)
└────────┘
```

Terragrunt will:
1. Apply VPC first (no dependencies)
2. Apply S3 and RDS in parallel (both depend only on VPC)
3. Apply IAM last (depends on S3)

---

## Step 2: Create the RDS Module Config

Create `finstack/terragrunt/environments/dev/rds/terragrunt.hcl`:

```hcl
# RDS module configuration for dev
include "root" {
  path = find_in_parent_folders()
}

locals {
  env_vars = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

# Declare dependency on VPC — Terragrunt applies VPC first
dependency "vpc" {
  config_path = "../vpc"

  # Mock outputs allow `terragrunt plan` before VPC is applied
  mock_outputs = {
    vpc_id             = "vpc-mock-id"
    private_subnet_ids = ["subnet-mock-1", "subnet-mock-2"]
  }
  mock_outputs_allowed_terraform_commands = ["plan", "validate"]
}

terraform {
  source = "../../../../terraform/modules/rds"
}

inputs = {
  project     = local.env_vars.locals.project
  environment = local.env_vars.locals.environment

  # These come from the VPC module's outputs
  vpc_id     = dependency.vpc.outputs.vpc_id
  subnet_ids = dependency.vpc.outputs.private_subnet_ids

  # Dev-sized instance
  instance_class = "db.t3.micro"
  multi_az       = false

  common_tags = {
    Project     = local.env_vars.locals.project
    Environment = local.env_vars.locals.environment
    ManagedBy   = "terragrunt"
  }
}
```

**Key points:**
- `dependency "vpc"` tells Terragrunt that RDS depends on VPC
- `dependency.vpc.outputs.vpc_id` reads the VPC module's Terraform output
- `mock_outputs` lets you run `terragrunt plan` in the RDS directory even if VPC hasn't been applied yet — essential for CI/CD pipelines that plan before apply

---

## Step 3: Create the IAM Module Config

Create `finstack/terragrunt/environments/dev/iam/terragrunt.hcl`:

```hcl
# IAM module configuration for dev
include "root" {
  path = find_in_parent_folders()
}

locals {
  env_vars = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

# IAM depends on S3 — needs the bucket ARN for the access policy
dependency "s3" {
  config_path = "../s3"

  mock_outputs = {
    bucket_arn  = "arn:aws:s3:::mock-bucket"
    bucket_name = "mock-bucket"
  }
  mock_outputs_allowed_terraform_commands = ["plan", "validate"]
}

terraform {
  source = "../../../../terraform/modules/iam"
}

inputs = {
  project     = local.env_vars.locals.project
  environment = local.env_vars.locals.environment
  bucket_arn  = dependency.s3.outputs.bucket_arn

  common_tags = {
    Project     = local.env_vars.locals.project
    Environment = local.env_vars.locals.environment
    ManagedBy   = "terragrunt"
  }
}
```

---

## Step 4: Visualise the Dependency Graph

```bash
cd finstack/terragrunt/environments/dev
terragrunt graph-dependencies
```

Expected output (DOT format):

```
digraph {
  "vpc" ;
  "s3" ;
  "rds" ;
  "iam" ;
  "rds" -> "vpc" ;
  "iam" -> "s3" ;
}
```

This confirms Terragrunt knows: RDS depends on VPC, IAM depends on S3, and VPC/S3 are independent.

---

## Step 5: Plan All Modules

```bash
cd finstack/terragrunt/environments/dev
terragrunt run-all plan
```

Terragrunt plans modules in dependency order. VPC and S3 plan first (using real state from Exercise 1 — they should show no changes). RDS and IAM plan next (using mock outputs since they haven't been applied yet).

Expected summary across all modules:

```
Group 1: vpc (0 to add), s3 (0 to add)    ← already deployed
Group 2: rds (N to add), iam (N to add)   ← new modules
```

---

## Step 6: Apply All Modules

```bash
cd finstack/terragrunt/environments/dev
terragrunt run-all apply
```

Terragrunt applies in order:
1. VPC — already exists, no changes
2. S3 — already exists, no changes (applied in parallel with VPC check)
3. RDS — created, receives real vpc_id and subnet_ids from VPC
4. IAM — created, receives real bucket_arn from S3

Type `y` for each module when prompted.

---

## Step 7: Verify Cross-Module Data Flow

```bash
cd finstack/terragrunt/environments/dev/rds
terragrunt output
```

Verify that `vpc_id` in the RDS state matches the VPC module's output:

```bash
cd ../vpc
terragrunt output vpc_id
```

The values should match — Terragrunt read the VPC output and passed it as an input to RDS.

---

## Step 8: Destroy in Reverse Order

```bash
cd finstack/terragrunt/environments/dev
terragrunt run-all destroy
```

Terragrunt destroys in reverse dependency order:
1. IAM first (depends on S3)
2. RDS next (depends on VPC)
3. S3 and VPC last (no dependents remaining)

This prevents "resource still in use" errors. Type `y` for each module.

---

## Step 9: Verify Clean State

```bash
aws --endpoint-url=http://localhost:4566 s3 ls s3://finstack-terraform-state/ --recursive
```

State files still exist (they're empty but present). The actual infrastructure is destroyed.

---

## You're Done When

- [x] `terragrunt graph-dependencies` shows VPC → RDS and S3 → IAM edges
- [x] `run-all apply` applies VPC and S3 first, then RDS and IAM
- [x] RDS receives real VPC outputs (vpc_id, subnet_ids) via `dependency` blocks
- [x] IAM receives the real S3 bucket ARN via `dependency` blocks
- [x] `run-all destroy` tears down IAM/RDS before S3/VPC
- [x] You understand when and why to use `mock_outputs`

## Common Mistakes

- **Circular dependencies** — if A depends on B and B depends on A, Terragrunt will error. Rethink the module boundaries
- **Missing `mock_outputs`** — without them, `terragrunt plan` fails if the dependency hasn't been applied. Always provide mocks for plan/validate
- **Wrong `config_path`** — paths are relative to the current `terragrunt.hcl` file, not the root. Use `../vpc`, not `environments/dev/vpc`
- **Forgetting to expose outputs in the Terraform module** — if the VPC module doesn't have an `output "vpc_id"` block, the dependency read fails at apply time
- **Running `destroy` on a single module that has dependents** — Terragrunt won't stop you, but Terraform will fail if another module references destroyed resources. Use `run-all destroy` to handle ordering
