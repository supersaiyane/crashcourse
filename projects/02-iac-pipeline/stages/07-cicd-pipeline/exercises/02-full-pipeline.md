# Exercise 2: Full Pipeline — Apply on Merge with Environment Approvals

**Goal:** Add the `terraform-apply.yml` workflow that runs when a PR merges to main. Configure environment protection rules, re-plan before apply, run OPA again, and verify the complete PR-to-production flow with an audit trail.

**Time:** 45 minutes

---

## Step 1: Configure GitHub Environments

Go to your repository settings and create the production environment:

```
Repository -> Settings -> Environments -> New environment

Name: production
  - Required reviewers: add yourself or your team lead
  - Deployment branches: restrict to "main" only
  - Optional: add a 5-minute wait timer
```

---

## Step 2: Create the Apply Workflow

Create `finstack/.github/workflows/terraform-apply.yml` with:

- **Trigger:** `on: push` to `main` branch, with `paths` filtering to `finstack/terraform/**`, `finstack/terragrunt/**`
- **Concurrency:** `cancel-in-progress: false` (never interrupt a running apply)
- **Permissions:** `id-token: write`, `contents: read`
- **Job:** `environment: production` (triggers the approval gate)
- **Steps in order:**
  1. Checkout (`actions/checkout@v4`)
  2. OIDC auth — use a **write** role (separate from the plan read-only role)
  3. Setup Terraform (pinned version)
  4. Init (`terraform init -input=false`)
  5. Plan (`terraform plan -input=false -no-color -out=tfplan`, then export JSON)
  6. OPA gate (`conftest test tfplan.json` — no `continue-on-error`, this blocks apply)
  7. Apply (`terraform apply -input=false -no-color tfplan`)
  8. Post-apply verification (`terraform output -no-color`, log commit SHA and actor)

Refer to the existing scaffold at `finstack/.github/workflows/terraform-apply.yml` for the complete implementation.

---

## Step 3: Configure Branch Protection

```
Repository -> Settings -> Branches -> Add rule for "main"

Enable:
  - Require a pull request before merging
  - Require at least 1 approval
  - Require status checks to pass (select "Terraform Plan" / "Plan & Policy Check")
  - Require branches to be up to date before merging
```

This ensures no one can push directly to main or merge without a passing plan.

---

## Step 4: Test the Full Flow

Run through the complete cycle:

```
1. Create branch:     git checkout -b feat/add-audit-bucket
2. Make a change:     add an S3 bucket to main.tf
3. Push + open PR:    git push -u origin feat/add-audit-bucket
4. Wait for plan:     terraform-plan.yml runs, posts PR comment
5. Review the plan:   check the PR comment for plan output + OPA
6. Approve + merge:   merge the PR to main
7. Wait for apply:    terraform-apply.yml triggers, pauses for approval
8. Approve deploy:    click "Approve" in the GitHub Actions UI
9. Verify apply:      check the workflow log for "Apply complete"
```

---

## Step 5: Verify the Audit Trail

After apply completes, trace the full chain:

- **Git commit** — who wrote the code, when, what changed
- **Pull request** — who reviewed, what the plan showed, OPA results
- **Environment approval** — who approved the deploy, when
- **Apply log** — which resources were created/modified, terraform output

This chain is the audit trail a BFSI regulator expects.

---

## Step 6: Test Failure Modes

**OPA failure in apply:** temporarily merge a non-compliant resource. The apply workflow should fail at the OPA step before `terraform apply` runs.

**Concurrent applies:** open two PRs, merge them in quick succession. Verify the second apply waits for the first to complete (concurrency group).

---

## You're Done When

- [x] Merging a PR to main triggers the apply workflow
- [x] The workflow pauses at the environment approval step
- [x] After approval, `terraform apply` runs successfully
- [x] The OPA gate runs again in the apply workflow (belt and braces)
- [x] `cancel-in-progress: false` prevents interrupting a running apply
- [x] You can trace the full audit trail: commit -> PR -> plan -> OPA -> approval -> apply
- [x] Branch protection prevents direct pushes to main

## Common Mistakes

- **Using `cancel-in-progress: true`** — this can interrupt `terraform apply` mid-execution, leaving infrastructure in an inconsistent state
- **Skipping the re-plan** — state may have changed since the PR plan; always re-plan
- **No environment protection** — without it, apply runs immediately with no human gate
- **Same OIDC role for plan and apply** — plan should be read-only; apply needs write, restricted to main
- **Forgetting `-input=false`** — Terraform hangs in CI waiting for input that never comes
- **Not logging post-apply outputs** — the verification step creates the audit record
