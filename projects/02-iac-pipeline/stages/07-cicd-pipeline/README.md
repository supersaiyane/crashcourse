# Stage 7: CI/CD Pipeline — GitHub Actions for FinStack IaC

**Goal:** Build a production-grade CI/CD pipeline that plans Terraform on pull requests, gates changes with OPA policy checks and cost estimation, and applies infrastructure only after human approval — all authenticated via OIDC with zero static AWS credentials in your repository.

**Prerequisites:** Stages 1–6 completed. A GitHub repository with your FinStack Terraform code. An AWS account (or LocalStack for local testing). Familiarity with GitHub Actions basics — see [`GitHub-Actions.md`](../../../../cicd/GitHub-Actions.md) for the full crash course.

**Sample App:** FinStack — a BFSI payment platform. You will automate the infrastructure provisioning pipeline so that every change to FinStack's Terraform code is validated, policy-checked, cost-estimated, and applied through a controlled, auditable workflow.

> For the full crash course on GitHub Actions, see [`GitHub-Actions.md`](../../../../cicd/GitHub-Actions.md).

---

## 1. Theory

### 1.1 Why CI/CD for Infrastructure?

Running `terraform apply` from your laptop works for learning. It fails in production for the same reasons ad-hoc server configuration fails:

| Problem | Manual `terraform apply` | CI/CD Pipeline |
|---------|--------------------------|----------------|
| **Audit trail** | "Someone ran apply at 2 AM" — who? which version? | Git commit + PR review + workflow run ID |
| **Consistency** | Different engineers have different provider versions, different env vars | Pinned runner image, locked provider versions, identical every time |
| **Secrets exposure** | AWS credentials on laptops — stolen laptop = compromised infra | OIDC federation — no static credentials anywhere |
| **Review** | "I reviewed the code" — but did you review the *plan*? | Plan output posted as a PR comment — reviewers see exactly what changes |
| **Policy** | "We don't allow public S3 buckets" — enforced by memory | OPA/conftest gate — policy violations block the pipeline |
| **Cost** | "This change costs how much?" — discovered on the AWS bill | Infracost estimate in the PR — before merge, not after |
| **Blast radius** | Apply to prod on a Friday afternoon? Sure, YOLO | Environment protection rules + manual approval gate |

In BFSI, the regulator does not accept "we trust our engineers to run apply correctly." They want a documented, repeatable, auditable process with separation of duties. That process is a CI/CD pipeline.

**The one idea that unlocks IaC CI/CD:** The pipeline is the *only* path to production. No human runs `terraform apply` against staging or prod. The pipeline runs it, after automated checks pass and a human approves. This is not bureaucracy — it is blast-radius control.

**Mental model:** Think of the pipeline as an airlock. Code enters through the outer door (PR), gets scanned and pressurised (plan, OPA, cost check), a human confirms the readings (review + approve), and only then does the inner door open (apply to the target environment). Nothing bypasses the airlock.

---

### 1.2 Architecture — The Full Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GITHUB ACTIONS PIPELINE                          │
│                                                                         │
│  PR opened/updated                              Merge to main           │
│  ─────────────────                              ──────────────          │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      ┌──────────────────┐   │
│  │ Checkout  │─▶│ OIDC     │─▶│ Terraform│      │ Checkout + OIDC  │   │
│  │ code      │  │ Auth     │  │ init     │      │                  │   │
│  └──────────┘  └──────────┘  └────┬─────┘      └────────┬─────────┘   │
│                                    │                      │             │
│                                    ▼                      ▼             │
│                              ┌──────────┐          ┌──────────┐        │
│                              │ Terraform│          │ Terraform│        │
│                              │ plan     │          │ plan     │        │
│                              └────┬─────┘          └────┬─────┘        │
│                                   │                      │              │
│                         ┌─────────┼──────────┐           │              │
│                         ▼         ▼          ▼           ▼              │
│                   ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│                   │ OPA     │ │Infra-  │ │ Post   │ │ OPA    │        │
│                   │conftest │ │cost    │ │ PR     │ │conftest│        │
│                   │ gate    │ │estimate│ │comment │ │ gate   │        │
│                   └────┬────┘ └────┬───┘ └────────┘ └───┬────┘        │
│                        │          │                      │              │
│                        ▼          ▼                      ▼              │
│                   ┌─────────────────┐          ┌─────────────────┐     │
│                   │ PR Status Check │          │ Environment     │     │
│                   │ (pass/fail)     │          │ Protection Gate │     │
│                   └─────────────────┘          │ (manual approve)│     │
│                                                └────────┬────────┘     │
│                                                         │               │
│                                                         ▼               │
│                                                   ┌──────────┐         │
│                                                   │ Terraform│         │
│                                                   │ apply    │         │
│                                                   └──────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Two workflows, one repository:**

1. **Plan workflow** — triggers on PR to `main`. Runs `terraform plan`, OPA checks, cost estimation. Posts results as a PR comment. Fails the check if policy violations are found.
2. **Apply workflow** — triggers on merge to `main`. Runs `terraform plan` again (state may have changed since the PR), OPA checks, then `terraform apply` behind an environment protection gate with required reviewers.

