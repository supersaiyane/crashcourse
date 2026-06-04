# Stage 5: Tekton

**Goal:** Build a cloud-native, Kubernetes-native CI/CD pipeline with Tekton — the same pipeline logic, running as Kubernetes resources.

**Prerequisites:** Stage 4 complete. A Kubernetes cluster with Tekton Pipelines installed.

---

## 1. Theory (What & Why)

### What makes Tekton different?

GitHub Actions, GitLab CI, and Jenkins run pipelines on VMs or containers managed by a central server. Tekton runs pipelines **as Kubernetes resources** — Tasks, Pipelines, and PipelineRuns are CRDs. Your CI/CD is declarative YAML, just like your app manifests.

### Key resources

| Resource | What it does |
|----------|-------------|
| **Task** | A set of steps (like a job in other CI systems) |
| **Pipeline** | Chains Tasks with dependencies |
| **PipelineRun** | An execution of a Pipeline |
| **Trigger** | Watches for events (webhook, cron) and creates PipelineRuns |

### Why Tekton?

- **Kubernetes-native** — runs where your apps run, uses the same RBAC, networking, storage
- **Reusable** — Tasks are shared via Tekton Hub (like Actions marketplace)
- **Scalable** — each PipelineRun is a set of pods, scales with the cluster
- **Portable** — no vendor lock-in, runs on any Kubernetes cluster

---

## 2. Hands-On

### 2.1 Install Tekton

```bash
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
```

### 2.2 Apply the Tasks and Pipeline

```bash
kubectl apply -f PipelineAPI/tekton/
```

### 2.3 Run the pipeline

```bash
tkn pipeline start pipelineapi-ci --workspace name=source,claimName=pipelineapi-pvc --showlog
```

---

## Exercises

1. [Exercise 1 — Run the Tekton pipeline](exercises/01-run-tekton.md)
2. [Exercise 2 — Add a Trigger](exercises/02-add-trigger.md)

**Next stage:** [06-comparison](../06-comparison/README.md)
