# Container Lifecycle Course

**From zero to production: deploy a full-stack app on Kubernetes with GitOps and observability.**

This course teaches the complete container lifecycle — building, shipping, running, orchestrating, deploying, and monitoring — using a real production-grade URL shortener called **Cutlink**.

## What You'll Build

```
Your Laptop                       Production Cluster
┌──────────────┐    ┌─────────────────────────────────────┐
│  docker build │───▶│  K8s (kind → production)           │
│  docker push  │    │  ├── Deployments + Services        │
│  helm package │    │  ├── Ingress + TLS                 │
│  git push     │    │  ├── HPA autoscaling               │
└──────────────┘    │  ├── NetworkPolicies               │
                    │  └── Resource limits                │
                    ├─────────────────────────────────────┤
                    │  ArgoCD (GitOps)                    │
                    │  ├── Auto-sync from git             │
                    │  ├── Self-healing                   │
                    │  └── Sync waves                     │
                    ├─────────────────────────────────────┤
                    │  Prometheus + Grafana               │
                    │  ├── Metrics collection             │
                    │  ├── Custom alerts                  │
                    │  ├── SLO dashboards                 │
                    │  └── ServiceMonitors                │
                    └─────────────────────────────────────┘
```

## Project Structure

```
container-lifecycle-course/
├── README.md          ← this file — course map
├── sample-app/        ← CUTLINK: the app you deploy in every stage
│   ├── backend/       ← Flask API + Dockerfile + requirements.txt
│   ├── frontend/      ← Nginx + HTML/CSS/JS + Dockerfile
│   ├── docker-compose.yml ← local dev (Stage 2)
│   ├── helm/cutlink/        ← Helm chart (Stage 4)
│   ├── k8s/                 ← K8s manifests (placeholder)
│   └── tests/               ← Pytest suite
│
├── stages/            ← 7 learning stages (01 → 07)
│   ├── 01-linux-foundations/
│   ├── 02-docker/
│   ├── 03-kubernetes/
│   ├── 04-helm/
│   ├── 05-argocd/
│   ├── 06-prometheus/
│   └── 07-grafana/
│
└── assets/            ← diagrams & images for the course
```

---

## The App: Cutlink

Cutlink is a URL shortener with:

| Component | Technology | Role | Stage Introduced |
|-----------|-----------|------|-----------------|
| Backend API | Python/Flask, Gunicorn | REST endpoints, metrics, DB migrations | Stage 2 |
| Frontend | Nginx, HTML/CSS/JS | Static UI, proxies `/api/*` to backend | Stage 2 |
| Database | PostgreSQL 16 | URL storage, click tracking | Stage 2 |
| Cache | Redis 7 | Hot URL cache, dedup | Stage 2 |

It has enough complexity to be realistic but is small enough for a single developer to fully understand.

---

## How sample-app, stages, and assets correlate

Every stage works with **the same app** — Cutlink. The table below shows exactly which file in `sample-app/` each stage touches and what asset describes it.

### Correlation Map

| Stage | sample-app/ File Touched | What You Do With It | Related Manifest/Config |
|-------|--------------------------|---------------------|------------------------|
| 01 Linux | *(none — kernel features explained)* | Run `unshare`, inspect `/proc/` to see cgroups & namespaces that Docker uses | — |
| **02 Docker** | `backend/Dockerfile` | Build multi-stage image | — |
| | `frontend/Dockerfile` | Build nginx-alpine image | — |
| | `docker-compose.yml` | Run all 4 services locally | — |
| | `tests/test_app.py` | Run tests against live container | — |
| **03 K8s** | *(images built in Stage 2)* | Deploy to kind cluster | `stages/03-kubernetes/manifests/*.yaml` |
| **04 Helm** | `helm/cutlink/` | Create chart, template, lint, package | `helm/cutlink/templates/*.yaml` |
| | *(values-dev/prod/staging)* | Multi-environment overrides | — |
| **05 ArgoCD** | `helm/cutlink/` | GitOps-deploy the Helm chart | `stages/05-argocd/config/*.yaml` |
| **06 Prometheus** | `backend/app.py` (metrics endpoint) | Scrape `/metrics` | `stages/06-prometheus/config/*.yaml` |
| **07 Grafana** | *(Prometheus data source)* | Build dashboards from Cutlink metrics | `stages/07-grafana/dashboards/*.json` |

### Evolution of One App Across All Stages