Why plan again on merge? Because the state file may have changed between PR approval and merge. Another PR could have merged first. The plan on merge catches this drift.

---

### 1.3 OIDC Authentication — No Static Keys

Static AWS access keys in GitHub Secrets are a liability. They don't expire, they can be exfiltrated from logs, and rotating them requires coordination. OIDC federation eliminates them entirely.

```
┌──────────────┐         ┌───────────────┐         ┌──────────────┐
│  GitHub       │  JWT    │  AWS STS      │  Role   │  AWS API     │
│  Actions      │────────▶│  (assume-role │────────▶│  (Terraform  │
│  Runner       │         │   with-OIDC)  │         │   operations)│
│               │◀────────│               │         │              │
│               │  Temp   │               │         │              │
│               │  creds  │               │         │              │
└──────────────┘         └───────────────┘         └──────────────┘
```

**How it works:**

1. GitHub Actions mints a short-lived JWT (JSON Web Token) for each workflow run. The token contains claims: the repository name, the branch, the workflow, the actor.
2. AWS has an IAM OIDC identity provider that trusts GitHub's token issuer (`token.actions.githubusercontent.com`).
3. An IAM role has a trust policy that says: "Allow this specific GitHub repository to assume this role."
4. The `aws-actions/configure-aws-credentials` action exchanges the JWT for temporary AWS credentials (valid ~1 hour).
5. Terraform uses those temporary credentials. They expire. No static secrets exist anywhere.

**The trust policy — this is the security boundary:**

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
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/finstack-iac:*"
        }
      }
    }
  ]
}
```

**Critical:** The `sub` condition scopes the role to your specific repository. Without it, *any* GitHub repository could assume your role. In BFSI, scope this further to specific branches (`ref:refs/heads/main`) or environments (`environment:production`).

**Setting up the OIDC provider in AWS (one-time):**

```bash
# Create the OIDC provider (once per AWS account)
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"

# Create the IAM role with the trust policy above
aws iam create-role \
  --role-name github-actions-finstack-terraform \
  --assume-role-policy-document file://trust-policy.json

# Attach the permissions the role needs
aws iam attach-role-policy \
  --role-name github-actions-finstack-terraform \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/FinStackTerraformPolicy
```

The permissions policy should follow least privilege — only the actions Terraform needs (ec2:*, rds:*, s3:*, iam:PassRole, etc.), scoped to the FinStack resources where possible.

---

### 1.4 State Locking in CI

When CI runs `terraform plan` or `terraform apply`, it acquires a lock on the state file (via DynamoDB, as configured in Stage 1). This prevents two pipeline runs from corrupting state.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  PR #42 plan    │────▶│  DynamoDB Lock   │     │  S3 State   │
│  (running)      │     │  Table           │     │  Bucket     │
│                 │     │  ┌─────────────┐ │     │             │
│  Lock acquired  │◀────│  │ LockID: ... │ │     │             │
│  Plan runs OK   │     │  │ Info: PR#42 │ │     │             │
│                 │     │  └─────────────┘ │     │             │
└─────────────────┘     │                  │     │             │
                        │                  │     │             │
┌─────────────────┐     │  BLOCKED         │     │             │
│  PR #43 plan    │────▶│  (lock held)     │     │             │
│  (waiting)      │     │                  │     │             │
│                 │     │  Retries with    │     │             │
│  Waits...       │◀────│  backoff         │     │             │
└─────────────────┘     └──────────────────┘     └─────────────┘
```

**Terraform handles this automatically** with the S3 backend + DynamoDB lock table you configured in Stage 1. In CI, the key concern is: if a workflow run is cancelled mid-apply, the lock may be stuck. The pipeline should handle this:

```yaml
# In your workflow — set a timeout to prevent indefinite lock holds
jobs:
  apply:
    timeout-minutes: 30   # Kill the job if it hangs
```

If a lock gets stuck, a privileged operator runs `terraform force-unlock <LOCK_ID>` — this should never be automated in CI, because a stuck lock usually means something went wrong that needs human investigation.

---

### 1.5 Environment Protection Rules

GitHub Environments let you define protection rules per deployment target. This is how you enforce "staging deploys automatically, production requires approval."

```
┌──────────────────────────────────────────────────────────┐
│  GitHub Repository Settings → Environments                │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  dev          │  │  staging      │  │  production   │   │
│  │              │  │              │  │              │   │
│  │ Protection:  │  │ Protection:  │  │ Protection:  │   │
│  │  None        │  │  None        │  │  Required    │   │
│  │              │  │              │  │  reviewers:  │   │
│  │ Secrets:     │  │ Secrets:     │  │   @sre-leads │   │
│  │  AWS_ROLE_   │  │  AWS_ROLE_   │  │              │   │
│  │  ARN (dev)   │  │  ARN (stg)   │  │ Wait timer:  │   │
│  │              │  │              │  │  5 minutes   │   │
│  │ Auto-deploy  │  │ Auto-deploy  │  │              │   │
│  │  on merge    │  │  after dev   │  │ Branch:      │   │
│  │              │  │  succeeds    │  │  main only   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Configuration in the workflow:**

```yaml
jobs:
  apply-production:
    runs-on: ubuntu-latest
    environment: production          # This triggers the protection rules
    permissions:
      id-token: write                # OIDC
      contents: read
    steps:
      # ... the apply steps
