# Stage 7: CI/CD Pipeline — Automating the Entire IaC Lifecycle

**Goal:** Build GitHub Actions workflows that automate every stage of the FinStack IaC pipeline — format, validate, plan, OPA policy gate, and apply — so that infrastructure changes flow through pull requests with human review, automated safety checks, and zero long-lived credentials.

**Prerequisites:** Stages 1-6 complete. You should be comfortable with Terraform, Terragrunt, Packer, Vault, OPA, and Ansible. This stage ties them all together in a single automated pipeline.

**Sample App:** FinStack — the same BFSI payment platform. You have written the Terraform modules, Terragrunt wrappers, OPA policies, and Ansible playbooks. Now you automate the workflow: every pull request gets a plan and policy check; every merge to main triggers an apply with environment approvals.

> For the full crash course on GitHub Actions, see [`GitHub-Actions.md`](../../../../cicd/GitHub-Actions.md).

---

## 1. Theory

### 1.1 Why CI/CD for Infrastructure?

Without CI/CD, infrastructure changes follow a manual workflow:

```
Developer writes .tf code
  -> Developer runs terraform plan on their laptop
  -> Developer eyeballs the plan
  -> Developer runs terraform apply
  -> Maybe someone reviews the PR afterward
  -> Maybe someone checks if OPA policies passed
```

This works for one engineer. It collapses with a team:

| Problem | Manual Workflow | CI/CD Pipeline |
|---------|----------------|----------------|
| **Who ran apply?** | Check shell history, maybe | Git commit + workflow run log |
| **Did OPA pass?** | "I think I ran conftest" | Automated gate — merge blocked if it fails |
| **Was the plan reviewed?** | Maybe, if someone asked | PR comment with full plan, required approval |
| **Credentials** | Long-lived AWS keys on laptops | OIDC — no keys, short-lived session tokens |
| **Consistency** | "It works on my machine" | Same Terraform version, same env, every time |
| **Audit trail** | Scattered across laptops | Every change traceable: commit -> PR -> plan -> approval -> apply |

In BFSI, the audit trail alone justifies CI/CD for IaC. When the regulator asks "who approved the security group change that opened port 443?" you point to: the Git commit, the pull request review, the OPA policy check passing, the environment approval, and the `terraform apply` log — all linked, all timestamped, all immutable.

**The one idea that unlocks IaC CI/CD:** treat infrastructure code exactly like application code. Pull request for every change. Automated tests (format, validate, plan, OPA). Human review of the plan. Merge triggers deploy. No one runs `terraform apply` from their laptop in production. Ever.

**Mental model:** Think of the CI/CD pipeline as a factory assembly line for infrastructure changes. Raw material (a `.tf` file change) enters at one end. It passes through quality checkpoints (format, validate, plan, OPA). A human inspector reviews the output (PR review). Only after all checks pass and the inspector approves does the change reach production (apply on merge). Defective changes are rejected at the checkpoint, not after they reach the factory floor.

---

### 1.2 Architecture — The Complete Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    GITHUB ACTIONS CI/CD PIPELINE                          │
│                                                                          │
│  PULL REQUEST (plan-on-PR)                                               │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────┐ │
│  │Checkout│─▶│  OIDC  │─▶│  Init  │─▶│Validate│─▶│  Plan  │─▶│ OPA  │ │
│  │        │  │  Auth   │  │        │  │  + Fmt │  │        │  │ Gate │ │
│  └────────┘  └────────┘  └────────┘  └────────┘  └───┬────┘  └──┬───┘ │
│                                                       │          │      │
│                                                       ▼          ▼      │
│                                                  ┌─────────────────┐    │
│                                                  │  PR Comment:    │    │
│                                                  │  Plan + OPA     │    │
│                                                  │  results        │    │
│                                                  └─────────────────┘    │
│                                                                          │
│  MERGE TO MAIN (apply-on-merge)                                          │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────┐ │
│  │Checkout│─▶│  OIDC  │─▶│  Init  │─▶│  Plan  │─▶│  OPA   │─▶│Apply │ │
│  │        │  │  Auth   │  │        │  │(re-plan)│  │(re-check)│ │      │ │
│  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └──┬───┘ │
│                                                                   │      │
│                  ┌─────────────────────┐                          │      │
│                  │ Environment approval │◀─── Required before ────┘      │
│                  │ (manual gate)        │     apply runs                  │
│                  └─────────────────────┘                                  │
│                                                                          │
│  AWS                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  OIDC Provider  ──▶  IAM Role  ──▶  Terraform operations       │    │
│  │  (GitHub)            (assume)       (plan / apply)              │    │
│  │                                                                 │    │
│  │  No long-lived keys. Session tokens expire in 1 hour.          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

