# GitLab CI/CD — A 2-Day Crash Course

> **In one sentence:** GitLab CI/CD runs your build/test/deploy pipeline from a single
> `.gitlab-ci.yml` file in your repo — GitLab reads it on every push and executes the jobs on
> "runners," organized into sequential stages.

> Same core idea as GitHub Actions (see `GitHub-Actions.md`); this leads with GitLab's model and
> the differences.

---

## Part 0 — Why GitLab CI, and its mental model

GitLab pioneered putting CI/CD *inside* the same platform as your Git repo, issues, and registry.
The whole pipeline lives in one file at the repo root: **`.gitlab-ci.yml`**. Push code, and
GitLab's runners execute it. Because everything (code, CI, container registry, environments,
review apps) is one product, GitLab CI is especially strong for end-to-end DevOps in one place.

**The organizing concept is the stage→job pipeline:**
- You define ordered **stages** (e.g. `build → test → deploy`).
- Each **job** belongs to a stage.
- Jobs in the *same* stage run **in parallel**; the pipeline only advances to the next stage when
  *all* jobs in the current stage pass.
This gives a clear left-to-right pipeline you can watch in the UI: a column per stage, jobs
stacked within it.

**Mental model:** `.gitlab-ci.yml` defines a conveyor belt of stages. Each stage is a checkpoint:
all its jobs must pass before the belt moves to the next stage. A job is a script that runs on a
fresh runner in a chosen Docker image.

---

## Part 1 — The vocabulary

| Term | Meaning |
|------|---------|
| **Pipeline** | The whole run, triggered by a push/MR/schedule |
| **Stage** | An ordered phase; jobs in it run in parallel |
| **Job** | A unit of work (a `script:`) assigned to a stage |
| **Runner** | The agent that executes jobs (GitLab-hosted or self-managed) |
| **Image** | The Docker image a job runs inside (`image: node:20`) |
| **Artifact** | Files a job produces and passes to later jobs / downloads |
| **Cache** | Reused files across runs to speed jobs (dependencies) |

---

## DAY 1 — Get it working

### 1. Your first pipeline
Create `.gitlab-ci.yml` at the repo root:
```yaml
stages:                 # define the order
  - build
  - test
  - deploy

build-job:
  stage: build
  image: node:20        # the Docker image this job runs in
  script:               # the commands (this is the job's body)
    - npm ci
    - npm run build
  artifacts:
    paths: [dist/]      # pass dist/ to later stages

test-job:
  stage: test
  image: node:20
  script:
    - npm ci
    - npm test

deploy-job:
  stage: deploy
  script:
    - ./deploy.sh
  rules:
    - if: $CI_COMMIT_BRANCH == "main"    # only deploy from main
```
Commit and push. **Build → Pipelines** shows the run as columns (build, test, deploy), advancing
stage by stage. That's a working pipeline.

### 2. Read the structure
- Every job needs a **`script:`** (the commands) and usually a **`stage:`** (defaults to `test` if
  omitted) and an **`image:`** (the container it runs in — pick one with your toolchain).
- Jobs in the **same stage run in parallel**; the next stage waits for the current one to fully
  pass.
- Each job runs in a **fresh container** — no shared filesystem between jobs except via
  `artifacts`/`cache`.
- The top-level **`stages:`** list defines the order. Jobs reference a stage by name.

### 3. `rules:` — when a job runs (the modern control)
`rules:` decides whether and when each job is created:
```yaml
deploy-prod:
  stage: deploy
  script: [ ./deploy.sh prod ]
  rules:
    - if: $CI_COMMIT_BRANCH == "main"           # auto on main
      when: manual                               # ...but require a manual click
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      when: never                                # never on MRs
```
`when: manual` creates a "play" button — the standard way to gate production deploys behind a
human click. (Older pipelines used `only:`/`except:`; `rules:` is the current, more powerful way.)

### 4. Predefined variables (GitLab gives you context)
```
$CI_COMMIT_BRANCH   $CI_COMMIT_SHA   $CI_COMMIT_TAG
$CI_PIPELINE_SOURCE (push / merge_request_event / schedule / web)
$CI_PROJECT_PATH    $CI_REGISTRY     $CI_REGISTRY_IMAGE   $CI_JOB_TOKEN
$CI_ENVIRONMENT_NAME   $GITLAB_USER_LOGIN
```
These power your `rules:` conditions and scripts without any setup.

**By end of Day 1 you can:** define stages, write jobs with images and scripts, pass artifacts,
and gate jobs with `rules:`/`when: manual`. That's a real CI/CD pipeline.

---

## DAY 2 — Make it real