```

When the job reaches the `environment: production` declaration, GitHub pauses and waits for a required reviewer to approve. The reviewer sees the plan output (from the PR comment or a linked artifact) and decides whether to proceed.

**In BFSI, this is your segregation of duties:** the developer writes the code, the pipeline validates it, and an SRE lead approves the production deployment. The audit trail is the GitHub Actions run log + the approval record.

---

### 1.6 OPA Conftest Gate in CI

You built OPA policies in Stage 5. Now you integrate them into the pipeline so policy violations block the merge.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  terraform    │────▶│  terraform   │────▶│  conftest    │
│  init         │     │  plan -out   │     │  test        │
│               │     │  tfplan      │     │  tfplan.json │
│               │     │              │     │              │
│               │     │  terraform   │     │  Policies:   │
│               │     │  show -json  │     │  - no public │
│               │     │  tfplan      │     │    S3        │
│               │     │  > tfplan.   │     │  - encryption│
│               │     │    json      │     │    required  │
│               │     │              │     │  - tags      │
│               │     │              │     │    required  │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                          ┌───────┴───────┐
                                          │               │
                                     ┌────▼───┐     ┌────▼───┐
                                     │  PASS  │     │  FAIL  │
                                     │        │     │        │
                                     │ Proceed│     │ Block  │
                                     │ to     │     │ merge  │
                                     │ apply  │     │ Post   │
                                     │        │     │ errors │
                                     └────────┘     └────────┘
```

**The CI step:**

```yaml
- name: OPA policy check
  run: |
    # Convert the binary plan to JSON for conftest
    terraform show -json tfplan > tfplan.json

    # Run conftest against the JSON plan
    conftest test tfplan.json \
      --policy policy/ \
      --output json \
      | tee conftest-results.json

    # Fail the step if any violations
    if jq -e '.[] | select(.failures | length > 0)' conftest-results.json > /dev/null 2>&1; then
      echo "::error::OPA policy violations found. See conftest output above."
      exit 1
    fi
```

**Why JSON output?** So you can parse the results and post them as a structured PR comment. A wall of text is harder to review than a table of pass/fail results.

---

### 1.7 Cost Estimation with Infracost

Infracost estimates the monthly cost of infrastructure changes and posts the diff as a PR comment. In BFSI, where infrastructure budgets are tightly controlled, this prevents "we accidentally provisioned 20 r5.4xlarge instances" surprises.

```
┌──────────────┐     ┌──────────────┐     ┌───────────────────────┐
│  terraform    │────▶│  infracost   │────▶│  PR Comment           │
│  plan -out    │     │  breakdown   │     │                       │
│  tfplan       │     │  --path      │     │  Monthly cost: $1,247 │
│               │     │  tfplan      │     │  Change:      +$89    │
│               │     │              │     │                       │
│               │     │              │     │  ┌─────────────────┐  │
│               │     │              │     │  │ Resource      $ │  │
│               │     │              │     │  │ RDS          742│  │
│               │     │              │     │  │ EKS nodes    380│  │
│               │     │              │     │  │ NAT GW        98│  │
│               │     │              │     │  │ S3              2│  │
│               │     │              │     │  └─────────────────┘  │
└──────────────┘     └──────────────┘     └───────────────────────┘
```

**The CI step:**

```yaml
- name: Cost estimation
  uses: infracost/actions/setup@v3
  with:
    api-key: ${{ secrets.INFRACOST_API_KEY }}

- name: Generate cost breakdown
  run: |
    infracost breakdown \
      --path tfplan \
      --format json \
      --out-file /tmp/infracost.json

- name: Post cost comment
  uses: infracost/actions/comment@v1
  with:
    path: /tmp/infracost.json
    behavior: update        # Update existing comment, don't create new ones
```

Infracost is optional but high-value. If you skip it, you lose cost visibility. If you add it, every PR shows the dollar impact before anyone clicks "merge."

---

## 2. Hands-On Exercises

The exercises are in the `exercises/` directory. Complete them in order.

### Exercise 1: Plan Workflow

**File:** `exercises/01-plan-workflow.md`

Build the plan workflow: configure OIDC authentication, run `terraform init` and `terraform plan`, and post the plan output as a PR comment. This is the read-only, non-destructive half of the pipeline.

**Key concepts you'll implement:**

```yaml
# .github/workflows/terraform-plan.yml
on:
  pull_request:
    branches: [main]
    paths:
      - 'terraform/**'            # Only run when IaC changes
      - '.github/workflows/**'    # Or when the pipeline itself changes

permissions:
  id-token: write                 # OIDC token
  contents: read                  # Checkout
  pull-requests: write            # Post PR comments
```