Two workflows, two triggers, one principle: **plan is safe to run on any PR; apply only happens on main after approval.**

---

### 1.3 OIDC Authentication — No More Long-Lived Keys

Traditional CI/CD stores AWS access keys as GitHub Secrets. This is a security risk — the keys are long-lived, and if the repository is compromised, the attacker has permanent AWS access.

OIDC (OpenID Connect) eliminates this entirely:

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  GitHub Actions   │  token  │  AWS STS          │  creds  │  Terraform   │
│  Runner           │────────▶│  AssumeRoleWith   │────────▶│  apply       │
│                   │         │  WebIdentity      │         │              │
│  "I am repo X,   │         │  "Token valid,    │         │  (short-lived│
│   workflow Y,     │         │   role assumed,   │         │   session)   │
│   branch main"   │         │   here are temp   │         │              │
│                   │         │   credentials"    │         │              │
└──────────────────┘         └──────────────────┘         └──────────────┘
```

**How it works:**
1. GitHub Actions mints an OIDC token for the workflow run. The token contains claims: repository, branch, workflow, actor.
2. The workflow calls `aws-actions/configure-aws-credentials` with `role-to-assume`.
3. AWS STS validates the token against the OIDC provider (GitHub), checks the IAM role's trust policy (does it allow this repo and branch?), and issues temporary credentials.
4. The credentials expire in 1 hour (configurable). No keys stored anywhere.

**IAM trust policy for the OIDC role:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:your-org/finstack:*"
        }
      }
    }
  ]
}
```

**The `sub` claim is your security boundary.** `repo:your-org/finstack:*` means only workflows in the `finstack` repo can assume this role. You can tighten it further: `repo:your-org/finstack:ref:refs/heads/main` restricts to the main branch only — so PR workflows can plan but not apply with production credentials.

**Why this matters for BFSI:** no long-lived AWS keys in GitHub. No keys on developer laptops that can be stolen. No keys to rotate. The auditor sees: "AWS access is granted per-workflow-run via OIDC federation, scoped to the repository and branch, with credentials that expire in 60 minutes."

---

### 1.4 The Plan Workflow — What Runs on Every PR

The plan workflow (`terraform-plan.yml`) is the safety net. It runs on every pull request that touches infrastructure files:

```yaml
on:
  pull_request:
    branches: [main]
    paths:
      - "finstack/terraform/**"
      - "finstack/terragrunt/**"
      - "finstack/policies/**"
```

**The path filter is critical.** Without it, every PR (docs, app code, tests) triggers a Terraform plan — wasting CI minutes and creating noise. With it, only infrastructure changes trigger the pipeline.

**What the plan workflow does, step by step:**

```
Step 1:  Checkout code
Step 2:  OIDC auth to AWS (read-only role)
Step 3:  Setup Terraform (pinned version)
Step 4:  terraform fmt -check (style gate)
Step 5:  terraform init (download providers)
Step 6:  terraform validate (syntax check)
Step 7:  terraform plan -out=tfplan (compute diff)
Step 8:  terraform show -json tfplan > tfplan.json (export for OPA)
Step 9:  conftest test tfplan.json (OPA policy gate)
Step 10: Post plan + OPA results as PR comment
Step 11: Fail if plan or OPA failed
```

