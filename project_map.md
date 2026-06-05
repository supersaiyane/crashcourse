# Project Map — crashcourse

## Overview
136 crash course markdown files for DevOps/SRE/Cloud/AI engineers across 19 categories. PWA website on GitHub Pages.

**Repo:** https://github.com/supersaiyane/crashcourse
**Site:** https://supersaiyane.github.io/crashcourse/

## Directories

| Directory | Purpose | Count |
|-----------|---------|-------|
| `ai/` | AI & LLM Engineering | 15 |
| `cicd/` | CI/CD & GitOps | 7 |
| `cloud/` | Cloud Providers + Foundations | 8 |
| `containers/` | Containers & Orchestration | 9 |
| `data/` | Data & Messaging | 5 |
| `dataops/` | Data Engineering & MLOps | 6 |
| `design/` | Software Engineering & Design | 9 |
| `iac/` | Infrastructure as Code + Config Mgmt | 12 |
| `linux/` | Linux & Terminal | 11 |
| `networking/` | Networking & CLI Tools | 8 |
| `observability/` | Observability | 10 |
| `patterns/` | Cloud-Native Patterns | 2 |
| `platform/` | Platform Engineering | 2 |
| `processes/` | SRE Processes | 8 |
| `security/` | Security | 7 |
| `vcs/` | Version Control | 2 |
| `interview/` | Interview Prep | 6 |
| `career/` | Engineering Career | 5 |
| `product/` | Product & Project Management | 17 |
| `docs/` | PWA website (GitHub Pages) | 10 |

## Root Files
- `README.md` — Landing page, social badges (star/fork/watch), clear 3-line use case, star CTA, tweet button, full index, learning paths
- `LICENSE` — MIT
- `CONTRIBUTING.md` — Contribution guide
- `.github/workflows/deploy.yml` — GitHub Actions Pages deploy

## PWA (docs/)
- `index.html` — SPA shell with footer links, mermaid.js CDN, progress/bookmark/continue-reading HTML sections
- `css/style.css` — Design system, dark/light themes, progress bar styles, bookmark star styles, mermaid wrapper
- `js/app.js` — Router, renderer, search, theme toggle, localStorage progress tracker (cc-read/cc-bookmarks/cc-history), mermaid diagram rendering
- `sw.js` — Service worker for offline
- `manifest.json` — PWA manifest
- `data/course-index.json` — Course catalog (136 courses, 19 categories with tags and colors)
- `assets/icons/` — favicon.svg, icon-192.png, icon-512.png
- `checkpoint.md` — Session continuity checkpoint