```
Stage 2                    Stage 3                    Stage 4
docker-compose.yml  →      K8s manifests      →      Helm chart
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  docker run  │          │  kubectl apply│          │  helm install│
│  cutlink     │          │  cutlink      │          │  cutlink     │
└──────────────┘          └──────────────┘          └──────────────┘

Stage 5                    Stage 6                    Stage 7
GitOps deploy       →      Metrics scrape      →      Dashboard
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  ArgoCD sync │          │  Prometheus  │          │  Grafana     │
│  from git    │          │  /metrics    │          │  visualize   │
└──────────────┘          └──────────────┘          └──────────────┘
```

### `assets/` Directory

Place diagrams, screenshots, and architecture images here:

```
assets/
├── architecture.png     ← overall system diagram (optional)
├── cutlink-screenshot.png ← screenshot of the app UI
├── demo/               ← animated gifs or recordings
└── topology/           ← network topology diagrams
```

When you reach a stage, check `assets/` for any visual reference. Add your own screenshots as you progress.

---

## Curriculum

| Stage | Topic | What You'll Learn | Duration |
|-------|-------|-------------------|----------|
| [01](stages/01-linux-foundations) | **Linux Foundations** | Kernel, processes, namespaces, cgroups, filesystem, networking, systemd | 1-2 weeks |
| [02](stages/02-docker) | **Docker** | Images, containers, Dockerfiles, multi-stage builds, Compose, volumes, networks | 2 weeks |
| [03](stages/03-kubernetes) | **Kubernetes** | Pods, Deployments, Services, Ingress, ConfigMaps, Secrets, HPA, RBAC, StatefulSets | 3-4 weeks |
| [04](stages/04-helm) | **Helm** | Charts, templates, values, dependencies, hooks, multi-environment overrides | 1 week |
| [05](stages/05-argocd) | **ArgoCD** | GitOps, Applications, App of Apps, sync waves, auto-sync, rollback | 1 week |
| [06](stages/06-prometheus) | **Prometheus** | Metrics, PromQL, ServiceMonitors, recording rules, alerting | 1-2 weeks |
| [07](stages/07-grafana) | **Grafana** | Dashboards, templating, annotations, unified alerting, provisioning | 1 week |

**Total: ~10-14 weeks at a sustainable pace**

## How Each Stage Is Structured

```
stages/XX-topic/
├── README.md         ← Full theory + step-by-step exercises + solutions (inline)
├── manifests/        ← K8s YAML for this stage
├── config/           ← Config files (ArgoCD apps, Prometheus rules, dashboards)
└── exercises/
    ├── 01-first.md   ← Hands-on exercise (extracted from README)
    ├── 02-second.md
    └── ...
```

Every stage has:
- **Theory**: What the technology is, why it matters, how it works
- **Why This Matters for the Next Stage**: Connecting concepts
- **Hands-on exercises**: Step-by-step with expected output
- **Solutions**: Full command output and explanations (in README)

## Prerequisites

- A laptop with 16GB+ RAM and 50GB free disk
- Basic terminal familiarity (`ls`, `cd`, `cat`, `vi/nano`)
- Willingness to type commands and understand them

## Quick Start — Run Cutlink Now

```bash
# 1. Start with Docker (requires Docker Desktop)
cd sample-app
docker compose up -d

# 2. Open http://localhost:8080
# 3. Shorten a URL, see it work
# 4. docker compose down -v
```

Then start from [Stage 1](stages/01-linux-foundations) and work through.

## Architecture Diagram

```
                    ┌──────────────┐
                    │   Browser    │
                    └──────┬───────┘
                           │ :8080
                    ┌──────▼───────┐
                    │   Nginx      │
                    │  (frontend)  │
                    └──┬───────────┘
                       │ /api/*
                ┌──────▼───────────┐
                │   Flask API      │
                │   (backend)      │
                └──┬───────┬───────┘
                   │       │
          ┌────────▼──┐ ┌──▼────────┐
          │ PostgreSQL │ │   Redis   │
          │ (storage)  │ │  (cache)  │
          └────────────┘ └───────────┘
```

## Learning Philosophy

1. **Understand, don't memorize** — Every command is explained. If you understand *why* it works, you don't need to memorize it.
2. **Type everything** — No copy-paste. Typing builds muscle memory and forces you to read what you're running.
3. **Break things on purpose** — Kill pods, delete namespaces, roll back. Production experience comes from recovery, not perfection.
4. **One production app** — Cutlink follows you through every stage. You see the same app evolve from a Docker Compose setup to a fully monitored production deployment.