**The PR comment is the review artefact.** It shows every reviewer exactly what will change — resources created, modified, destroyed — and whether OPA policies passed. The reviewer does not need to run Terraform locally. Everything is visible in the PR.

**Concurrency control:**

```yaml
concurrency:
  group: terraform-plan-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

If you push a new commit to the same PR, the previous plan run is cancelled. This saves CI minutes and ensures the reviewer always sees the latest plan.

---

### 1.5 The Apply Workflow — What Runs on Merge

The apply workflow (`terraform-apply.yml`) runs when a PR is merged to main:

```yaml
on:
  push:
    branches: [main]
    paths:
      - "finstack/terraform/**"
      - "finstack/terragrunt/**"
```

**Key differences from the plan workflow:**

| Aspect | Plan Workflow | Apply Workflow |
|--------|-------------|---------------|
| **Trigger** | `pull_request` | `push` to `main` |
| **OIDC role** | Read-only (plan only) | Read-write (can modify infra) |
| **Concurrency** | Cancel previous runs | Never cancel in-progress applies |
| **OPA** | Advisory (posts to PR) | Blocking (fails the apply) |
| **Environment** | None | `production` (requires approval) |
| **Output** | PR comment | Apply log + state update |

**Why re-plan before apply?** The plan from the PR might be stale — another PR could have merged between your plan and your merge, changing the state. The apply workflow re-plans against the current state, re-runs OPA, and only then applies. Belt and braces.

**Concurrency for apply is non-negotiable:**

```yaml
concurrency:
  group: terraform-apply
  cancel-in-progress: false    # NEVER cancel an in-progress apply
```

Two simultaneous `terraform apply` runs will corrupt state. The concurrency group ensures only one apply runs at a time, and `cancel-in-progress: false` ensures a running apply is never interrupted.

---

### 1.6 Environment Approvals — The Human Gate

GitHub Environments provide a manual approval gate before apply:

```yaml
jobs:
  apply:
    environment: production    # Requires approval from designated reviewers
```

When the apply workflow reaches this job, it pauses and waits for a designated reviewer to approve. The reviewer can see the commit, the PR, and the plan output before clicking "Approve."

**Setting up the environment in GitHub:**
1. Repository Settings -> Environments -> New environment: `production`
2. Add required reviewers (the SRE team leads)
3. Optionally: restrict to the `main` branch only
4. Optionally: add a wait timer (e.g., 5 minutes for final checks)

```
Developer                    GitHub Actions              AWS
   |                              |                        |
   +-- Push to PR ───────────────>| Plan + OPA             |
   |                              | Post PR comment        |
   |                              |                        |
   +-- Merge PR ─────────────────>| Re-plan                |
   |                              | Re-OPA                 |
   |                              | WAIT for approval      |
   |                              |                        |
   |  Reviewer approves ─────────>| terraform apply ──────>| Create/modify
   |                              |                        | infrastructure
   |                              | Post-apply verify      |
   |                              |                        |
