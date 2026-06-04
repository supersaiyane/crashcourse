# Stage 3: GitLab CI

**Goal:** Build the same pipeline in GitLab CI — test, build, scan — and compare with GitHub Actions.

**Prerequisites:** Stage 2 complete. A GitLab account (gitlab.com or self-hosted).

---

## 1. Theory (What & Why)

### GitLab CI vs GitHub Actions

| Feature | GitHub Actions | GitLab CI |
|---------|---------------|-----------|
| **Config file** | `.github/workflows/*.yml` | `.gitlab-ci.yml` (single file) |
| **Runners** | GitHub-hosted or self-hosted | Shared or self-hosted |
| **Stages** | Jobs with `needs` | Explicit `stages` array |
| **Artifacts** | `actions/upload-artifact` | Built-in `artifacts:` keyword |
| **Caching** | `actions/cache` | Built-in `cache:` keyword |
| **Container registry** | ghcr.io | Built-in per-project registry |

GitLab CI has more built-in features (caching, artifacts, registry, environments) but GitHub Actions has a larger marketplace of reusable actions.

---

## 2. Hands-On

### 2.1 Review .gitlab-ci.yml

Open `PipelineAPI/.gitlab-ci.yml`. Three stages: test, build, scan — same pipeline logic as GitHub Actions.

### 2.2 Push to GitLab

Mirror the repo to GitLab or push directly. Open CI/CD > Pipelines to watch it run.

### 2.3 Compare with GitHub Actions

Note the differences: single file vs directory, stages keyword, built-in Docker-in-Docker service, allow_failure on scan.

---

## Exercises

1. [Exercise 1 — Run the GitLab pipeline](exercises/01-run-pipeline.md)
2. [Exercise 2 — Add artifacts and caching](exercises/02-artifacts-cache.md)

**Next stage:** [04-jenkins](../04-jenkins/README.md)