**What you'll build:**

```
PR opened/updated
    │
    ▼
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Checkout │──▶│ OIDC     │──▶│ Terraform│──▶│ Post     │
│ code     │   │ auth     │   │ init +   │   │ plan as  │
│          │   │ to AWS   │   │ plan     │   │ PR       │
│          │   │          │   │          │   │ comment  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
```

**You're done when:**
- Opening a PR that changes `terraform/` triggers the plan workflow
- The workflow authenticates to AWS via OIDC (no static `AWS_ACCESS_KEY_ID` anywhere)
- The plan output appears as a comment on the PR
- Reviewers can read the plan and know exactly what will change
- A syntax error in Terraform fails the workflow check

Estimated time: 45 minutes.

---

### Exercise 2: Full Pipeline

**File:** `exercises/02-full-pipeline.md`

Add the OPA conftest gate, cost estimation, and the apply workflow with environment protection. This completes the pipeline — PR triggers plan + checks, merge triggers plan + apply with approval.

**Key concepts you'll implement:**

```yaml
# The apply workflow runs on merge to main
on:
  push:
    branches: [main]
    paths:
      - 'terraform/**'

jobs:
  apply:
    environment: production       # Triggers approval gate
    # ...
```

**What you'll build:**

```
Merge to main
    │
    ▼
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Checkout │──▶│ OIDC     │──▶│ Terraform│──▶│ OPA      │──▶│ Terraform│
│ + auth   │   │          │   │ plan     │   │ conftest │   │ apply    │
│          │   │          │   │ (fresh)  │   │ gate     │   │ (after   │
│          │   │          │   │          │   │          │   │ approval)│
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

**You're done when:**
- A PR with a public S3 bucket is blocked by the OPA conftest gate
- Merging to `main` triggers the apply workflow
- The apply job pauses and waits for a required reviewer to approve (environment protection)
- After approval, `terraform apply` runs and provisions infrastructure
- The full audit trail is visible in the GitHub Actions run log
- Cost estimation appears on PR comments (if Infracost is configured)

Estimated time: 60 minutes.

---

## 3. The Plan Workflow — Step by Step

### 3.1 Workflow File Structure

Create `.github/workflows/terraform-plan.yml`:

```yaml
name: "Terraform Plan"

on:
  pull_request:
    branches: [main]
    paths:
      - 'terraform/**'
      - 'policy/**'                 # Re-run if policies change too
      - '.github/workflows/terraform-plan.yml'

# Cancel in-progress runs for the same PR
concurrency:
  group: terraform-plan-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  id-token: write                   # Request OIDC JWT
  contents: read                    # git checkout
  pull-requests: write              # Post PR comments

env:
  TF_VERSION: "1.7.5"              # Pin Terraform version
  TF_WORKING_DIR: "terraform/environments/dev"
  AWS_REGION: "ap-south-1"

jobs:
  plan:
    name: "Terraform Plan"
    runs-on: ubuntu-latest
    timeout-minutes: 15             # Prevent runaway jobs

    steps:
      # ── Checkout ──────────────────────────────────────────
      - name: Checkout code
        uses: actions/checkout@v4

      # ── OIDC Authentication ──────────────────────────────
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
          # No access-key-id, no secret-access-key — OIDC only

      # ── Terraform Setup ──────────────────────────────────
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}
          terraform_wrapper: true    # Enables output capture

      # ── Init ─────────────────────────────────────────────
      - name: Terraform Init
        id: init
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform init -input=false

      # ── Validate ─────────────────────────────────────────
      - name: Terraform Validate
        id: validate
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform validate -no-color

      # ── Format Check ─────────────────────────────────────
      - name: Terraform Format Check
        id: fmt
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform fmt -check -recursive -diff
        continue-on-error: true      # Don't block, just report

      # ── Plan ─────────────────────────────────────────────
      - name: Terraform Plan
        id: plan
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: |
          terraform plan \
            -input=false \
            -no-color \
            -out=tfplan \
            2>&1 | tee plan-output.txt

          # Save plan as JSON for OPA and Infracost
          terraform show -json tfplan > tfplan.json
        continue-on-error: true      # Post the plan even if it fails

      # ── Post PR Comment ──────────────────────────────────
      - name: Post plan to PR
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('fs');
            const planOutput = fs.readFileSync(
              '${{ env.TF_WORKING_DIR }}/plan-output.txt', 'utf8'
            );

            // Truncate if too long for a PR comment (65536 char limit)
            const maxLen = 60000;
            const truncated = planOutput.length > maxLen
              ? planOutput.substring(0, maxLen) + '\n\n... (truncated)'
              : planOutput;

            const body = `### Terraform Plan Results

            | Step | Status |
            |------|--------|
            | Format | \`${{ steps.fmt.outcome }}\` |
            | Init | \`${{ steps.init.outcome }}\` |
            | Validate | \`${{ steps.validate.outcome }}\` |
            | Plan | \`${{ steps.plan.outcome }}\` |

            <details><summary>Show Plan Output</summary>

            \`\`\`hcl
            ${truncated}
            \`\`\`

            </details>

            *Triggered by @${{ github.actor }} in PR #${{ github.event.pull_request.number }}*
            *Workflow run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}*`;

            // Find existing comment to update (don't spam the PR)
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });

            const botComment = comments.find(c =>
              c.user.type === 'Bot' &&
              c.body.includes('### Terraform Plan Results')
            );

            if (botComment) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: botComment.id,
                body: body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: body,
              });
            }

      # ── Fail if plan failed ──────────────────────────────
      - name: Check plan status
        if: steps.plan.outcome == 'failure'
        run: exit 1
