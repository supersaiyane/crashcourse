# Terragrunt — A 2-Day Crash Course

> **In one sentence:** Terragrunt is a thin wrapper around Terraform that keeps your configurations DRY, manages remote state automatically, and orchestrates multi-module deployments — it's the scaffolding that makes large-scale Terraform manageable. Prerequisite: know Terraform — see `Terraform.md`.

---

## Part 0 — Why Terragrunt exists

Terraform is powerful but its ergonomics break down at scale. The moment you have more than two environments, you run into the same three problems every time.

**Duplicated backend configuration.** Every module needs a `backend` block pointing to S3 (or GCS, or Azure Blob). That block contains a bucket name, a key path, a region, a DynamoDB table. Paste it into `dev/vpc`, `dev/eks`, `staging/vpc`, `staging/eks`, and you've already got eight copies of essentially the same config. Change the bucket name and you're doing find-and-replace archaeology.

**Copy-pasted module directories per environment.** The idiomatic solution is to have a directory per environment, each calling the same module. But those `main.tf` files end up being near-identical, differing only in a handful of variable values. You're maintaining boilerplate instead of infrastructure.

**No dependency ordering between modules.** Terraform doesn't know that your `eks` module depends on your `vpc` module unless they're in the same state file. Split them across state files for isolation, and you lose that guarantee. You end up running `terraform apply` in a specific order manually, or encoding it in a Makefile that nobody trusts.

Terragrunt solves all three. It generates backend config at apply time from a single root definition. It lets you write a `terragrunt.hcl` that's a few lines of `inputs = {}` with everything else inherited from a parent. And it reads explicit `dependency` blocks to build an apply order graph.

**Mental model:** if Terraform is a single Lego set, Terragrunt is the instruction manual for assembling multiple sets into a city — it tells you which set to build first, shares common settings, and keeps the pieces organized.

---

## Part 1 — The vocabulary

| Term | What it is |
|---|---|
| `terragrunt.hcl` | The config file Terragrunt reads. Lives alongside (or instead of) `terraform.tfvars`. One per module directory. |
| `include` | Merges a parent `terragrunt.hcl` into the current one. How hierarchy works — child inherits root remote_state, locals, and generate blocks. |
| `dependency` | Declares that the current module depends on another. Lets you read output values from the dependency's state. Drives `run_all` ordering. |
| `generate` | Writes a file to disk before running Terraform. Used to generate `backend.tf` or `provider.tf` dynamically. |
| `inputs` | A map of values passed as Terraform variables. Equivalent to `-var` or a `terraform.tfvars` file. |
| `run_all` | Terragrunt subcommand that walks a directory tree, respects `dependency` ordering, and runs a command across all modules. |
| `before_hook` / `after_hook` | Shell commands that run before or after a Terraform command. Useful for validation, linting, or notifications. |
| `remote_state` block | Declares the backend configuration. Terragrunt generates the `backend.tf` file from this. Defined once in the root, inherited everywhere. |
| `read_terragrunt_config` | Function that reads and parses another `terragrunt.hcl` at a given path. Used in root configs to pull in account-level or region-level variables. |

---

## DAY 1 — DRY Terraform

### 1. Install

```bash
# macOS
brew install terragrunt

# Linux — download binary directly
curl -Lo terragrunt https://github.com/gruntwork-io/terragrunt/releases/latest/download/terragrunt_linux_amd64
chmod +x terragrunt
sudo mv terragrunt /usr/local/bin/

# Verify
terragrunt --version
```

Terragrunt wraps Terraform. You still need Terraform installed. Terragrunt passes through every flag it doesn't own, so `terragrunt apply -var foo=bar` works exactly as you'd expect.

### 2. Wrapping a Terraform module

The simplest possible `terragrunt.hcl` is one line:

```hcl
terraform {
  source = "git::https://github.com/terraform-aws-modules/terraform-aws-vpc.git?ref=v5.1.0"
}
```

That `source` can be a registry module, a Git URL, or a relative local path:

```hcl
terraform {
  source = "../../../modules/vpc"
}
```

When you run `terragrunt plan`, Terragrunt copies the source into a `.terragrunt-cache` directory and runs `terraform plan` there. Your working directory stays clean.

### 3. Auto-generating backend config

Define the remote state once in a root `terragrunt.hcl`:

```hcl
# root terragrunt.hcl
remote_state {
  backend = "s3"

  config = {
    bucket         = "my-org-terraform-state"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }

  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
}
```

