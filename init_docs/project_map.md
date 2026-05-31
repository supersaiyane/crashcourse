# Project Map — crashcourse

## Overview
98 crash course markdown files for DevOps/SRE/Cloud/AI engineers, organized into 14 category directories. Includes a PWA website hosted on GitHub Pages.

**Repo:** https://github.com/supersaiyane/crashcourse
**Site:** https://supersaiyane.github.io/crashcourse/

## Directory Structure

| Directory | Purpose | File Count |
|-----------|---------|------------|
| `ai/` | AI & LLM Engineering | 15 |
| `cicd/` | CI/CD & GitOps | 7 |
| `cloud/` | Cloud Providers | 5 |
| `containers/` | Containers & Orchestration | 9 |
| `data/` | Data & Messaging | 5 |
| `iac/` | Infrastructure as Code | 9 |
| `linux/` | Linux & Terminal | 11 |
| `networking/` | Networking & CLI Tools | 8 |
| `observability/` | Observability | 10 |
| `platform/` | Platform Engineering | 2 |
| `processes/` | SRE Processes | 8 |
| `security/` | Security | 7 |
| `vcs/` | Version Control | 2 |
| `docs/` | PWA website (GitHub Pages) | 9 |

## Root Files
- `README.md` — Repo landing page with full index, badges, learning paths
- `LICENSE` — MIT
- `CONTRIBUTING.md` — Contribution guidelines
- `.gitignore` — Ignores .DS_Store, .claude/, IDE files

## PWA (docs/)
- `index.html` — Single page app shell
- `css/style.css` — Full design system (dark/light, glassmorphism)
- `js/app.js` — Router, renderer, search, theme, stats
- `sw.js` — Service worker for offline
- `manifest.json` — PWA manifest
- `data/course-index.json` — Course catalog (categories, files, tags, colors)
- `assets/icons/` — favicon.svg, icon-192.png, icon-512.png