```

**Key design decisions in this workflow:**

- **`concurrency`** — cancels in-progress runs for the same PR. If you push three commits in quick succession, only the latest plan runs. Saves runner minutes and avoids confusing stale plan comments.
- **`terraform_wrapper: true`** — the `setup-terraform` action wraps the `terraform` binary to capture stdout/stderr into step outputs. This is how you get the plan text into the PR comment.
- **`continue-on-error: true`** on the plan step — you still want to post the plan output even if it fails. The "Check plan status" step at the end fails the workflow if needed.
- **Update, don't spam** — the PR comment step finds and updates the existing bot comment instead of creating a new one on every push. This keeps the PR clean.
- **Truncation** — large plans can exceed GitHub's 65536-character comment limit. Truncate gracefully.

---

### 3.2 Expected Output — The PR Comment

When a developer opens a PR that changes Terraform files, the workflow runs and posts:

```text
### Terraform Plan Results

| Step      | Status    |
|-----------|-----------|
| Format    | `success` |
| Init      | `success` |
| Validate  | `success` |
| Plan      | `success` |

<details><summary>Show Plan Output</summary>

Terraform will perform the following actions:

  # module.vpc.aws_vpc.main will be created
  + resource "aws_vpc" "main" {
      + arn                              = (known after apply)
      + cidr_block                       = "10.0.0.0/16"
      + enable_dns_hostnames             = true
      + enable_dns_support               = true
      + id                               = (known after apply)
      + tags                             = {
          + "Environment" = "dev"
          + "ManagedBy"   = "terraform"
          + "Name"        = "finstack-vpc"
          + "Project"     = "finstack"
        }
    }

Plan: 12 to add, 0 to change, 0 to destroy.

</details>

Triggered by @engineer in PR #42
Workflow run: https://github.com/org/finstack-iac/actions/runs/12345
```

The reviewer reads the plan, confirms the changes match the PR description, and approves.

---

## 4. The Apply Workflow — Step by Step

### 4.1 Workflow File Structure

Create `.github/workflows/terraform-apply.yml`:

```yaml
name: "Terraform Apply"

on:
  push:
    branches: [main]
    paths:
      - 'terraform/**'
      - 'policy/**'

permissions:
  id-token: write
  contents: read

env:
  TF_VERSION: "1.7.5"
  AWS_REGION: "ap-south-1"