```

In BFSI, the approval gate is often a regulatory requirement. The pipeline proves: code was reviewed (PR approval), policies were checked (OPA), and deployment was authorised (environment approval) — three distinct gates, all logged.

---

### 1.7 The OPA Gate in CI — Policy as Code

In Stage 5, you wrote OPA/Rego policies and tested them locally with `conftest`. In CI, the same policies run automatically against every plan:

```bash
terraform plan -out=tfplan
terraform show -json tfplan > tfplan.json
conftest test --policy finstack/policies tfplan.json
```

**What the OPA gate catches in CI:**

```
┌─────────────────────────────────────────────────────────────┐
│  OPA Policy Gate in CI                                       │
│                                                             │
│  Pass: All S3 buckets have public access blocked            │
│  Pass: All resources tagged with Project, Environment       │
│  Pass: Instance types restricted to approved list           │
│  Pass: RDS instances are encrypted and multi-AZ (prod)      │
│  Pass: No inline IAM policies (use managed policies only)   │
│                                                             │
│  If ANY policy fails:                                       │
│    Plan workflow:  PR marked as failed, reviewer warned      │
│    Apply workflow: Apply blocked entirely                    │
└─────────────────────────────────────────────────────────────┘
```

The OPA gate runs in both workflows. In the plan workflow, failure is visible in the PR comment (the reviewer can see which policy was violated). In the apply workflow, failure blocks the apply — non-compliant infrastructure never reaches AWS.

---

### 1.8 Workflow File Structure

The FinStack CI/CD lives in two workflow files:

```
finstack/.github/workflows/
├── terraform-plan.yml     # Runs on PRs — plan + OPA + PR comment
└── terraform-apply.yml    # Runs on merge to main — re-plan + OPA + apply
```

**Shared configuration via environment variables:**

```yaml
env:
  TF_VERSION: "1.7.0"           # Pin Terraform version
  AWS_REGION: "ap-south-1"       # Mumbai — FinStack's primary region
  WORKING_DIR: "finstack/terraform/environments"
  POLICY_DIR: "finstack/policies"
```

Pinning the Terraform version is non-negotiable. Without it, a new Terraform release could change plan output or behaviour, causing unexpected diffs. Everyone on the team and CI must use the same version.

---

### 1.9 Permissions — Principle of Least Privilege

GitHub Actions workflows declare the permissions they need:

```yaml
permissions:
  id-token: write        # OIDC — request a token from GitHub
  contents: read         # Checkout the repository
  pull-requests: write   # Post plan as a PR comment (plan workflow only)
```

**Separate OIDC roles for plan and apply:**

| Workflow | IAM Role | Permissions |
|----------|----------|-------------|
| Plan (PR) | `finstack-ci-plan` | `ReadOnlyAccess` + `iam:GetRole` + `s3:GetBucketPolicy` |
| Apply (merge) | `finstack-ci-apply` | `PowerUserAccess` (or a scoped policy matching your resources) |

The plan role cannot modify infrastructure. Even if the plan workflow is compromised (e.g., a malicious PR), the attacker can only read — not create, modify, or destroy. The apply role has write access but is restricted to the `main` branch via the OIDC trust policy's `sub` claim.

---

### 1.10 Saving and Applying Plans

The plan workflow saves the plan to a file:

```bash
terraform plan -input=false -no-color -out=tfplan
```

The apply workflow re-plans and applies the saved plan:

```bash
terraform plan -input=false -no-color -out=tfplan
terraform apply -input=false -no-color tfplan
```

**Why `-input=false`?** CI has no interactive terminal. Without this flag, Terraform would hang waiting for user input if a variable is missing.

**Why `-no-color`?** Colour codes (ANSI escape sequences) make logs unreadable in PR comments and log viewers. Raw text is cleaner.

**Why not pass the plan from the PR workflow to the apply workflow?** Because the state might have changed between the PR plan and the merge. A stale plan could create resources that already exist or miss resources that were added. Always re-plan in the apply workflow.

---

### 1.11 The PR Comment — Making Plans Reviewable

The plan workflow posts a formatted comment on the PR using `actions/github-script`:

```
## Terraform Plan Results

| Step | Status |
|------|--------|
| Format | pass |
| Init | pass |
| Validate | pass |
| Plan | pass |
| OPA Policy | pass |

<details><summary>Show Plan Output</summary>

  # aws_s3_bucket.statements will be created
  + resource "aws_s3_bucket" "statements" {
      + bucket = "finstack-dev-statements"
      + ...
    }

  Plan: 7 to add, 0 to change, 0 to destroy.

</details>

<details><summary>Show OPA Policy Results</summary>

  15 tests, 15 passed, 0 warnings, 0 failures

