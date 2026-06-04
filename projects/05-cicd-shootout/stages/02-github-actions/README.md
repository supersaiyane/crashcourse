# Stage 2: GitHub Actions

**Goal:** Build a complete CI pipeline in GitHub Actions — test, build, scan, and deploy the PipelineAPI.

**Prerequisites:** Stage 1 complete. A GitHub repository.

---

## 1. Theory (What & Why)

### Why GitHub Actions?

GitHub Actions is CI/CD built into GitHub — no external service, no webhook configuration, no separate UI. Your pipeline lives next to your code in `.github/workflows/`.

### Key concepts

| Concept | What it is |
|---------|-----------|
| **Workflow** | A YAML file triggered by events (push, PR, schedule) |
| **Job** | A set of steps running on a runner (ubuntu-latest, self-hosted) |
| **Step** | A single command or action |
| **Action** | A reusable step (checkout, setup-python, docker/build-push) |
| **Needs** | Job dependency — build needs test to pass first |

### The PipelineAPI workflow

```yaml
test → build → scan
```

Three jobs, chained with `needs`. If test fails, build and scan are skipped.

---

## 2. Hands-On

### 2.1 Review the workflow

Open `PipelineAPI/.github/workflows/ci.yml`. It defines three jobs: test (pytest + ruff), build (Docker), scan (Trivy).

### 2.2 Push and watch

Push to GitHub and open the Actions tab. You'll see the workflow running — each job as a separate box with logs.

### 2.3 Trigger on PR

Create a branch, push a change, open a PR. The workflow runs on the PR — status checks appear on the PR page.

---

## Exercises

1. [Exercise 1 — Run the workflow](exercises/01-run-workflow.md)
2. [Exercise 2 — Add deployment step](exercises/02-add-deploy.md)

**Next stage:** [03-gitlab-ci](../03-gitlab-ci/README.md)