jobs:
  # ── Plan (runs first, no approval needed) ──────────────
  plan:
    name: "Plan — ${{ matrix.environment }}"
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      matrix:
        environment: [dev, staging, production]
        include:
          - environment: dev
            tf_dir: terraform/environments/dev
          - environment: staging
            tf_dir: terraform/environments/staging
          - environment: production
            tf_dir: terraform/environments/production
    outputs:
      plan-exitcode-dev: ${{ steps.plan-dev.outputs.exitcode }}
      plan-exitcode-staging: ${{ steps.plan-staging.outputs.exitcode }}
      plan-exitcode-production: ${{ steps.plan-production.outputs.exitcode }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets[format('AWS_ROLE_ARN_{0}', matrix.environment)] }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Terraform Init
        working-directory: ${{ matrix.tf_dir }}
        run: terraform init -input=false

      - name: Terraform Plan
        id: plan-${{ matrix.environment }}
        working-directory: ${{ matrix.tf_dir }}
        run: |
          terraform plan \
            -input=false \
            -no-color \
            -out=tfplan \
            -detailed-exitcode        # Exit 0 = no changes, 2 = changes

          # Save JSON plan for OPA
          terraform show -json tfplan > tfplan.json

      - name: OPA policy check
        working-directory: ${{ matrix.tf_dir }}
        run: |
          # Install conftest
          wget -q https://github.com/open-policy-agent/conftest/releases/download/v0.46.0/conftest_0.46.0_Linux_x86_64.tar.gz
          tar xzf conftest_0.46.0_Linux_x86_64.tar.gz
          chmod +x conftest

          # Run policy checks
          ./conftest test tfplan.json \
            --policy ../../../policy/ \
            --no-color \
            | tee opa-results.txt

      - name: Upload plan artifact
        uses: actions/upload-artifact@v4
        with:
          name: tfplan-${{ matrix.environment }}
          path: |
            ${{ matrix.tf_dir }}/tfplan
            ${{ matrix.tf_dir }}/tfplan.json
          retention-days: 1           # Plans are ephemeral

  # ── Apply Dev (auto, no approval) ─────────────────────
  apply-dev:
    name: "Apply — dev"
    needs: plan
    runs-on: ubuntu-latest
    environment: dev
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_dev }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Download plan
        uses: actions/download-artifact@v4
        with:
          name: tfplan-dev
          path: terraform/environments/dev

      - name: Terraform Init
        working-directory: terraform/environments/dev
        run: terraform init -input=false

      - name: Terraform Apply
        working-directory: terraform/environments/dev
        run: terraform apply -input=false -no-color tfplan

  # ── Apply Staging (auto, after dev succeeds) ──────────
  apply-staging:
    name: "Apply — staging"
    needs: [plan, apply-dev]
    runs-on: ubuntu-latest
    environment: staging
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_staging }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Download plan
        uses: actions/download-artifact@v4
        with:
          name: tfplan-staging
          path: terraform/environments/staging

      - name: Terraform Init
        working-directory: terraform/environments/staging
        run: terraform init -input=false

      - name: Terraform Apply
        working-directory: terraform/environments/staging
        run: terraform apply -input=false -no-color tfplan

  # ── Apply Production (requires manual approval) ───────
  apply-production:
    name: "Apply — production"
    needs: [plan, apply-staging]
    runs-on: ubuntu-latest
    environment: production           # ← This triggers the approval gate
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_production }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      # ⚠️ Re-plan for production — the saved plan may be stale
      - name: Terraform Init
        working-directory: terraform/environments/production
        run: terraform init -input=false

      - name: Terraform Plan (fresh)
        working-directory: terraform/environments/production
        run: |
          terraform plan \
            -input=false \
            -no-color \
            -out=tfplan

          terraform show -json tfplan > tfplan.json

      - name: OPA policy check (production)
        working-directory: terraform/environments/production
        run: |
          wget -q https://github.com/open-policy-agent/conftest/releases/download/v0.46.0/conftest_0.46.0_Linux_x86_64.tar.gz
          tar xzf conftest_0.46.0_Linux_x86_64.tar.gz
          chmod +x conftest

          ./conftest test tfplan.json \
            --policy ../../../policy/ \
            --no-color

      - name: Terraform Apply
        working-directory: terraform/environments/production
        run: terraform apply -input=false -no-color tfplan
```

**Key design decisions:**

- **Matrix plan, sequential apply** — plan runs in parallel for all environments (fast feedback). Apply runs sequentially: dev → staging → production. If dev fails, staging and production never run.
- **Re-plan for production** — the saved plan artifact from the matrix may be minutes or hours old (waiting for approval). Production re-plans to catch state drift. This is a deliberate trade-off: slightly slower, but safer.
- **Separate OIDC roles per environment** — `AWS_ROLE_ARN_dev`, `AWS_ROLE_ARN_staging`, `AWS_ROLE_ARN_production`. Each role has permissions scoped to its environment. The production role cannot touch dev resources, and vice versa.
- **`timeout-minutes`** — prevents a hung apply from holding the state lock forever.

---

### 4.2 Environment Setup in GitHub

Configure environments in your repository settings:

```text
Repository → Settings → Environments

1. Create "dev"
   - No protection rules
   - Add secret: AWS_ROLE_ARN_dev = arn:aws:iam::111111111111:role/github-actions-finstack-dev

2. Create "staging"
   - No protection rules (auto-deploy after dev)
   - Add secret: AWS_ROLE_ARN_staging = arn:aws:iam::222222222222:role/github-actions-finstack-staging

3. Create "production"
   - Required reviewers: @your-org/sre-leads (at least 1)
   - Wait timer: 5 minutes (cooling-off period)
   - Deployment branches: main only
   - Add secret: AWS_ROLE_ARN_production = arn:aws:iam::333333333333:role/github-actions-finstack-prod
```

The wait timer is a BFSI pattern — it gives the approver 5 minutes to reconsider after clicking "approve." If they realise they made a mistake, they can cancel the pending deployment before it starts.

---

## 5. Cost Estimation Integration

### 5.1 Adding Infracost to the Plan Workflow

Add these steps to `terraform-plan.yml` after the plan step:

```yaml
      # ── Cost Estimation ──────────────────────────────────
      - name: Setup Infracost
        uses: infracost/actions/setup@v3
        with:
          api-key: ${{ secrets.INFRACOST_API_KEY }}

      - name: Generate cost breakdown
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: |
          infracost breakdown \
            --path tfplan.json \
            --format json \
            --out-file /tmp/infracost.json

      - name: Post cost estimate to PR
        uses: infracost/actions/comment@v1
        with:
          path: /tmp/infracost.json
          behavior: update
```

**Expected PR comment from Infracost:**

```text
Monthly cost will increase by $89 (from $1,158 to $1,247)

