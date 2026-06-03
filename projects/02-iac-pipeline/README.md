# IaC Pipeline Course

**From zero to production: provision, harden, and deploy BFSI payment infrastructure with Infrastructure as Code and GitOps.**

This course teaches the complete IaC pipeline — writing infrastructure, managing state, building golden images, injecting secrets, enforcing policy, configuring servers, and automating it all in CI/CD — using a real production-grade payment platform called **FinStack**.

## What You'll Build

```
Developer Laptop (LocalStack + Vault Dev)         AWS (ap-south-1)
┌────────────────────────────────────────┐        ┌──────────────────────────────────────┐
│  terraform init/plan/apply             │        │  VPC (10.0.0.0/16)                   │
│  terragrunt run-all plan               │───────▶│  ├── Public subnets (NAT, ALB)       │
│  packer build                          │        │  ├── Private subnets (EKS, RDS)      │
│  ansible-playbook bootstrap.yml        │        │  │                                    │
│  conftest test                         │        │  ├── EKS Cluster                     │
│  vault kv put                          │        │  │   ├── payment-api (Flask)          │
│  git push → GitHub Actions             │        │  │   ├── HPA + resource limits        │
└────────────────────────────────────────┘        │  │   └── IRSA for Vault/S3            │
                                                   │  │                                    │
                                                   │  ├── RDS PostgreSQL (Multi-AZ)       │
                                                   │  │   └── encrypted, private subnet   │
                                                   │  │                                    │
                                                   │  ├── S3 (statements, audit logs)     │
                                                   │  │   └── SSE-KMS, no public access   │
                                                   │  │                                    │
                                                   │  ├── Vault (dynamic DB creds)        │
                                                   │  │   └── AppRole auth, lease TTL     │
                                                   │  │                                    │
                                                   │  └── OPA (policy gate in CI)         │
                                                   │      └── no public S3, tags required │
                                                   └──────────────────────────────────────┘
```

## Project Structure

```
02-iac-pipeline/
├── README.md              ← this file — course map
├── prompt.md              ← generation prompt for reproducibility
├── finstack/              ← FINSTACK: the infra + app you build in every stage
│   ├── app/               ← Python Flask payment API + Dockerfile
│   ├── terraform/         ← HCL modules: vpc, eks, rds, s3, iam, security-groups
│   │   ├── modules/       ← reusable modules
│   │   └── environments/  ← root config (backend, providers, variables)
│   ├── terragrunt/        ← DRY multi-env wrappers (dev/staging/prod)
│   ├── packer/            ← Golden AMI template (Amazon Linux 2, CIS hardened)
│   ├── ansible/           ← Post-provision config (bootstrap, monitoring agent)
│   ├── policies/          ← OPA Rego files (S3, tags, instance types)
│   ├── vault/             ← Vault config, policies, init scripts
│   ├── .github/workflows/ ← CI/CD: plan-on-PR, apply-on-merge
│   └── docker-compose.yml ← LocalStack + Vault dev mode (free local practice)
│
├── stages/                ← 7 learning stages (01 → 07)
│   ├── 01-terraform-basics/
│   ├── 02-terragrunt/
│   ├── 03-packer/
│   ├── 04-vault-secrets/
│   ├── 05-opa-policy/
│   ├── 06-ansible-config/
│   └── 07-cicd-pipeline/
│
└── assets/                ← diagrams & images for the course
```

---

## The App: FinStack

FinStack is a BFSI payment infrastructure platform with:

