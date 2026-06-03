# Stage 1: Terraform Basics — Infrastructure as Code from First Principles

**Goal:** Write, plan, and apply Terraform configurations that provision the complete FinStack network and compute infrastructure — VPC, subnets, EKS, RDS, S3, and IAM — against LocalStack on your laptop, then understand state, modules, and backends well enough to operate Terraform in a team.

**Prerequisites:** Docker installed and running (for LocalStack). Basic terminal skills. No AWS account required — LocalStack simulates everything for free.

**Sample App:** FinStack — a BFSI payment platform with a Flask API, PostgreSQL database, S3 storage, and EKS compute. You will provision the infrastructure that FinStack runs on.

> For the full crash course on Terraform, see [`Terraform.md`](../../../../iac/Terraform.md).

---

## 1. Theory

### 1.1 Why Infrastructure as Code?

Before IaC, provisioning infrastructure meant clicking through a web console or SSH-ing into servers and running ad-hoc commands. This works for one server. It collapses at scale:

| Problem | Console / SSH Approach | Terraform |
|---------|----------------------|-----------|
| **Reproducibility** | "I clicked these buttons" — no record | `.tf` files in Git — exact record |
| **Drift** | Someone changed a setting in the console — nobody knows | `terraform plan` shows drift instantly |
| **Collaboration** | Two engineers clicking at the same time — conflict | State locking prevents concurrent changes |
| **Environments** | "Set up staging the same as prod" — hours of clicking | Same code, different variables — minutes |
| **Audit** | "Who changed the security group?" — dig through CloudTrail | Git blame on the `.tf` file — seconds |
| **Disaster recovery** | "Rebuild everything from scratch" — days | `terraform apply` — minutes |

In BFSI, the audit trail alone justifies IaC. When the regulator asks "who approved this network change and when?" you point to a Git commit, a pull request review, and a CI/CD pipeline run — not a screenshot of a console session.

**The one idea that unlocks Terraform:** Terraform is a **desired-state engine**. You describe what infrastructure should exist (a VPC with these subnets, an RDS instance with this config), and Terraform figures out how to get from the current state to the desired state. You never write "create this, then modify that, then delete the other." You write "this is what I want" and Terraform computes the diff.

**Mental model:** Think of Terraform like a GPS. You enter the destination (desired state). The GPS knows your current location (current state from the state file). It computes the route (the plan). You confirm, and it navigates (apply). If you take a wrong turn (manual drift), it recalculates.

---

### 1.2 Architecture — How Terraform Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR LAPTOP                              │
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────────┐  │
│  │  .tf files   │────▶│  terraform   │────▶│  State file    │  │
│  │  (desired    │     │  CLI         │     │  (current      │  │
│  │   state)     │     │              │     │   state)       │  │
│  └──────────────┘     └──────┬───────┘     └────────────────┘  │
│                              │                                  │
│                              │ API calls                        │
│                              ▼                                  │
│                       ┌──────────────┐                          │
│                       │  Provider    │                          │
│                       │  (aws, gcp,  │                          │
│                       │   azurerm)   │                          │
│                       └──────┬───────┘                          │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │ HTTPS
                               ▼
                  ┌────────────────────────┐
                  │  Cloud API             │
                  │  (AWS / LocalStack)    │
                  │                        │
                  │  VPC, RDS, S3, EKS,   │
                  │  IAM, Security Groups  │
                  └────────────────────────┘
```

**The lifecycle — four commands you'll use daily:**

```
terraform init       →  Download providers, initialise backend
terraform plan       →  Compute diff between desired and current state
terraform apply      →  Execute the plan — create/update/destroy resources
terraform destroy    →  Remove everything managed by this config
```

The plan is the safety net. It shows you exactly what will change before anything touches infrastructure. In production, you run `plan` in CI on a pull request and `apply` only after human approval.

---

### 1.3 Core Concepts

#### Providers

A provider is Terraform's plugin for a specific API. The AWS provider knows how to create VPCs, EC2 instances, S3 buckets. The Google provider knows GCE, GCS, GKE. You can mix providers in one configuration.

```hcl
# Configure the AWS provider
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"      # Any 5.x version
    }
  }
}

