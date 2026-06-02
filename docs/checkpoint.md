# Checkpoint

| Date/Time | Task | Status | What Changed | Resume Vector |
|-----------|------|--------|-------------|---------------|
| 2026-05-31 03:30 | Repo setup + organize into categories | Done | 29 files into 9 dirs, README, LICENSE | README.md:1 |
| 2026-05-31 04:00 | 26 new crash courses | Done | ai/, security/, data/ + 26 files | ai/LLM-Fundamentals.md:1 |
| 2026-05-31 05:00 | 20 more courses | Done | Tempo, Mimir, ELK, HTTP, Puppet | observability/Tempo.md:1 |
| 2026-05-31 06:30 | 17 more courses | Done | Envoy, vLLM, Harbor, Regex | containers/Harbor.md:1 |
| 2026-05-31 07:00 | Final 6 + README (98 total) | Done | Claude-Code, Agentic-Patterns, RabbitMQ | README.md:1 |
| 2026-05-31 08:00 | Repo rename + topics | Done | Renamed to crashcourse, 20 topics | README.md:5 |
| 2026-05-31 12:30 | PWA website + GitHub Pages | Done | docs/ full PWA, GitHub Actions workflow | docs/index.html:1, docs/js/app.js:1 |
| 2026-05-31 13:00 | Fix course loading on Pages | Done | app.js uses raw.githubusercontent.com | docs/js/app.js:33-36 |
| 2026-05-31 13:30 | 9 design courses | Done | design/ category created | design/System-Design.md:1 |
| 2026-05-31 13:45 | 12 more (dataops, patterns, config mgmt) | Done | dataops/, patterns/, SaltStack, Chef, Consul | dataops/MLOps.md:1 |
| 2026-05-31 13:50 | Cloud foundations (3 courses) | Done | Cloud-Networking, Cloud-Security, Cloud-Architecture | cloud/Cloud-Architecture.md:1 |
| 2026-05-31 14:00 | README update (121 total, 17 categories) | Done | Badge counts, new index sections, footer | README.md:1-3 |
| 2026-05-31 14:30 | PWA course-index.json + hero stats updated | Done | Added design/9, dataops/6, patterns/2, +3 iac, +3 cloud to JSON; hero 121/17 | docs/data/course-index.json:1, docs/index.html:99 |
| 2026-05-31 14:45 | Repo About section updated | Done | Description: 121 courses, homepage URL set | gh api repos/supersaiyane/crashcourse |
| 2026-05-31 15:00 | Scanned EngineeringBlueprints, scheduled TODO | Done | 15 new courses planned: interview/, career/, practices | TODO.txt (local, gitignored) |
| 2026-05-31 15:30 | Footer links added | Done | Portfolio, LinkedIn, Medium, Book in footer | docs/index.html:128-155 |
| 2026-05-31 21:30 | 15 new courses (interview, career, practices) | Done | interview/6, career/5, + 4 in existing categories | interview/System-Design-Interview.md:1, career/Engineering-Career-Path.md:1 |

| 2026-06-01 00:30 | Wave 1: PWA progress tracker + mermaid.js | Done | app.js, style.css, index.html — localStorage tracking, bookmarks, continue-reading, mermaid rendering | docs/js/app.js:71, docs/css/style.css |
| 2026-06-01 01:00 | Wave 1: Interview Q + diagrams batch 1 (5 priority) | Done | Kubernetes, Docker, Terraform, AWS, System-Design — both IQ + mermaid | containers/Kubernetes.md, iac/Terraform.md |
| 2026-06-01 01:30 | Wave 1: Interview Q + diagrams batch 2 (5 courses) | Done | Prometheus, Git, Linux, Helm, GitHub-Actions — both IQ + mermaid | observability/Prometheus.md, vcs/Git.md |
| 2026-06-01 02:00 | Wave 1: Interview Q + diagrams batch 3 (27 courses) | Partial | 14 both IQ+mermaid, 12 IQ-only, 1 mermaid-only — rate limit hit | observability/Grafana.md, cicd/ArgoCD.md |

| 2026-06-01 07:45 | Wave 3 project catalog expanded | Done | TODO.txt: 33 tiered projects (1-14yr exp) replacing old 5-project list | TODO.txt:366-473 |
| 2026-06-01 08:30 | Wave 1: Recommended learning resources | Done | All 136 courses — YouTube, docs, blogs curated per tool | containers/Kubernetes.md, ai/LLM-Fundamentals.md |
| 2026-06-01 09:30 | DSA separate repo plan | Done | dsa.txt: 25 full courses, 8 categories, 3 learning paths, FAANG-calibrated | dsa.txt (local, gitignored) |
| 2026-06-01 12:00 | PM courses planned + TODO status table | Done | TODO.txt: 16 product/project courses + master status table | TODO.txt (local, gitignored) |
| 2026-06-01 12:23 | Fix hero subtitle 98→136 | Done | index.html (meta+OG+hero), manifest.json | docs/index.html:7,12,93, docs/manifest.json:4 |
| 2026-06-01 12:45 | 15 industry case study projects added | Done | TODO.txt: projects #34-48 (Netflix, Uber, Stripe, Spotify, LinkedIn, etc.) | TODO.txt (local, gitignored) |
| 2026-06-01 13:00 | README optimized for discoverability | Done | Social badges, star CTA, clear use case, tweet button, repo topics updated | README.md:1-55, README.md:345-360 |
| 2026-06-01 21:00 | 17 product/ courses written | Done | All 17: PM, Strategy, Discovery, Roadmapping, Analytics, PLG, User-Stories, Stakeholder, Agile-Scrum, Kanban, Risk, Sprint, JIRA, TPM, Delivery, Project-Mgmt, PM-AI-Era | product/Product-Management-Fundamentals.md:1 |
| 2026-06-01 21:30 | Counts updated to 153/20 | Done | README, index.html, manifest.json, course-index.json, repo description all updated | README.md:10, docs/index.html:99, docs/data/course-index.json:2 |

| 2026-06-02 08:30 | Bulk Interview Q&A + Mermaid diagrams | Done | All 153 courses now have both IQ (10 Q&A each) and mermaid diagrams. 117 IQ added, 128 mermaid added. | All 20 category dirs — verified 153/153 IQ, 153/153 mermaid |

## Next Session Resume Vector

- 153 courses across 20 categories — all have Interview Questions + Mermaid diagrams
- Wave 1 completed features:
  - Progress Tracker & Bookmarks: DONE (100%)
  - Recommended Learning Resources: DONE (136/153 — 17 product/ courses need resources)
  - Interview Questions: DONE (153/153)
  - Mermaid Architecture Diagrams: DONE (153/153)
- Remaining: commit all changes, push, update TODO.txt counts
- TODO.txt has 48 project walkthroughs (33 + 15 industry case studies)
- dsa.txt has full plan for separate DSA repo (25 courses, Python, FAANG-focused)
- Wave 2 (quiz, comparisons, GIFs) + Wave 3 (CLI playground) not started
- Site live at https://supersaiyane.github.io/crashcourse/
