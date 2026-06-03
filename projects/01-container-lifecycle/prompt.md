# Prompt Recipe: Complete Educational Course with Full-Stack Sample App

Use this prompt to reproduce the methodology behind **Container Lifecycle Course** — a multi-stage, hands-on educational course built around a single production-grade sample app.

---

## 1. Core Concept

```
Build a [TOPIC] course that teaches novices the complete [SUBJECT] lifecycle,
using a production-grade [SAMPLE APP] from zero to production monitoring.
```

**Example:** "Build a container lifecycle course that teaches novices the complete container lifecycle from Linux foundations through Grafana dashboards, using a production-grade URL shortener called Cutlink."

---

## 2. Sample App Requirements

The app must be:

- **Simple enough for a novice** — a single developer can understand every line
- **Complex enough to be realistic** — exercises all production concerns:
  - Stateless API (backend)
  - Stateful database (PostgreSQL)
  - Cache layer (Redis)
  - Frontend proxy (Nginx)
  - Custom metrics (Prometheus endpoint)
- **Runnable with a single `docker compose up`**
- **Usable in every single stage** — the same app evolves across the entire course

### Recipe

```
A [STACK] [APP TYPE] with:
- Backend: [language/framework] (REST endpoints, [features])
- Frontend: [server] serving [type] (static UI, proxies to backend)
- Database: [DB] ([purpose])
- Cache: [tool] ([purpose])
```

**Example:** "Cutlink is a URL shortener with: Backend — Python/Flask API (REST endpoints, Prometheus metrics, DB migrations). Frontend — Nginx serving static HTML/JS. Database — PostgreSQL (URL storage, click tracking). Cache — Redis (hot URL caching, deduplication)."

---

## 3. Sample App Structure

```
sample-app/
├── backend/
│   ├── app.py              ← main application (Flask/FastAPI/Express etc.)
│   ├── Dockerfile           ← multi-stage build
│   └── requirements.txt     ← dependencies
├── frontend/
│   ├── Dockerfile           ← nginx-alpine based
│   ├── nginx.conf           ← reverse proxy config
│   ├── index.html           ← UI
│   ├── style.css            ← styling
│   └── app.js               ← client logic
├── docker-compose.yml       ← single-command local run
├── helm/
│   └── <app-name>/          ← Helm chart (templates, values, Chart.yaml)
└── tests/
    └── test_app.py          ← test suite
```

**Key rules:**
- `docker-compose.yml` configures all services (db, cache, backend, frontend)
- Backend Dockerfile uses **multi-stage** builds (teach from day one)
- Frontend Dockerfile uses **nginx:alpine** (smallest surface area)
- Helm chart has **multi-environment values** (`values-dev.yaml`, `values-prod.yaml`)
- k8s/ directory exists for manifests (can be empty initially, populated during K8s stage)

---

## 4. Curriculum Design

### Stage Selection

Choose topics that form a **linear dependency chain** — each stage builds on the previous:

```
[Stage 1: Foundations] → [Stage 2: Core Tool] → [Stage 3: Orchestrator] →
[Stage 4: Templating] → [Stage 5: GitOps] → [Stage 6: Monitoring] → [Stage 7: Visualization]
```

**Example chain:**
```
Linux Foundations → Docker → Kubernetes → Helm → ArgoCD → Prometheus → Grafana
```

### Stage Structure

```
stages/XX-topic/
├── README.md              ← Full theory + step-by-step exercises + inline solutions at bottom
├── manifests/             ← K8s YAML configs for this stage
├── config/                ← Config files (ArgoCD apps, Prometheus rules, dashboards)
└── exercises/
    ├── 01-first-exercise.md
    ├── 02-second-exercise.md
    └── ...
```

### What Every Stage README Must Contain

| Section | Content |
|---------|---------|
| **Title + Tagline** | "Stage X: Topic — one-line what this does" |
| **Theory** | What it is, why it matters, how it works |
| **Why This Matters for the Next Stage** | Bridge to the next topic |
| **Hands-on Exercises** | 3-4 step-by-step exercises with expected output |
| **Inline Solutions** | Full commands and explanations at the bottom of the README |
| **Code/Manifests** | Separate files in `manifests/` or `config/` with inline comments |

---

## 5. Exercise Design

### Principles

