# Exercise 1: Plan Workflow — Terraform Plan on Every PR

**Goal:** Write the `terraform-plan.yml` GitHub Actions workflow from scratch. It should run on every pull request that touches infrastructure files, execute format/validate/plan/OPA checks, and post the results as a PR comment.

**Time:** 45 minutes

---

## Step 1: Set Up OIDC in AWS

Create the IAM trust policy that allows GitHub Actions to assume a role:

```bash
cat > trust-policy.json << 'EOF'
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
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/finstack:*"
        }
      }
    }
  ]
}
EOF
```

Replace `ACCOUNT_ID` and `YOUR_ORG/finstack` with your values. Create the OIDC provider and role:

```bash
# Create OIDC provider (one-time setup, skip if it already exists)
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"

# Create the role for plan (read-only)
aws iam create-role \
  --role-name finstack-ci-plan \
  --assume-role-policy-document file://trust-policy.json

# Attach read-only permissions (narrow this for production)
aws iam attach-role-policy \
  --role-name finstack-ci-plan \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
```

Add the role ARN as a repository secret:

```
Repository -> Settings -> Secrets and variables -> Actions
  Name:  AWS_ROLE_ARN
  Value: arn:aws:iam::ACCOUNT_ID:role/finstack-ci-plan
```

---

## Step 2: Create the Plan Workflow

Create `finstack/.github/workflows/terraform-plan.yml` with:

- **Trigger:** `on: pull_request` with `paths` filtering to `finstack/terraform/**`, `finstack/terragrunt/**`, `finstack/policies/**`
- **Concurrency:** cancel in-progress runs for the same PR number
- **Permissions:** `id-token: write`, `contents: read`, `pull-requests: write`
- **Steps in order:**
  1. Checkout (`actions/checkout@v4`)
  2. OIDC auth (`aws-actions/configure-aws-credentials@v4`)
  3. Setup Terraform (`hashicorp/setup-terraform@v3`, version pinned, `terraform_wrapper: false`)
  4. Format check (`terraform fmt -check -recursive`, `continue-on-error: true`)
  5. Init (`terraform init -input=false`)
  6. Validate (`terraform validate -no-color`)
  7. Plan (`terraform plan -input=false -no-color -out=tfplan`, then `terraform show -json tfplan > tfplan.json`, `continue-on-error: true`)
  8. OPA check (`conftest test --policy ... tfplan.json`, `continue-on-error: true`)
  9. Post PR comment (`actions/github-script@v7` — read plan and OPA output, post formatted comment)
  10. Check results (fail if plan or OPA step failed)

Refer to the existing scaffold at `finstack/.github/workflows/terraform-plan.yml` for the complete implementation.

---

## Step 3: Test with a PR

Create a branch and make an infrastructure change:

```bash
git checkout -b feat/add-audit-bucket
```

Add a new S3 bucket to `finstack/terraform/environments/main.tf`:

```hcl
resource "aws_s3_bucket" "audit_logs" {
  bucket = "${var.project}-${var.environment}-audit-logs"
  tags   = merge(local.common_tags, { Name = "${var.project}-audit-logs" })
}
```

Push and open a PR:

```bash
git add finstack/terraform/environments/main.tf
git commit -m "feat: add audit logs S3 bucket"
git push -u origin feat/add-audit-bucket
```

The plan workflow should trigger automatically. Check the Actions tab.

---

## Step 4: Verify the PR Comment

After the workflow completes, the PR should have a comment showing:
- A status table (Format, Init, Validate, Plan, OPA — pass or fail for each)
- Collapsible plan output ("1 to add" for the new bucket)
- Collapsible OPA policy results

---

## Step 5: Test a Policy Violation

Add a public S3 bucket (without the public access block) and push. The OPA step should fail. The PR comment should show which policy was violated.

Remove the violating code, push again, and verify the OPA step passes.

---

## Step 6: Test a Format Violation

Deliberately mis-indent a `.tf` file and push. The format check should fail. Fix with `terraform fmt`, commit, and push — the step should pass.

---

## You're Done When

- [x] The workflow triggers on PRs that modify `finstack/terraform/**`
- [x] AWS authentication uses OIDC — no `AWS_ACCESS_KEY_ID` in secrets
- [x] The PR has a comment showing the plan output and OPA results
- [x] A format violation (`terraform fmt -check`) fails the workflow
- [x] A policy violation (e.g., public S3) fails the OPA step and shows in the comment
- [x] Pushing a new commit to the PR cancels the previous run (concurrency)

## Common Mistakes

- **Missing `permissions: id-token: write`** — OIDC auth fails silently without this
- **Forgetting `terraform_wrapper: false`** — the wrapper adds extra output that breaks plan parsing
- **Wrong `working-directory`** — all Terraform commands must run from the environments directory
- **PR comment too large** — truncate plan output to 60,000 characters (GitHub's comment limit)
- **Using `pull_request_target` instead of `pull_request`** — `pull_request_target` gives forks access to secrets, which is a security risk
