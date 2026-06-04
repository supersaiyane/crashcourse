# PROJECT-GUIDE.md — Authoring Guide for Hands-On Lab Projects

> **Read this before building any new project.** This guide defines the quality bar, structure,
> and conventions for every hands-on project in the `projects/` directory. The reference
> implementation is Project 1 (Container Lifecycle / Cutlink). Every new project must be
> indistinguishable in depth, voice, and completeness from that reference.

---

## 0. What a project IS (and isn't)

**Is:** A complete, realistic, buildable application with 5-7 guided stages that take a learner
from zero to a working production-grade setup. Each stage teaches one tool deeply through the
lens of the project's app. The learner should be able to `docker-compose up` the app, work
through every stage, and have something real at the end.

**Isn't:** A collection of loose exercises, a man-page rewrite, a skeleton with TODO comments,
or a thin README pointing elsewhere. If the sample app has 4 files and the READMEs are 60 lines,
it's not a project — it's a sketch.

---

## 1. Directory structure (mandatory, no exceptions)

```text
projects/NN-project-name/
|-- README.md                         <- project overview (see template below)
|-- <AppName>/                        <- the sample application (capitalised, memorable name)
|   |-- <service-dirs>/               <- application source code
|   |   |-- app.py / server.js        <- main application file
|   |   |-- Dockerfile                <- multi-stage (test + production)
|   |   |-- requirements.txt / package.json
|   |   +-- ...
|   |-- docker-compose.yml            <- full local stack (app + dependencies)
|   |-- Makefile                      <- dev/test/build/deploy shortcuts
|   |-- .gitignore
|   |-- .env.example                  <- template for secrets (never real values)
|   |-- tests/                        <- test suite (or test file alongside app)
|   +-- <infra-dirs>/                 <- k8s/, helm/, terraform/, etc.
|       +-- ...
+-- stages/
    |-- 01-stage-name/
    |   |-- README.md                 <- deep teaching document (400-900 lines)
    |   |-- exercises/
    |   |   |-- 01-exercise-name.md   <- guided exercise with steps + expected output
    |   |   |-- 02-exercise-name.md
    |   |   +-- ...
    |   +-- <config-or-manifests>/    <- stage-specific files (optional)
    |       +-- ...
    |-- 02-stage-name/
    |   +-- ...
    +-- NN-stage-name/
        +-- ...
```

### Naming rules

- **Project folder:** `NN-kebab-case` — `01-container-lifecycle`, `04-gitops-multi-env`
- **App folder:** PascalCase, memorable name — `Cutlink`, `FinStack`, `ObservaShop`, `BillFlow`
- **Stage folders:** `NN-kebab-case` matching the tool — `01-linux-foundations`, `03-flux-bootstrap`
- **Exercise files:** `NN-kebab-case.md` — `01-run-first-container.md`, `02-promql-queries.md`

---

## 2. The sample application — quality bar

The app is the heart of the project. It must be:

### Realistic (not a toy)

| Good | Bad |
|------|-----|
| URL shortener with backend + frontend + postgres + redis | "Hello World" API |
| Billing service with subscriptions, invoices, webhooks | Single endpoint that returns "ok" |
| E-commerce with 4 microservices + observability | One Flask file with no dependencies |

### Complete (runnable out of the box)

Every app MUST include:

| File | Purpose | Required? |
|------|---------|-----------|
| **Application source** | The actual code (app.py, server.js, main.go) | Yes |
| **Dockerfile** | Multi-stage: test stage + production stage | Yes |
| **docker-compose.yml** | Full local stack (app + databases + infra) | Yes |
| **Makefile** | Common targets: dev, test, build, run, clean | Yes |
| **Test suite** | Minimum 5 tests covering happy + unhappy paths | Yes |
| **requirements.txt / package.json** | Pinned dependency versions | Yes |
| **.gitignore** | Ignore node_modules, __pycache__, .env, etc. | Yes |
| **.env.example** | Template with placeholder values (never real secrets) | Yes |
| **Health endpoint** | `GET /health` returning `{"status":"ok","version":"X.Y.Z"}` | Yes |
| **Input validation** | At least one endpoint validates input and returns 400 | Yes |

