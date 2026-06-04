# Stage 5: Tekton

**Goal:** Build a cloud-native, Kubernetes-native CI/CD pipeline with Tekton — the same pipeline logic running as Kubernetes resources instead of on a centralised CI server.

**Prerequisites:** Stage 4 complete. A Kubernetes cluster (kind or minikube). kubectl installed. Tekton CLI (`tkn`) installed.

---

## 1. Theory (What & Why)

### What makes Tekton different?

GitHub Actions, GitLab CI, and Jenkins all run pipelines on VMs or containers managed by a central server. Tekton flips this: pipelines **are** Kubernetes resources. Tasks and Pipelines are CRDs. A PipelineRun creates pods that execute your steps. Your CI/CD runs where your apps run.

### Why Kubernetes-native CI/CD?

| Benefit | How Tekton delivers it |
|---------|----------------------|
| **Same infrastructure** | Pipelines run as pods — same cluster, RBAC, networking |
| **Scalability** | Each PipelineRun is pods. Cluster autoscaler handles load |
| **Portability** | Runs on any Kubernetes — EKS, GKE, AKS, on-prem |
| **Declarative** | Pipelines are YAML, stored in Git, versioned |
| **Isolation** | Each step runs in its own container |

### Core resources

| Resource | What it is | Other CI equivalent |
|----------|-----------|-------------------|
| **Task** | A set of steps (containers) that run sequentially | A job |
| **TaskRun** | An execution of a Task | A job run |
| **Pipeline** | Chains Tasks with dependencies and parameters | A workflow |
| **PipelineRun** | An execution of a Pipeline | A pipeline run |
| **Workspace** | Shared storage between Tasks (PVC-backed) | Artifacts |
| **Trigger** | Watches for events, creates PipelineRuns | Webhook trigger |
| **EventListener** | HTTP endpoint that receives webhooks | Webhook receiver |

### How a Pipeline executes

```text
PipelineRun created (by user, trigger, or cron)
    |
    v
+------------------+     +------------------+
|  Task: test      |     |  Task: build     |
|  (pod with       | --> |  (pod with       |
|   3 containers)  |     |   kaniko builder) |
+------------------+     +------------------+
    |                         |
    v                         v
  Workspace (PVC) --- shared between tasks
```

Each Task runs as a pod. Steps within a Task share the pod filesystem. Tasks communicate via Workspaces — typically a PersistentVolumeClaim.

### Tekton vs traditional CI

| Aspect | Traditional CI | Tekton |
|--------|---------------|--------|
| **Execution** | VMs or managed containers | Kubernetes pods |
| **Scaling** | Add agents manually | Cluster autoscaler |
| **Config** | YAML/Groovy in repo | YAML CRDs in cluster |
| **State** | Centralised server | Stateless (Kubernetes) |
| **UI** | Built-in | Tekton Dashboard (addon) |
| **Learning curve** | Low-Medium | High (requires K8s) |
| **Best for** | Most teams | K8s-native, multi-cloud, compliance |

---

## 2. Hands-On: PipelineAPI on Tekton

### 2.1 Install Tekton

```bash
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
kubectl wait --for=condition=ready pod --all -n tekton-pipelines --timeout=120s
```

### 2.2 Install Tekton Dashboard

```bash
kubectl apply -f https://storage.googleapis.com/tekton-releases/dashboard/latest/release.yaml
kubectl port-forward svc/tekton-dashboard -n tekton-pipelines 9097:9097 &
# Open http://localhost:9097
```

### 2.3 Review the Tasks

**Test Task** — three steps (install, test, lint) in one pod:

```yaml
apiVersion: tekton.dev/v1
kind: Task
metadata:
  name: pipelineapi-test
spec:
  steps:
    - name: install
      image: python:3.11-slim
      script: pip install -r /workspace/source/api/requirements.txt
    - name: test
      image: python:3.11-slim
      script: cd /workspace/source/api && python -m pytest -v
    - name: lint
      image: python:3.11-slim
      script: cd /workspace/source/api && ruff check .
  workspaces:
    - name: source
```

