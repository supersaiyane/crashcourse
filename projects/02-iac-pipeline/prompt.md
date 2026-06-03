# Generation Prompt — IaC Pipeline Course (Project 02)

This file records the prompt used to generate this project, for reproducibility.

## Prompt

```
Build a complete hands-on project at projects/02-iac-pipeline/

Reference project to match: Read projects/01-container-lifecycle/README.md first — match the
same quality, structure, depth, and voice.

Project name: FinStack — BFSI Payment Infrastructure Platform
Courses covered: Terraform → Terragrunt → Packer → Vault → OPA → Ansible → GitHub-Actions

What to build:

1. Root README.md (same quality as Project 1):
   - "What You'll Build" with ASCII architecture diagram
   - Project structure tree
   - The App section (FinStack: VPC + EKS + RDS + S3 + a small payment API)
   - Correlation map (which finstack/ file each stage touches)
   - Evolution diagram across stages
   - Curriculum table with stages, topics, duration
   - Prerequisites

2. prompt.md — the generation prompt for reproducibility

3. finstack/ (the working app/infra — NOT "sample-app"):
   - app/ — simple Python Flask payment API with Dockerfile, requirements.txt
   - terraform/ — modules: vpc, eks, rds, s3, iam, security-groups. Main config files.
     Backend config for S3 state. Variables + outputs.
   - terragrunt/ — environments/dev/, environments/staging/, environments/prod/
   - packer/ — AMI template (amazon-linux-2, hardened with CIS basics)
   - ansible/ — playbooks/bootstrap.yml, roles/monitoring-agent/, inventory/
   - policies/ — OPA rego files (no_public_s3.rego, require_tags.rego, restrict_instance_types.rego)
   - vault/ — config.hcl, policies/app-policy.hcl, scripts/init-secrets.sh
   - .github/workflows/ — terraform-plan.yml (on PR), terraform-apply.yml (on merge)
   - docker-compose.yml — LocalStack + Vault dev mode for free local practice

4. stages/ (7 stages, each with README.md + exercises/):
   - 01-terraform-basics/ — init, plan, apply, state, modules
   - 02-terragrunt/ — DRY config, dependencies, multi-env
   - 03-packer/ — golden AMIs, immutable infra
   - 04-vault-secrets/ — dynamic secrets, AppRole, policies
   - 05-opa-policy/ — policy-as-code, conftest
   - 06-ansible-config/ — post-provision, roles, vault
   - 07-cicd-pipeline/ — GH Actions, plan-on-PR, apply-on-merge, OIDC

5. assets/ — empty directory with .gitkeep

Rules:
- All Terraform code should be syntactically valid HCL
- Use ap-south-1 region, BFSI-themed naming
- LocalStack docker-compose for free local practice
- Real AWS as optional (with cost warnings)
- Match the voice and depth of Project 1
```

## Model

Claude (Anthropic) — used via Claude Code CLI.

## Date

2026-06-02