`path_relative_to_include()` resolves to the path of the calling module relative to the root. A module at `live/dev/vpc/terragrunt.hcl` gets the key `live/dev/vpc/terraform.tfstate`. Every module gets a unique state key automatically.

The `generate` block writes `backend.tf` into the Terraform working directory before `init`. You never write a `backend.tf` by hand again.

### 4. Inputs and variables

```hcl
# live/dev/vpc/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../../modules/vpc"
}

inputs = {
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]
  environment        = "dev"
}
```

`find_in_parent_folders()` walks up the directory tree until it finds a `terragrunt.hcl` — that's the root config. The `inputs` block maps directly to Terraform variables. No `terraform.tfvars` file needed.

### 5. Multi-environment layout

The canonical Terragrunt directory structure separates live infrastructure from reusable modules:

```
.
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── eks/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── live/
    ├── terragrunt.hcl          ← root config: remote_state, generate provider
    ├── dev/
    │   ├── account.hcl         ← account-level locals (account_id, region)
    │   ├── vpc/
    │   │   └── terragrunt.hcl
    │   └── eks/
    │       └── terragrunt.hcl
    ├── staging/
    │   ├── account.hcl
    │   ├── vpc/
    │   │   └── terragrunt.hcl
    │   └── eks/
    │       └── terragrunt.hcl
    └── prod/
        ├── account.hcl
        ├── vpc/
        │   └── terragrunt.hcl
        └── eks/
            └── terragrunt.hcl
```

Each environment directory is identical in structure. The module-level `terragrunt.hcl` files differ only in their `inputs`. The backend state paths are generated automatically.

### 6. terragrunt plan/apply

```bash
# Single module
cd live/dev/vpc
terragrunt plan
terragrunt apply

# Destroy
terragrunt destroy

# Pass Terraform flags through
terragrunt apply -target=aws_vpc.main
```

Terragrunt runs `terraform init` for you on the first run. If you update the source ref, run `terragrunt init --upgrade`.

---

**By end of Day 1 you can:**
- Install Terragrunt and wrap an existing Terraform module
- Define remote state once and have it applied everywhere via `include`
- Structure a multi-environment directory tree
- Run plan and apply for a single module with auto-generated backend config

---

## DAY 2 — Make it real

### 1. Dependency blocks and run_all

`dependency` lets one module consume outputs from another:

```hcl
# live/dev/eks/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../../modules/eks"
}

dependency "vpc" {
  config_path = "../vpc"

  mock_outputs = {
    vpc_id          = "vpc-00000000"
    private_subnets = ["subnet-00000000", "subnet-11111111"]
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  vpc_id          = dependency.vpc.outputs.vpc_id
  private_subnets = dependency.vpc.outputs.private_subnets
  cluster_version = "1.29"
}
```

`mock_outputs` lets `terragrunt validate` and `terragrunt plan` succeed even when the dependency hasn't been applied yet — useful in CI on feature branches.

`run_all` traverses a directory tree and runs a command across all modules, respecting `dependency` ordering:

```bash
# Apply all modules in dev, in dependency order
cd live/dev
terragrunt run-all apply

# Plan everything without applying
terragrunt run-all plan

# Destroy in reverse dependency order
terragrunt run-all destroy
```

`run_all` will error if it detects a cycle in your dependency graph.

### 2. Include and hierarchy — root, env, module

You can have multiple levels of `include`. A module can include a region-level config that itself uses root-level locals:

```hcl
# live/dev/us-east-1/vpc/terragrunt.hcl
include "root" {
  path   = find_in_parent_folders("root.hcl")
  expose = true
}

include "region" {
  path   = find_in_parent_folders("region.hcl")
  expose = true
}
```

`expose = true` makes the included config's locals accessible in the child via `include.root.locals.some_value`.

Keep the hierarchy shallow. Three levels (root → env → module) covers most real setups. Adding a fourth level (root → account → region → module) is warranted for multi-account AWS organizations.

### 3. Generating provider config

Rather than duplicating `provider "aws" {}` blocks, generate them:

```hcl
# root terragrunt.hcl
locals {
  account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl"))
  account_id   = local.account_vars.locals.account_id
  aws_region   = local.account_vars.locals.aws_region
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
provider "aws" {
  region = "${local.aws_region}"

  assume_role {
    role_arn = "arn:aws:iam::${local.account_id}:role/TerraformRole"
  }
}
EOF
}
```