| Component | Technology | Role | Stage Introduced |
|-----------|-----------|------|-----------------|
| Payment API | Python/Flask, Gunicorn | REST endpoints for payments, balance, health | Stage 1 |
| Database | PostgreSQL 16 (RDS) | Transaction ledger, account balances | Stage 1 |
| Object Store | S3 | Monthly statements, audit logs | Stage 1 |
| Networking | VPC, subnets, NAT, ALB | Network isolation, public/private tiers | Stage 1 |
| Compute | EKS (Kubernetes) | Container orchestration for the API | Stage 1 |
| Identity | IAM roles, IRSA | Least-privilege access for pods and services | Stage 1 |
| Secrets | Vault (dynamic creds) | Short-lived DB passwords, AppRole auth | Stage 4 |
| Policy | OPA / Conftest | Enforce tagging, block public S3, restrict instances | Stage 5 |
| Config Mgmt | Ansible | Bootstrap nodes, install monitoring agents | Stage 6 |
| CI/CD | GitHub Actions | Plan-on-PR, apply-on-merge, OIDC auth to AWS | Stage 7 |

It has enough complexity to be realistic — VPC networking, encrypted databases, secret injection, policy gates — but is scoped to what a single engineer can fully understand and operate.

---

## How finstack/, stages/, and assets/ correlate

Every stage works with **the same infrastructure** — FinStack. The table below shows exactly which file in `finstack/` each stage touches and what you do with it.

### Correlation Map

| Stage | finstack/ Files Touched | What You Do With It | Key Config |
|-------|------------------------|---------------------|------------|
| **01 Terraform** | `terraform/modules/*`, `terraform/environments/*` | Write VPC, EKS, RDS, S3, IAM modules; init, plan, apply against LocalStack | `main.tf`, `variables.tf`, `outputs.tf` per module |
| **02 Terragrunt** | `terragrunt/environments/dev/`, `staging/`, `prod/` | DRY wrapper configs, dependency ordering, multi-env deploy | `terragrunt.hcl` per environment |
| **03 Packer** | `packer/amazon-linux-2.pkr.hcl` | Build a CIS-hardened golden AMI with provisioners | Packer HCL template |
| **04 Vault** | `vault/config.hcl`, `vault/policies/`, `vault/scripts/` | Enable secrets engines, create AppRole, inject dynamic DB creds | `app-policy.hcl`, `init-secrets.sh` |
| **05 OPA** | `policies/*.rego` | Write and test Rego policies; run conftest against Terraform plan JSON | `no_public_s3.rego`, `require_tags.rego` |
| **06 Ansible** | `ansible/playbooks/`, `ansible/roles/`, `ansible/inventory/` | Bootstrap nodes, install monitoring agent, configure log shipping | `bootstrap.yml`, `monitoring-agent` role |
| **07 CI/CD** | `.github/workflows/terraform-plan.yml`, `terraform-apply.yml` | Plan-on-PR, apply-on-merge, OIDC auth, OPA gate, Vault integration | GitHub Actions YAML |

### Evolution of One Platform Across All Stages

```
Stage 1                    Stage 2                    Stage 3
Terraform modules   →      Terragrunt DRY      →      Golden AMI
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  tf init     │          │  tg run-all  │          │  packer build│
│  tf plan     │          │  plan        │          │  AMI output  │
│  tf apply    │          │  3 envs      │          │  CIS harden  │
└──────────────┘          └──────────────┘          └──────────────┘

Stage 4                    Stage 5                    Stage 6
Vault secrets       →      OPA policy gate     →      Ansible config
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  vault kv put│          │  conftest    │          │  ansible-play│
│  AppRole     │          │  test plan   │          │  bootstrap   │
│  dynamic DB  │          │  no pub S3   │          │  monitoring  │
└──────────────┘          └──────────────┘          └──────────────┘

Stage 7
CI/CD pipeline
┌──────────────┐
│  GH Actions  │
│  plan on PR  │
│  apply merge │
└──────────────┘
```

### `assets/` Directory

Place diagrams, screenshots, and architecture images here:

```
assets/
├── architecture.png     ← overall infra diagram (optional)
├── pipeline-flow.png    ← CI/CD pipeline visualisation
├── demo/               ← animated gifs or recordings
└── topology/           ← network topology diagrams
```

When you reach a stage, check `assets/` for any visual reference. Add your own screenshots as you progress.