### Infrastructure files (varies by project)

Depending on the project's focus, the app should also include the relevant infrastructure:

| Project type | Infrastructure files |
|-------------|---------------------|
| Container lifecycle | K8s manifests, Helm chart (with multi-env values, templates, hooks) |
| IaC pipeline | Terraform modules, Terragrunt configs, Ansible playbooks, OPA policies |
| Observability | Prometheus config, alert rules, Grafana dashboards, OTel collector config |
| GitOps | Kustomize base + overlays, Flux manifests, Sealed Secret examples, cert-manager CRDs |
| CI/CD | GH Actions workflow, .gitlab-ci.yml, Jenkinsfile, Tekton Tasks/Pipeline |

### File count targets

| Quality level | App files | Stage files | Total |
|--------------|-----------|-------------|-------|
| **Minimum** | 15 | 20 | 35 |
| **Good** | 25 | 30 | 55 |
| **Reference (P1)** | 33 | 48 | 81 |

If your app has fewer than 15 files, it's a sketch, not a project.

---

## 3. Project README.md — template

```markdown
# Project N: <Title>

**App:** <AppName> — one sentence describing the app and its domain

**What you'll build:** 2-3 sentences describing the end state. What will the learner
have when all stages are complete?

**Tier:** Foundation (1-3 years) | Intermediate (3-7 years) | Senior (7+ years)

**Duration:** N-M weeks

**Courses covered:** Tool1, Tool2, Tool3, ...

## Stages

| # | Stage | Course | What you'll do |
|---|-------|--------|---------------|
| 1 | Stage Name | Tool.md | One sentence |
| 2 | ... | ... | ... |

## The app: <AppName>

Description of the app architecture. Include an ASCII diagram:

        +----------+     +----------+
        | Service A| --> | Service B|
        +----------+     +----------+

- **Service A** (language, port) — what it does
- **Service B** (language, port) — what it does

## Getting started

    cd <AppName>
    docker-compose up -d

Then work through stages starting at stages/01-.../README.md.
```

---

## 4. Stage README.md — the teaching document (MOST IMPORTANT SECTION)

This is where the real value lives. Each stage README is a standalone teaching document
that takes a learner from "never used this tool" to "can use it competently with the project's app."

### 4.1 Mandatory arc (in this exact order)

```text
# Stage N: <Tool/Topic Name>

**Goal:** One sentence — what the learner can do after completing this stage.

**Prerequisites:** What must be done/installed before starting.

---

## 1. Theory (What & Why)              <- 150-400 lines

### The problem this tool solves        <- paint the pain FIRST
### How it works                        <- architecture, key concepts, data flow
### Vocabulary table                    <- 6-10 key terms (| Term | Meaning |)
### Comparison table                    <- this tool vs alternatives
### Mental model / analogy              <- one strong analogy

## 2. Hands-On                          <- 200-400 lines

### 2.1 <First task>                    <- numbered, incremental
### 2.2 <Second task>
### 2.3 <Third task>
... (6-10 subsections typical)

## 3. Key patterns                      <- 50-150 lines

### Pattern 1
### Pattern 2
### Pattern 3

## 4. Common mistakes                   <- 30-80 lines

- **Mistake name:** explanation + fix
- **Mistake name:** explanation + fix
... (5-8 mistakes typical)

## Exercises

1. [Exercise 1 — ...](exercises/01-...)
2. [Exercise 2 — ...](exercises/02-...)

**Next stage:** [NN-next-stage](../NN-next-stage/README.md)
```

### 4.2 Section 1: Theory — how to write it

**Start with the PAIN, not the tool.**

```text
BAD:  "Kustomize is a Kubernetes-native configuration management tool."
GOOD: "Picture this: you have a deployment that works in dev. Now you need staging
       and production. The naive approach is copy-paste: 3 environments x 5 files
       = 15 files with 90% duplication..."
```

**Include at least one ASCII diagram per stage:**

```text
+---------------+     GET /metrics     +---------------+
|  Prometheus   | ------------------> |   Your App    |
|  (scraper)    | <------------------ |   (exporter)  |
+------+--------+    metric samples   +---------------+
       |
       v
  +---------+
  |  TSDB   |  <- time-series database (local disk)
  +---------+
```

