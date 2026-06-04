# Stage 1: Git Branching Strategy

**Goal:** Establish a trunk-based development workflow with branch protection, PR reviews, and conventional commits for the BillFlow billing service.

**Prerequisites:** Git installed. A GitHub account with a repository created. The BillFlow app running locally (`cd BillFlow/billing-service && npm install && npm start`).

---

## 1. Theory (What & Why)

### Why branching strategy matters

Most teams don't fail because of bad code — they fail because of bad integration. Developer A builds a feature on a branch for three weeks. Developer B builds another. When both try to merge, the conflicts are catastrophic. Code that worked in isolation breaks in combination. The release slips. The hotfix goes to the wrong branch. Nobody knows what's deployed where.

A branching strategy prevents this by defining clear rules: where code lives, how it moves, and who approves it.

### The spectrum of strategies

| Strategy | How it works | Best for | Risk |
|----------|-------------|----------|------|
| **Trunk-based** | Everyone commits to `main`. Short-lived branches (<1 day). Feature flags for WIP. | Teams with CI/CD, frequent deploys | Broken main if CI is weak |
| **GitHub Flow** | Feature branches off `main`, merged via PR. No release branches. | Small teams, web apps | Long PRs slow everyone |
| **Git Flow** | `develop`, `release/*`, `hotfix/*`, `feature/*` branches. Formal release process. | Versioned software, mobile apps | Complex, slow, merge hell |
| **Release branching** | `main` + `release/X.Y` branches. Features go to main, cherrypick to release. | Products with multiple supported versions | Cherrypick conflicts |

For BillFlow — a SaaS billing service deploying multiple times per day — **trunk-based development** is the right choice. Why?

- **Speed:** Code reaches production in hours, not weeks.
- **Simplicity:** One branch to think about. No merge ceremonies.
- **Small diffs:** Short-lived branches mean small PRs that are easy to review.
- **Continuous feedback:** CI catches problems immediately, not during a painful merge.

### Trunk-based development in detail

The core rule: **main is always deployable**.

```text
main ──●──●──●──●──●──●──●──●──●──  (always green, always deployable)
        \   /  \   /  \   /
         ●─●    ●─●    ●─●    ← feature branches (hours, not weeks)
```

How it works in practice:

1. You pull the latest `main`.
2. Create a feature branch: `feat/add-invoice-endpoint`.
3. Write code, commit, push. The branch lives for hours — maybe a day at most.
4. Open a PR. CI runs tests, linting, security scan.
5. A teammate reviews. If CI is green and review approves, merge (squash).
6. The feature branch is deleted. It served its purpose.
7. The deployment pipeline picks up the merge to `main` and deploys.

What if your feature takes a week? Break it down. Ship the database migration first. Then the API endpoint. Then the UI. Each piece is small, reviewable, and independently safe.

### What about feature flags?

When you can't break a feature into independently shippable pieces, use a feature flag:

```javascript
if (process.env.FEATURE_INVOICE_V2 === 'true') {
  // new invoice logic
} else {
  // old invoice logic
}
```

The code is in `main` but dormant. You ship it dark, test it in staging, then flip the flag in production. No long-lived branch needed.

### Conventional commits

A commit message should answer: *what kind of change is this?*

```text
feat: add subscription creation endpoint
fix: handle null customer in invoice webhook
docs: update API reference for payment webhooks
chore: bump express to 4.19.2
test: add missing test for invoice validation
refactor: extract payment processing into service class
perf: cache subscription lookup by customer ID
ci: add security scanning to GitHub Actions workflow
```

The prefix isn't decoration — it drives automation:

- **Changelogs:** Tools like `conventional-changelog` generate release notes automatically.
- **Semantic versioning:** `feat` = minor bump, `fix` = patch bump, `BREAKING CHANGE` = major bump.
- **CI decisions:** A `docs:` commit might skip the build step. A `feat:` commit triggers a full pipeline.

### Branch protection rules

Branch protection is the enforcement mechanism. Without it, trunk-based development is a suggestion. With it, it's a guarantee.

| Rule | What it enforces | Why it matters |
|------|-----------------|----------------|
| **Require PR reviews** | At least 1 reviewer must approve | Catches bugs, shares knowledge |
| **Require status checks** | CI must pass before merge | No broken code on main |
| **Require linear history** | No merge commits (squash or rebase only) | Clean, readable history |
| **Restrict force pushes** | Cannot rewrite main history | Prevents accidents |
| **Require signed commits** | GPG-signed commits only | Audit trail for compliance |
| **Dismiss stale reviews** | New push invalidates old approvals | Reviewer sees the final code |

For BillFlow, we'll set up: require 1 review, require CI status checks, require linear history.

---

## 2. Hands-On: Set Up the BillFlow Repository

### 2.1 Initialise and make the first commit

```bash
cd BillFlow/billing-service

# Initialise
git init
git add .
git commit -m "feat: initial BillFlow billing service

- Express API with subscriptions, invoices, and payment webhook endpoints
- Health check at /health
- Dockerfile with multi-stage build
- Basic test suite"
```

Note the commit message: `feat:` prefix, summary line under 72 characters, body explains what's included. This is the standard you'll maintain throughout the project.

