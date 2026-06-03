# Stage 2: Terragrunt — DRY Multi-Environment Infrastructure

**Goal:** Wrap the Terraform modules you built in Stage 1 with Terragrunt to eliminate configuration repetition, manage dependencies between modules, and deploy FinStack across dev, staging, and prod environments from a single codebase.

**Prerequisites:** Stage 1 (Terraform Basics) completed. You should be comfortable with Terraform modules, state, and the plan/apply lifecycle.

**Sample App:** FinStack — the same BFSI payment platform. Terragrunt manages the same VPC, RDS, S3, and IAM modules but across three environments without duplicating any `.tf` files.

> For the full crash course on Terragrunt, see [`Terragrunt.md`](../../../../iac/Terragrunt.md).

---

## 1. Theory

### 1.1 Why Terragrunt?

You finished Stage 1 with a clean module structure. Now imagine deploying FinStack to three environments:

```
environments/
├── dev/
│   ├── main.tf          # Calls modules with dev values
│   ├── variables.tf     # Duplicated from staging/prod
│   ├── outputs.tf       # Duplicated
│   ├── providers.tf     # Duplicated (only region changes)
│   └── backend.tf       # Different state key, same bucket
├── staging/
│   ├── main.tf          # 90% identical to dev
│   ├── variables.tf     # Duplicated
│   ├── outputs.tf       # Duplicated
│   ├── providers.tf     # Duplicated
│   └── backend.tf       # Different state key
└── prod/
    ├── main.tf          # 90% identical
    ├── variables.tf     # Duplicated
    ├── outputs.tf       # Duplicated
    ├── providers.tf     # Duplicated
    └── backend.tf       # Different state key
```

That is 15 files where 12 are nearly identical. Every time you add a module or change a provider version, you edit three places. This is the DRY violation Terragrunt solves.

| Problem | Raw Terraform | Terragrunt |
|---------|--------------|------------|
| **Backend config per env** | Copy-paste `backend.tf` with different keys | `remote_state` block in root `terragrunt.hcl` — auto-generates backend per env |
| **Provider version** | Hardcoded in every env | `generate` block writes `providers.tf` once |
| **Module inputs** | Duplicated `main.tf` per env | One `terragrunt.hcl` per module per env — only the values that differ |
| **Dependency ordering** | Manual or `depends_on` hacks | `dependency` blocks with typed outputs |
| **Apply all envs** | `cd dev && terraform apply && cd ../staging && ...` | `terragrunt run-all apply` |

**The one idea that unlocks Terragrunt:** Terragrunt is a **thin wrapper** that generates the boilerplate Terraform needs (backend, providers, variables) and manages the execution order. Your actual infrastructure logic stays in Terraform modules — Terragrunt just orchestrates them.

**Mental model:** If Terraform modules are LEGO bricks, Terragrunt is the instruction booklet that says "build this set in this order, using these colour variants for each room."

---

### 1.2 Architecture — Terragrunt Directory Layout

```
finstack/terragrunt/
├── terragrunt.hcl                    ← Root config (backend, provider generation)
│
├── environments/
│   ├── dev/
│   │   ├── env.hcl                   ← Environment-level variables (environment = "dev")
│   │   ├── vpc/
│   │   │   └── terragrunt.hcl        ← Module config — inputs for VPC in dev
│   │   ├── rds/
│   │   │   └── terragrunt.hcl        ← Module config — inputs for RDS in dev
│   │   ├── s3/
│   │   │   └── terragrunt.hcl
│   │   └── iam/
│   │       └── terragrunt.hcl
│   │
│   ├── staging/
│   │   ├── env.hcl
│   │   ├── vpc/
│   │   │   └── terragrunt.hcl        ← Same structure, different values
│   │   ├── rds/
│   │   │   └── terragrunt.hcl
│   │   ├── s3/
│   │   │   └── terragrunt.hcl
│   │   └── iam/
│   │       └── terragrunt.hcl
│   │
│   └── prod/
│       ├── env.hcl
│       ├── vpc/
│       │   └── terragrunt.hcl
│       ├── rds/
│       │   └── terragrunt.hcl
│       ├── s3/
│       │   └── terragrunt.hcl
│       └── iam/
│           └── terragrunt.hcl
```

**Key insight:** Each module directory contains only a single `terragrunt.hcl` file with the inputs that differ per environment. All shared configuration (backend, providers, common variables) lives in parent `terragrunt.hcl` files and is inherited automatically.

```
Root terragrunt.hcl        ← Backend config, provider generation
    │
    ├── env.hcl            ← Environment name, region, account ID
    │
    └── module/terragrunt.hcl  ← Source path + module-specific inputs
```

---

### 1.3 Core Concepts

#### The `include` Block — Configuration Inheritance

Every child `terragrunt.hcl` includes the root config:

```hcl
# environments/dev/vpc/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()      # Walks up directories until it finds terragrunt.hcl
}
```

