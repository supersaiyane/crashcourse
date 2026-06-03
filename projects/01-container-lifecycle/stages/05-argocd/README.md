# Stage 5: ArgoCD — GitOps for Kubernetes

**Prerequisites:** Stage 4 (Helm), Stage 3 (Kubernetes). You must understand Helm charts, values overrides, and Kubernetes resource fundamentals before attempting this stage.

---

## Part 1: What is GitOps?

### The Philosophy

GitOps is an operational framework that applies DevOps best practices — version control, code review, CI/CD — directly to infrastructure and application management. The core idea is simple but profound: **your Git repository becomes the single source of truth for your entire system's desired state.**

In a GitOps workflow, everything that defines your infrastructure and applications lives in Git:
- Kubernetes manifests (Deployments, Services, ConfigMaps)
- Helm charts and their values files
- Configuration files for infrastructure-as-code
- Policy definitions and access controls

A GitOps operator (like ArgoCD) continuously runs inside your cluster, comparing the desired state declared in Git against the live state running in the cluster. When they diverge, the operator reconciles them — either automatically or with human approval, depending on your policy.

### The Core Principles

**1. Declarative Description.** Your entire system is described declaratively — you say *what* you want, not *how* to achieve it. This is Kubernetes-native thinking applied at the deployment level. Instead of running `kubectl apply -f deployment.yaml` on a terminal, you commit that same YAML to Git. The operator reads it and makes the cluster match.

**2. Version Controlled Desired State.** Every change to your infrastructure or application is a Git commit. This gives you the full power of version control: blame, history, diffs, reverts, branching for canary deployments, and tags for releases. If a deployment breaks, you don't scramble to roll back — you revert the commit.

**3. Automated Reconciliation.** The operator (ArgoCD) runs a continuous reconciliation loop. It constantly asks: "Does the live cluster match what Git says?" If not, it takes action. This means drift — manual changes made via `kubectl exec` or `kubectl edit` — is automatically detected and corrected. The cluster heals itself to match the declared state.

**4. Pull-Based Deployment.** Traditional CI/CD uses a push model: a CI pipeline authenticates to the cluster and pushes changes. This requires cluster credentials in the CI system — a significant security risk. GitOps uses a pull model: the operator inside the cluster pulls from Git. The CI pipeline only needs to push to Git, not authenticate to the cluster. This dramatically reduces the attack surface.

### Push vs Pull: Why Pull Wins

| Aspect | Push (CI/CD) | Pull (GitOps) |
|--------|-------------|---------------|
| Credentials | CI system needs cluster access | Operator in cluster pulls from Git |
| Drift detection | None — only deploys on pipeline run | Continuous reconciliation |
| Rollback | Re-run pipeline with old code | `git revert` + automatic reconciliation |
| Audit trail | Pipeline logs (may be lost) | Git history (immutable, signed) |
| Access control | CI users need cluster access | Developers only need Git access |
| Multi-cluster | Configure each CI system per cluster | Same operator runs in every cluster |

### Real-World Benefits

- **Audit Trail:** Every change to the system is a Git commit with an author, timestamp, and diff. No more "who changed that ConfigMap?" mysteries. This is invaluable for SOC 2, ISO 27001, and other compliance frameworks.
- **Disaster Recovery:** To recreate a cluster from scratch: point ArgoCD at your Git repo. That's it. The operator rebuilds everything automatically.
- **Revert Anything:** A bad deploy is not a crisis. `git revert HEAD~1 && git push`. ArgoCD detects the divergence and restores the previous state in minutes.
- **Separation of Concerns:** Developers push code. Operations manages Git repos. No one needs direct `kubectl` access beyond emergency break-glass scenarios.
- **Observability Built In:** ArgoCD shows you exactly what's deployed, what version, and whether it matches Git. No more guessing.

---

## Part 2: ArgoCD Architecture

ArgoCD is not a monolith. It is composed of several components, each with a distinct responsibility. Understanding the architecture helps you troubleshoot, scale, and configure security.