### 2.2 Push to GitHub

```bash
# Create the repo (if using GitHub CLI)
gh repo create billflow --public --source=. --push

# Or if the repo already exists:
git remote add origin git@github.com:<your-user>/billflow.git
git push -u origin main
```

### 2.3 Create your first feature branch

Let's add input validation to the subscription endpoint:

```bash
# Always start from latest main
git checkout main
git pull origin main

# Create a descriptively named branch
git checkout -b feat/validate-subscription-input
```

Now add validation to `server.js`:

```javascript
// In the POST /api/subscriptions handler, add validation:
app.post('/api/subscriptions', (req, res) => {
  const { customer, plan } = req.body;

  // Validation
  if (!customer || typeof customer !== 'string') {
    return res.status(400).json({ error: 'customer is required and must be a string' });
  }
  if (!plan || !['starter', 'professional', 'enterprise'].includes(plan)) {
    return res.status(400).json({ error: 'plan must be one of: starter, professional, enterprise' });
  }

  // ... rest of the handler
});
```

Commit with a conventional message:

```bash
git add server.js
git commit -m "feat: add input validation to subscription creation

- customer field: required, must be string
- plan field: must be one of starter/professional/enterprise
- Returns 400 with descriptive error on invalid input"

git push -u origin feat/validate-subscription-input
```

### 2.4 Open a pull request

```bash
gh pr create \
  --title "feat: add input validation to subscription creation" \
  --body "## What
Adds input validation to POST /api/subscriptions.

## Why
Invalid data was being accepted silently, causing downstream payment failures.

## Test plan
- [x] Added validation for customer field
- [x] Added validation for plan field
- [x] Returns 400 with descriptive error messages
- [x] Existing tests still pass"
```

### 2.5 Set up branch protection

Via GitHub CLI:

```bash
gh api repos/{owner}/billflow/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  --input - << 'JSON'
{
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "required_status_checks": {
    "strict": true,
    "contexts": ["test"]
  },
  "enforce_admins": true,
  "required_linear_history": true,
  "restrictions": null
}
JSON
```

Or via GitHub UI: Settings → Branches → Add branch protection rule → Branch name pattern: `main`.

### 2.6 Verify protection works

```bash
# Try pushing directly to main — should fail
git checkout main
echo "// test" >> server.js
git add . && git commit -m "test: direct push"
git push origin main
# Error: protected branch hook declined
```

This is exactly what you want. The only way code reaches `main` is through a reviewed, CI-passing PR.

### 2.7 The daily workflow

Here's what a typical day looks like with trunk-based development:

```text
09:00  Pull latest main
09:05  Create branch: feat/add-invoice-pdf-generation
09:30  First commit: add PDF template
10:00  Second commit: wire template to invoice endpoint
10:15  Push, open PR, request review
10:30  CI passes, reviewer approves
10:35  Squash merge to main
10:36  Branch auto-deleted
10:40  Deployment pipeline picks up the change
```

Total branch lifetime: 1 hour 30 minutes. Small diff. Easy review. Fast deployment.

---

## 3. Key patterns for BillFlow

### Squash merge strategy

When merging PRs, use squash merge. This collapses all branch commits into a single commit on `main`:

```text
Branch commits:
  "wip: trying something"
  "fix: actually this way"
  "oops forgot a file"

Squash result on main:
  "feat: add input validation to subscription creation"
```

Clean history. Every commit on `main` represents a complete, reviewed change.

Configure in GitHub: Settings → General → Pull Requests → Allow squash merging (only).

### Commit message template

Create `.gitmessage` in the repo root:

```text
# <type>: <description> (max 72 chars)
#
# Types: feat, fix, docs, chore, test, refactor, perf, ci
#
# Body: explain WHY, not what (the diff shows what)
#
# Footer: references (Closes #123, BREAKING CHANGE: ...)
```

### PR template

Create `.github/pull_request_template.md`:

```markdown
## What
<!-- One sentence: what does this PR do? -->

## Why
<!-- Why is this change needed? Link to issue if applicable. -->

## Test plan
<!-- How did you verify this works? -->
- [ ] Unit tests pass
- [ ] Manual testing done
- [ ] No regressions
```

---

## 4. Common mistakes

- **Long-lived branches:** If your branch is older than 2 days, something is wrong. Break the work into smaller pieces.
- **"WIP" commits on main:** Never squash-merge a PR with a vague title like "various fixes." Each merge to main should have a clear, conventional commit message.
- **Skipping CI:** Branch protection exists for a reason. Never override it "just this once." That's how production breaks.
- **No reviews for small changes:** Even a one-line fix benefits from a second pair of eyes. The review is about knowledge sharing as much as bug catching.
- **Forgetting to pull:** Always `git pull origin main` before creating a branch. Stale branches cause unnecessary conflicts.

---

## Exercises

1. [Exercise 1 — Set up trunk-based workflow](exercises/01-trunk-based.md)
2. [Exercise 2 — Branch protection rules](exercises/02-branch-protection.md)

**Next stage:** [02-kustomize-overlays](../02-kustomize-overlays/README.md) — base manifests with per-environment overlays.