┌──────────────────────────────────┬──────────────┬──────────────┐
│ Resource                         │ Monthly Cost │ Change       │
├──────────────────────────────────┼──────────────┼──────────────┤
│ module.rds.aws_db_instance.main  │ $742.00      │ +$0.00       │
│ module.eks.aws_eks_node_group    │ $380.00      │ +$89.00      │
│ module.vpc.aws_nat_gateway       │ $98.00       │ +$0.00       │
│ module.s3.aws_s3_bucket          │ $2.00        │ +$0.00       │
└──────────────────────────────────┴──────────────┴──────────────┘
```

The cost delta (+$89) is what reviewers care about. A PR that adds $89/month is reasonable. A PR that adds $8,900/month warrants a conversation.

---

## 6. Complete Pipeline Flow — End to End

Here is the full lifecycle for a FinStack infrastructure change:

```text
1. Developer creates a branch:
   git checkout -b feat/add-redis-cluster

2. Developer writes Terraform code:
   vim terraform/modules/redis/main.tf
   vim terraform/environments/dev/main.tf    # Add module "redis"

3. Developer opens a PR:
   git push -u origin feat/add-redis-cluster
   → Opens PR #47: "Add Redis cluster for FinStack session cache"

4. Plan workflow triggers automatically:
   ┌──────────────────────────────────────────────────────────┐
   │  terraform-plan.yml                                       │
   │                                                          │
   │  ✓ Checkout                                    (2s)      │
   │  ✓ OIDC auth → temporary AWS credentials       (3s)      │
   │  ✓ terraform init                              (8s)      │
   │  ✓ terraform validate                          (1s)      │
   │  ✓ terraform fmt -check                        (1s)      │
   │  ✓ terraform plan → 5 to add, 0 to change     (12s)     │
   │  ✓ OPA conftest → 0 violations                 (3s)      │
   │  ✓ Infracost → +$45/month                     (5s)      │
   │  ✓ Post plan + cost as PR comments             (2s)      │
   └──────────────────────────────────────────────────────────┘

5. Reviewer reads the plan comment:
   - "5 to add" — new Redis ElastiCache resources
   - OPA passed — encryption enabled, no public access
   - Cost: +$45/month — within budget
   → Reviewer approves the PR

6. Developer merges to main:
   → Apply workflow triggers

7. Apply workflow runs:
   ┌──────────────────────────────────────────────────────────┐
   │  terraform-apply.yml                                      │
   │                                                          │
   │  Plan (parallel):                                        │
   │    ✓ dev:        3 to add (Redis + SG + subnet group)   │
   │    ✓ staging:    3 to add                                │
   │    ✓ production: 3 to add                                │
   │                                                          │
   │  Apply dev:                                              │
   │    ✓ terraform apply → 3 added                  (45s)    │
   │                                                          │
   │  Apply staging:                                          │
   │    ✓ terraform apply → 3 added                  (48s)    │
   │                                                          │
   │  Apply production:                                       │
   │    ⏸ Waiting for approval...                             │
   │    ✓ @sre-lead approved                                  │
   │    ⏱ 5-minute wait timer...                              │
   │    ✓ Fresh plan → 3 to add (no drift)                    │
   │    ✓ OPA conftest → 0 violations                         │
   │    ✓ terraform apply → 3 added                  (52s)    │
   └──────────────────────────────────────────────────────────┘

8. Infrastructure deployed across all environments.
   Audit trail: PR #47 → merge commit → workflow run #789
```

**The audit chain is complete:** the regulator can trace from "Redis cluster exists in production" back to the PR review, the OPA policy check, the cost approval, the SRE lead's manual approval, and the exact Terraform plan that was applied.

---

## 7. Common Pitfalls

- **Static AWS keys in GitHub Secrets.** OIDC exists specifically to eliminate this. If you see `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in your repository secrets, replace them with OIDC. Static keys do not expire, cannot be scoped to a workflow, and are a compliance risk.

- **Not pinning the Terraform version.** If one workflow run uses Terraform 1.7 and the next uses 1.8, state format differences can cause failures. Pin `terraform_version` in the workflow and match it to your `.terraform-version` or `required_version` constraint.

- **Applying a stale plan.** The plan from the PR may be hours old by the time the apply runs. State may have changed (another PR merged, a manual change, drift). Always re-plan before applying in the merge workflow, especially for production.

- **Forgetting `id-token: write` permission.** OIDC authentication requires the workflow to have `id-token: write` permission. Without it, the `configure-aws-credentials` action silently falls back to looking for static credentials and fails. This is the most common OIDC setup mistake.

- **Oversized plan comments.** GitHub PR comments have a 65536-character limit. Large plans (50+ resources) exceed this. Truncate the plan output and link to the full artifact or workflow log.

- **No concurrency control on apply.** Two merges in quick succession can trigger two apply workflows that race for the state lock. Use `concurrency` groups on the apply workflow to serialise them: `concurrency: { group: terraform-apply-${{ matrix.environment }}, cancel-in-progress: false }`. Note `cancel-in-progress: false` — you do not want to cancel a running apply.