**Build Task** — uses Kaniko (builds images without Docker daemon):

```yaml
apiVersion: tekton.dev/v1
kind: Task
metadata:
  name: pipelineapi-build
spec:
  params:
    - name: image-tag
      type: string
  steps:
    - name: build
      image: gcr.io/kaniko-project/executor:latest
      args:
        - --dockerfile=/workspace/source/api/Dockerfile
        - --context=/workspace/source/api
        - --destination=pipelineapi:$(params.image-tag)
        - --no-push
  workspaces:
    - name: source
```

### 2.4 Review the Pipeline

Two tasks chained: test first, build after (`runAfter`):

```yaml
apiVersion: tekton.dev/v1
kind: Pipeline
metadata:
  name: pipelineapi-ci
spec:
  params:
    - name: image-tag
      default: latest
  workspaces:
    - name: source
  tasks:
    - name: test
      taskRef: { name: pipelineapi-test }
      workspaces:
        - name: source
          workspace: source
    - name: build
      runAfter: [test]
      taskRef: { name: pipelineapi-build }
      params:
        - name: image-tag
          value: $(params.image-tag)
      workspaces:
        - name: source
          workspace: source
```

### 2.5 Apply and create workspace

```bash
kubectl apply -f PipelineAPI/tekton/

# Create shared storage
kubectl apply -f - << 'PVEOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pipelineapi-source
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
PVEOF
```

### 2.6 Run the pipeline

```bash
tkn pipeline start pipelineapi-ci \
  --param image-tag=v1.0.0 \
  --workspace name=source,claimName=pipelineapi-source \
  --showlog
```

Watch: test task pod starts (3 containers), pytest passes, ruff passes, build task starts (Kaniko), pipeline completes.

```bash
kubectl get pipelineruns
# NAME                      SUCCEEDED   REASON
# pipelineapi-ci-run-xyz    True        Succeeded
```

### 2.7 View in Dashboard

Open `http://localhost:9097` > PipelineRuns > click the run for task graph, step logs, and timing.

---

## 3. Key patterns

### Triggers — automated pipeline starts

```bash
kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml
```

Create an EventListener that starts the pipeline on GitHub webhook push events. Expose it as a Service, configure a GitHub webhook, and pushes automatically trigger PipelineRuns.

### Reusable Tasks from Tekton Hub

```bash
tkn hub install task git-clone
```

Use community Tasks instead of writing your own for common operations (git-clone, kaniko, trivy-scan).

### Kaniko vs Docker-in-Docker

Tekton does not use Docker-in-Docker. Kaniko builds images inside a container without a Docker daemon:
- **Safer:** No privileged containers needed
- **Simpler:** No DinD service to manage
- **Compatible:** Produces standard OCI images

### Pipeline parameters

Pass configuration at runtime:

```bash
tkn pipeline start pipelineapi-ci \
  --param image-tag=v2.0.0 \
  --param registry=ghcr.io/myorg
```

Parameters flow from Pipeline to Tasks, making pipelines reusable across projects.

---

## 4. Common mistakes

- **Forgetting the workspace PVC:** Without shared storage, tasks cannot access each other's outputs.
- **Using Docker commands:** Tekton pods do not have Docker. Use Kaniko or Buildah.
- **No Tekton Dashboard:** Debugging with only `kubectl logs` is painful. Install the Dashboard.
- **Overcomplicating Tasks:** Each Task should do one thing. Do not put test+build+deploy in one Task.
- **Ignoring resource limits:** PipelineRun pods consume cluster resources. Set requests and limits.
- **Not cleaning up PipelineRuns:** Old runs accumulate. Use Tekton's built-in pruning or a CronJob.

---

## Exercises

1. [Exercise 1 — Run the Tekton pipeline](exercises/01-run-tekton.md)
2. [Exercise 2 — Add a Trigger](exercises/02-add-trigger.md)

**Next stage:** [06-comparison](../06-comparison/README.md) — side-by-side comparison of all four systems.
