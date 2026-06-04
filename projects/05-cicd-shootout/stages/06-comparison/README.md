# Stage 6: Comparison

**Goal:** Compare all four CI/CD systems side-by-side — features, developer experience, performance, cost, and where each shines.

**Prerequisites:** Stages 1-5 complete. You have run the same pipeline in all four systems.

---

## 1. Feature Matrix

| Feature | GitHub Actions | GitLab CI | Jenkins | Tekton |
|---------|---------------|-----------|---------|--------|
| **Config format** | YAML | YAML | Groovy/YAML | YAML (CRDs) |
| **Hosted runners** | Yes (free tier) | Yes (shared) | No (self-host) | No (K8s pods) |
| **Container registry** | ghcr.io | Built-in | Plugin | External |
| **Caching** | Action-based | Built-in | Plugin | PVC-based |
| **Artifacts** | Action-based | Built-in | Built-in | PVC-based |
| **Secrets** | Encrypted secrets | Masked variables | Credentials store | K8s Secrets |
| **Marketplace** | 15,000+ actions | Templates | 1,800+ plugins | Tekton Hub |
| **Self-hosted** | Optional | Yes | Required | Required (K8s) |
| **Learning curve** | Low | Low | Medium | High |
| **Best for** | GitHub-native teams | GitLab-native teams | Enterprise/legacy | K8s-native teams |

## 2. Developer Experience

### Setup time
- **GitHub Actions:** Minutes — create a YAML file, push, done
- **GitLab CI:** Minutes — same as above, different YAML
- **Jenkins:** Hours — install server, configure plugins, set up agents
- **Tekton:** Hours — install on K8s, learn CRDs, create PVCs

### Debugging
- **GitHub Actions:** Good — step logs, re-run failed jobs, SSH debug action
- **GitLab CI:** Good — job logs, web terminal, local runner testing
- **Jenkins:** Variable — depends on UI version, plugin quality, Blue Ocean vs classic
- **Tekton:** Harder — kubectl logs, tkn CLI, no built-in web UI (need Tekton Dashboard)

### Portability
- **GitHub Actions:** Locked to GitHub
- **GitLab CI:** Locked to GitLab
- **Jenkins:** Portable (runs anywhere)
- **Tekton:** Portable (runs on any K8s)

## 3. When to use which

| Scenario | Best choice |
|----------|------------|
| Small team, code on GitHub | GitHub Actions |
| Enterprise, self-hosted Git | GitLab CI (self-managed) |
| Complex legacy pipelines, maximum flexibility | Jenkins |
| Kubernetes-native, multi-cloud, reusable pipelines | Tekton |
| Just starting out | GitHub Actions (lowest friction) |

---

## Exercises

1. [Exercise 1 — Build your own comparison](exercises/01-your-comparison.md)

**Congratulations — you have completed the CI/CD Shootout project.**