</details>
```

The plan output is truncated to 60,000 characters (GitHub's comment size limit). Collapsible `<details>` blocks keep the comment compact.

**Why this matters:** the reviewer sees the exact infrastructure diff without running Terraform locally. They can approve or request changes based on the plan. This is the code review of infrastructure — as important as reviewing application code.

---

### 1.12 Error Handling and Failure Modes

The workflows use `continue-on-error: true` for some steps and an explicit check step at the end:

```yaml
- name: Terraform Plan
  id: plan
  run: terraform plan ...
  continue-on-error: true

- name: Check results
  run: |
    if [ "${{ steps.plan.outcome }}" != "success" ]; then
      echo "::error::Terraform plan failed"
      exit 1
    fi
    if [ "${{ steps.opa.outcome }}" != "success" ]; then
      echo "::error::OPA policy check failed"
      exit 1
    fi
```

**Why `continue-on-error`?** To allow the PR comment step to run even if plan or OPA fails. Without it, a failed plan would abort the workflow before posting the comment — and the reviewer would see a red X but no details. With `continue-on-error`, the comment is always posted, and the final step checks the outcome and fails the workflow with a clear error message.

---

### 1.13 Advanced Patterns

#### Multi-environment promotion

For FinStack's dev/staging/prod environments, the pipeline can promote changes through environments:

```
PR          merge to main         manual promotion
.tf change ──> apply to dev ──> staging ──> production
                                 (auto)      (approval required)
```

This uses separate jobs with environment gates:

```yaml
jobs:
  apply-dev:
    environment: dev
    # ... apply to dev

  apply-staging:
    needs: apply-dev
    environment: staging
    # ... apply to staging

  apply-prod:
    needs: apply-staging
    environment: production      # Manual approval required
    # ... apply to production
```

#### Matrix strategy for multiple stacks

If FinStack has multiple Terraform stacks (networking, compute, data), a matrix runs them in parallel:

```yaml
strategy:
  matrix:
    stack: [networking, compute, data]
  fail-fast: false    # Do not cancel other stacks if one fails

steps:
  - name: Plan
    run: terraform plan
    working-directory: finstack/terraform/${{ matrix.stack }}
```

#### Terraform state lock timeout

In CI, add a lock timeout to handle concurrent runs gracefully:

```bash
terraform plan -lock-timeout=5m
```

This waits up to 5 minutes for a lock to release instead of failing immediately.

#### Slack notification on apply

```yaml
- name: Notify on apply
  if: always()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "Terraform apply ${{ job.status }} for FinStack (${{ github.sha }})"
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

### 1.14 Security Considerations for IaC CI/CD

| Risk | Mitigation |
|------|-----------|
| **Malicious PR modifies workflow** | Require CODEOWNERS approval for `.github/workflows/` changes |
| **PR extracts secrets** | Use `pull_request` (not `pull_request_target`) — forks cannot access secrets |
| **Long-lived AWS keys** | OIDC eliminates keys entirely |
| **Apply without review** | Branch protection: require PR + approval + status checks before merge |
| **State file in logs** | Never print state; use `-no-color` and truncate plan output |
| **Concurrent applies** | Concurrency group with `cancel-in-progress: false` |
| **Stale plan applied** | Re-plan in the apply workflow, not reuse the PR plan |
| **OPA bypassed** | OPA runs in both workflows; apply workflow blocks on OPA failure |

**Branch protection rules for FinStack (GitHub):**
1. Require a pull request before merging
2. Require at least 1 approval
3. Require status checks to pass (terraform-plan, opa-check)
4. Require branches to be up to date before merging
5. Do not allow bypassing the above settings

---

### 1.15 Putting It All Together — The Full FinStack Pipeline

Here is the complete flow from code change to production infrastructure:

