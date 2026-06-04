# Stage 2: Kustomize Overlays

**Goal:** Structure Kubernetes manifests with a shared base and per-environment overlays (dev, staging, production) using Kustomize.

**Prerequisites:** Stage 1 complete. kubectl and kustomize installed.

---

## 1. Theory (What & Why)

### The problem with copy-paste YAML

Without Kustomize, teams copy manifests per environment and edit them. Three environments times 5 files equals 15 files with 90% duplication. When you update the base, you must update all three copies.

### How Kustomize works

The base defines what gets deployed. Overlays define how it differs per environment. Patches modify specific fields — replica count, memory limits, environment variables.

Key features: patches, configMapGenerator, secretGenerator, namespace override, commonLabels.

---

## 2. Hands-On

### 2.1 Build the base

```bash
kustomize build BillFlow/k8s/base
```

### 2.2 Build an overlay

```bash
kustomize build BillFlow/k8s/overlays/dev
kustomize build BillFlow/k8s/overlays/production
```

Compare: dev has 1 replica and 256Mi; production has 3 replicas and 1Gi.

### 2.3 Apply to a cluster

```bash
kubectl apply -k BillFlow/k8s/overlays/dev --dry-run=client -o yaml
kubectl apply -k BillFlow/k8s/overlays/dev
```

---

## Exercises

1. [Exercise 1 — Build and compare overlays](exercises/01-build-overlays.md)
2. [Exercise 2 — Add a ConfigMap per environment](exercises/02-configmap-overlay.md)

**Next stage:** [03-flux-bootstrap](../03-flux-bootstrap/README.md)
