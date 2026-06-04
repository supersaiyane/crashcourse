# Stage 2: Kustomize Overlays

**Goal:** Structure Kubernetes manifests with a shared base and per-environment overlays (dev, staging, production) using Kustomize — so one change to the base propagates to all environments, while each environment retains its specific configuration.

**Prerequisites:** Stage 1 complete. kubectl installed. kustomize CLI installed (or use `kubectl kustomize`). A Kubernetes cluster (kind, minikube, or cloud) — though you can test with `kustomize build` alone.

---

## 1. Theory (What & Why)

### The problem Kustomize solves

Picture this: you have a Kubernetes deployment for BillFlow. It works in dev. Now you need staging and production. The naive approach is copy-paste:

```text
k8s/
├── dev/
│   ├── deployment.yaml     ← 1 replica, 256Mi, LOG_LEVEL=debug
│   ├── service.yaml
│   └── namespace.yaml
├── staging/
│   ├── deployment.yaml     ← 2 replicas, 512Mi, LOG_LEVEL=info
│   ├── service.yaml
│   └── namespace.yaml
└── production/
    ├── deployment.yaml     ← 3 replicas, 1Gi, LOG_LEVEL=warn
    ├── service.yaml
    └── namespace.yaml
```

Three environments × three files = nine files with 90% duplication. When you change the container port from 3000 to 3001, you update three files. When you add a readiness probe, three files. When you add a ConfigMap, three more files. Eventually someone forgets to update production. The diff between environments becomes untrustworthy.

Kustomize solves this with **base + overlays**:

```text
k8s/
├── base/                   ← the 90% that's shared
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── namespace.yaml
│   └── kustomization.yaml
└── overlays/
    ├── dev/                ← the 10% that differs
    │   └── kustomization.yaml
    ├── staging/
    │   └── kustomization.yaml
    └── production/
        └── kustomization.yaml
```

One source of truth (base) + small patches per environment (overlays). Change the base, all environments update. Change an overlay, only that environment is affected.

### How Kustomize works internally

Kustomize doesn't template. It doesn't use `{{ variables }}`. It works with pure, valid Kubernetes YAML and applies **transformations**:

```text
┌─────────────┐     ┌───────────────┐     ┌──────────────────┐
│  Base YAML  │ ──> │ Kustomization │ ──> │  Final YAML      │
│  (valid K8s)│     │ (patches,     │     │  (valid K8s,     │
│             │     │  labels,      │     │   ready to apply) │
│             │     │  namespace)   │     │                  │
└─────────────┘     └───────────────┘     └──────────────────┘
```

The output is always valid Kubernetes YAML. No intermediate state. No rendering engine. You can `kustomize build` and pipe it to `kubectl apply` — or just use `kubectl apply -k`.

### Kustomize vs Helm

| Aspect | Kustomize | Helm |
|--------|-----------|------|
| **Approach** | Patch-based — start with real YAML, modify specific fields | Template-based — Go templates generate YAML |
| **Learning curve** | Lower — you write real YAML | Higher — you learn Go template syntax |
| **Readability** | High — overlays show what differs | Medium — templates can be hard to read |
| **Packaging** | No concept of packages | Charts are distributable packages |
| **Dependencies** | No dependency management | Chart dependencies with versions |
| **When to use** | Internal apps, simple customisation | Third-party software, complex applications |

BillFlow uses Kustomize because it's an internal app with straightforward environment differences. Helm would add unnecessary complexity.

### Key Kustomize features

| Feature | What it does | When to use |
|---------|-------------|-------------|
| **resources** | List of YAML files to include | Always — your base manifests |
| **patches** | Modify specific fields in specific resources | Environment differences (replicas, memory) |
| **configMapGenerator** | Create ConfigMaps from files or literals | Environment config (LOG_LEVEL, DB_HOST) |
| **secretGenerator** | Create Secrets from files or literals | Credentials (use Sealed Secrets in prod) |
| **namespace** | Override the namespace for all resources | Environment isolation |
| **commonLabels** | Add labels to all resources and selectors | Filtering, grouping by environment |
| **namePrefix / nameSuffix** | Add prefix/suffix to all resource names | Multi-tenant deployments |
| **images** | Override image tags without patching | Deploy different versions per environment |

---

## 2. Hands-On: BillFlow Multi-Environment Setup

### 2.1 Understand the base

Look at `BillFlow/k8s/base/`:

**`namespace.yaml`** — creates the `billflow` namespace:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: billflow
```

**`deployment.yaml`** — the BillFlow deployment with sensible defaults:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billflow
  namespace: billflow
spec:
  replicas: 1                          # overridden per environment
  selector:
    matchLabels:
      app: billflow
  template:
    metadata:
      labels:
        app: billflow
    spec:
      containers:
        - name: billflow
          image: billflow:latest        # overridden per environment
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: development        # overridden per environment
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi            # overridden per environment
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
```

**`service.yaml`** — exposes BillFlow within the cluster:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: billflow
  namespace: billflow
spec:
  selector:
    app: billflow
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
```

**`kustomization.yaml`** — ties them together:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - deployment.yaml
  - service.yaml
commonLabels:
  app.kubernetes.io/name: billflow
  app.kubernetes.io/managed-by: kustomize
```

### 2.2 Build the base

```bash
cd BillFlow
kustomize build k8s/base
```