provider "aws" {
  region = "ap-south-1"        # Mumbai — common for BFSI in India

  # For LocalStack: override the endpoints
  endpoints {
    s3  = "http://localhost:4566"
    ec2 = "http://localhost:4566"
    rds = "http://localhost:4566"
    iam = "http://localhost:4566"
    sts = "http://localhost:4566"
    eks = "http://localhost:4566"
  }
}
```

**Version pinning matters.** `~> 5.0` means "any 5.x but not 6.0". Without pinning, `terraform init` could pull a new major version that breaks your config. In a team, pin the exact version (`= 5.40.0`) and upgrade deliberately.

#### Resources

A resource is a single infrastructure object managed by Terraform:

```hcl
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "finstack-vpc"
    Environment = "dev"
    Project     = "finstack"
    ManagedBy   = "terraform"
  }
}
```

The syntax is `resource "<provider>_<type>" "<local_name>"`. The local name is how you refer to this resource elsewhere in your code (`aws_vpc.main.id`). It has no effect on the actual infrastructure.

**Every resource has:**
- **Arguments** — what you configure (cidr_block, tags)
- **Attributes** — what Terraform computes after creation (id, arn, dns_name)
- **Dependencies** — implicit (via references) or explicit (`depends_on`)

#### Variables

Variables parameterise your configuration. One codebase, many environments:

```hcl
# variables.tf
variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true   # Hidden in plan/apply output
}
```

**How to pass variables (in priority order, highest wins):**

1. `-var 'environment=prod'` on the command line
2. `-var-file="prod.tfvars"` pointing to a file
3. `TF_VAR_environment=prod` environment variable
4. `terraform.tfvars` or `*.auto.tfvars` files (auto-loaded)
5. Default value in the variable block
6. Interactive prompt if no default and no value provided

**Never put secrets in `.tfvars` files committed to Git.** Use environment variables, a secrets manager, or Terragrunt's `sops_decrypt_file()`. We cover secure secret injection in Stage 4 (Vault).

#### Outputs

Outputs expose values from your configuration — useful for passing data between modules or displaying results:

```hcl
# outputs.tf
output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.main.id
}