This single line inherits:
- Remote state configuration (S3 backend)
- Provider generation (AWS provider with correct version)
- Any common inputs defined in the root

#### The `terraform` Block — Module Source

```hcl
terraform {
  source = "../../../terraform/modules/vpc"    # Path to the Terraform module
}
```

Terragrunt copies the module to a temp directory, generates the backend and provider files, then runs `terraform init/plan/apply` there.

#### The `inputs` Block — Module Variables

```hcl
inputs = {
  project     = "finstack"
  environment = "dev"
  vpc_cidr    = "10.0.0.0/16"
  azs         = ["ap-south-1a", "ap-south-1b"]
}
```

These become `-var` arguments passed to Terraform. No `terraform.tfvars` file needed.

#### The `dependency` Block — Module Ordering

```hcl
# environments/dev/rds/terragrunt.hcl
dependency "vpc" {
  config_path = "../vpc"               # Relative path to the VPC module directory
}

inputs = {
  vpc_id     = dependency.vpc.outputs.vpc_id
  subnet_ids = dependency.vpc.outputs.private_subnet_ids
}
```

This tells Terragrunt:
1. The RDS module depends on the VPC module
2. Run VPC first when doing `run-all apply`
3. Pass VPC outputs as inputs to RDS

**Dependency graph for FinStack:**

```
        ┌─────────┐
        │   VPC   │
        └────┬────┘
             │
     ┌───────┼───────┐
     ▼       │       ▼
┌────────┐   │  ┌────────┐
│  S3    │   │  │  RDS   │  ← depends on VPC (subnets, vpc_id)
└───┬────┘   │  └────────┘
    │        │
    ▼        ▼
┌────────────────┐
│     IAM        │  ← depends on S3 (bucket ARN)
└────────────────┘
```

#### The `remote_state` Block — Automatic Backend

```hcl
# Root terragrunt.hcl
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
  }
}
```

The magic is `${path_relative_to_include()}`. For `environments/dev/vpc/terragrunt.hcl`, this evaluates to `environments/dev/vpc` — giving each module its own state file automatically:

```
s3://finstack-terraform-state/
├── environments/dev/vpc/terraform.tfstate
├── environments/dev/rds/terraform.tfstate
├── environments/dev/s3/terraform.tfstate
├── environments/dev/iam/terraform.tfstate
├── environments/staging/vpc/terraform.tfstate
├── environments/staging/rds/terraform.tfstate
└── ...
```

No more copy-pasting backend configs. No more state key collisions.

#### The `generate` Block — Provider Generation

```hcl
# Root terragrunt.hcl
generate "provider" {
  path      = "providers.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}
EOF
}
```

Every module gets the same provider configuration without any duplication.

#### `read_terragrunt_config` — Sharing Environment Variables

```hcl
# environments/dev/vpc/terragrunt.hcl
locals {
  env_vars = read_terragrunt_config(find_in_parent_folders("env.hcl"))
  environment = local.env_vars.locals.environment
}
```

This reads `env.hcl` from the parent directory, giving you access to environment-level variables without repeating them in every module config.

---

### 1.4 Run-All — Orchestrated Multi-Module Operations

The killer feature of Terragrunt is `run-all`. It discovers all `terragrunt.hcl` files in the directory tree, builds the dependency graph, and runs Terraform operations in the correct order with parallelism.

```bash
# Plan all modules in dev
cd environments/dev
terragrunt run-all plan

# Apply all modules in dev (respects dependency order)
terragrunt run-all apply

# Destroy in reverse dependency order
terragrunt run-all destroy
```

**Execution order for `run-all apply`:**

```
Step 1 (parallel): VPC, S3         ← No dependencies
Step 2 (parallel): RDS, IAM        ← VPC done, S3 done
```

Terragrunt figures this out from your `dependency` blocks. You never manually sequence applies.

---

### 1.5 FinStack Multi-Environment Architecture

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   DEV             │  │   STAGING         │  │   PROD            │
│   10.0.0.0/16    │  │   10.1.0.0/16    │  │   10.2.0.0/16    │
│                   │  │                   │  │                   │
│  VPC + 2 subnets │  │  VPC + 2 subnets │  │  VPC + 3 subnets │
│  RDS db.t3.micro │  │  RDS db.t3.small │  │  RDS db.r5.large │
│  S3 (AES256)     │  │  S3 (KMS)        │  │  S3 (KMS + repl) │
│  1 NAT GW        │  │  1 NAT GW        │  │  3 NAT GWs (HA)  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
         │                     │                      │
         └─────────────────────┼──────────────────────┘
                               │
                    Same Terraform modules
                    Different Terragrunt inputs
