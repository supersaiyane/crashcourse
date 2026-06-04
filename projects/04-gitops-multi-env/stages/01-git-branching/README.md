# Stage 1: Git Branching Strategy

**Goal:** Establish a trunk-based development workflow with branch protection, PR reviews, and conventional commits for the BillFlow billing service.

**Prerequisites:** Git installed. A GitHub account. The BillFlow app running locally.

---

## 1. Theory (What & Why)

### Why trunk-based development?

Long-lived feature branches are where code goes to die. They diverge, conflict, and block releases. Trunk-based development keeps everyone on main with short-lived branches:

- **main is always deployable** — never push broken code directly
- **Feature branches live less than 1 day** — small PRs, fast reviews
- **CI runs on every PR** — tests must pass before merge
- **Linear history** — rebase or squash to keep history clean

### Branch protection

GitHub branch protection rules enforce the workflow: require PR reviews, require status checks to pass, require linear history, restrict force pushes.

### Conventional commits

Use prefixes: feat (new feature), fix (bug fix), docs (documentation), chore (maintenance). The prefix tells you what kind of change without reading the diff.

---

## 2. Hands-On

### 2.1 Initialise the repo

```bash
cd BillFlow/billing-service
git init
git add .
git commit -m "feat: initial BillFlow billing service"
```

### 2.2 Create a feature branch

```bash
git checkout -b feat/add-invoice-endpoint
# Make changes, then commit and push
```

### 2.3 Set up branch protection

Via GitHub UI: Settings, Branches, Add rule for main. Require 1 review and status checks.

---

## Exercises

1. [Exercise 1 — Set up trunk-based workflow](exercises/01-trunk-based.md)
2. [Exercise 2 — Branch protection rules](exercises/02-branch-protection.md)

**Next stage:** [02-kustomize-overlays](../02-kustomize-overlays/README.md)