```
┌─────────────────────────────────────────────────────────────────┐
│                     ArgoCD Architecture                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────────┐    │
│  │  API      │◄──►│   Repository │◄──►│   Application      │    │
│  │  Server   │    │   Server     │    │   Controller       │    │
│  │  (gRPC/   │    │  (caches     │    │  (reconciliation   │    │
│  │   REST)   │    │   repos)     │    │   loop)            │    │
│  └────┬─────┘    └──────────────┘    └────────┬───────────┘    │
│       │                                       │               │
│       ▼                                       ▼               │
│  ┌────────────────┐              ┌──────────────────────┐      │
│  │  Redis (Cache, │              │  Kubernetes API      │      │
│  │  API tokens)   │              │  (watches live       │      │
│  └────────────────┘              │   state)             │      │
│                                  └──────────────────────┘      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  Dex / SSO (Authentication, OIDC, SAML, LDAP)      │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1. API Server

The API Server is the front door. It exposes:
- **gRPC endpoint** — used by the `argocd` CLI
- **REST endpoint** — used by the Web UI
- **WebSocket connections** — for streaming log output and events

It handles authentication (via Dex/SSO), authorization (RBAC), and all CRUD operations on ArgoCD resources (Applications, Projects, Settings). The API Server is stateless — all persistent data lives in the Kubernetes API (as CRDs) and Redis (for caching).

When you run `argocd app list`, the CLI sends a gRPC request to the API Server, which queries the Application CRDs in the cluster and returns the response.

### 2. Repository Server

The Repository Server is the bridge to your Git repos. It:
- Clones repositories and caches them (avoids repeated cloning on every sync)
- Generates Kubernetes manifests from raw YAML, Helm charts, Kustomize overlays, or Jsonnet
- Returns the rendered manifests to the Application Controller

When ArgoCD syncs an Application, the Repository Server:
1. Clones the repo (or uses the cached copy)
2. Checks out the target revision (branch, tag, commit SHA)
3. Renders the manifests (e.g., `helm template` for Helm charts)
4. Returns the final Kubernetes YAML to the Application Controller

The Repository Server runs its own Git operations and does not depend on `kubectl`. It can authenticate to private repos via SSH keys, HTTPS credentials, or GitHub App tokens.

### 3. Application Controller

This is the engine. The Application Controller:
- Runs the continuous reconciliation loop (default: every 3 minutes)
- Compares the desired state (from the Repository Server) against the live state (from the Kubernetes API)
- Detects drift (OutOfSync status)
- Executes sync operations (creates, updates, deletes resources)
- Handles sync waves and sync phases
- Reports status back to the Application CRD

The reconciliation loop is:
1. Read an Application CRD
2. Ask the Repository Server to render the manifests for that Application
3. Query the Kubernetes API for the live state of all resources in the Application
4. Compare — if they match, mark as Synced. If not, mark as OutOfSync and optionally sync.

### 4. Redis

Redis serves two purposes:
- **Caching:** The Repository Server caches cloned repos and rendered manifests in Redis. This avoids re-cloning on every reconciliation cycle.
- **Rate Limiting:** The API Server uses Redis to enforce rate limits and manage API tokens.

If Redis goes down, ArgoCD continues to function but performance degrades (every reconciliation requires a fresh clone).

### 5. Dex / SSO Integration

Dex is an optional identity provider proxy that integrates with external authentication systems:
- OIDC providers (Google, Okta, Azure AD, Keycloak)
- SAML providers (Okta, OneLogin)
- LDAP / Active Directory
- GitHub / GitLab OAuth

This integration means you don't need separate credentials for ArgoCD — your team authenticates with their existing corporate identity. RBAC policies then determine what each user or group can do.

---

## Part 3: Core Concepts

### The Application CRD

An ArgoCD **Application** is a Custom Resource Definition (CRD) that tells ArgoCD what to deploy and where. It is the central concept — everything in ArgoCD revolves around Applications.

Here is the structure of an Application spec, annotated:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd          # Applications live in the argocd namespace
spec:
  # PROJECT — logical grouping for RBAC. More on this below.
  project: default

  # SOURCE — where to find the desired state (a Git repository)
  source:
    repoURL: https://github.com/my-org/my-repo.git
    path: charts/my-app
    targetRevision: HEAD      # branch, tag, or commit SHA
    helm:                     # Helm-specific configuration
      valueFiles:
        - values-production.yaml
      parameters:
        - name: replicaCount
          value: "5"

  # DESTINATION — where to deploy (a Kubernetes cluster + namespace)
  destination:
    server: https://kubernetes.default.svc   # the same cluster
    namespace: my-app-namespace

  # SYNC POLICY — how and when to reconcile
  syncPolicy:
    automated:
      prune: true             # delete resources removed from Git
      selfHeal: true          # revert manual changes to match Git
    syncOptions:
      - CreateNamespace=true  # auto-create the namespace
```