```

Same modules, different inputs. Dev is cheap and fast. Prod is resilient and encrypted. The code path is identical — only the configuration changes.

---

## 2. Hands-On Exercises

### Exercise 1: DRY Config

**File:** `exercises/01-dry-config.md`

Write the root `terragrunt.hcl` with remote state and provider generation, then create the dev environment VPC and S3 module configs.

**Key commands you'll learn:**

```bash
terragrunt init                        # Init a single module
terragrunt plan                        # Plan a single module
terragrunt apply                       # Apply a single module
terragrunt output                      # Show module outputs
```

**What you'll create:**

```
terragrunt/
├── terragrunt.hcl           ← Root: backend + provider generation
└── environments/dev/
    ├── env.hcl              ← environment = "dev"
    ├── vpc/terragrunt.hcl   ← VPC inputs for dev
    └── s3/terragrunt.hcl    ← S3 inputs for dev
```

**You're done when:**
- `terragrunt plan` in `environments/dev/vpc/` shows the VPC resources
- State is stored at `environments/dev/vpc/terraform.tfstate` in S3
- Provider config is auto-generated (no `providers.tf` in your source)

Estimated time: 30 minutes.

---

### Exercise 2: Multi-Environment

**File:** `exercises/02-multi-env.md`

Create staging and prod environment configs by duplicating the directory structure (not the Terraform modules). Each environment has different CIDR blocks, instance sizes, and encryption settings.

**Key commands you'll learn:**

```bash
cd environments/staging && terragrunt run-all plan    # Plan all staging modules
cd environments/prod && terragrunt run-all apply      # Apply all prod modules
```

**What you'll build:**

```
environments/
├── dev/       ← 10.0.0.0/16, db.t3.micro, AES256
├── staging/   ← 10.1.0.0/16, db.t3.small, KMS
└── prod/      ← 10.2.0.0/16, db.r5.large, KMS
```

**You're done when:**
- Three environments exist with different configurations
- Each has its own state file path in S3
- Adding a new environment takes minutes, not hours

Estimated time: 30 minutes.

---

### Exercise 3: Dependencies

**File:** `exercises/03-dependencies.md`

Add RDS and IAM module configs with `dependency` blocks that reference VPC and S3 outputs. Use `run-all` to apply the full stack in the correct order.

**Key commands you'll learn:**

```bash
terragrunt run-all plan                # Plan all modules in order
terragrunt run-all apply               # Apply all modules in order
terragrunt run-all destroy             # Destroy in reverse order
terragrunt graph-dependencies          # Show the dependency graph
```

**What you'll wire:**

```
VPC ──▶ RDS (needs vpc_id, subnet_ids)
S3  ──▶ IAM (needs bucket_arn)
```

**You're done when:**
- `terragrunt run-all apply` deploys VPC and S3 first, then RDS and IAM
- `terragrunt run-all destroy` tears down in reverse order
- You can add a new module (e.g., EKS) by adding one `terragrunt.hcl` file

Estimated time: 30 minutes.

---

## 3. Summary

### What You Learned

| Concept | Key Insight |
|---------|-------------|
| **DRY config** | Root `terragrunt.hcl` eliminates backend/provider duplication |
| **`include`** | Child configs inherit from parents automatically |
| **`inputs`** | Module variables without `terraform.tfvars` files |
| **`dependency`** | Typed, ordered cross-module references |
| **`run-all`** | Orchestrated multi-module plan/apply/destroy with parallelism |
| **`remote_state`** | Auto-generated backend with `path_relative_to_include()` |
| **`generate`** | Auto-generated provider config — one source of truth |
| **Multi-env** | Same modules, different inputs per environment |

### Terragrunt Cheat Sheet

```bash
# Single module operations (run from module directory)
terragrunt init                         # Initialise the module
terragrunt plan                         # Plan changes
terragrunt apply                        # Apply changes
terragrunt destroy                      # Destroy resources
terragrunt output                       # Show outputs

# Multi-module operations (run from environment directory)
terragrunt run-all init                 # Init all modules
terragrunt run-all plan                 # Plan all in dependency order
terragrunt run-all apply                # Apply all in dependency order
terragrunt run-all destroy              # Destroy in reverse order
terragrunt run-all output               # Show all outputs

# Dependency management
terragrunt graph-dependencies           # Show dependency graph (DOT format)
terragrunt render-json                  # Show effective config as JSON

# Debugging
terragrunt terragrunt-info              # Show effective configuration
terragrunt validate-inputs              # Validate inputs against module variables
```

### Next Steps

You've completed Stage 2. FinStack deploys to three environments with zero config duplication. Next:

- **Stage 3 (Packer)** — build golden AMIs for FinStack nodes
- **Stage 4 (Vault)** — inject dynamic secrets into Terragrunt inputs
- **Stage 7 (CI/CD)** — run `terragrunt run-all plan` in GitHub Actions

**Further learning:**
- Terragrunt `before_hook` and `after_hook` for running scripts around plan/apply
- `mock_outputs` for planning modules before dependencies are applied
- Using `sops_decrypt_file()` for encrypted secrets in Terragrunt inputs
- Terragrunt with Atlantis or Terraform Cloud for PR-based workflows