```
1. Developer creates branch, edits .tf files
2. Developer pushes branch, opens PR
     |
     v
3. GitHub Actions: terraform-plan.yml fires
   a. OIDC auth (read-only role)
   b. fmt -check         --> fail = PR blocked
   c. init + validate    --> fail = PR blocked
   d. plan -out=tfplan   --> diff computed
   e. show -json tfplan  --> export for OPA
   f. conftest test      --> policy violations = PR blocked
   g. Post plan + OPA as PR comment
     |
     v
4. Reviewer reads plan in PR comment
   - "7 to add, 0 to change, 0 to destroy — looks correct"
   - OPA: "15 passed, 0 failures"
   - Reviewer approves PR
     |
     v
5. Developer merges PR to main
     |
     v
6. GitHub Actions: terraform-apply.yml fires
   a. OIDC auth (read-write role, main branch only)
   b. init
   c. plan (re-plan for safety)
   d. conftest test (re-check OPA)
   e. PAUSE: environment approval required
     |
     v
7. SRE lead approves in GitHub Environments
     |
     v
8. terraform apply tfplan
   - Infrastructure created/modified in AWS
   - State file updated in S3 backend
   - Apply log available in GitHub Actions
     |
     v
9. Post-apply verification
   - terraform output confirms resources
   - Commit SHA, actor, ref logged

Audit trail: commit -> PR -> plan -> OPA -> PR approval
             -> merge -> re-plan -> re-OPA -> env approval -> apply
```

Every step is logged, every decision traceable, every gate automated except the two human approvals (PR review and environment approval). This is the standard a BFSI regulator expects.

---

## 2. Hands-On Exercises

The exercises are in the `exercises/` directory. Complete them in order.

### Exercise 1: Plan Workflow

**File:** `exercises/01-plan-workflow.md`

Write the `terraform-plan.yml` workflow from scratch. Configure OIDC auth, run format/validate/plan, post results as a PR comment. Test it by opening a PR that adds a new S3 bucket.

**Key concepts you'll practise:**

```yaml
on: pull_request          # Trigger on PRs only
permissions: id-token     # OIDC auth
concurrency: cancel       # Save CI minutes
continue-on-error: true   # Post comment even on failure
actions/github-script     # Post PR comment via API
```

**What you'll build:**

```
Pull Request opened
    |
    +-- Checkout
    +-- OIDC auth to AWS
    +-- terraform fmt -check
    +-- terraform init
    +-- terraform validate
    +-- terraform plan -out=tfplan
    +-- conftest test tfplan.json
    +-- Post plan + OPA to PR comment
    +-- Fail if plan or OPA failed
```

**You're done when:**
- Opening a PR that modifies `finstack/terraform/**` triggers the workflow
- The PR has a comment showing the plan output and OPA results
- A format violation fails the workflow with a clear error
- A policy violation (e.g., public S3 bucket) fails the OPA step

Estimated time: 45 minutes.

---

### Exercise 2: Full Pipeline

**File:** `exercises/02-full-pipeline.md`

Add the `terraform-apply.yml` workflow. Configure environment approvals, re-plan before apply, and post-apply verification. Test the complete flow: PR -> review -> merge -> approval -> apply.

**Key concepts you'll practise:**

```yaml
on: push (main only)       # Trigger on merge
environment: production    # Manual approval gate
concurrency: never cancel  # Protect running applies
terraform apply tfplan     # Apply saved plan
```

**What you'll build:**

```
Merge to main
    |
    +-- Checkout
    +-- OIDC auth to AWS (write role)
    +-- terraform init
    +-- terraform plan (re-plan for safety)
    +-- conftest test (re-check OPA)
    +-- [PAUSE: environment approval]
    +-- terraform apply
    +-- Post-apply verification
```

**You're done when:**
- Merging a PR to main triggers the apply workflow
- The workflow pauses for environment approval before applying
- After approval, `terraform apply` runs and outputs are verified
- The full audit trail is visible: commit -> PR -> plan -> approval -> apply

Estimated time: 45 minutes.

---

## 3. Summary

### What You Learned