---

## Curriculum

| Stage | Topic | What You'll Learn | Duration |
|-------|-------|-------------------|----------|
| [01](stages/01-terraform-basics) | **Terraform Basics** | Providers, resources, state, modules, plan/apply lifecycle, LocalStack | 2 weeks |
| [02](stages/02-terragrunt) | **Terragrunt** | DRY configuration, dependency blocks, multi-environment promotion | 1 week |
| [03](stages/03-packer) | **Packer** | Golden AMIs, immutable infrastructure, provisioners, CIS hardening | 1 week |
| [04](stages/04-vault-secrets) | **Vault Secrets** | Dynamic secrets, AppRole auth, policies, Terraform integration | 1-2 weeks |
| [05](stages/05-opa-policy) | **OPA Policy** | Rego language, conftest, policy-as-code in CI, BFSI compliance | 1 week |
| [06](stages/06-ansible-config) | **Ansible Config** | Playbooks, roles, inventory, vault (Ansible Vault), post-provision | 1 week |
| [07](stages/07-cicd-pipeline) | **CI/CD Pipeline** | GitHub Actions, plan-on-PR, apply-on-merge, OIDC, full pipeline | 1 week |

**Total: ~8-10 weeks at a sustainable pace**

## How Each Stage Is Structured

```
stages/XX-topic/
├── README.md         ← Full theory + step-by-step exercises + solutions (inline)
└── exercises/
    ├── 01-first.md   ← Hands-on exercise
    ├── 02-second.md
    └── ...
```

Every stage has:
- **Theory**: What the technology is, why it matters, how it works
- **Architecture diagrams**: ASCII art showing how the piece fits into FinStack
- **Step-by-step commands**: With expected output and explanations
- **"You're done when..."**: Clear checkpoints so you know you've succeeded
- **Exercises**: Hands-on practice extracted from the README
- **Links back**: Every stage links to the relevant crashcourse file (e.g. `Terraform.md`)

## Prerequisites

- A laptop with 8GB+ RAM and 20GB free disk
- Docker installed (for LocalStack and Vault dev mode)
- Basic terminal familiarity (`ls`, `cd`, `cat`, `vi/nano`)
- Willingness to type commands and understand them
- An AWS account is **optional** — LocalStack covers Stages 1-5 for free

## Quick Start — Run FinStack Locally Now

```bash
# 1. Start LocalStack + Vault dev mode
cd finstack
docker compose up -d

# 2. Verify services are running
docker compose ps
# localstack   Running   0.0.0.0:4566->4566/tcp
# vault         Running   0.0.0.0:8200->8200/tcp

# 3. Set environment for LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ap-south-1
export AWS_ENDPOINT_URL=http://localhost:4566

# 4. Run your first Terraform plan
cd terraform/environments
terraform init
terraform plan

# 5. Tear down when done
cd ../../
docker compose down -v
```

Then start from [Stage 1](stages/01-terraform-basics) and work through.

## Cost Warning

> **LocalStack is free.** Stages 1-6 can be completed entirely on LocalStack. If you choose to deploy to real AWS, expect costs for EKS (~$0.10/hr per cluster), RDS (~$0.02/hr for db.t3.micro), NAT Gateway (~$0.045/hr), and ALB (~$0.02/hr). Always run `terraform destroy` when you're done practising. Never leave an EKS cluster running overnight unless you intend to.

## Learning Philosophy

1. **Understand, don't memorize** — every command is explained. If you understand *why* it works, you don't need to memorize it.
2. **Type everything** — no copy-paste. Typing builds muscle memory and forces you to read what you're running.
3. **Break things on purpose** — corrupt state, revoke secrets, violate policies. Production experience comes from recovery, not perfection.
4. **One production platform** — FinStack follows you through every stage. You see the same infrastructure evolve from a single Terraform module to a fully automated, policy-gated, secret-injected CI/CD pipeline.