**Include a vocabulary table (6-10 terms):**

```text
| Term | What it is |
|------|-----------|
| Counter | A metric that only goes up (requests, errors) |
| Gauge | A metric that goes up and down (temperature, queue size) |
| Histogram | Observations sorted into buckets (latency distribution) |
```

**Include a comparison table:**

```text
| Feature | Kustomize | Helm |
|---------|-----------|------|
| Approach | Patch-based | Template-based |
| Learning curve | Lower | Higher |
| Packaging | No | Charts |
```

**Add BFSI-flavoured context where organic:**

```text
"In a banking context, this matters during month-end batch processing when
traffic spikes 10x. The HPA must scale from 3 pods to 30 in minutes —
if your resource requests are wrong, the cluster runs out of capacity and
salary processing fails."
```

### 4.3 Section 2: Hands-On — how to write it

**Every command must be annotated:**

```text
BAD:
    kubectl apply -f deployment.yaml

GOOD:
    kubectl apply -f deployment.yaml    # creates the deployment in the cluster
    # -f = file, can also be a URL or directory
    # kubectl checks if the resource exists: creates if new, updates if existing
```

**Show expected output:**

```text
    kubectl get pods -n billflow-dev
    # NAME                        READY   STATUS    RESTARTS   AGE
    # billflow-7d8f9c6b4-x2k9m   1/1     Running   0          30s
```

**Use the project's app, not generic examples:**

```text
BAD:  docker build -t my-app:latest .
GOOD: docker build -t billflow:local ./billing-service
      # Builds the BillFlow image using the multi-stage Dockerfile
      # Stage 1 runs pytest + ruff; Stage 2 produces the slim production image
```

**End each subsection with confirmation:**

```text
    curl http://localhost:3000/health
    # {"status":"ok","env":"development","version":"1.0.0"}
    # If you see this, the app is running correctly.
```

### 4.4 Section 3: Key patterns

3-5 patterns that production teams use. Short, actionable, with code:

```text
### Squash merge strategy

When merging PRs, use squash merge. This collapses all branch commits
into a single commit on main:

    Branch: "wip", "fix typo", "actually this way"
    Main:   "feat: add subscription validation"

Configure in GitHub: Settings > Pull Requests > Allow squash merging only.
```

### 4.5 Section 4: Common mistakes

Bulleted list. Bold the lead phrase. Include the fix:

```text
- **Forgetting prune: true:** Without it, resources you delete from Git stay
  in the cluster forever. Always set `prune: true` on Flux Kustomizations.

- **Running builds on the controller:** The Jenkins controller should only
  schedule and monitor. Install agents for build execution. Building on the
  controller is a security and stability risk.
```

### 4.6 Line count targets

| Quality level | Lines per stage README |
|--------------|----------------------|
| **Unacceptable** | < 200 |
| **Minimum** | 400 |
| **Good** | 600 |
| **Reference (P1 avg)** | 750-900 |

**If a stage README is under 400 lines, it is not teaching — it is summarising. Rewrite it.**

---

## 5. Exercise files — template and rules

```markdown
# Exercise N: <Title>

**Goal:** One sentence.

## Step 1: <Action>

    command to run
    # annotation explaining what this does

Behind the scenes / what to observe:
- Point 1
- Point 2

## Step 2: <Action>

    command to run

Expected output:

    what they should see

## Step 3: <Action>

...

## Verify

    command to confirm it worked

You should see: <description of success state>
```

### Exercise quality rules

- **Minimum 2-3 exercises per stage** (2 only for synthesis stages like "Comparison")
- Each exercise has **numbered steps with commands**
- Each exercise shows **expected output** for at least one step
- Each exercise ends with a **verification step**
- Exercise names describe the action: `01-run-first-container.md`, not `01-exercise.md`
- **Reference (P1):** exercises are 30-60 lines each, with 3-6 steps

---

## 6. Infrastructure files — what goes where

### Stage-specific config (inside `stages/NN-stage/`)

Files that only make sense in the context of one stage:

