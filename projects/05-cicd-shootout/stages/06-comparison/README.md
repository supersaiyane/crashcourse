# Stage 6: Comparison

**Goal:** Compare all four CI/CD systems side-by-side — features, developer experience, performance, cost, and where each shines. This is the synthesis stage: you have built the same pipeline four ways, now make an informed decision.

**Prerequisites:** Stages 1-5 complete. You have run the PipelineAPI pipeline in GitHub Actions, GitLab CI, Jenkins, and Tekton.

---

## 1. Feature Matrix

| Feature | GitHub Actions | GitLab CI | Jenkins | Tekton |
|---------|---------------|-----------|---------|--------|
| **Config format** | YAML (multi-file) | YAML (single file) | Groovy (Jenkinsfile) | YAML (CRDs) |
| **Hosted runners** | Yes (free tier) | Yes (shared) | No (self-host only) | No (K8s pods) |
| **Self-hosted** | Optional | Yes | Required | Required (K8s) |
| **Container registry** | ghcr.io | Built-in per-project | Via plugin | External |
| **Caching** | `actions/cache` | Built-in `cache:` | Plugin-based | PVC-based |
| **Artifacts** | `actions/upload-artifact` | Built-in `artifacts:` | Built-in | PVC/workspace |
| **Secrets** | Encrypted per-repo | Masked variables | Credentials store | K8s Secrets |
| **Visualisation** | Job graph | Stage pipeline | Blue Ocean plugin | Tekton Dashboard |
| **Marketplace** | 15,000+ actions | Templates + includes | 1,800+ plugins | Tekton Hub |
| **Docker builds** | Buildx (fast) | DinD (slower) | Docker agent | Kaniko (no daemon) |
| **Local testing** | `act` (limited) | `gitlab-runner exec` | Run locally | `tkn` on local K8s |
| **Matrix builds** | Native | `parallel:` keyword | Scripted loops | Pipeline params |
| **Approval gates** | Environment reviewers | Manual jobs | Input step | PipelineRun pause |

---

## 2. Developer Experience

### Setup time (zero to first green build)

| System | Time | What you need |
|--------|------|---------------|
| **GitHub Actions** | 5 min | Create YAML, push |
| **GitLab CI** | 5 min | Create YAML, push |
| **Jenkins** | 30-60 min | Install server, plugins, create job, agents |
| **Tekton** | 45-90 min | Install on K8s, learn CRDs, create PVCs |

### Config complexity (lines for the same pipeline)

| System | Lines | Format |
|--------|-------|--------|
| **GitHub Actions** | 35 | YAML |
| **GitLab CI** | 28 | YAML |
| **Jenkins** | 25 | Groovy |
| **Tekton** | 75 | YAML (3 files) |

Tekton is most verbose because each Task is a separate resource with metadata, spec, and workspace declarations. The trade-off is maximum composability.

### Debugging experience

| System | How you debug | Rating |
|--------|--------------|--------|
| **GitHub Actions** | Step logs, re-run failed jobs, SSH debug action | Good |
| **GitLab CI** | Job logs, web terminal, local runner | Good |
| **Jenkins** | Console output, Blue Ocean, replay | Variable |
| **Tekton** | `tkn pipelinerun logs`, Dashboard, `kubectl describe` | Harder |

### Day-to-day workflow

- **GitHub Actions:** Push, check Actions tab, green/red in 5 min.
- **GitLab CI:** Push, check Pipelines, similar flow. Great MR integration.
- **Jenkins:** Push, check separate Jenkins UI. The extra hop adds friction.
- **Tekton:** Push (if Triggers set up) or `tkn pipeline start`. Check Dashboard. More steps but powerful for complex workflows.

---

## 3. Performance

### Execution time for PipelineAPI (same code, same tests)

| System | Test | Build | Scan | Total | Notes |
|--------|------|-------|------|-------|-------|
| **GitHub Actions** | ~90s | ~60s | ~30s | ~3 min | Fast runners, Buildx cache |
| **GitLab CI** | ~100s | ~90s | ~30s | ~3.5 min | Shared runners may queue |
| **Jenkins** | ~80s | ~50s | ~20s | ~2.5 min | Dedicated agents, pre-warmed |
| **Tekton** | ~120s | ~90s | ~30s | ~4 min | Pod startup overhead |