output "rds_endpoint" {
  description = "RDS connection endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}
```

Outputs appear after `terraform apply` and can be queried with `terraform output vpc_id`.

#### Data Sources

A data source reads information from infrastructure that Terraform does not manage. It's read-only — Terraform never creates, updates, or destroys a data source:

```hcl
# Look up the latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

# Use it
resource "aws_instance" "bastion" {
  ami           = data.aws_ami.amazon_linux_2.id
  instance_type = "t3.micro"
}
```

Data sources are essential for referencing existing infrastructure — the account ID, available AZs, existing VPCs created by another team.

#### Locals

Locals are computed values within a module. They reduce repetition and make complex expressions readable:

```hcl
locals {
  common_tags = {
    Project     = "finstack"
    Environment = var.environment
    ManagedBy   = "terraform"
    Team        = "platform"
  }

  # Derive subnet CIDRs from the VPC CIDR
  public_subnets  = [for i in range(3) : cidrsubnet(var.vpc_cidr, 8, i)]
  private_subnets = [for i in range(3) : cidrsubnet(var.vpc_cidr, 8, i + 100)]
}
```

Use locals for anything you reference more than once. They make your code DRY without the overhead of a variable.

---

### 1.4 State — The Source of Truth

State is Terraform's record of what infrastructure it manages. Without state, Terraform cannot compute a plan.

```
┌────────────────┐      ┌───────────────────┐      ┌──────────────┐
│  .tf files     │      │  terraform.tfstate │      │  Real infra  │
│  (what you     │◄────▶│  (what Terraform   │◄────▶│  (what       │
│   want)        │      │   thinks exists)   │      │   actually   │
│                │      │                    │      │   exists)    │
└────────────────┘      └───────────────────┘      └──────────────┘
      ▲                          ▲                         ▲
      │                          │                         │
   Desired state            Recorded state            Actual state
```

**Plan = Desired - Recorded**. Terraform compares your `.tf` files to the state file and produces a diff.
**Apply = execute that diff** against the real infrastructure, then update the state file.

**What lives in state:**
- Resource IDs (vpc-abc123, i-def456)
- All attribute values (including sensitive ones)
- Dependencies between resources
- Provider configuration

**State pitfalls to understand now:**

| Pitfall | What happens | Prevention |
|---------|-------------|------------|
| **Local state in a team** | Two engineers run apply simultaneously — state corruption | Use a remote backend (S3 + DynamoDB) |
| **Secrets in state** | `terraform.tfstate` contains RDS passwords in plaintext | Encrypt the state file at rest (S3 SSE), restrict access |
| **State drift** | Someone changes infra via console — Terraform doesn't know | Run `terraform plan` regularly; use `terraform refresh` |
| **Lost state** | State file deleted — Terraform thinks nothing exists, tries to recreate everything | Remote backend with versioning; `terraform import` to recover |
| **State file in Git** | Secrets exposed, merge conflicts on every apply | `.gitignore` the state file; use remote backend |

**Remote backend configuration (production pattern):**

```hcl
terraform {
  backend "s3" {
    bucket         = "finstack-terraform-state"
    key            = "environments/dev/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "finstack-terraform-locks"  # State locking
  }
}
```

The S3 bucket stores the state. The DynamoDB table provides locking — only one `terraform apply` can run at a time. This is non-negotiable for teams.

---

### 1.5 Modules — Reusable Infrastructure

A module is a directory of `.tf` files called from another configuration. Modules are how you avoid copying VPC code across dev, staging, and prod.

```
finstack/terraform/
├── modules/
│   ├── vpc/
│   │   ├── main.tf        # VPC, subnets, NAT, route tables
│   │   ├── variables.tf   # Inputs: cidr, environment, azs
│   │   └── outputs.tf     # Outputs: vpc_id, subnet_ids
│   ├── eks/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── rds/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── s3/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
│
└── environments/
    ├── main.tf             # Calls modules
    ├── variables.tf        # Environment-level variables
    ├── outputs.tf          # Top-level outputs
    ├── providers.tf        # Provider config
    ├── backend.tf          # State backend config
    └── terraform.tfvars    # Variable values (not committed)
```

**Calling a module:**

```hcl
# environments/main.tf
module "vpc" {
  source      = "../modules/vpc"
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
  azs         = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
}

module "rds" {
  source       = "../modules/rds"
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id          # Output from vpc module
  subnet_ids   = module.vpc.private_subnet_ids
  db_password  = var.db_password
}
```

**Module design rules:**
1. One module per logical unit (vpc, eks, rds, s3) — not one module per resource
2. Every input is a variable with a description and type
3. Every output needed by other modules is exported
4. No hardcoded values — everything parameterised
5. Pin module versions when using the Terraform Registry

**The module composition pattern:**

```
environments/main.tf
    │
    ├── module "vpc"       →  modules/vpc/
    │       ↓ vpc_id, subnet_ids
    ├── module "eks"       →  modules/eks/
    │       ↓ cluster_endpoint
    ├── module "rds"       →  modules/rds/
    │       ↓ rds_endpoint
    └── module "s3"        →  modules/s3/
            ↓ bucket_arn
```

Outputs flow from one module to inputs of the next. Terraform builds the dependency graph automatically from these references.

---

### 1.6 The Dependency Graph

Terraform builds a directed acyclic graph (DAG) of all resources. Resources that don't depend on each other are created in parallel. Resources with dependencies are created in order.

```
                    ┌─────────┐
                    │   VPC   │
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────┐ ┌────────┐
         │ Public │ │ Private│ │  IGW   │
         │Subnets │ │Subnets │ │        │
         └───┬────┘ └───┬────┘ └────┬───┘
             │          │           │
             ▼          │           ▼
         ┌────────┐    │     ┌──────────┐
         │  NAT   │    │     │ Route    │
         │Gateway │    │     │ Table    │
         └───┬────┘    │     └──────────┘
             │         │
             ▼         ▼
        ┌────────┐ ┌────────┐ ┌────────┐
        │  ALB   │ │  EKS   │ │  RDS   │
        └────────┘ └────────┘ └────────┘
                       │
                       ▼
                  ┌──────────┐
                  │  FinStack│
                  │  Pods    │
                  └──────────┘
```

Terraform resolves this automatically from resource references. You rarely need `depends_on` — use it only when there's a hidden dependency Terraform can't infer (e.g., an IAM policy that must exist before a Lambda can be created, but the Lambda doesn't reference the policy directly).

**Visualise the graph:**

```bash
terraform graph | dot -Tpng > graph.png
```

---

### 1.7 FinStack Infrastructure — What We're Building

In this stage, you'll provision the complete FinStack infrastructure on LocalStack:

```
┌──────────────────────────────────────────────────────────┐
│  VPC: 10.0.0.0/16  (finstack-vpc)                        │
│                                                          │
│  ┌─────────────────────┐  ┌─────────────────────────┐   │
│  │  Public Subnets      │  │  Private Subnets         │   │
│  │  10.0.0.0/24 (AZ-a) │  │  10.0.100.0/24 (AZ-a)  │   │
│  │  10.0.1.0/24 (AZ-b) │  │  10.0.101.0/24 (AZ-b)  │   │
│  │  10.0.2.0/24 (AZ-c) │  │  10.0.102.0/24 (AZ-c)  │   │
│  │                      │  │                          │   │
│  │  ┌─────┐  ┌──────┐  │  │  ┌──────┐  ┌──────────┐│   │
│  │  │ NAT │  │ ALB  │  │  │  │ EKS  │  │ RDS      ││   │
│  │  │ GW  │  │      │  │  │  │Nodes │  │ Postgres ││   │
│  │  └─────┘  └──────┘  │  │  └──────┘  └──────────┘│   │
│  └─────────────────────┘  └─────────────────────────┘   │
│                                                          │
│  ┌─────────────────────┐  ┌─────────────────────────┐   │
│  │  S3 Bucket           │  │  IAM Roles               │   │
│  │  finstack-statements │  │  eks-node-role           │   │
│  │  SSE-KMS encrypted   │  │  rds-monitoring-role     │   │
│  │  No public access    │  │  finstack-app-role (IRSA)│   │
│  └─────────────────────┘  └─────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Why this architecture matters for BFSI:**
- **Private subnets for data:** RDS and EKS nodes are never directly internet-accessible
- **NAT Gateway:** Private instances can pull packages and updates but can't be reached from outside
- **ALB in public subnets:** Only the load balancer faces the internet
- **S3 encryption:** All objects encrypted with KMS — regulatory requirement for payment data
- **No public S3:** The bucket is private — no accidental data exposure (we enforce this with OPA in Stage 5)
- **IAM least privilege:** Each component gets only the permissions it needs

---

## 2. Hands-On Exercises

The exercises are in the `exercises/` directory. Complete them in order.

### Exercise 1: First Apply

**File:** `exercises/01-first-apply.md`

Start LocalStack, write a minimal Terraform configuration, and run the full init/plan/apply lifecycle. Create a VPC and S3 bucket for FinStack.

**Key commands you'll learn:**

```bash
docker compose up -d                  # Start LocalStack
terraform init                        # Download providers
terraform plan                        # Preview changes
terraform apply                       # Create infrastructure
terraform show                        # Inspect current state
terraform output                      # Query outputs
terraform destroy                     # Tear down everything
```

**What you'll create:**

```
┌──────────────────────────────┐
│  LocalStack (localhost:4566) │
│                              │
│  ┌────────────────────────┐  │
│  │  VPC: 10.0.0.0/16     │  │
│  │  + 2 public subnets    │  │
│  │  + 2 private subnets   │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │  S3: finstack-dev-     │  │
│  │  statements            │  │
│  │  SSE-AES256 encrypted  │  │
│  │  No public access      │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

**You're done when:**
- `terraform plan` shows 0 changes (infrastructure matches desired state)
- `terraform output vpc_id` returns a VPC ID
- `terraform output bucket_name` returns a bucket name
- You understand what each command does and when you'd use it

Estimated time: 30 minutes.

---

### Exercise 2: Modules

**File:** `exercises/02-modules.md`

Refactor your flat Terraform configuration into reusable modules — VPC, RDS, S3, and IAM. Wire them together with input/output references.

**Key commands you'll learn:**

```bash
terraform init -upgrade               # Re-initialise after adding modules
terraform plan -target=module.vpc      # Plan a single module
terraform state list                   # List all resources in state
terraform state show aws_vpc.main      # Show details of one resource
```

**What you'll build:**

```
environments/main.tf
    │
    ├── module "vpc"    ──▶  modules/vpc/
    │       ↓ vpc_id, private_subnet_ids, public_subnet_ids
    │
    ├── module "rds"    ──▶  modules/rds/
    │       ↓ rds_endpoint, rds_port
    │
    ├── module "s3"     ──▶  modules/s3/
    │       ↓ bucket_arn, bucket_name
    │
    └── module "iam"    ──▶  modules/iam/
            ↓ role_arns
```

**You're done when:**
- `terraform state list` shows resources namespaced under `module.vpc`, `module.rds`, etc.
- Changing a variable in one module doesn't require editing another
- You can explain why modules make multi-environment deployments possible

Estimated time: 45 minutes.

---

### Exercise 3: State Management

**File:** `exercises/03-state-management.md`

Configure a remote backend (S3 + DynamoDB on LocalStack), practice state operations — import, move, remove — and deliberately corrupt then recover state.

**Key commands you'll learn:**

```bash
terraform state mv                     # Rename a resource in state
terraform state rm                     # Remove a resource from state (without destroying it)
terraform import                       # Import existing infrastructure into state
terraform state pull                   # Download remote state to stdout
terraform state push                   # Upload state to remote backend
terraform force-unlock                 # Release a stuck state lock
```

**What you'll practise:**

```
Scenario 1: Remote backend
  Local state  ──migrate──▶  S3 backend + DynamoDB lock

Scenario 2: Import
  Manually created resource  ──import──▶  Terraform-managed

Scenario 3: Recovery
  Corrupted state  ──backup + reimport──▶  Working state
```

**You're done when:**
- State is stored in an S3 bucket (on LocalStack), not on disk
- You can import a resource that was created outside Terraform
- You understand why state locking prevents corruption
- You've recovered from a deliberately broken state file

Estimated time: 45 minutes.

---

## 3. Summary

### What You Learned

| Concept | Key Insight |
|---------|-------------|
| **IaC** | Describe desired state in code; Terraform computes the diff and applies it |
| **Provider** | Plugin that talks to a specific cloud API; version-pin it |
| **Resource** | A single infrastructure object; has arguments, attributes, dependencies |
| **Variable** | Parameterises config; sensitive flag hides secrets in output |
| **Output** | Exposes values for use by other modules or humans |
| **Data source** | Read-only lookup of existing infrastructure |
| **State** | Terraform's record of what it manages; source of truth for plan |
| **Remote backend** | S3 + DynamoDB for team use; encryption + locking |
| **Module** | Directory of `.tf` files called from a root config; reusability unit |
| **Dependency graph** | DAG of resources; Terraform parallelises independent work |
| **Plan** | The safety net; always review before apply |

### Terraform Cheat Sheet

```bash
# Lifecycle
terraform init                          # Initialise — download providers, set up backend
terraform plan                          # Preview changes (desired vs current)
terraform apply                         # Execute the plan
terraform destroy                       # Remove all managed resources
terraform plan -out=tfplan              # Save plan to file
terraform apply tfplan                  # Apply a saved plan (CI pattern)

# State
terraform state list                    # List all resources in state
terraform state show <resource>         # Show one resource's attributes
terraform state mv <old> <new>          # Rename a resource in state
terraform state rm <resource>           # Remove from state (keep real infra)
terraform import <resource> <id>        # Import existing infra into state
terraform state pull                    # Download remote state to stdout
terraform state push                    # Upload local state to remote

# Inspection
terraform output                        # Show all outputs
terraform output <name>                 # Show one output
terraform show                          # Show the full current state
terraform graph | dot -Tpng > g.png     # Visualise dependency graph
terraform providers                     # List providers used
terraform validate                      # Check syntax without accessing APIs
terraform fmt                           # Format .tf files (canonical style)
terraform fmt -check                    # Check formatting without changing

# Workspace (basic multi-env — Terragrunt is better)
terraform workspace list                # List workspaces
terraform workspace new dev             # Create workspace
terraform workspace select dev          # Switch workspace

# Targeting (use sparingly)
terraform plan -target=module.vpc       # Plan only the VPC module
terraform apply -target=aws_s3_bucket.x # Apply one resource only

# Variables
terraform plan -var 'env=prod'          # Pass a variable
terraform plan -var-file=prod.tfvars    # Pass a variable file
TF_VAR_env=prod terraform plan          # Environment variable
```

### Next Steps

You've completed Stage 1. FinStack's infrastructure is defined in reusable modules with remote state. Next:

- **Stage 2 (Terragrunt)** — eliminate config repetition across dev/staging/prod
- **Stage 3 (Packer)** — build hardened machine images for FinStack nodes
- **Stage 4 (Vault)** — inject dynamic secrets instead of static passwords

**Further learning:**
- Terraform workspaces vs Terragrunt environments (see `Terragrunt.md`)
- The `terraform_remote_state` data source for cross-stack references
- Terraform Cloud / Terraform Enterprise for managed state and runs
- Writing custom providers (rare, but possible)