```text
stages/03-kubernetes/manifests/       <- K8s YAMLs used only in K8s stage
stages/05-argocd/config/              <- ArgoCD Application CRDs
stages/06-prometheus/config/          <- ServiceMonitor, PrometheusRule
stages/07-grafana/dashboards/         <- Grafana JSON dashboards
```

### App-level infra (inside `<AppName>/`)

Files that are part of the application itself and used across stages:

```text
Cutlink/docker-compose.yml            <- runs the whole app locally
Cutlink/helm/cutlink/                 <- Helm chart (used in Helm + ArgoCD stages)
BillFlow/k8s/base/                    <- Kustomize base (used in Kustomize + Flux stages)
BillFlow/k8s/overlays/                <- per-env overlays
```

### Rule of thumb

If the file would exist in a real production repo --> put it in `<AppName>/`.
If the file only exists for teaching purposes --> put it in `stages/NN-stage/`.

---

## 7. Voice and language

Match the crashcourse voice (defined in root `CLAUDE.md`):

- **Second person, calm, direct, peer-to-peer.** You're an experienced engineer explaining
  to a smart colleague who's new to this tool.
- **Concepts before commands, always.** Lead every section with WHY, then show HOW.
- **Use analogies and mental models.** One strong analogy per stage in the Theory section.
- **Bold the lead phrase** of pitfalls and key rules so they are skimmable.
- **Inline annotate all code.** A command without context is half-useless.
- **No filler, no preamble.** Never write "In this stage we will learn about..."
  Just start teaching.
- **BFSI context where organic.** Salary-day traffic, regulatory deadlines, audit trails,
  compliance. Only when it genuinely illustrates the point.

---

## 8. Labs UI integration checklist

After building the project, register it on the website:

1. Create `docs/data/labs/<project-id>.json` with all stages, exercises, and `appDir`
2. Add the project ID to `LAB_INDEX` array in `docs/js/app.js`
3. Confirm all `readme` paths in the JSON resolve to actual files
4. Test the Labs page: card appears, stages load, exercises link correctly, download works

---

## 9. Quality checklist — the project is DONE when...

### Sample application
- [ ] `docker-compose up -d` starts the full stack with no errors
- [ ] At least 5 tests pass (`make test`)
- [ ] Dockerfile is multi-stage (test + production)
- [ ] Makefile has: dev, test, build, run, clean targets
- [ ] `.env.example` exists with placeholder values
- [ ] `.gitignore` prevents secrets and build artifacts from being committed
- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] At least one endpoint validates input (returns 400)
- [ ] App has 15+ files minimum

### Stage READMEs
- [ ] Every stage README has 400+ lines (750+ for key stages)
- [ ] Theory section explains WHY before HOW with ASCII diagram
- [ ] At least one comparison/vocabulary table per stage
- [ ] Hands-on sections annotate every command and show expected output
- [ ] Commands use the project's app name (not generic `my-app`)
- [ ] Common mistakes are genuinely useful (not filler)
- [ ] Links to exercises and next stage are correct

### Exercises
- [ ] Minimum 2-3 exercises per stage
- [ ] Numbered steps with commands
- [ ] Expected output shown for at least one step
- [ ] Each ends with a verification step

### Labs UI
- [ ] Lab JSON created in `docs/data/labs/`
- [ ] `LAB_INDEX` in `app.js` updated
- [ ] All README paths accessible on GitHub Pages
- [ ] Download link works for the app directory

---

## 10. Reference implementation

**Project 1: Container Lifecycle (Cutlink)** is the gold standard.

- **App:** 33 files — backend (Flask), frontend (HTML/JS/CSS), docker-compose, Helm chart
  with templates/hooks/multi-env values, tests
- **Stages:** 7 READMEs averaging 750+ lines each — deep theory, annotated hands-on,
  ASCII diagrams, comparison tables, BFSI context
- **Exercises:** 2-4 per stage with numbered steps and expected output
- **Stage config:** K8s manifests, ArgoCD applications, Prometheus monitors, Grafana dashboards
- **Total:** 81 files

When in doubt, open a P1 stage README and ask: "Would my README sit next to this without
looking thin?" If not, add more depth.

---

**The mantra:** build a real app with real infra, teach the why before the how in every stage,
show expected output for every command, and never ship a README under 400 lines.