### Projects

An **AppProject** is a logical grouping of Applications with boundaries:
- **Allowed source repos:** restrict which Git repos Applications in the project can use
- **Allowed destinations:** restrict which clusters and namespaces Applications can deploy to
- **Allowed cluster resources:** restrict which resource types can be created
- **RBAC roles:** control who can manage Applications within the project

The `default` project ships with ArgoCD and allows all sources and destinations. In production, create specific projects per team or service:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: backend-team
  namespace: argocd
spec:
  sourceRepos:
    - 'https://github.com/my-org/backend-*'
  destinations:
    - namespace: 'staging-*'
      server: https://kubernetes.default.svc
    - namespace: 'production-*'
      server: https://kubernetes.default.svc
  clusterResourceWhitelist:
    - group: ''
      kind: Namespace
```

### Sync: The Reconciliation Engine

**Sync** is the process of making the live cluster state match the desired state in Git. It is the heart of ArgoCD.

**Sync Phases and Waves (advanced):**
Sync is divided into two phases, each containing multiple waves:

1. **PreSync Phase** (waves -3, -2, -1) — resources that must be ready before the main sync
2. **Sync Phase** (waves 0, 1, 2, 3...) — main resources
3. **PostSync Phase** (waves 1, 2, 3...) — resources that run after the main sync (integration tests, smoke tests)

Within each phase, resources are applied in wave order (lower numbers first). Resources in the same wave are applied in parallel. A wave waits for resources in the previous wave to be healthy before proceeding.

Configure sync waves via annotations:
```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "1"
```

This is essential for Stateful workloads: deploy the database before the backend that depends on it, and the backend before the frontend that calls it.

### Sync Policy: Manual vs Automatic

**Manual Sync Policy:**
```yaml
syncPolicy: {}
```
- ArgoCD will detect OutOfSync status but will NOT sync automatically
- A human must click "Sync" in the UI or run `argocd app sync my-app`
- Useful for production deployments where changes need approval

**Automatic Sync Policy:**
```yaml
syncPolicy:
  automated:
    prune: true
    selfHeal: true
```
- ArgoCD syncs automatically when Git changes
- `prune: true` — resources removed from Git are deleted from the cluster
- `selfHeal: true` — manual changes to the cluster are reverted to match Git
- Useful for staging environments where speed is more important than gates

### Sync Status

ArgoCD reports one of four sync statuses for each Application:

| Status | Meaning |
|--------|---------|
| **Synced** | The live state matches the desired state in Git. |
| **OutOfSync** | There is a difference between live and desired state. Either Git changed, the cluster changed, or both. |
| **Syncing** | A sync operation is currently in progress. |
| **Failed** | The last sync attempt failed (e.g., invalid YAML, missing Secret, crash looping pod). |

The **Health Status** is separate from Sync Status:

| Health | Meaning |
|--------|---------|
| **Healthy** | All resources are running as expected |
| **Degraded** | One or more resources are failing |
| **Progressing** | Resources are being created/updated |
| **Missing** | Resources that should exist are not found |
| **Suspended** | Resources are scaled to zero (HPA, CronJob) |

An Application can be **Synced but Degraded** — the manifests match Git, but the app itself is crashing. Conversely, an Application can be **OutOfSync but Healthy** — someone made a manual change that hasn't been reverted, but the app is running fine.

---

## Part 4: The App of Apps Pattern

### The Problem

As your system grows, you end up with many Applications in ArgoCD. Each service, each database, each supporting tool becomes an Application. Managing them individually is tedious and error-prone. You need to:
- Deploy the monitoring stack (Prometheus, Grafana, Loki)
- Deploy the database operator
- Deploy each microservice
- Ensure they deploy in the right order

### The Pattern

The **App of Apps** pattern solves this by introducing a root Application that manages child Applications. You define all your Applications as Kubernetes manifests in Git, and the root App ensures they are all created in ArgoCD.

```
root.yaml (Root Application)
├── apps/backend-app.yaml (Child Application — manages backend)
├── apps/frontend-app.yaml (Child Application — manages frontend)
├── apps/infra-app.yaml (Child Application — manages postgres, redis)
└── apps/monitoring-app.yaml (Child Application — manages prometheus, grafana)
```

**Root Application:**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/my-org/cutlink
    path: argocd/apps               # Directory containing child App YAMLs
    targetRevision: HEAD
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd               # Child Applications also go into argocd ns
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

The root Application watches the `argocd/apps/` directory. Any YAML file added there becomes a new ArgoCD Application. This is recursive and scales to any number of services.

### Why This Scales

- **Single source of truth:** The root Application, all child Applications, and all their manifests are in one Git repo
- **Decoupled teams:** Each team owns their child Application YAML and the resources it references
- **Environment separation:** Point child Applications at different value files or different branches per environment
- **Onboarding:** A new service = a new file in `argocd/apps/`. No clicks in a UI

---

## Part 5: Helm Integration

ArgoCD has first-class Helm support. When you point an Application at a directory containing a Helm chart, ArgoCD delegates chart rendering to the Repository Server, which runs `helm template` internally.

### How ArgoCD Renders Helm Charts

```
Application.spec.source.path = sample-app/helm/cutlink
Application.spec.source.helm.valueFiles = [values-production.yaml]
```

ArgoCD performs these steps:
1. Repository Server clones the repo
2. It reads `Chart.yaml` and `values.yaml` from `charts/cutlink/`
3. It overrides values with the files and parameters specified in the Application spec
4. It runs `helm template --name-template cutlink -f values-production.yaml .`
5. The resulting Kubernetes manifests are returned to the Application Controller
6. The Application Controller applies them to the cluster

### Specifying Values

You have three ways to pass values to a Helm chart:

**1. Value Files (recommended):**
```yaml
helm:
  valueFiles:
    - values-production.yaml
    - values-overrides.yaml