This outputs all three resources with the common labels injected. Note that `commonLabels` adds the labels to both `metadata.labels` AND `spec.selector.matchLabels` — Kustomize handles this automatically.

### 2.3 Understand the overlays

Each overlay has a single `kustomization.yaml` that references the base and applies patches.

**Dev overlay** (`k8s/overlays/dev/kustomization.yaml`):

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: billflow-dev                # override namespace
resources:
  - ../../base                         # reference the base
patches:
  - target:
      kind: Deployment
      name: billflow
    patch: |
      - op: replace
        path: /spec/replicas
        value: 1                       # single replica for dev
      - op: replace
        path: /spec/template/spec/containers/0/env/0/value
        value: dev
      - op: replace
        path: /spec/template/spec/containers/0/resources/limits/memory
        value: 256Mi
commonLabels:
  environment: dev
```

**Production overlay** — same structure but different values:

- 3 replicas (high availability)
- 1Gi memory limit (handle real traffic)
- `environment: production` label

### 2.4 Build and compare overlays

```bash
# Build dev
kustomize build k8s/overlays/dev > /tmp/dev.yaml

# Build production
kustomize build k8s/overlays/production > /tmp/prod.yaml

# Compare — only the differences show
diff /tmp/dev.yaml /tmp/prod.yaml
```

The diff reveals exactly what differs between environments:

```diff
< namespace: billflow-dev
> namespace: billflow-production
<   replicas: 1
>   replicas: 3
<         value: dev
>         value: production
<           memory: 256Mi
>           memory: 1Gi
<     environment: dev
>     environment: production
```

This is the power of Kustomize: the diff IS the documentation. No guessing what's different.

### 2.5 Apply to a cluster (dry run)

```bash
# Preview what would be applied
kubectl apply -k k8s/overlays/dev --dry-run=client -o yaml | head -50

# Apply for real (if you have a cluster)
kubectl apply -k k8s/overlays/dev

# Verify
kubectl get all -n billflow-dev
```

### 2.6 Add a ConfigMap per environment

Create a ConfigMap that varies by environment. Add to the base `kustomization.yaml`:

```yaml
configMapGenerator:
  - name: billflow-config
    literals:
      - LOG_LEVEL=debug
      - DB_POOL_SIZE=5
      - RATE_LIMIT=100
```

Then override in the production overlay:

```yaml
configMapGenerator:
  - name: billflow-config
    behavior: merge
    literals:
      - LOG_LEVEL=warn
      - DB_POOL_SIZE=20
      - RATE_LIMIT=1000
```

Build both and compare — dev gets debug logging with small pool, production gets warn logging with large pool. Same ConfigMap name, different values, no duplication.

### 2.7 Override the image tag per environment

Instead of patching the deployment, use the `images` transformer:

```yaml
# In the production overlay:
images:
  - name: billflow
    newName: ghcr.io/yourorg/billflow
    newTag: v1.2.3
```

This replaces `billflow:latest` with `ghcr.io/yourorg/billflow:v1.2.3` in the production output. Dev keeps using `latest` for fast iteration.

---

## 3. Key patterns

### Strategic merge patches vs JSON patches

Kustomize supports two patch formats:

**Strategic merge patch** (natural YAML — specify what to merge):

```yaml
patches:
  - patch: |
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: billflow
      spec:
        replicas: 3
```

**JSON6902 patch** (surgical — specify exact operations):

```yaml
patches:
  - target:
      kind: Deployment
      name: billflow
    patch: |
      - op: replace
        path: /spec/replicas
        value: 3
```

Use strategic merge for readability. Use JSON patches when you need to add items to arrays or make precise changes.

### Environment-specific secrets

Never put real secrets in `kustomization.yaml`. Instead, use `secretGenerator` with `envs` files that are in `.gitignore`:

```yaml
secretGenerator:
  - name: db-credentials
    envs:
      - secrets.env    # .gitignored, contains DB_PASSWORD=...
```

For GitOps (everything in Git), use Sealed Secrets (Stage 4) instead.

### Validation before apply

Always validate your Kustomize output before applying:

```bash
# Check it builds
kustomize build k8s/overlays/production

# Validate against the Kubernetes API
kustomize build k8s/overlays/production | kubectl apply --dry-run=server -f -

# Diff against what's currently deployed
kustomize build k8s/overlays/production | kubectl diff -f -
```

---

## 4. Common mistakes

- **Forgetting `../../base` path:** The overlay `resources` path is relative. Getting it wrong gives cryptic errors.
- **Label selector mismatch:** If you add `commonLabels` in an overlay, it must not conflict with the base's selectors. Kustomize handles this for `app` labels, but custom labels need care.
- **Modifying base directly for one environment:** If you find yourself adding `if production` logic to the base, stop — that's what overlays are for. The base should be environment-agnostic.
- **Giant patches:** If your overlay patch is larger than the base, you've split things wrong. Rethink what belongs in the base.
- **Not testing all overlays:** After changing the base, build ALL overlays — not just the one you're working on. A change that works in dev might break production's overlay.

---

## Exercises

1. [Exercise 1 — Build and compare overlays](exercises/01-build-overlays.md)
2. [Exercise 2 — Add a ConfigMap per environment](exercises/02-configmap-overlay.md)

**Next stage:** [03-flux-bootstrap](../03-flux-bootstrap/README.md) — GitOps continuous delivery with Flux.
