# Stage 3: Flux Bootstrap

**Goal:** Deploy BillFlow across three environments using Flux GitOps — the cluster watches Git and automatically reconciles state.

**Prerequisites:** Stages 1-2 complete. A Kubernetes cluster (kind or minikube). Flux CLI installed.

---

## 1. Theory (What & Why)

### What is GitOps?

GitOps means Git is the single source of truth for your infrastructure. You never run kubectl apply manually in production. Instead: push to Git, Flux detects the change, Flux applies it to the cluster.

### How Flux works

Flux runs controllers inside your cluster that watch a Git repository. When a commit changes manifests, Flux reconciles — applies the new state, prunes removed resources, and reports drift.

Key CRDs:
- **GitRepository** — where to pull from (repo URL, branch, interval)
- **Kustomization** — what to apply (path in repo, target namespace, dependencies)

### BillFlow Flux setup

The project ships with `flux/gotk-sync.yaml` defining three Kustomizations:
- billflow-dev: auto-deploys from overlays/dev
- billflow-staging: auto-deploys from overlays/staging, depends on dev
- billflow-production: auto-deploys from overlays/production, depends on staging

---

## 2. Hands-On

### 2.1 Bootstrap Flux

```bash
flux bootstrap github --owner=<your-user> --repository=crashcourse --path=projects/04-gitops-multi-env/BillFlow/flux --personal
```

### 2.2 Apply the sync manifests

```bash
kubectl apply -f BillFlow/flux/gotk-sync.yaml
```

### 2.3 Watch reconciliation

```bash
flux get kustomizations --watch
```

Push a change to the dev overlay — watch Flux detect and apply it within 1-5 minutes.

---

## Exercises

1. [Exercise 1 — Bootstrap and deploy](exercises/01-bootstrap.md)
2. [Exercise 2 — Watch reconciliation](exercises/02-reconciliation.md)

**Next stage:** [04-sealed-secrets](../04-sealed-secrets/README.md)