```

**2. Inline Parameters:**
```yaml
helm:
  parameters:
    - name: image.tag
      value: v1.2.3
    - name: ingress.enabled
      value: "true"
```

**3. Raw Values (inline YAML string):**
```yaml
helm:
  values: |
    image:
      tag: v1.2.3
    ingress:
      enabled: true
    replicaCount: 5
```

The order of precedence is: inline `values` > `parameters` > `valueFiles` > chart's built-in `values.yaml`.

---

## Exercises Overview

The following exercises build on each other:

1. **Install ArgoCD** — Deploy ArgoCD into your cluster and verify both CLI and Web UI access
2. **Deploy Cutlink via GitOps** — Take the Helm chart you built in Stage 4, push it to a Git repo, and deploy it through ArgoCD. Watch auto-sync in action
3. **App of Apps and Rollback** — Implement the App of Apps pattern to manage multiple services. Configure sync waves for ordered deployment. Perform a rollback via `git revert`

---

## Key Commands Reference

| Command | Description |
|---------|-------------|
| `argocd app list` | List all Applications |
| `argocd app get cutlink` | Show Application details |
| `argocd app sync cutlink` | Trigger a manual sync |
| `argocd app diff cutlink` | Show diff between desired and live |
| `argocd app rollback cutlink --prune` | Rollback to previous sync |
| `argocd proj list` | List all Projects |
| `argocd repo list` | List configured Git repositories |
| `argocd admin initial-password -n argocd` | Get initial admin password |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `config/application-cutlink.yaml` | Single Application manifest for Cutlink |
| `config/app-of-apps/root.yaml` | Root Application for App of Apps pattern |
| `config/app-of-apps/backend-app.yaml` | Child Application for backend |
| `config/app-of-apps/frontend-app.yaml` | Child Application for frontend |
| `config/app-of-apps/infra-app.yaml` | Child Application for infrastructure |
| `exercises/01-install-argocd.md` | Step-by-step install guide |
| `exercises/02-deploy-cutlink.md` | Step-by-step GitOps deployment |
| `exercises/03-rollback-and-sync.md` | Sync waves and rollback guide |

---

## Review Questions

1. What makes GitOps different from traditional CI/CD? Name three concrete differences.
2. What are the five main components of ArgoCD? What does each do?
3. What is the difference between Sync Status and Health Status?
4. When would you use sync waves? Give a real example.
5. What problem does the App of Apps pattern solve?
6. How does ArgoCD render a Helm chart? What commands does it run internally?
7. Why does the pull-based deployment model improve security?
8. What happens if you manually edit a resource in a cluster that has `selfHeal: true`?

---

**Next: Stage 6 — Observability with Prometheus, Grafana, and Loki.**