Jenkins fastest (pre-warmed agents). Tekton slowest (pod creation overhead). GH Actions and GitLab CI in the middle.

### Scaling behaviour

| System | 10 builds/day | 100 builds/day | 1000 builds/day |
|--------|---------------|-----------------|------------------|
| **GitHub Actions** | Free tier | Approaching limits | Need paid/self-hosted |
| **GitLab CI** | Shared runners | May queue | Need self-hosted |
| **Jenkins** | 1-2 agents | 5-10 agents | K8s-based agents needed |
| **Tekton** | Cluster handles | Cluster handles | Autoscaler handles |

Tekton scales best (K8s autoscaling). Jenkins scales worst (manual agent management).

---

## 4. Cost Analysis

### Monthly cost: team of 5, 10 builds/day

| System | Compute | Infrastructure | Total |
|--------|---------|---------------|-------|
| **GitHub Actions** | $0 (free tier) | $0 | **$0/month** |
| **GitLab CI** | $0 (shared) | $0 | **$0/month** |
| **Jenkins** | $0 (self-hosted) | $50-100 (EC2) | **$50-100/month** |
| **Tekton** | $0 (cluster pods) | $100-200 (K8s) | **$100-200/month** |

### Hidden costs

| System | Hidden cost |
|--------|------------|
| **GitHub Actions** | Vendor lock-in (actions are GitHub-specific) |
| **GitLab CI** | Vendor lock-in (less than GH but present) |
| **Jenkins** | Operations time (plugins, patches, agents) |
| **Tekton** | K8s expertise requirement |

---

## 5. When to Use Which

| Scenario | Best choice | Why |
|----------|------------|-----|
| Small team, code on GitHub | **GitHub Actions** | Zero setup, free, integrated |
| Enterprise, self-hosted Git | **GitLab CI** | Built-in features, single platform |
| Maximum flexibility, legacy | **Jenkins** | Plugin ecosystem, runs anywhere |
| Kubernetes-native, multi-cloud | **Tekton** | Portable, scalable, K8s-native |
| Compliance-heavy (BFSI) | **Jenkins or Tekton** | Self-hosted, audit trail |
| Open-source project | **GitHub Actions** | Free for public repos |
| Just starting out | **GitHub Actions** | Lowest friction |

### The honest recommendation

**For 80% of teams:** Start with GitHub Actions (or GitLab CI if you use GitLab). It is free, fast, and good enough. Do not over-engineer your CI.

**For teams on Kubernetes:** Consider Tekton if you need portability or multi-cloud.

**For enterprises with legacy Jenkins:** Do not migrate for the sake of it. Jenkins works. Migrate only if the operational burden outweighs the migration cost.

**The wrong choice:** Choosing Tekton because it is "cloud-native" when your team does not know Kubernetes. Or choosing Jenkins because "everyone uses it" when GitHub Actions would take 5 minutes.

---

## 6. What you have learned

Across stages 1-5, you built the same pipeline four ways:

```text
PipelineAPI (Flask + pytest + ruff + Docker)
    |
    +-- GitHub Actions (.github/workflows/ci.yml)
    +-- GitLab CI (.gitlab-ci.yml)
    +-- Jenkins (Jenkinsfile)
    +-- Tekton (Tasks + Pipeline CRDs)
```

Each system does the same thing: checkout, install, test, lint, build, scan. The difference is in ergonomics, scalability, cost, and operational burden. There is no universally "best" CI/CD system — there is only the best fit for your team, your infrastructure, and your constraints.

---

## Exercises

1. [Exercise 1 — Build your own comparison](exercises/01-your-comparison.md)

**Congratulations — you have completed the CI/CD Shootout project.**

You can now make an informed decision about CI/CD tooling, backed by hands-on experience with all four systems. Most engineers only know one — you know four.