## Course Enrichment Status
- **Interview Questions** (`## Top 10 Interview Questions`): 153/153 DONE
- **Mermaid Diagrams** (```mermaid in Part 0): 153/153 DONE
- Format: IQ uses `<details><summary>` collapsible blocks (10 per file); Mermaid uses `graph LR|TD` in Part 0

## Wave 1 Interactive Features (COMPLETE)
- **Progress Tracker & Bookmarks** — DONE (153/153)
- **Recommended Learning Resources** — DONE (153/153)
- **Interview Questions** — DONE (153/153)
- **Mermaid Architecture Diagrams** — DONE (153/153)

## Wave 2 Interactive Features (partial)
- **Quick Quiz** (`## Quick Quiz`) — DONE (153/153). 5 self-test Q&A per course
- **Comparison Matrix** (`## Comparison Matrix`) — DONE (153/153). Tool vs 2 alternatives
- **Terminal Demo** (`## Terminal Demo`) — DONE (153/153). Uses ```terminal-demo code blocks rendered by app.js termTyping() with char-by-char typing + IntersectionObserver trigger
- **Inline Highlights** (Hypothes.is) — DONE. Embedded via script in index.html
- **Comments** (Giscus) — DONE. GitHub Discussions-backed, per-course mapping via loadGiscus() in app.js. Requires Giscus GitHub App installed

## PWA Bug Fixes
- **SW refresh fix** (sw.js v2): external origin requests bypass service worker
- **Cache bust** (v7): index.html references app.js?v=7, cli-engine.js?v=2, style.css?v=5
- **Repo public** (2026-06-03): badges use cacheSeconds=3600, About desc updated
- **Private repo support**: deploy.yml deploys entire repo root (not just docs/), MD_BASE='../' relative, root index.html JS redirect preserves hash routes
- **How to Use page**: docs/how-to-use.md rendered via #/how-to-use route in app.js

## Planned (in TODO.txt + dsa.txt, local only)
- Wave 2 fully complete
- README features section added (course sections table + PWA features list)

## Wave 3 Interactive Features (in progress)
- **CLI Playground** — xterm.js simulated terminal per course
  - Engine: docs/js/cli-engine.js (CLIPlayground class)
  - Data: docs/data/cli-{toolId}.json (command DB + scenarios per tool)
  - Loader: loadCLIPlayground(catId, filename) in app.js:837 — cliMap routes filename→JSON
  - Split view: .cli-split grid (terminal left, reference right, stacks on mobile <900px)
  - Reference panel: populated from data.reference[], click-to-type
  - Dependencies: xterm.js 5.5.0 + fit addon (CDN)
  - **Tier 1 — DONE (8/8, 489 commands, 16 scenarios):**
    - cli-containers.json / cli-kubernetes.json (51), cli-docker.json (68), cli-terraform.json (46)
    - cli-git.json (71), cli-linux.json (66), cli-bash.json (78), cli-helm.json (60), cli-ansible.json (49)
  - **Tier 2 — DONE (10/10, 754 commands, 20 scenarios):**
    - cli-prometheus.json (60), cli-postgresql.json (86), cli-redis.json (139), cli-aws.json (59)
    - cli-vault.json (57), cli-argocd.json (61), cli-tmux.json (87), cli-jq-yq.json (86)
    - cli-dns-curl-dig.json (72), cli-kafka.json (47)
  - **Tier 3 — DONE (12/12, 569 commands, 24 scenarios):**
    - cli-vim.json (108), cli-systemd.json (109), cli-trivy.json (24), cli-kustomize.json (67)
    - cli-tekton.json (56), cli-gitlab-ci.json (60), cli-podman.json (70), cli-containerd-nerdctl.json (55)
    - cli-pulumi.json (54), cli-flux.json (48), cli-opa.json (48), cli-k6.json (39)
  - **Tier 4 — DONE (6/6, 369 commands, 12 scenarios):**
    - cli-grafana.json (54), cli-loki.json (53), cli-etcd.json (81)
    - cli-cert-manager.json (60), cli-ssh.json (69), cli-sed-awk.json (72)
  - **Tier 5 — DONE (7/7, 344 commands, 14 scenarios):**
    - cli-github-actions.json (67), cli-jenkins.json (59), cli-alertmanager.json (53)
    - cli-nginx.json (59), cli-makefile.json (40), cli-gcp.json (56), cli-azure.json (50)
  - **Aliases:** jq→jq-yq, yq→jq-yq, sed→sed-awk, awk→sed-awk
  - **Grand total: 43 tools, ~2525 commands, 86 scenarios, 44 JSON files, 47 cliMap entries**
  - Tier skip: design/, product/, career/, interview/, patterns/ — not CLI-centric
- Wave 3: 15 flagship hands-on projects planned (TODO.txt:639-900), 7/15 DONE
  - **projects/01-container-lifecycle/** — Cutlink URL shortener, 7 stages (Linux→Grafana), DONE
  - **projects/02-iac-pipeline/** — FinStack payment infra, 7 stages (Terraform→GH-Actions), 73 files, DONE
    - finstack/: terraform (6 modules), terragrunt (3 envs), packer, ansible, vault, OPA, GH workflows, frontend (payment dashboard)
    - 7 stage READMEs (~175KB) + 17 exercises, frontend at :3000, Makefile, tests (7), .gitignore, .env.example
  - **projects/03-observability-stack/** — ObservaShop e-commerce microservices, 7 stages (Prometheus→Mimir), 40 files, DONE
    - ObservaShop/: 4 Flask services (gateway, order-svc, payment-svc, inventory-svc), frontend (e-commerce dashboard :8000), docker-compose, prometheus.yml, otel-collector.yml, alerts, dashboard, helm
    - 7 stage READMEs + 15 exercises, frontend at :8000
  - **projects/04-gitops-multi-env/** — BillFlow SaaS billing, 7 stages (Git→Velero), 34 files, DONE
    - BillFlow/: Node.js billing API + frontend dashboard (:8000), Kustomize base+3 overlays, Flux GitOps sync manifests
    - 7 stage READMEs + 14 exercises, Tier: Intermediate, docker compose verified
  - **projects/05-cicd-shootout/** — PipelineAPI, 6 stages (Docker→Comparison), 28 files, DONE
    - PipelineAPI/: Flask API + frontend dashboard (:8000) + pytest, same pipeline in 4 CI systems (GH Actions, GitLab CI, Jenkins, Tekton)
    - 6 stage READMEs + 11 exercises, Tier: Foundation, docker compose verified
  - **projects/PROJECT-GUIDE.md** — 824-line authoring guide: directory structure, app quality bar, stage README arc, exercise format, file quality standards for all file types. Reference: P1 Cutlink.
  - **projects/06-security-pipeline/** — SecureBank banking transaction API (Go), 7 stages (Trivy→full pipeline), 50 files, DONE
    - SecureBank/: Go API + frontend dashboard (:8000) with tests, Terraform (intentional misconfigs), OPA policies (4), Falco rules (4), K8s NetworkPolicy, GH Actions security pipeline
    - 7 stage READMEs + 17 exercises, Tier: Intermediate, docker compose verified
  - **projects/07-multi-cloud-app/** — CloudPlatform real-time analytics, 8 stages (AWS→Multi-Cloud Strategy), 70 files, DONE
    - CloudPlatform/: Flask API + Kafka processor + frontend dashboard (:8000), Terraform for AWS/GCP/Azure, k6 load tests, nginx
    - 8 stage READMEs (470-673 lines) + 27 exercises, Tier: Intermediate, docker compose verified, 9/9 tests pass
  - P8-P15: PLANNED, build order in Phases 2-4 (see TODO.txt)
  - **Labs UI: DONE** — card grid + stage navigator + localStorage progress
    - Routes: #/labs, #/labs/{id}, #/labs/{id}/{stage}
    - Data: docs/data/labs/*.json (one per project)
    - LAB_INDEX in app.js — array of lab IDs to load
    - Nav tabs: Courses | Labs in header
    - Features: tier filter, stage progress bar (done/current/pending), exercise checkboxes, course reference links, prev/next nav, continue-where-left-off
    - Sidebar: exercise .md links (clickable viewer), appDir download link, progress checkboxes, course ref, mark-complete
    - appDir: download via download-directory.github.io (Cutlink/, finstack/) — class lab-download-link (not lab-file-link, to avoid click handler interception)
    - localStorage key: cc-labs-progress
    - SW v5: network-first for lab JSON (docs/sw.js:49-53) — prevents stale cache
- Mermaid responsive fix: flexbox centering + width:100% + min-width:300px (style.css:1081-1095)
- Cache bust: style.css?v=8, cli-engine.js?v=2, app.js?v=8, SW v5
- DSA separate repo: 25 full courses, Python, FAANG-calibrated (plan in dsa.txt)
- TODO.txt has master status table at the bottom tracking all work
- Repo: PUBLIC (made public 2026-06-03)
