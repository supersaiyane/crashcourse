# Terraform — A 2-Day Crash Course

> **In one sentence:** Terraform lets you describe your cloud infrastructure (servers,
> networks, databases) as code in files, then creates, changes, or destroys it to match —
> safely, repeatably, and reviewably.

---

## Part 0 — Why Terraform exists

Clicking around a cloud console to create infrastructure is fast the first time and a disaster
forever after. You can't review a click, you can't reproduce an environment exactly, you can't
diff what changed, and you can't rebuild after a disaster without remembering 200 manual steps.
This is **ClickOps**, and it doesn't scale.

**Infrastructure as Code (IaC)** makes your infrastructure a text file: version-controlled,
peer-reviewed, repeatable. Terraform is the dominant IaC tool because it's **declarative** (you
describe the desired end state, not the steps), **cloud-agnostic** (one language for AWS, GCP,
Azure, and hundreds of other providers), and it tracks what it created in a **state file** so
it knows exactly what to add, change, or remove.

**The three ideas that explain Terraform:**
1. **Declarative desired state.** You write "I want an EC2 instance of type t3.micro." You don't
   write "call the create API, poll until ready..." Terraform figures out the *how*.
2. **State.** Terraform records what it built in a state file. On the next run it compares
   *your code* (desired) vs *state* (what exists) vs *reality* and computes a **plan** — the
   exact set of creates/updates/deletes to reconcile them.
3. **The plan/apply loop.** You always `plan` (preview) before `apply` (execute). The plan is a
   reviewable diff of your infrastructure. Nothing changes without you seeing it first.

**Mental model:** Terraform is a reconciler with memory. Code says what you want, state
remembers what exists, and `plan` shows the diff between them before anything happens.

```mermaid
graph LR
    Write["Write .tf files"] --> Init["terraform init"]
    Init --> Plan["terraform plan"]
    Plan -->|review diff| Apply["terraform apply"]
    Apply --> State["State file (S3 + DynamoDB lock)"]
    State -->|next run| Plan

    Apply --> Cloud["Cloud Provider API"]
    Cloud --> Infra["Running Infrastructure"]

    subgraph Managed Resources
        Infra --> VPC["VPC / Network"]
        Infra --> EC2["Compute"]
        Infra --> RDS["Database"]
        Infra --> S3["Storage"]
    end

    Destroy["terraform destroy"] --> Cloud
```

---

## Part 1 — The vocabulary

| Term | Meaning |
|------|---------|
| **Provider** | A plugin for a platform (aws, google, azurerm, kubernetes…) |
| **Resource** | A single piece of infrastructure (`aws_instance`, `aws_s3_bucket`) |
| **Data source** | Read-only lookup of something that already exists |
| **State** | Terraform's record of what it manages (`terraform.tfstate`) |
| **Plan** | The previewed diff: what will be created/changed/destroyed |
| **Module** | A reusable, parameterized bundle of resources |
| **Variable / Output** | Inputs to / values exposed from your config |
| **Backend** | Where state is stored (local file, or remote like S3) |

---

## DAY 1 — Get it working

### 1. The core loop, hands-on
Create `main.tf`:
```hcl
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "demo" {       # TYPE "LOCAL_NAME"
  bucket = "my-unique-demo-bucket-12345"
}
```
Run the loop:
```bash
terraform init      # downloads the aws provider plugin (run once per new config/provider)
terraform plan      # PREVIEW: shows "+ aws_s3_bucket.demo will be created"
terraform apply     # EXECUTE: creates it (type 'yes' to confirm)
terraform destroy   # tear it down when done (also previews first)
```
Read the plan symbols: `+` create, `-` destroy, `~` update in place, `-/+` replace
(destroy then create). **Always read the plan before typing yes** — especially watch for
`-/+` and `-`, which are destructive.