- **Exercises go in `exercises/` folder** — separate markdown files per exercise
- **Solutions stay inline** in the README (no separate `solutions/` directories)
- Each exercise is a single markdown file with:
  - Goal
  - Step-by-step instructions
  - Expected output snippets
  - Questions to reinforce learning
- 3-4 exercises per stage

### Exercise Naming

```
exercises/
├── 01-first-concept.md
├── 02-second-concept.md
├── 03-third-concept.md
└── 04-advanced-concept.md    ← optional
```

---

## 6. File & Manifest Design Rules

- **Every YAML file has inline comments** explaining each field — novices must understand every line
- **Every Dockerfile is multi-stage** — teach optimization from the start
- **Helm charts have multi-environment values** — dev, staging, production
- **All exercises reference the same sample app** — Cutlink appears identically in every stage

---

## 7. Diagram/Asset Guidelines

```
assets/
├── architecture.png
├── <app>-screenshot.png
├── demo/
└── topology/
```

- Use ASCII architecture diagrams in READMEs (no external tool dependency)
- Place real screenshots in `assets/`

---

## 8. README Structure (Root)

```
1. Title + Tagline
2. What You'll Build (ASCII architecture overview)
3. Project Structure — show how sample-app/, stages/, assets/ correlate
4. The App — describe sample app components
5. Correlation Map — table: every stage × which sample-app/ file it touches
6. Curriculum Table — stage links, topics, duration
7. How Each Stage Is Structured — explain the directory layout
8. Prerequisites
9. Quick Start — run the sample app now
10. Architecture Diagram
11. Learning Philosophy
```

---

## 9. Learning Philosophy (Reusable)

1. **Understand, don't memorize** — Every command is explained. If you understand *why* it works, you don't need to memorize it.
2. **Type everything** — No copy-paste. Typing builds muscle memory.
3. **Break things on purpose** — Kill pods, delete namespaces, roll back. Production experience comes from recovery.
4. **One production app** — The same app follows the student through every stage.

---

## 10. Full Prompt Template

Copy and paste this, then replace the bracketed sections:

```
Build a complete educational course teaching novices the full [TOPIC]
lifecycle from [FOUNDATION] through [FINAL TOOL], using a production-grade
[SAMPLE APP TYPE] called [APP NAME].

## Sample App

Create a [STACK] [APP TYPE] with:
- Backend: [language/framework] (REST endpoints, [features])
- Frontend: [server] serving [type]
- Database: [DB] ([purpose])
- Cache: [tool] ([purpose])

The app must run with a single `docker compose up` and be referenced
in every learning stage.

## Curriculum

Create 7 sequential stages:

| # | Topic | What They'll Learn |
|---|-------|-------------------|
| 01 | [Foundation] | [details] |
| 02 | [Core Tool] | [details] |
| 03 | [Orchestrator] | [details] |
| 04 | [Templating] | [details] |
| 05 | [GitOps/CI] | [details] |
| 06 | [Monitoring] | [details] |
| 07 | [Visualization] | [details] |

## Structure Rules

- Sample app code lives in sample-app/
- Course stages live in stages/XX-topic/
- Each stage has: README.md, manifests/ (or config/), exercises/
- Exercises are separate files in exercises/ folder
- Solutions are inline at the bottom of each stage's README (NOT in solutions/)
- No empty directories
- Every YAML file has inline comments explaining every field
- Every Dockerfile uses multi-stage builds
- Helm charts have multi-environment values files
- Root README.md ties everything together with a correlation map
- Learning philosophy: understand don't memorize, type everything, break things on purpose, one app across all stages
```

---

## 11. What Made This Work

| Decision | Why |
|----------|-----|
| **One app across all stages** | Student builds familiarity — no context switching between examples |
| **Multi-service sample app** | Exercises real concerns (stateful, stateless, proxy, metrics) without being overwhelming |
| **Exercises in separate files** | Cleaner README, printable worksheets, easy to assign individually |
| **Solutions inline in README** | No separate directory to maintain, easy to check during self-study |
| **Inline YAML comments** | Novices understand every field without googling |
| **Multi-stage Dockerfiles from day 1** | Builds good habits immediately |
| **ASCII diagrams only** | No external image tool dependency, renders in any terminal |
| **kind for K8s** | Runs on a laptop, no cloud costs, multi-node capable |
