# Stage 2: GitHub Actions

**Goal:** Build a complete CI pipeline in GitHub Actions — test, build, scan, and deploy PipelineAPI — and understand the concepts that make GitHub Actions the most popular CI system for open-source and small teams.

**Prerequisites:** Stage 1 complete. A GitHub repository with PipelineAPI pushed.

---

## 1. Theory (What & Why)

### Why GitHub Actions?

GitHub Actions is CI/CD built into GitHub — no external service, no webhook configuration, no separate UI. Your pipeline lives next to your code in `.github/workflows/`. For teams already on GitHub, the friction to set up CI is nearly zero.

### Core concepts

| Concept | What it is | Analogy |
|---------|-----------|---------|
| **Workflow** | A YAML file triggered by events (push, PR, schedule, manual) | A recipe: when X happens, do Y |
| **Event** | What triggers the workflow | push, pull_request, schedule, workflow_dispatch |
| **Job** | A set of steps running on a single runner | A stage in your pipeline |
| **Step** | A single command or action within a job | One instruction |
| **Action** | A reusable step from the marketplace | A pre-built tool (checkout, setup-python, docker-build) |
| **Runner** | The machine that executes a job | ubuntu-latest, macos-latest, or self-hosted |
| **Needs** | Job dependency | Pipeline ordering |
| **Matrix** | Run the same job with different parameters | Test on Python 3.10, 3.11, 3.12 simultaneously |
| **Secret** | Encrypted variable available to workflows | DOCKER_PASSWORD, API keys |
| **Artifact** | File produced by one job, consumed by another | Test reports, built images |

### How a workflow executes

```text
Event: push to main
   |
   v
+--------+     needs     +---------+     needs     +--------+
|  test  | ------------> |  build  | ------------> |  scan  |
| (3 min)|               | (2 min) |               | (1 min)|
+--------+               +---------+               +--------+
```

Each job runs on a fresh VM. No state carries over between jobs unless you use artifacts or caching. This ensures isolation.

### Actions marketplace

15,000+ reusable actions:

| Action | What it does |
|--------|-------------|
| `actions/checkout@v4` | Clones your repo |
| `actions/setup-python@v5` | Installs Python |
| `docker/setup-buildx-action@v3` | Sets up Docker Buildx |
| `docker/build-push-action@v5` | Builds and pushes Docker images |
| `aquasecurity/trivy-action@master` | Scans for vulnerabilities |
| `actions/cache@v4` | Caches dependencies between runs |

You do not need to write shell scripts for common tasks. Someone has already built and tested an action for it.

---

## 2. Hands-On: The PipelineAPI Workflow

### 2.1 Review the workflow

Open `PipelineAPI/.github/workflows/ci.yml`:

```yaml
name: PipelineAPI CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install -r api/requirements.txt
      - run: cd api && python -m pytest -v
      - run: cd api && ruff check .

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v5
        with:
          context: ./api
          push: false
          tags: pipelineapi:${{ github.sha }}

  scan:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          scan-ref: ./api
```

Three jobs chained with `needs`. If test fails, build and scan are skipped.

### 2.2 Push and watch

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions pipeline"
git push origin main
```

Open the Actions tab on GitHub. Each job appears as a separate box with expandable logs.

### 2.3 Trigger on a Pull Request

```bash
git checkout -b feat/add-update-endpoint
# Make a change
git add . && git commit -m "feat: add PUT endpoint"
git push -u origin feat/add-update-endpoint
```

Open a PR. The workflow runs automatically. Status checks appear on the PR — green check or red X.

### 2.4 Test failure handling

Break a test intentionally — change `assert r.status_code == 200` to `== 500`. Push. Watch:
- **test** job fails (pytest reports failure)
- **build** job is skipped (grey, never ran)
- **scan** job is skipped

The pipeline stops at the first failure. No wasted compute.

### 2.5 Add caching

pip installs are slow. Cache them:

```yaml
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: 'pip'
          cache-dependency-path: 'api/requirements.txt'
```

First run: cache miss, installs normally (~15s). Second run: cache hit (~2s). Over hundreds of builds, this saves hours.

---

## 3. Key patterns

### Conditional execution

Run deployment only on pushes to main (not on PRs):

```yaml
  deploy:
    needs: scan
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - run: echo "Deploying..."
```

### Matrix builds

Test across multiple Python versions simultaneously:

```yaml
  test:
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12"]
    steps:
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
```

Three parallel jobs, one per version. If any fails, the whole matrix fails.

### Secrets

Store sensitive values in Settings > Secrets:

```yaml
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
```

Secrets are masked in logs and not available to forks.

### Reusable workflows

Extract common logic:

```yaml
# .github/workflows/reusable-test.yml
on:
  workflow_call:
    inputs:
      python-version:
        type: string
        default: "3.11"
```

Call from another workflow: `uses: ./.github/workflows/reusable-test.yml`

---

## 4. Cost and limits

| Tier | Minutes/month | Notes |
|------|---------------|-------|
| **Free** | 2,000 min (Linux) | Public repos: unlimited free |
| **Team** | 3,000 min | Larger runners available |
| **Enterprise** | 50,000 min | Self-hosted runners |

PipelineAPI takes ~6 minutes per run. At 10 builds/day: 1,800 min/month — fits in free tier.

---

## 5. Common mistakes

- **Not using `needs`:** Without dependencies, all jobs run in parallel — build runs before test finishes.
- **Hardcoded secrets:** Never put API keys in YAML. Use GitHub Secrets.
- **No caching:** Reinstalling deps on every run wastes 30-60 seconds per build.
- **Running on every branch:** Use `branches: [main]` and `pull_request` to limit CI runs.
- **Not pinning action versions:** `uses: actions/checkout@main` can break. Pin to `@v4`.
- **Ignoring scan failures:** `continue-on-error: true` on security scans means you ship known vulnerabilities.

---

## Exercises

1. [Exercise 1 — Run the workflow](exercises/01-run-workflow.md)
2. [Exercise 2 — Add deployment step](exercises/02-add-deploy.md)

**Next stage:** [03-gitlab-ci](../03-gitlab-ci/README.md) — the same pipeline in GitLab CI.
