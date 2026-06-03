# Exercise 2: Multi-Environment — Staging and Prod from the Same Modules

**Goal:** Create staging and prod environments alongside dev, each with different VPC CIDRs and instance sizes, and verify that Terragrunt isolates their state automatically.

**Time:** 30 minutes

**Prerequisites:** Exercise 1 complete (dev VPC and S3 deployed via Terragrunt).

---

## Step 1: Create the Staging Environment

Create `finstack/terragrunt/environments/staging/env.hcl`:

```hcl
# Environment-level variables for staging
locals {
  environment = "staging"
  project     = "finstack"
  vpc_cidr    = "10.1.0.0/16"    # Different CIDR from dev (10.0.0.0/16)
}
```

---

## Step 2: Create Staging Module Configs

Create `finstack/terragrunt/environments/staging/vpc/terragrunt.hcl`:

```hcl
# VPC module configuration for staging — identical structure to dev
include "root" {
  path = find_in_parent_folders()
}

locals {
  env_vars = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

terraform {
  source = "../../../../terraform/modules/vpc"
}

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

Create `finstack/terragrunt/environments/staging/s3/terragrunt.hcl`:

```hcl
# S3 module configuration for staging
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

Notice: these are identical to the dev module configs. The only difference is that `find_in_parent_folders("env.hcl")` resolves to `staging/env.hcl` instead of `dev/env.hcl`. This is the DRY pattern in action.

---

## Step 3: Create the Prod Environment

Create `finstack/terragrunt/environments/prod/env.hcl`:

```hcl
# Environment-level variables for prod
locals {
  environment = "prod"
  project     = "finstack"
  vpc_cidr    = "10.2.0.0/16"    # Distinct from dev and staging
}
```

Create the same `vpc/terragrunt.hcl` and `s3/terragrunt.hcl` as staging — they are structurally identical. Copy them:

```bash
cp -r finstack/terragrunt/environments/staging/vpc finstack/terragrunt/environments/prod/
cp -r finstack/terragrunt/environments/staging/s3 finstack/terragrunt/environments/prod/
```

---

## Step 4: Deploy Staging

```bash
cd finstack/terragrunt/environments/staging
terragrunt run-all plan
```

Expected output: Terragrunt discovers `vpc/` and `s3/`, plans both. The VPC should show `cidr_block = "10.1.0.0/16"` (not `10.0.0.0/16`).

```bash
terragrunt run-all apply
```

Type `y` when prompted for each module (or use `--terragrunt-non-interactive` to auto-approve).

---

## Step 5: Deploy Prod

```bash
cd ../prod
terragrunt run-all apply
```

The VPC should show `cidr_block = "10.2.0.0/16"`.

---

## Step 6: Verify State Isolation

```bash
aws --endpoint-url=http://localhost:4566 s3 ls s3://finstack-terraform-state/ --recursive
```

Expected:

```
environments/dev/vpc/terraform.tfstate
environments/dev/s3/terraform.tfstate
environments/staging/vpc/terraform.tfstate
environments/staging/s3/terraform.tfstate
environments/prod/vpc/terraform.tfstate
environments/prod/s3/terraform.tfstate
```

Six separate state files — one per module per environment. No environment can accidentally modify another's infrastructure.

---

## Step 7: Verify Environment Differentiation

```bash
cd ../dev/vpc && terragrunt output vpc_cidr
# Expected: "10.0.0.0/16"

cd ../../staging/vpc && terragrunt output vpc_cidr
# Expected: "10.1.0.0/16"

cd ../../prod/vpc && terragrunt output vpc_cidr
# Expected: "10.2.0.0/16"
```

Same module code, different outputs — driven entirely by `env.hcl`.

---

## Step 8: Clean Up

Destroy in reverse order (prod first, or all at once):

```bash
cd finstack/terragrunt/environments/staging
terragrunt run-all destroy

cd ../prod
terragrunt run-all destroy
```

Leave dev intact for Exercise 3.

---

## You're Done When

- [x] Three environments (dev, staging, prod) exist with different VPC CIDRs
- [x] Each environment has its own isolated state path in S3
- [x] The module-level `terragrunt.hcl` files are identical across environments
- [x] Only `env.hcl` differs between environments
- [x] Adding a fourth environment (e.g., `uat`) would require only a new `env.hcl` and copying the module directory structure

## Common Mistakes

- **Using the same CIDR across environments** — works in LocalStack but causes routing conflicts in real AWS if VPCs are peered
- **Forgetting to create module directories in the new environment** — Terragrunt only discovers `terragrunt.hcl` files that actually exist
- **Editing the Terraform module** to add environment logic — the module should be environment-agnostic; all differentiation happens in Terragrunt inputs
- **Not verifying state isolation** — always check S3 paths after deploying a new environment