### 2. Understand state
After `apply`, look at `terraform.tfstate` — it's JSON recording what Terraform created and its
real attributes (the bucket's ARN, etc.). Inspect it properly with commands, never edit by hand:
```bash
terraform state list                 # what's under management
terraform state show aws_s3_bucket.demo
```
Run `terraform plan` again with no code changes → "No changes." Terraform compared code, state,
and reality and found them aligned. *That* is the reconciliation working.

### 3. Variables — stop hardcoding
`variables.tf`:
```hcl
variable "region"        { type = string  default = "us-east-1" }
variable "instance_type" { type = string  default = "t3.micro" }
variable "tags"          { type = map(string)  default = {} }
```
Use them: `region = var.region`. Supply values via defaults, a `*.tfvars` file, `-var`, or
`TF_VAR_region` env var:
```bash
terraform plan -var="region=eu-west-1"
terraform plan -var-file="prod.tfvars"
```

### 4. Outputs and data sources
**Outputs** expose values (an IP, a DB endpoint) after apply. **Data sources** read existing
infra you didn't create:
```hcl
data "aws_ami" "ubuntu" {              # look up the latest Ubuntu AMI
  most_recent = true
  owners      = ["099720109477"]
  filter { name = "name"  values = ["ubuntu/images/hvm-ssd/ubuntu-22.04-*"] }
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id     # reference the data source
  instance_type = var.instance_type
  tags          = merge(var.tags, { Name = "web" })
}

output "web_ip" { value = aws_instance.web.public_ip }
```
References (`resource.name.attribute`, `data.type.name.attribute`) automatically create a
**dependency graph** — Terraform builds the AMI lookup before the instance, with no explicit
ordering needed.

**By end of Day 1 you can:** init → plan → apply → destroy, read plans, use variables,
outputs, and data sources. That's a real, reviewable IaC workflow.

---

## DAY 2 — Make it real

### 1. Remote state + locking (do this before any teamwork)
Local state on your laptop breaks the moment a teammate also runs Terraform — you'll clobber
each other. Store state remotely with locking:
```hcl
terraform {
  backend "s3" {
    bucket         = "my-tf-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "tf-locks"        # prevents two applies at once (state lock)
    encrypt        = true
  }
}
```
Now state is shared, encrypted, versioned, and locked during applies. **Never commit
`*.tfstate` to Git** (it can contain secrets) — add it to `.gitignore`.

### 2. Loops: `count` and `for_each`
```hcl
# count -> indexed (a list)
resource "aws_instance" "web" {
  count         = 3
  instance_type = "t3.micro"
  tags          = { Name = "web-${count.index}" }
}

# for_each -> keyed (a map/set) — PREFER THIS
resource "aws_s3_bucket" "b" {
  for_each = toset(["logs", "data", "backups"])
  bucket   = "myorg-${each.value}"
}
# reference: aws_s3_bucket.b["logs"].arn
```
Prefer `for_each` over `count`: with `count`, removing the middle element reindexes everything
after it and Terraform destroys/recreates resources it shouldn't. `for_each` keys are stable.

### 3. Modules — the unit of reuse
A module is just a folder of `.tf` files you call with inputs:
```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"   # from the public Registry
  version = "5.5.0"
  name    = "main"
  cidr    = "10.0.0.0/16"
}

module "app" {
  source = "./modules/app"     # a local module
  env    = "prod"
  count  = var.instance_count
}
```
Build your infrastructure from composable modules (network module, app module, db module)
rather than one giant file. Pin module and provider versions for reproducibility.

### 4. Managing change safely
```bash
terraform plan -out=tf.plan        # save the exact plan
terraform apply tf.plan            # apply THAT plan (no surprises, no re-prompt) — ideal in CI
terraform apply -target=module.app # scope an apply to one resource/module (use sparingly)
terraform apply -replace=aws_instance.web   # force recreate one resource
```
In CI/CD: `plan` on pull requests (so reviewers see the diff), `apply` the saved plan on merge.

### 5. State surgery (when you need it)
```bash
terraform import aws_s3_bucket.demo my-existing-bucket   # adopt pre-existing infra into state
terraform state mv aws_instance.a aws_instance.b         # rename without destroy/create
terraform state rm aws_instance.old                      # stop managing (don't destroy)
terraform refresh                                        # sync state with real-world drift
terraform force-unlock <LOCK_ID>                         # release a stuck lock (carefully)
```
`import` is how you bring ClickOps-created resources under Terraform without rebuilding them.

### 6. Workspaces & environments
```bash
terraform workspace new staging
terraform workspace select prod
terraform workspace list
```
Workspaces give separate state for the same config — but many teams prefer separate directories
or separate backends per environment for stronger isolation. Either is fine; be consistent.

---

## Worked example — VPC + instance, promoted to prod
```text
1. Write modules/network (VPC, subnets) and modules/app (instance + SG).
2. root main.tf calls both modules; backend "s3" stores state with DynamoDB locking.
3. terraform init
4. terraform plan -out=tf.plan        # reviewer reads the diff in the PR
5. terraform apply tf.plan            # CI applies the exact reviewed plan
6. Need prod? prod.tfvars with bigger instance_type + more replicas:
   terraform apply -var-file=prod.tfvars
7. Decommission: terraform destroy -var-file=prod.tfvars
```

---


## Terminal Demo

```terminal-demo
# terraform@infra ~ %

$ terraform version
Terraform v1.7.5

$ terraform init
Initializing the backend...
Initializing provider plugins...
- Using previously-installed hashicorp/aws v5.40.0
Terraform has been successfully initialized!

$ terraform plan -out=tfplan
aws_vpc.main: Refreshing state... [id=vpc-abc123]
aws_subnet.private: Refreshing state... [id=subnet-def456]
aws_eks_cluster.prod: Refreshing state... [id=prod-cluster]

Plan: 2 to add, 1 to change, 0 to destroy.

$ terraform apply tfplan
aws_security_group.api: Creating...
aws_security_group.api: Creation complete after 3s [id=sg-ghi789]
aws_instance.api: Creating...
aws_instance.api: Still creating... [10s elapsed]
aws_instance.api: Creation complete after 45s [id=i-jkl012]
aws_eks_node_group.prod: Modifying... [id=prod-cluster:prod-nodes]
aws_eks_node_group.prod: Modifications complete after 2m [id=prod-cluster:prod-nodes]

Apply complete! Resources: 2 added, 1 changed, 0 destroyed.

$ terraform state list | head -8
aws_vpc.main
aws_subnet.private[0]
aws_subnet.private[1]
aws_eks_cluster.prod
aws_eks_node_group.prod
aws_rds_instance.prod
aws_s3_bucket.data_lake
aws_iam_role.eks_node

$ terraform output -json | jq '{cluster_endpoint,db_endpoint,vpc_id}'
{
  "cluster_endpoint": "https://ABC123.gr7.ap-south-1.eks.amazonaws.com",
  "db_endpoint": "prod-db.abc123.ap-south-1.rds.amazonaws.com:5432",
  "vpc_id": "vpc-abc123"
}

$ terraform validate
Success! The configuration is valid.
```

---

## Common pitfalls
- **Local state in a team.** Guarantees corruption/conflicts. Use a remote backend with locking
  from day one. Never commit `*.tfstate`.
- **Editing state by hand.** Use `terraform state` subcommands; manual edits corrupt it.
- **Ignoring `-/+` (replace) in a plan.** That means *destroy and recreate* — fine for a server,
  catastrophic for a database. Read every plan.
- **`count` for things that get removed from the middle.** Causes needless destroy/recreate;
  use `for_each`.
- **Unpinned providers/modules.** A surprise upgrade changes behavior. Pin versions.
- **Secrets in `.tf` or `.tfvars` committed to Git.** Use environment variables, a secrets
  manager, or marked `sensitive` variables; keep `.tfvars` with secrets out of Git.
- **Manual changes in the console (drift).** Terraform will try to revert them on the next
  apply. Manage a resource in *one* place — Terraform or the console, not both.

---

## Quick command reference
```bash
# Core loop
terraform init [-upgrade]          terraform validate      terraform fmt -recursive
terraform plan [-out=tf.plan]      terraform apply [tf.plan] [-auto-approve]
terraform destroy                  terraform show

# Targeting / vars
terraform plan  -target=RES        terraform apply -replace=RES
terraform plan  -var="k=v"         terraform plan -var-file=prod.tfvars

# State
terraform state list               terraform state show RES
terraform state mv SRC DST         terraform state rm RES
terraform import RES <real-id>     terraform refresh
terraform force-unlock <LOCK_ID>

# Outputs / workspaces / debug
terraform output [-raw NAME] [-json]
terraform workspace list|new|select
terraform console                  terraform graph | dot -Tpng > g.png
```

### HCL essentials
`resource "type" "name" {}` · `data "type" "name" {}` · `variable {}` · `output {}` ·
`module {}` · `locals {}` · meta-args: `count`, `for_each`, `depends_on`, `lifecycle {}` ·
functions: `merge`, `coalesce`, `lookup`, `toset`, `templatefile`, `jsonencode`, `try`.

---

## Top 10 Interview Questions

<details>
<summary><strong>Q: What is Terraform state and why is it critical?</strong></summary>

State is Terraform's record of what infrastructure it manages. It maps your HCL resource definitions to real cloud resources (by storing their IDs, attributes, and dependencies). Without state, Terraform cannot compute a plan — it would not know what already exists. State must be stored remotely with locking (e.g., S3 + DynamoDB) in team environments to prevent concurrent applies from corrupting it.

</details>

<details>
<summary><strong>Q: What happens if someone changes infrastructure manually in the console (drift)?</strong></summary>

On the next `terraform plan`, Terraform compares your code (desired state) against what it finds in the cloud (actual state via API calls) and the state file. If someone changed a resource manually, Terraform detects the difference and proposes changes to bring reality back in line with code. This is why you manage resources in one place — either Terraform or the console, not both.

</details>

<details>
<summary><strong>Q: What is the difference between `count` and `for_each`, and when do you use each?</strong></summary>

Both create multiple instances of a resource. `count` uses a numeric index — removing an item from the middle reindexes everything after it, causing unnecessary destroy/recreate operations. `for_each` uses stable string keys from a map or set, so adding or removing an item only affects that specific resource. Prefer `for_each` whenever the set of items may change over time.

</details>

<details>
<summary><strong>Q: How do you import existing infrastructure into Terraform?</strong></summary>

Use `terraform import <resource_address> <real_id>` to bring a manually created resource under Terraform management. This adds the resource to state but does not generate the HCL code — you must write the matching resource block yourself. After importing, run `terraform plan` to verify the code and state align. In Terraform 1.5+, you can also use `import` blocks in HCL for a more declarative approach.

</details>

<details>
<summary><strong>Q: How do you manage multiple environments (dev, staging, prod) with Terraform?</strong></summary>

Three common approaches: (1) Separate directories per environment with their own state backends — strongest isolation. (2) Terraform workspaces — same code, separate state files, switched via `terraform workspace select`. (3) Terragrunt — a wrapper that keeps configurations DRY across environments with shared modules and per-environment variable files. Most production teams prefer separate directories or Terragrunt for clearer isolation.

</details>

<details>
<summary><strong>Q: What are Terraform modules and why should you use them?</strong></summary>

A module is a reusable, parameterized bundle of resources — just a directory of `.tf` files called with inputs. Modules eliminate copy-paste across environments, enforce standards (every VPC gets the same structure), and make infrastructure composable. Pin module versions for reproducibility. Use the public Terraform Registry for well-maintained community modules and write custom modules for organisation-specific patterns.

</details>

<details>
<summary><strong>Q: How do you handle secrets in Terraform?</strong></summary>

Never store secrets in `.tf` files or commit `.tfvars` containing secrets to Git. Mark variables as `sensitive` so Terraform redacts them from plan output. Pass secret values via environment variables (`TF_VAR_*`), a secrets manager (Vault, AWS Secrets Manager), or encrypted variable files. Use a remote backend with encryption enabled for state, because state can contain secret values in plaintext.

</details>

<details>
<summary><strong>Q: What does `-/+` mean in a Terraform plan, and why is it dangerous?</strong></summary>

`-/+` means Terraform will destroy and recreate the resource (a "replacement"). This happens when a change affects an immutable attribute — for example, changing the AMI of an EC2 instance. For a stateless server, this is fine. For a database, it means data loss. Always read the plan carefully, especially for `-/+` on stateful resources. Use `lifecycle { prevent_destroy = true }` on critical resources as a safety net.

</details>

<details>
<summary><strong>Q: How do you structure a Terraform CI/CD pipeline?</strong></summary>

On pull requests: run `terraform init`, `terraform validate`, `terraform plan -out=tf.plan` and post the plan output as a PR comment for review. On merge to main: run `terraform apply tf.plan` using the saved plan file so the exact reviewed changes are applied. Add `tflint` and policy checks (OPA, Sentinel, checkov) in the PR stage. Use remote state with locking to prevent concurrent applies.

</details>

<details>
<summary><strong>Q: What is the difference between Terraform and Ansible?</strong></summary>

Terraform is declarative and designed for infrastructure provisioning — creating, modifying, and destroying cloud resources (VPCs, instances, databases). Ansible is procedural (though it has declarative modules) and designed for configuration management — installing software, managing files, and configuring servers after they exist. They complement each other: Terraform creates the infrastructure, Ansible configures what runs on it. See `Ansible.md`.

</details>

---



## Quick Quiz

Test your understanding with these rapid-fire questions (answers hidden):

<details>
<summary>1. What is the ONE core problem that Terraform solves?</summary>
Re-read Part 0 — the mental model section. If you can explain the "why" in one sentence, you understand the foundation.
</details>

<details>
<summary>2. Name the 3 most important terms from the vocabulary section.</summary>
Review Part 1. These are the building blocks every conversation about Terraform uses.
</details>

<details>
<summary>3. What is the first thing you would set up on Day 1?</summary>
Check the Day 1 section — the very first hands-on step that gets you a working result.
</details>

<details>
<summary>4. What is the most common production pitfall with Terraform?</summary>
Review the Common Pitfalls section. The first item listed is typically the most frequently encountered.
</details>

<details>
<summary>5. How does Terraform compare to its closest alternative?</summary>
Check the Comparison Matrix below — focus on the key differentiating row.
</details>



## Comparison Matrix

| Dimension | Terraform | Pulumi | CloudFormation |
|-----------|-----------|--------|----------------|
| **Primary use case** | Core strength of Terraform | Core strength of Pulumi | Core strength of CloudFormation |
| **Learning curve** | Moderate | Varies | Varies |
| **Community/ecosystem** | Active | Active | Growing |
| **Operational complexity** | Medium | Varies | Varies |
| **Best for** | See Part 0 | Different tradeoffs | Different tradeoffs |

> **How to read this matrix:** no tool wins on every dimension. Pick based on your specific constraints — team expertise, existing infrastructure, scale requirements, and compliance needs. The right choice is the one that fits your context, not the one with the most checkmarks.

## Next steps after Day 2
- `lifecycle { create_before_destroy / prevent_destroy / ignore_changes }` for safe updates.
- **Terragrunt** for DRY multi-environment setups; **Atlantis**/**TF Cloud** for PR-based
  apply workflows.
- **Policy as code** (`tflint`, OPA/Sentinel, `checkov`) to enforce standards in CI.
- Compare with **Pulumi** (same goals, real programming languages — see `Pulumi.md`) and
  **Packer** for baking images that Terraform then deploys (see `Packer.md`).

## Recommended learning resources

**YouTube channels & playlists:**
- [HashiCorp — HashiConf Terraform Talks](https://www.youtube.com/@HashiCorp) — official deep dives on modules, state, workspaces, and provider development
- [Ned in the Cloud — Terraform Deep Dives](https://www.youtube.com/@NedintheCloud) — thorough walkthroughs of state management, testing, and CI/CD patterns
- [TechWorld with Nana — Terraform Beginner Tutorial](https://www.youtube.com/@TechWorldwithNana) — clear, structured introduction for first-time users
- [Spacelift — Terraform Best Practices](https://www.youtube.com/@spacelift-io) — advanced patterns, drift detection, and IaC comparisons
- [KodeKloud — Terraform for Beginners](https://www.youtube.com/@KodeKloud) — hands-on labs and exam-oriented walkthroughs

**Official docs & blogs:**
- [Terraform Documentation](https://developer.hashicorp.com/terraform/docs) — language reference, provider registry, and CLI docs
- [HashiCorp Blog — Terraform](https://www.hashicorp.com/blog/products/terraform) — release announcements, patterns, and production case studies
- [Spacelift Blog — Terraform](https://spacelift.io/blog) — IaC comparisons, advanced module patterns, and CI/CD integration guides

**The mantra:** code = desired state, state = what exists, plan = the diff. Always plan before
apply, store state remotely with locking, prefer `for_each`, and pin your versions.