| Concept | Key Insight |
|---------|-------------|
| **IaC CI/CD** | Treat infrastructure code like application code — PR, review, test, deploy |
| **OIDC** | No long-lived AWS keys; GitHub tokens exchanged for short-lived AWS sessions |
| **Plan workflow** | Runs on every PR; posts plan + OPA results as a comment |
| **Apply workflow** | Runs on merge to main; re-plans, re-checks OPA, requires approval |
| **OPA in CI** | Policy gate blocks non-compliant infrastructure automatically |
| **Environment approvals** | Manual gate before apply — regulatory requirement in BFSI |
| **Concurrency** | Cancel stale plan runs; never cancel in-progress applies |
| **Path filters** | Only infrastructure file changes trigger the pipeline |
| **PR comment** | The plan is the review artefact — reviewers see the diff without running Terraform |
| **Least privilege** | Plan role is read-only; apply role is write, restricted to main branch |

### GitHub Actions + Terraform Cheat Sheet

```yaml
# -- Workflow triggers --
on:
  pull_request:
    branches: [main]
    paths: ["finstack/terraform/**"]     # Only infra changes
  push:
    branches: [main]
    paths: ["finstack/terraform/**"]

# -- OIDC auth (no long-lived keys) --
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
    aws-region: ap-south-1

# -- Terraform setup --
- uses: hashicorp/setup-terraform@v3
  with:
    terraform_version: "1.7.0"
    terraform_wrapper: false              # Raw output for parsing

# -- Terraform commands in CI --
terraform fmt -check -recursive           # Style gate
terraform init -input=false               # No interactive prompts
terraform validate -no-color              # Syntax check
terraform plan -input=false -no-color -out=tfplan   # Save plan
terraform show -json tfplan > tfplan.json           # Export for OPA
terraform apply -input=false -no-color tfplan       # Apply saved plan

# -- OPA gate --
conftest test --policy policies/ tfplan.json

# -- Concurrency --
# Plan: cancel stale runs
concurrency:
  group: terraform-plan-${{ github.event.pull_request.number }}
  cancel-in-progress: true
# Apply: NEVER cancel
concurrency:
  group: terraform-apply
  cancel-in-progress: false

# -- Environment approval --
jobs:
  apply:
    environment: production               # Requires manual approval

# -- Permissions --
permissions:
  id-token: write                         # OIDC token
  contents: read                          # Checkout
  pull-requests: write                    # PR comment (plan only)

# -- Post plan as PR comment --
- uses: actions/github-script@v7
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: planOutput
      });
```

### The Complete IaC Pipeline — All 7 Stages

```
Stage 1: Terraform      Write infrastructure as code
Stage 2: Terragrunt     DRY multi-environment configs
Stage 3: Packer          Immutable golden AMIs
Stage 4: Vault           Dynamic secrets, no static passwords
Stage 5: OPA             Policy gates, compliance as code
Stage 6: Ansible         Post-provision configuration
Stage 7: CI/CD           Automate everything above
         |
         v
Every change: PR -> plan -> OPA -> review -> merge -> approval -> apply
```

### Next Steps

You have completed the IaC Pipeline course. FinStack's infrastructure is now fully automated — from Terraform modules through CI/CD. Next:

- **Observability** — monitor the infrastructure you built (see `Prometheus.md`, `Grafana.md`, `Loki.md`)
- **GitOps** — extend CI/CD to Kubernetes deployments with ArgoCD (see `ArgoCD.md`)
- **Disaster Recovery** — test what happens when you lose a region (see `Disaster-Recovery.md`)
- **Chaos Engineering** — break things on purpose to build confidence (see `Chaos-Engineering.md`)

**Further learning:**
- Terraform Cloud / HCP Terraform for managed runs and state
- GitHub Actions reusable workflows for sharing pipeline logic across repos
- OIDC federation with GCP and Azure (same pattern, different providers)
- Terragrunt `run-all` in CI for multi-stack parallel plans
- Atlantis as an alternative Terraform PR automation tool
- Infracost for cost estimation in PR comments
