# Stage 3: Flux Bootstrap

**Goal:** Deploy BillFlow across three environments using Flux GitOps — the cluster watches your Git repository and automatically reconciles state. You push YAML, Flux applies it.

**Prerequisites:** Stages 1-2 complete. A Kubernetes cluster (kind or minikube). Flux CLI installed. GitHub personal access token with repo scope.

---

## 1. Theory (What & Why)

### What is GitOps?

GitOps is a single idea: Git is the source of truth for your infrastructure. The desired state of your cluster lives in Git. An operator running inside the cluster watches for changes and reconciles — making the cluster match what Git says.

This is the opposite of imperative management:

| Imperative (traditional) | Declarative (GitOps) |
|--------------------------|---------------------|
| Run kubectl apply from your laptop | Push YAML to Git |
| "Who ran that command?" — nobody knows | Every change is a Git commit with author and timestamp |
| Drift happens silently | Operator detects and corrects drift |
| Access control: who has kubeconfig | Access control: who can merge to main |
| Rollback: "does anyone have the old YAML?" | Rollback: git revert |

### Why Flux?

Flux is a CNCF graduated project (same tier as Kubernetes itself). It runs as a set of controllers inside your cluster:

- **Source Controller** — watches Git repositories and Helm chart repositories for changes
- **Kustomize Controller** — applies Kustomize overlays to the cluster
- **Helm Controller** — manages Helm chart releases
- **Notification Controller** — sends alerts on deployment events

Key Flux CRDs:

| CRD | Purpose | Example |
|-----|---------|---------|
| **GitRepository** | Where to pull from — repo URL, branch, polling interval | Watch main branch every 1 minute |
| **Kustomization** | What to apply — path in repo, target namespace, dependencies | Apply overlays/dev to billflow-dev |
| **HelmRelease** | A Helm chart to install | Not used in this project |

### The reconciliation loop

Flux runs a continuous loop:

1. Poll Git (every N minutes)
2. Detect changes (compare Git state with cluster state)
3. Apply changes (create, update, delete resources)
4. Report status (healthy, progressing, failed)
5. Go to 1

This loop is what makes GitOps powerful. If someone manually edits a resource in the cluster (drift), Flux will detect it and revert it to match Git. Git always wins.

### Flux vs ArgoCD

Both are GitOps operators. Key differences:

| Aspect | Flux | ArgoCD |
|--------|------|--------|
| **UI** | No built-in UI (use Flux dashboard or Grafana) | Rich built-in web UI |
| **Architecture** | Set of independent controllers | Monolithic server + repo server |
| **Multi-tenancy** | Via Kustomization CRDs with service accounts | Via AppProject CRDs |
| **Kustomize support** | Native (Kustomize controller) | Via application manifests |
| **CNCF status** | Graduated | Graduated |

Flux is a better fit for BillFlow because we use Kustomize overlays — Flux applies them natively.

---

## 2. Hands-On: Bootstrap Flux for BillFlow

### 2.1 Check prerequisites

```bash
flux --version
kubectl cluster-info
flux check --pre
```

### 2.2 Bootstrap Flux

Bootstrap installs Flux controllers in your cluster AND creates the Flux config in your Git repo:

```bash
export GITHUB_TOKEN=<your-personal-access-token>

flux bootstrap github \
  --owner=<your-github-user> \
  --repository=billflow \
  --branch=main \
  --path=./flux \
  --personal
```

What this does:
1. Installs Flux controllers in flux-system namespace
2. Creates a flux/ directory in your repo with Flux system manifests
3. Commits and pushes the Flux config to Git
4. Configures Flux to watch this repo

### 2.3 Confirm Flux is running

```bash
flux check
kubectl get pods -n flux-system
```

You should see: helm-controller, kustomize-controller, notification-controller, source-controller — all Running.

### 2.4 Apply the BillFlow sync manifests

The project ships with `BillFlow/flux/gotk-sync.yaml` — three Kustomization CRDs for dev, staging, and production:

```bash
kubectl apply -f BillFlow/flux/gotk-sync.yaml
```

This creates:
- **GitRepository** — polls your repo every 1 minute
- **Kustomization (dev)** — applies overlays/dev, no dependencies
- **Kustomization (staging)** — applies overlays/staging, depends on dev being healthy
- **Kustomization (production)** — applies overlays/production, depends on staging being healthy

The dependency chain is critical: if dev fails, staging will not deploy. If staging fails, production will not deploy.

### 2.5 Watch the reconciliation

```bash
flux get kustomizations --watch
```

You will see each Kustomization go from "progressing" to "Applied revision: main@sha1:abc123". All three should be Ready within minutes.

### 2.6 Confirm deployments

```bash
kubectl get pods -n billflow-dev          # 1 pod (1 replica)
kubectl get pods -n billflow-staging      # 2 pods (2 replicas)
kubectl get pods -n billflow-production   # 3 pods (3 replicas)
```

### 2.7 Push a change and watch Flux deploy it

Edit the dev overlay — change replicas from 1 to 2:

```bash
# Edit k8s/overlays/dev/kustomization.yaml — change replicas to 2
git add .
git commit -m "feat: scale dev to 2 replicas"
git push
```

Now watch:

```bash
flux get kustomizations --watch
```

Within 1-5 minutes, billflow-dev reconciles. The new replica appears:

```bash
kubectl get pods -n billflow-dev    # 2 pods now
```

You did not run kubectl apply. You pushed to Git, and the cluster updated itself.

---

## 3. Key patterns

### Pruning

The `prune: true` setting means Flux will delete resources that no longer exist in Git. If you remove a ConfigMap from Git, Flux removes it from the cluster. This prevents ghost resources.

### Health checks

Flux checks health after applying changes. If a deployment fails its health checks (pods crash, readiness probes fail), the Kustomization stays in "not ready" state. Dependent Kustomizations will not proceed.

### Suspend and resume

Need to freeze production deployments?

```bash
flux suspend kustomization billflow-production    # stop reconciling
flux resume kustomization billflow-production     # resume reconciling
```

This is how you implement manual approval gates.

### Force reconciliation

```bash
flux reconcile source git billflow
flux reconcile kustomization billflow-dev
```

### Notifications

Flux can send Slack/webhook notifications when reconciliation succeeds or fails. Configure a Provider and Alert CRD in the flux-system namespace.

---

## 4. Common mistakes

- **Editing resources directly in the cluster:** Flux will revert your changes on the next reconciliation. All changes must go through Git.
- **Forgetting prune: true:** Without it, resources you delete from Git stay in the cluster forever.
- **Too-short reconciliation interval:** Setting interval to 30s hammers your Git provider. 1-5 minutes is sensible.
- **Missing dependencies:** If production deploys before staging, you skip the safety net. Always chain: dev, staging, production.
- **Not checking Flux status:** After a push, always check `flux get kustomizations`. Failures are usually YAML syntax errors or missing namespaces.

---

## Exercises

1. [Exercise 1 — Bootstrap and deploy](exercises/01-bootstrap.md)
2. [Exercise 2 — Watch reconciliation](exercises/02-reconciliation.md)

**Next stage:** [04-sealed-secrets](../04-sealed-secrets/README.md) — encrypt secrets in Git.
