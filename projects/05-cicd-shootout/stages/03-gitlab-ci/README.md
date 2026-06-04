# Stage 3: GitLab CI

**Goal:** Build the same pipeline in GitLab CI — test, build, scan — and understand how it compares to GitHub Actions in structure, features, and developer experience.

**Prerequisites:** Stage 2 complete. A GitLab account (gitlab.com or self-hosted).

---

## 1. Theory (What & Why)

### GitLab CI at a glance

GitLab CI is the CI/CD system built into GitLab. Like GitHub Actions, it is tightly integrated with the Git platform. Unlike GitHub Actions, everything lives in a single file (`.gitlab-ci.yml`) and GitLab provides more built-in features (caching, artifacts, container registry, environments) without needing marketplace plugins.

### Core concepts

| Concept | What it is | GitHub Actions equivalent |
|---------|-----------|--------------------------|
| **Pipeline** | A full CI run triggered by an event | Workflow |
| **Stage** | A phase of the pipeline (test, build, deploy) | No direct equiv (uses `needs`) |
| **Job** | A unit of work within a stage | Job |
| **Runner** | Machine that executes jobs | Runner |
| **Artifacts** | Files passed between jobs (built-in) | `actions/upload-artifact` |
| **Cache** | Dependencies cached between pipelines (built-in) | `actions/cache` |
| **Variables** | Environment variables (masked, protected) | Secrets |
| **Services** | Sidecar containers (Docker-in-Docker, postgres) | No direct equiv |

### The key difference: stages vs needs

GitHub Actions chains jobs with `needs` (a dependency graph). GitLab CI uses an ordered list of `stages`:

```yaml
stages:
  - test      # all test jobs run first
  - build     # all build jobs run after ALL test jobs pass
  - scan      # all scan jobs run after ALL build jobs pass
```

Within a stage, jobs run in parallel. Between stages, jobs run sequentially. Simpler to reason about but less flexible.

### GitLab CI vs GitHub Actions

| Feature | GitHub Actions | GitLab CI |
|---------|---------------|-----------|
| **Config file** | `.github/workflows/*.yml` (multiple) | `.gitlab-ci.yml` (single) |
| **Stages** | Implicit via `needs` | Explicit `stages:` array |
| **Runners** | GitHub-hosted or self-hosted | Shared (gitlab.com) or self-hosted |
| **Artifacts** | Requires action | Built-in `artifacts:` keyword |
| **Caching** | Requires action | Built-in `cache:` keyword |
| **Container registry** | ghcr.io (separate) | Built-in per-project registry |
| **Environments** | GitHub Environments | Built-in with deploy boards |
| **Local testing** | `act` (third-party, limited) | `gitlab-runner exec` (official) |
| **Marketplace** | 15,000+ actions | Templates + includes |

### When GitLab CI wins

- **Built-in features:** Caching, artifacts, registry work out of the box
- **Single file:** Easier to manage than multiple workflow files
- **Self-hosted runners:** GitLab Runner is simpler to install and manage
- **Pipeline includes:** Pull shared CI templates from other repos
- **Container registry:** Every project gets `registry.gitlab.com/user/project` automatically

---

## 2. Hands-On: PipelineAPI on GitLab CI

### 2.1 Review .gitlab-ci.yml

```yaml
stages:
  - test
  - build
  - scan

variables:
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.pip-cache"

test:
  stage: test
  image: python:3.11-slim
  cache:
    paths: [.pip-cache/]
  script:
    - pip install -r api/requirements.txt
    - cd api && python -m pytest -v
    - cd api && ruff check .

build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker build -t pipelineapi:$CI_COMMIT_SHA ./api

scan:
  stage: scan
  image: aquasec/trivy:latest
  script:
    - trivy fs --severity HIGH,CRITICAL ./api
  allow_failure: true
```

Compare with GitHub Actions:
- **Stages are explicit** — `stages: [test, build, scan]`
- **Images are per-job** — each job specifies its Docker image
- **Cache is built-in** — just `cache: paths:`, no action needed
- **Docker-in-Docker** — build job uses `services: [docker:24-dind]`
- **allow_failure** — scan can fail without blocking (use cautiously)

### 2.2 Push to GitLab

```bash
git remote add gitlab https://gitlab.com/<your-user>/pipelineapi.git
git push gitlab main
```

### 2.3 Watch the pipeline

Open **CI/CD > Pipelines**. Three stages visualised as a graph:

```text
[test] --> [build] --> [scan]
  OK         OK         OK
```

Click any job for logs.

### 2.4 Compare execution with GitHub Actions

Run both on the same commit. Note:
- **Setup time:** GitLab shared runners may queue longer
- **Cache:** GitLab built-in cache is often faster (stored closer to runner)
- **Docker build:** GitLab DinD adds ~30s overhead vs GitHub Buildx

### 2.5 Use the built-in container registry

```yaml
build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA ./api
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
```

`$CI_REGISTRY_IMAGE` = `registry.gitlab.com/your-user/pipelineapi`. No Docker Hub needed.

---

## 3. Key patterns

### Pipeline includes

Share CI templates across projects:

```yaml
include:
  - project: 'devops/ci-templates'
    ref: main
    file: '/python-test.yml'
```

When the template updates, all projects that include it get the update automatically.

### Rules (modern conditional execution)

```yaml
deploy:
  stage: deploy
  script: ./deploy.sh
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      when: always
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      when: never
```

### Environments and deploy boards

```yaml
deploy-staging:
  stage: deploy
  environment:
    name: staging
    url: https://staging.example.com
  script: ./deploy.sh staging
```

GitLab tracks deployments per environment with rollback buttons.

### JUnit test reports

```yaml
test:
  script:
    - cd api && python -m pytest --junitxml=report.xml
  artifacts:
    reports:
      junit: api/report.xml
```

GitLab parses JUnit XML and shows results directly on the merge request.

---

## 4. Common mistakes

- **Forgetting Docker-in-Docker:** Build job needs `services: [docker:24-dind]`. Without it, docker commands fail.
- **Not using built-in cache:** Many teams reinstall deps from scratch every run. Use `cache:`.
- **allow_failure on security scans:** Means you ship known vulnerabilities. Use only for advisory scans.
- **Huge .gitlab-ci.yml:** Use `include:` to split into manageable pieces.
- **Not using `$CI_REGISTRY`:** Pushing to Docker Hub needs extra credentials. Built-in registry is free.

---

## Exercises

1. [Exercise 1 — Run the GitLab pipeline](exercises/01-run-pipeline.md)
2. [Exercise 2 — Add artifacts and caching](exercises/02-artifacts-cache.md)

**Next stage:** [04-jenkins](../04-jenkins/README.md) — the same pipeline in Jenkins.