Every module that includes this root gets a provider configured to assume the correct role in the correct account. No provider block in any module directory.

### 4. Hooks

```hcl
terraform {
  source = "../../../modules/eks"

  before_hook "validate" {
    commands = ["apply", "plan"]
    execute  = ["terraform", "validate"]
  }

  after_hook "notify" {
    commands     = ["apply"]
    execute      = ["slack-notify", "apply complete: ${path_relative_to_include()}"]
    run_on_error = false
  }
}
```

Hooks run in the module's working directory (inside `.terragrunt-cache`). Use them sparingly — a hook that fails blocks the entire apply.

### 5. Working with monorepos

In a monorepo where infrastructure lives alongside application code, keep your `live/` tree at the repo root and your `modules/` tree nearby. Use `--terragrunt-working-dir` to target a specific path from CI without `cd`:

```bash
terragrunt run-all plan --terragrunt-working-dir live/dev
```

Use `.terragrunt-cache` in your `.gitignore`. It's regenerated on every run.

```
# .gitignore
**/.terragrunt-cache
**/.terraform
*.tfstate
*.tfstate.backup
```

### 6. CI/CD integration

A typical GitHub Actions job for Terragrunt (see `GitHub-Actions.md` for workflow fundamentals):

```yaml
- name: Terragrunt plan
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: |
    cd live/${{ matrix.environment }}
    terragrunt run-all plan \
      --terragrunt-non-interactive \
      --terragrunt-parallelism 4
```

`--terragrunt-non-interactive` disables prompts. `--terragrunt-parallelism` controls how many modules run concurrently — keep it under 10 to avoid AWS API rate limits.

For apply, require manual approval between plan and apply steps. Never auto-apply `prod`.

### 7. Debugging — terragrunt render-json

When the config inheritance is hard to follow, render the fully-merged config for a module:

```bash
cd live/dev/vpc
terragrunt render-json
```

This writes `terragrunt-rendered.json` showing exactly what Terragrunt sees after all `include` merges and function evaluations. If your `inputs` aren't what you expect, start here.

For verbose logging:

```bash
terragrunt apply --terragrunt-log-level debug 2>&1 | less
```

### 8. Migration from plain Terraform

If you have existing Terraform state and want to adopt Terragrunt without disrupting anything:

1. Don't move state files. Terragrunt can target existing state — set `key` in `remote_state.config` to match the existing path exactly.
2. Add `terragrunt.hcl` files to each module directory. Use `inputs = {}` to replace `terraform.tfvars`.
3. Add a root `terragrunt.hcl` with `remote_state` and `generate "backend"`.
4. Run `terragrunt plan` in one module and verify the plan is empty (no changes).
5. Once confident, delete the hand-written `backend.tf` from each module.

Do not run `terragrunt run-all apply` during migration. Validate one module at a time.

---

## Worked example — Multi-account AWS setup

This is the structure you'll see in most mature AWS organizations using Terragrunt. Three accounts: management, dev, prod.

```
live/
├── root.hcl                    ← remote_state, generate provider, shared locals
├── management/
│   ├── account.hcl             ← account_id = "111111111111", region = "us-east-1"
│   └── us-east-1/
│       └── iam/
│           └── terragrunt.hcl
├── dev/
│   ├── account.hcl             ← account_id = "222222222222", region = "us-east-1"
│   └── us-east-1/
│       ├── vpc/
│       │   └── terragrunt.hcl
│       └── eks/
│           └── terragrunt.hcl
└── prod/
    ├── account.hcl             ← account_id = "333333333333", region = "us-east-1"
    └── us-east-1/
        ├── vpc/
        │   └── terragrunt.hcl
        └── eks/
            └── terragrunt.hcl
```

**root.hcl:**

```hcl
locals {
  account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl"))
  account_id   = local.account_vars.locals.account_id
  aws_region   = local.account_vars.locals.aws_region
}

remote_state {
  backend = "s3"
  config = {
    bucket         = "my-org-tf-state-${local.account_id}"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = local.aws_region
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
provider "aws" {
  region = "${local.aws_region}"
  assume_role {
    role_arn = "arn:aws:iam::${local.account_id}:role/TerraformRole"
  }
}
EOF
}
```

**account.hcl** (per account, no `terragrunt {}` block — just locals):

```hcl
locals {
  account_id = "222222222222"
  aws_region = "us-east-1"
  env        = "dev"
}
```

**Module-level terragrunt.hcl** (dev eks):

