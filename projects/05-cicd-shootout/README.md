# Project 5: CI/CD Shootout

**App:** PipelineAPI — the same Python Flask REST API deployed through 4 different CI/CD systems for an apples-to-apples comparison.

**What you'll build:** A complete CI/CD pipeline in each system — build, test, scan, and deploy. Then compare them: features, DX, speed, cost, and where each shines.

**Tier:** Foundation (1-3 years experience)

**Duration:** 4-6 weeks

**Courses covered:** Docker, GitHub Actions, GitLab CI, Jenkins, Tekton

## Stages

| # | Stage | Course | What you'll do |
|---|-------|--------|---------------|
| 1 | The App | `Docker.md` | Build the Flask API, write tests, create Dockerfile |
| 2 | GitHub Actions | `GitHub-Actions.md` | Build/test/scan/deploy workflow in YAML |
| 3 | GitLab CI | `GitLab-CI.md` | .gitlab-ci.yml with stages, runners, artifacts |
| 4 | Jenkins | `Jenkins.md` | Declarative Jenkinsfile with agents and credentials |
| 5 | Tekton | `Tekton.md` | Cloud-native Tasks, Pipelines, and Triggers |
| 6 | Comparison | *(synthesis)* | Feature matrix, cost analysis, DX comparison |

## The app: PipelineAPI

A minimal but real API that exercises every CI stage:

- Python Flask with health check, CRUD endpoints, and input validation
- Unit tests (pytest) — CI must run these
- Dockerfile with multi-stage build — CI must build and push the image
- Linting (ruff) — CI must check code quality
- Security scan (trivy) — CI must scan the image

## Getting started

```bash
cd PipelineAPI/api
pip install -r requirements.txt
python -m pytest
python app.py  # http://localhost:5000
```

Then work through each stage starting at `stages/01-the-app/README.md`.