### 1. CI/CD variables & secrets
Set variables in **Settings → CI/CD → Variables** (mark them **Masked** and **Protected**), then
use them as env vars in scripts:
```yaml
deploy:
  script:
    - echo "$DEPLOY_TOKEN" | docker login -u ci --password-stdin $CI_REGISTRY
```
> For secrets: use Masked + Protected CI/CD variables (or GitLab's integration with Vault) — never
> commit them to `.gitlab-ci.yml`. (Ties to your plaintext-secrets habit — keep them in the
> Variables UI / Vault.)

### 2. Caching vs artifacts (know the difference)
- **`cache:`** — speeds up jobs by reusing files (like `node_modules`) *across pipeline runs*.
  Best-effort; not guaranteed.
- **`artifacts:`** — outputs a job *produces* (build output, test reports) passed to *later jobs*
  in the same pipeline and downloadable from the UI.
```yaml
build:
  cache:
    key: { files: [package-lock.json] }
    paths: [node_modules/]
  artifacts:
    paths: [dist/]
    reports:
      junit: report.xml          # GitLab renders test results in the MR
    expire_in: 1 week
```

### 3. Build & push a container (using GitLab's built-in registry)
Every GitLab project has a Container Registry, and `$CI_JOB_TOKEN` authenticates automatically:
```yaml
build-image:
  stage: build
  image: docker:27
  services: [docker:27-dind]      # docker-in-docker, to run docker inside the job
  script:
    - docker login -u "$CI_REGISTRY_USER" -p "$CI_JOB_TOKEN" $CI_REGISTRY
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
```

### 4. Environments & deployments (track what's where)
Declare **environments** so GitLab tracks deployments and offers rollback:
```yaml
deploy-prod:
  stage: deploy
  script: [ ./deploy.sh prod ]
  environment:
    name: production
    url: https://app.example.com
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      when: manual                 # human approval gate
```
The **Operate → Environments** page then shows current/previous deployments with a re-deploy
button. Combined with **Protected Environments**, you get approval controls for prod.

### 5. DRY pipelines — templates, `extends`, `include`
```yaml
.base-test: &base                  # a hidden template job (starts with a dot)
  image: node:20
  before_script: [ npm ci ]

test:unit:
  extends: .base-test              # inherit from the template
  script: [ npm run test:unit ]

include:
  - local: '/ci/deploy.yml'        # split big pipelines across files
  - template: 'Security/SAST.gitlab-ci.yml'   # GitLab's built-in security scanners
```
`extends`, hidden jobs (`.name`), and `include` keep large pipelines maintainable. GitLab also
ships ready-made templates (SAST, dependency scanning, container scanning) you `include` in one
line — a strong built-in security story.

### 6. Pipeline efficiency: `needs:` (DAG) and parallel
By default a stage waits for the whole previous stage. **`needs:`** lets a job start as soon as
its specific dependencies finish, turning the pipeline into a faster DAG:
```yaml
deploy:
  needs: [build-image, test:unit]  # start when these finish, not the whole test stage
```
`parallel: 5` splits a job into 5 parallel instances for test sharding.

---

## Worked example — test, build image, manual prod deploy
```text
1. stages: [test, build, deploy].
2. test:unit + test:lint run in parallel in the test stage (image: node:20), cache node_modules.
3. build-image (docker-in-docker) builds + pushes $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA.
4. deploy-staging: auto on main, environment: staging.
5. deploy-prod: environment: production, rules -> if main, when: manual (a "play" button).
6. include the SAST template for free security scanning on every pipeline.
```

---

## Common pitfalls
- **Expecting jobs to share a filesystem.** Each job is a fresh container. Pass data with
  `artifacts:`; speed up with `cache:` — and don't confuse the two.
- **No `image:`.** Jobs run in whatever the runner defaults to; always set `image:` to control the
  toolchain.
- **Secrets in `.gitlab-ci.yml`.** Use Masked/Protected CI/CD variables or Vault.
- **`when: manual` forgotten on prod.** Without it, a merge to main auto-deploys to production.
- **Slow pipelines from strict stages.** Use `needs:` to let independent jobs start early.
- **docker build without dind/buildkit setup.** Building images needs the `docker:dind` service
  or a configured runner — otherwise "cannot connect to the Docker daemon."
- **`rules:` order matters.** The *first* matching rule wins; put specific rules before general
  ones.

---

## Quick reference
```yaml
# Top-level keys
stages: [build, test, deploy]
variables: { KEY: value }
default: { image: node:20, before_script: [npm ci] }
include: [ { local: ci/x.yml }, { template: Security/SAST.gitlab-ci.yml } ]

# Job keys
job-name:
  stage: test
  image: node:20
  services: [docker:dind]
  variables: { K: v }
  before_script: [...]      script: [...]      after_script: [...]
  cache:     { key: ..., paths: [...] }
  artifacts: { paths: [...], reports: { junit: r.xml }, expire_in: 1 week }
  needs: [other-job]         # DAG: start early
  parallel: 5                # shard into N
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      when: manual           # on_success | manual | always | never | delayed
  environment: { name: production, url: https://... }
  extends: .template
  tags: [linux]              # pick runners by tag
```
```text
Key predefined vars: $CI_COMMIT_BRANCH $CI_COMMIT_SHA $CI_COMMIT_TAG
  $CI_PIPELINE_SOURCE $CI_REGISTRY $CI_REGISTRY_IMAGE $CI_JOB_TOKEN $CI_ENVIRONMENT_NAME
```

---

## Top 10 Interview Questions

<details>
<summary><strong>Q: How do stages and jobs relate in a GitLab CI pipeline?</strong></summary>

Stages define ordered phases (build, test, deploy). Each job belongs to a stage. Jobs in the same stage run in parallel; the pipeline advances to the next stage only when all jobs in the current stage pass. This gives a clear left-to-right flow you can monitor in the GitLab UI.

</details>

<details>
<summary><strong>Q: What is the difference between artifacts and cache?</strong></summary>

Artifacts are outputs a job produces (build files, test reports) that are passed to later jobs in the same pipeline and downloadable from the UI. Cache is a best-effort mechanism for reusing files (like `node_modules`) across pipeline runs to speed things up. Artifacts are guaranteed; cache is not.

</details>

<details>
<summary><strong>Q: How do you gate a production deployment behind a manual approval?</strong></summary>

Add `when: manual` to the deploy job's `rules:` block. This creates a "play" button in the GitLab UI — the pipeline pauses at that job until someone clicks it. Combine with Protected Environments to restrict who can trigger the deploy to specific roles or users.

</details>

<details>
<summary><strong>Q: How should secrets be handled in GitLab CI?</strong></summary>

Store them as CI/CD Variables in Settings, marked as Masked (hidden in logs) and Protected (only available on protected branches). For more sensitive credentials, integrate with HashiCorp Vault. Never commit secrets to `.gitlab-ci.yml` or any file in the repository.

</details>

<details>
<summary><strong>Q: What are GitLab runners, and when would you use self-managed runners?</strong></summary>

Runners are the agents that execute jobs. GitLab provides shared runners on gitlab.com. Self-managed runners are ones you host yourself — you use them when you need access to private networks, special hardware (GPUs), compliance-driven infrastructure, or when shared runner capacity is insufficient.

</details>

<details>
<summary><strong>Q: How does the `needs:` keyword improve pipeline performance?</strong></summary>

By default, a stage waits for all jobs in the previous stage to finish. `needs:` creates a DAG (directed acyclic graph) — a job starts as soon as its specific dependencies finish, regardless of other jobs in the previous stage. This can dramatically reduce total pipeline duration for pipelines with independent job paths.

</details>

<details>
<summary><strong>Q: How would you build and push a Docker image using GitLab CI?</strong></summary>

Use a `docker:27` image with a `docker:27-dind` service. Authenticate to the built-in Container Registry with `$CI_REGISTRY_USER` and `$CI_JOB_TOKEN` (provided automatically by GitLab), then run `docker build` and `docker push`. Tag the image with `$CI_COMMIT_SHA` for traceability.

</details>

<details>
<summary><strong>Q: What are `rules:` and why are they preferred over `only:`/`except:`?</strong></summary>

`rules:` is the current, more powerful mechanism for controlling when a job runs. It evaluates conditions in order — the first matching rule wins. It supports `if`, `changes`, `exists`, and `when` in combination. `only:`/`except:` is the legacy approach with less flexibility and harder-to-predict behaviour in complex pipelines.

</details>

<details>
<summary><strong>Q: How do you keep large GitLab CI configurations maintainable?</strong></summary>

Use `include:` to split pipelines across multiple files, hidden template jobs (names starting with `.`) combined with `extends:` for inheritance, and `default:` for shared settings like `image` and `before_script`. GitLab also ships ready-made templates for SAST, dependency scanning, and container scanning that you include in one line.

</details>

<details>
<summary><strong>Q: How does GitLab CI compare to GitHub Actions?</strong></summary>

Both are CI/CD-as-code triggered by Git events. GitLab CI uses a stage-based model (ordered stages, parallel jobs within a stage), while Actions uses independent workflow jobs with explicit `needs` dependencies. GitLab's advantage is the integrated platform (registry, environments, review apps, security scanners in one product). Actions' advantage is the larger marketplace of community actions and tighter GitHub integration.

</details>

---

## Next steps after Day 2
- **Parent-child & multi-project pipelines** for monorepos and cross-repo orchestration.
- **Review Apps** (ephemeral environments per merge request) — a GitLab signature feature.
- **Auto DevOps** and the built-in security scanners (SAST/DAST/dependency/container).
- Pair with **Argo CD** for GitOps, or deploy straight to Kubernetes via the GitLab agent.

**The mantra:** one `.gitlab-ci.yml`, ordered stages, parallel jobs within a stage, fresh
container per job. Pass data via artifacts, speed via cache and `needs:`, gate prod with
`when: manual`, and keep secrets in CI/CD variables.