```hcl
include "root" {
  path   = find_in_parent_folders("root.hcl")
  expose = true
}

terraform {
  source = "../../../../modules/eks"
}

dependency "vpc" {
  config_path = "../vpc"
  mock_outputs = {
    vpc_id          = "vpc-mock"
    private_subnets = ["subnet-mock-a", "subnet-mock-b"]
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  cluster_name    = "dev-cluster"
  cluster_version = "1.29"
  vpc_id          = dependency.vpc.outputs.vpc_id
  private_subnets = dependency.vpc.outputs.private_subnets
  environment     = include.root.locals.account_vars.locals.env
}
```

Each account has its own S3 bucket for state, its own DynamoDB table for locking, and its own IAM role that Terragrunt assumes. The module code is identical across environments — only the `inputs` and the assumed role differ.

For cross-account DNS or shared services, add a `dependency` that points to a path in a different account directory. Terragrunt will read that account's remote state to get the outputs.

---

## Common pitfalls

- **`.terragrunt-cache` in version control.** It's large, regenerated on every run, and will cause merge conflicts. Add it to `.gitignore` globally.

- **Circular dependencies in `run_all`.** If module A depends on B and B depends on A, `run_all` aborts. Break the cycle by extracting shared infrastructure into a third module that neither depends on.

- **`mock_outputs` masking real errors.** Mock outputs make `plan` succeed even when dependencies don't exist. If you ship a plan that used mocks and then apply it, the real outputs may differ. Always apply dependencies first in CI.

- **State key collisions.** If two modules generate the same `path_relative_to_include()` value, they share a state file — catastrophic. Keep your directory structure unique at every level.

- **`run_all apply` in production without review.** `run_all` applies modules in parallel up to `--terragrunt-parallelism`. In prod, run `run_all plan` first, review the output, then apply module by module or with explicit targeting.

- **Overwriting generated files.** If you manually create a `backend.tf` in a module directory and Terragrunt is set to `if_exists = "overwrite_terragrunt"`, your file wins — Terragrunt skips generation. Use `if_exists = "overwrite"` if you want Terragrunt to always win.

- **`find_in_parent_folders()` with no termination file.** If Terragrunt can't find a `terragrunt.hcl` in any parent, it errors. Keep your root config at the actual root of your live tree, not somewhere outside it.

- **Version drift between Terraform and Terragrunt.** Terragrunt releases track Terraform releases. Check the compatibility matrix — mismatches cause subtle, hard-to-diagnose errors. Pin both versions in CI.

---

## Quick command reference

```bash
# Single module operations
terragrunt init
terragrunt plan
terragrunt apply
terragrunt destroy
terragrunt output
terragrunt validate

# Pass Terraform flags through
terragrunt apply -target=aws_eks_cluster.main
terragrunt plan -var="cluster_version=1.30"

# Multi-module operations
terragrunt run-all init
terragrunt run-all plan
terragrunt run-all apply
terragrunt run-all destroy
terragrunt run-all output

# Scope run-all to a subtree
terragrunt run-all plan --terragrunt-working-dir live/dev

# Limit parallelism (default: 10)
terragrunt run-all apply --terragrunt-parallelism 3

# Non-interactive (CI)
terragrunt run-all apply --terragrunt-non-interactive

# Skip specific dependencies
terragrunt run-all apply --terragrunt-ignore-dependency-errors

# Debugging
terragrunt render-json
terragrunt plan --terragrunt-log-level debug

# Force re-init (after source change)
terragrunt init --upgrade

# Clear the cache
rm -rf .terragrunt-cache
```

⚠️ `run-all destroy` is irreversible. Always run `run-all plan` first and read the destroy plan carefully. In production, prefer targeted destroys.

---

## Next steps after Day 2

- `Terraform.md` — modules, state management, workspaces, and the primitives Terragrunt builds on
- `AWS.md` — IAM roles for Terraform, S3 backend setup, DynamoDB locking, multi-account organizations
- `GCP.md` — GCS backend config and service account authentication for Terragrunt on Google Cloud
- `GitHub-Actions.md` — CI/CD pipeline patterns: plan on PR, apply on merge, OIDC authentication to AWS/GCP/Azure without long-lived keys
- `Azure.md` — Azure Blob backend, service principal auth, and Terragrunt patterns for Azure subscriptions

---

**The mantra:** One root config, many modules — Terragrunt's job is to make the hundredth environment as simple as the first.