- **Skipping OPA in the apply workflow.** Running conftest only in the plan workflow is not enough. Policies may have changed between PR and merge. Run conftest again in the apply workflow before `terraform apply`.

- **Environment secrets vs repository secrets.** AWS role ARNs should be environment-scoped secrets, not repository secrets. A repository secret is available to all workflows and branches. An environment secret is available only to jobs that declare that environment — and environment protection rules apply.

- **No timeout on jobs.** A `terraform apply` that hangs (waiting for a resource to stabilise, a provider bug, network issue) holds the state lock indefinitely. Set `timeout-minutes` on every job. 30 minutes is generous for most IaC runs.

- **Manual `terraform apply` in production.** If even one engineer has credentials to run `terraform apply` against production outside the pipeline, the audit trail is broken. In BFSI, restrict production credentials to the CI/CD service role and enforce this with IAM policies.

---

## 8. Quick Reference

```bash
# ── OIDC Setup (one-time per AWS account) ────────────────────
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"

aws iam create-role \
  --role-name github-actions-finstack-terraform \
  --assume-role-policy-document file://trust-policy.json

aws iam attach-role-policy \
  --role-name github-actions-finstack-terraform \
  --policy-arn arn:aws:iam::ACCT:policy/FinStackTerraformPolicy

# ── Terraform CI commands ────────────────────────────────────
terraform init -input=false                    # Non-interactive init
terraform plan -input=false -no-color -out=tfplan  # Save binary plan
terraform show -json tfplan > tfplan.json      # Convert to JSON for OPA
terraform apply -input=false -no-color tfplan  # Apply saved plan

# ── OPA / Conftest ───────────────────────────────────────────
conftest test tfplan.json --policy policy/     # Check plan against policies
conftest test tfplan.json --policy policy/ --output json  # JSON for parsing

# ── Infracost ────────────────────────────────────────────────
infracost breakdown --path tfplan.json --format json --out-file cost.json
infracost diff --path tfplan.json --format json  # Show cost delta

# ── State lock management ────────────────────────────────────
terraform force-unlock <LOCK_ID>               # ⚠️ Manual only, never in CI

# ── GitHub CLI — inspect workflow runs ───────────────────────
gh run list --workflow=terraform-plan.yml       # List recent plan runs
gh run view <RUN_ID>                           # View a specific run
gh run view <RUN_ID> --log                     # View full logs

# ── Environment management (GitHub CLI) ──────────────────────
gh api repos/:owner/:repo/environments         # List environments
gh secret set AWS_ROLE_ARN --env production     # Set environment secret
```

---

## 9. Summary

### What You Learned

| Concept | Key Insight |
|---------|-------------|
| **OIDC** | Short-lived tokens replace static AWS keys; scoped to repo + branch |
| **Plan on PR** | Reviewers see exactly what changes before approving |
| **PR comment** | The plan is the review artifact — not the code, the *effect* of the code |
| **OPA gate** | Policy violations block the pipeline, not just the conscience of the engineer |
| **Cost estimation** | Dollar impact visible before merge, not on the next AWS bill |
| **Environment protection** | Production requires manual approval from a named reviewer |
| **Sequential deploy** | dev → staging → production; failure stops the chain |
| **Re-plan on apply** | State may have drifted since the PR; always plan fresh before applying |
| **State locking** | DynamoDB prevents concurrent applies; timeouts prevent stuck locks |
| **Concurrency groups** | Serialise applies to the same environment; cancel stale plans |
| **Audit trail** | PR → review → approval → workflow run → apply log; complete and immutable |

### Next Steps

You have completed the FinStack IaC pipeline project. The full pipeline is:

```
Code → PR → Plan + OPA + Cost → Review → Merge → Plan + OPA → Approve → Apply
```

**Where to go from here:**

- **Drift detection** — schedule a cron workflow that runs `terraform plan` nightly and alerts on unexpected changes (see `GitHub-Actions.md` for cron triggers)
- **Module versioning** — publish your Terraform modules to a private registry and pin versions in the pipeline
- **Multi-account** — use AWS Organizations + separate OIDC roles per account for true environment isolation
- **Terragrunt in CI** — if you adopted Terragrunt in Stage 2, replace `terraform` commands with `terragrunt` — the pipeline structure stays the same
- **Notification** — post Slack/Teams messages on apply success/failure for production
- **State backup** — enable S3 versioning on the state bucket so you can recover from corrupted applies

**Related crash courses:**
- [`GitHub-Actions.md`](../../../../cicd/GitHub-Actions.md) — the full CI/CD platform crash course
- [`Terraform.md`](../../../../iac/Terraform.md) — Terraform fundamentals and advanced patterns
- [`OPA.md`](../../../../iac/OPA.md) — policy-as-code in depth

**The mantra:** The pipeline is the only path to production — plan on PR, gate with policy, apply after approval, and leave an audit trail the regulator can follow.
