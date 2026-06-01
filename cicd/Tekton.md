# Tekton — A 2-Day Crash Course

> **Prerequisite:** You're comfortable with Kubernetes concepts. If not, work through `Kubernetes.md` first — Tekton lives entirely inside a cluster, and every concept maps back to a Kubernetes resource.

---

## Part 0 — Why Tekton

Most CI/CD tools treat the cluster as a deployment target. Tekton treats it as the runtime. Your pipeline doesn't talk to Kubernetes — your pipeline *is* Kubernetes.

Every step runs in its own container. Every pipeline is a set of Kubernetes custom resources. There is no Jenkins master, no GitLab runner process, no long-lived agent to babysit. When a job finishes, the pod exits. When a trigger fires, a new pod spawns. The cluster scheduler handles concurrency, resource limits, and retry.

This has three practical consequences:

1. **Reproducibility.** You specify the exact image for every step. No surprise tool versions because someone updated a shared agent.
2. **Portability.** A Tekton pipeline runs the same on GKE, EKS, AKS, or a local kind cluster. Your YAML is the contract.
3. **Native RBAC.** Pipeline permissions are Kubernetes service accounts and role bindings. You already know how to audit them.

The tradeoff is verbosity. Tekton is more yaml than GitHub Actions. You accept that cost in exchange for full control over the execution environment.

---

## Part 1 — Vocabulary

Before you write anything, get the object model straight. Tekton has a small, composable set of resources. Learn these nine and you know the whole surface.

| Resource | What it is |
|---|---|
| **Task** | A reusable unit of work. Contains one or more Steps, each running in a named container image. Think: "build", "test", "push". |
| **TaskRun** | An instantiation of a Task. Creates the pod, binds params and workspaces, records results. One TaskRun = one pod. |
| **Pipeline** | An ordered graph of Tasks. Declares dependencies between tasks using `runAfter` or `results` references. No execution happens here — it is a template. |
| **PipelineRun** | An instantiation of a Pipeline. Triggers all TaskRuns in order or in parallel per the graph. Holds the final status. |
| **Step** | A single container command inside a Task. Steps in the same Task share an emptyDir volume and run sequentially. |
| **Workspace** | A named volume mount. Tasks declare what storage they need; PipelineRuns bind actual PVCs, ConfigMaps, or Secrets to those names. |
| **Param** | A typed input value (string, array, object). Declared on Task or Pipeline, passed in at run time. Supports defaults. |
| **Result** | A string output from a Step written to `/tekton/results/<name>`. Other Tasks can consume results as params, creating implicit ordering. |
| **Trigger** | A set of three resources — `EventListener`, `TriggerBinding`, `TriggerTemplate` — that listen for a webhook, extract fields, and create a PipelineRun. |

The hierarchy is: Pipeline contains Tasks. PipelineRun creates TaskRuns. TaskRun creates a Pod. Steps are init containers in that Pod (from Tekton's perspective; you see them as regular containers in logs).

---

## Day 1 — Install, Write, Run, Inspect

### Install Tekton Pipelines

You need a running cluster. A local kind cluster is fine for Day 1.

```bash
# Install the Pipelines CRDs and controller
kubectl apply --filename \
  https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml

# Wait for the controller and webhook pods
kubectl wait --for=condition=Ready pods \
  --all -n tekton-pipelines --timeout=120s

# Install the tkn CLI (macOS)
brew install tektoncd-cli

# Verify
tkn version
```

The install adds a `tekton-pipelines` namespace with the controller, webhook, and chains controller (if you install Chains separately). Everything Tekton creates — Tasks, Pipelines, TaskRuns, PipelineRuns — lives in your application namespace, not in `tekton-pipelines`.

### Write your first Task

A Task that runs unit tests. Save this as `task-test.yaml`.

```yaml
apiVersion: tekton.dev/v1
kind: Task
metadata:
  name: run-tests
spec:
  params:
    - name: image
      type: string
      default: golang:1.22
  workspaces:
    - name: source
      description: The cloned source code
  steps:
    - name: test
      image: $(params.image)
      workingDir: $(workspaces.source.path)
      script: |
        #!/usr/bin/env sh
        go test ./... -v
```

Three things to notice:

- `params` are interpolated with `$(params.name)` syntax.
- `workspaces.source.path` resolves to the actual mount path at runtime — you never hardcode `/workspace/source` even though that is the default.
- `script` is preferred over `command`/`args` for anything longer than one line. Tekton writes the script to a file and executes it, so you get real shell.

Apply it:

```bash
kubectl apply -f task-test.yaml
tkn task describe run-tests
```

### Run it standalone with a TaskRun

```yaml
apiVersion: tekton.dev/v1
kind: TaskRun
metadata:
  generateName: run-tests-
spec:
  taskRef:
    name: run-tests
  params:
    - name: image
      value: golang:1.22
  workspaces:
    - name: source
      emptyDir: {}     # no real code — just testing the plumbing
```

```bash
kubectl create -f taskrun-test.yaml
tkn taskrun logs --last -f
```

`generateName` instead of `name` avoids name collisions when you run it multiple times. `kubectl create` (not `apply`) is the right verb for runs — they are events, not desired state.

### Chain Tasks into a Pipeline

A minimal pipeline: clone, then test.

```yaml
apiVersion: tekton.dev/v1
kind: Pipeline
metadata:
  name: build-and-test
spec:
  params:
    - name: repo-url
      type: string
    - name: revision
      type: string
      default: main
  workspaces:
    - name: shared-data
  tasks:
    - name: clone
      taskRef:
        resolver: hub
        params:
          - name: catalog
            value: tekton-catalog-tasks
          - name: type
            value: artifact
          - name: kind
            value: task
          - name: name
            value: git-clone
          - name: version
            value: "0.9"
      workspaces:
        - name: output
          workspace: shared-data
      params:
        - name: url
          value: $(params.repo-url)
        - name: revision
          value: $(params.revision)
    - name: test
      runAfter:
        - clone
      taskRef:
        name: run-tests
      workspaces:
        - name: source
          workspace: shared-data
```

The `shared-data` workspace threads through both tasks. The PVC you bind at PipelineRun time mounts into both pods, so the cloned code is visible to the test step.

### The tkn CLI — commands you use daily

```bash
# List and describe
tkn pipeline list
tkn pipelinerun list
tkn task list

# Start a pipeline interactively (prompts for params and workspaces)
tkn pipeline start build-and-test

# Stream logs of the latest run
tkn pipelinerun logs --last -f

# Describe a run (shows all TaskRuns, their status, and params)
tkn pipelinerun describe <name>

# Re-run the last PipelineRun with identical params
tkn pipelinerun rerun <name>

# Delete completed runs older than 24h to keep etcd clean
tkn pipelinerun delete --keep-since 1440
```

---

## Day 2 — Triggers, Hub, Workspaces, Chains, ArgoCD

### Tekton Triggers

Triggers let an external webhook (GitHub push, pull request, tag) create a PipelineRun automatically. Install the Triggers component first:

```bash
kubectl apply --filename \
  https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml
kubectl apply --filename \
  https://storage.googleapis.com/tekton-releases/triggers/latest/interceptors.yaml
```

A Trigger is three resources working together:

**EventListener** — a pod that receives HTTP webhooks. It references TriggerBindings and TriggerTemplates.

**TriggerBinding** — extracts fields from the webhook payload into named variables.

**TriggerTemplate** — a PipelineRun template parameterised by the binding variables.

```yaml
apiVersion: triggers.tekton.dev/v1beta1
kind: TriggerBinding
metadata:
  name: github-push-binding
spec:
  params:
    - name: repo-url
      value: $(body.repository.clone_url)
    - name: revision
      value: $(body.after)
---
apiVersion: triggers.tekton.dev/v1beta1
kind: TriggerTemplate
metadata:
  name: build-and-test-template
spec:
  params:
    - name: repo-url
    - name: revision
  resourcetemplates:
    - apiVersion: tekton.dev/v1
      kind: PipelineRun
      metadata:
        generateName: build-and-test-run-
      spec:
        pipelineRef:
          name: build-and-test
        params:
          - name: repo-url
            value: $(tt.params.repo-url)
          - name: revision
            value: $(tt.params.revision)
        workspaces:
          - name: shared-data
            volumeClaimTemplate:
              spec:
                accessModes:
                  - ReadWriteOnce
                resources:
                  requests:
                    storage: 1Gi
---
apiVersion: triggers.tekton.dev/v1beta1
kind: EventListener
metadata:
  name: github-listener
spec:
  serviceAccountName: tekton-triggers-sa
  triggers:
    - bindings:
        - ref: github-push-binding
      template:
        ref: build-and-test-template
      interceptors:
        - ref:
            name: github
          params:
            - name: secretRef
              value:
                secretName: github-webhook-secret
                secretKey: secret
            - name: eventTypes
              value: ["push"]
```

Expose the EventListener with an Ingress or LoadBalancer service, then register that URL as the webhook in your GitHub repository settings.

### Tekton Hub

Tekton Hub is a catalog of reusable Tasks and Pipelines. Rather than writing a `git-clone` task from scratch, you reference the community version.

```bash
# Search the catalog
tkn hub search git-clone

# Install a task into your cluster
tkn hub install task git-clone

# Install a specific version
tkn hub install task buildah --version 0.6
```

Commonly used Hub tasks: `git-clone`, `buildah` (OCI builds without Docker daemon), `crane` (image copy and tag), `sonarqube-scanner`, `trivy`, `kubectl-deploy-pod`.

⚠️ Pin versions explicitly. The Hub catalog updates and unpinned references can silently change behavior in your pipelines.

### Workspaces in depth

Workspaces are how Tasks share data. Five binding types exist at PipelineRun time:

| Binding type | When to use |
|---|---|
| `volumeClaimTemplate` | Ephemeral PVC per run. Most common for source code. |
| `persistentVolumeClaim` | Pre-existing PVC. Use for a shared dependency cache. |
| `emptyDir` | In-memory scratch space for a single TaskRun. No sharing across tasks. |
| `secret` | Mount a Kubernetes Secret. Use for signing keys, credentials. |
| `configMap` | Mount a ConfigMap. Use for build configuration files. |

A dependency cache pattern: bind a persistent PVC to a `cache` workspace in your build task, mount it at `$GOPATH/pkg/mod` or `~/.m2/repository`. Subsequent runs reuse downloaded dependencies.

### Tekton Chains

Chains is a supply chain security component that automatically signs TaskRun and PipelineRun attestations. Install it:

```bash
kubectl apply --filename \
  https://storage.googleapis.com/tekton-releases/chains/latest/release.yaml
```

Configure it to use a cosign key stored in a Kubernetes Secret, then set the storage backend:

```bash
kubectl patch configmap chains-config -n tekton-chains \
  --patch '{"data":{"artifacts.taskrun.format":"slsa/v1","artifacts.taskrun.storage":"oci","transparency.enabled":"true"}}'
```

Once configured, every completed TaskRun gets a signed SLSA provenance attestation stored alongside the image in your registry. Verify it with `cosign verify-attestation`.

### ArgoCD integration

Tekton handles CI — build, test, push. ArgoCD handles CD — deploy what is in Git. The integration point is simple: your pipeline's final step updates a GitOps repository with the new image digest.

A typical final task in the pipeline:

```yaml
- name: update-gitops-repo
  runAfter:
    - push-image
  taskRef:
    name: git-cli
  params:
    - name: GIT_USER_NAME
      value: tekton-bot
    - name: GIT_USER_EMAIL
      value: tekton@example.com
    - name: GIT_SCRIPT
      value: |
        git clone $(params.gitops-repo) /workspace/gitops
        cd /workspace/gitops
        sed -i "s|image:.*|image: $(tasks.build-image.results.IMAGE_URL)|g" \
          apps/myapp/deployment.yaml
        git add -A
        git commit -m "chore: update image to $(tasks.build-image.results.IMAGE_DIGEST)"
        git push
  workspaces:
    - name: source
      workspace: gitops-source
```

ArgoCD watches the GitOps repo and applies the diff. Tekton never talks to ArgoCD directly — Git is the interface.

---

## Part 2 — Worked Example: Full CI/CD Pipeline

This pipeline: clones source, runs tests, builds an OCI image with Buildah, scans it with Trivy, then updates the GitOps repository.

```yaml
apiVersion: tekton.dev/v1
kind: Pipeline
metadata:
  name: ci-cd-full
spec:
  params:
    - name: repo-url
    - name: revision
      default: main
    - name: image-name
    - name: gitops-repo
  workspaces:
    - name: source
    - name: gitops
    - name: docker-credentials
  results:
    - name: image-url
      value: $(tasks.build.results.IMAGE_URL)
    - name: image-digest
      value: $(tasks.build.results.IMAGE_DIGEST)
  tasks:
    - name: clone
      taskRef:
        resolver: hub
        params:
          - { name: name, value: git-clone }
          - { name: version, value: "0.9" }
      workspaces:
        - { name: output, workspace: source }
      params:
        - { name: url, value: $(params.repo-url) }
        - { name: revision, value: $(params.revision) }

    - name: test
      runAfter: [clone]
      taskRef:
        name: run-tests
      workspaces:
        - { name: source, workspace: source }

    - name: build
      runAfter: [test]
      taskRef:
        resolver: hub
        params:
          - { name: name, value: buildah }
          - { name: version, value: "0.6" }
      workspaces:
        - { name: source, workspace: source }
        - { name: dockerconfig, workspace: docker-credentials }
      params:
        - name: IMAGE
          value: $(params.image-name):$(params.revision)

    - name: scan
      runAfter: [build]
      taskRef:
        resolver: hub
        params:
          - { name: name, value: trivy-scanner }
          - { name: version, value: "0.1" }
      params:
        - name: IMAGE_PATH
          value: $(tasks.build.results.IMAGE_URL)
        - name: EXIT_CODE
          value: "1"   # fail the pipeline if CRITICAL vulnerabilities found

    - name: update-gitops
      runAfter: [scan]
      taskRef:
        name: update-gitops-manifest
      workspaces:
        - { name: source, workspace: gitops }
      params:
        - name: image-url
          value: $(tasks.build.results.IMAGE_URL)
        - name: gitops-repo
          value: $(params.gitops-repo)
```

Note how `$(tasks.build.results.IMAGE_URL)` threads the image reference from the build task into the scan and update tasks. Tekton enforces the ordering — `scan` cannot start until `build` produces that result.

Run it:

```bash
tkn pipeline start ci-cd-full \
  --param repo-url=https://github.com/yourorg/yourapp \
  --param image-name=registry.example.com/yourorg/yourapp \
  --param gitops-repo=https://github.com/yourorg/gitops \
  --workspace name=source,volumeClaimTemplateFile=pvc-template.yaml \
  --workspace name=gitops,volumeClaimTemplateFile=pvc-template.yaml \
  --workspace name=docker-credentials,secret=registry-credentials \
  --showlog
```

---

## Part 3 — Pitfalls

**PVC access modes.** `ReadWriteOnce` volumes can only mount to one node. If your Tasks run on different nodes — which happens in a multi-node cluster — you get a mount conflict. Use `ReadWriteMany` storage (NFS, Longhorn with RWX, AWS EFS) for workspaces shared across Tasks.

**Pod scheduling and resource requests.** Every Step becomes a container. If you leave resource requests unset, the scheduler treats them as zero and packs pods aggressively. A 5-step Task with unset limits can starve other workloads. Set `resources.requests` on Steps.

**Service account permissions.** The EventListener pod needs a service account with permission to create PipelineRuns and read Secrets. The Tekton controller needs permission to create pods in your namespace. Forgetting either results in silent failures or permission errors that appear in controller logs, not in `tkn` output.

**Result size limit.** Results are stored in the Tekton API as annotations. The total size of all results for a TaskRun is capped at 4096 bytes by default. If you try to pass a large artifact — a full SBOM, a long JSON blob — through results, the TaskRun will fail with a cryptic annotation size error. Pass large data through a workspace, not a result.

**`runAfter` vs result dependencies.** `runAfter` creates a soft ordering. A result reference like `$(tasks.build.results.IMAGE_URL)` creates a hard dependency — the consumer task will not start until the result exists. Use result references when you need the data. Use `runAfter` when you need ordering but not data.

**Trigger webhook validation.** If you skip the GitHub interceptor's `secretRef`, any HTTP POST to the EventListener URL will create a PipelineRun. In a production cluster this is a trivial denial-of-service vector. Always configure the interceptor secret.

**Namespace isolation.** By default, the EventListener creates PipelineRuns in its own namespace. If you want runs in a different namespace, set the `targetNamespace` field on the EventListener. Multi-tenant setups need explicit namespace configuration per trigger.

---

## Part 4 — Quick Reference

```bash
# Apply all Tekton resources in a directory
kubectl apply -f ./tekton/

# Start a pipeline and follow logs
tkn pipeline start <pipeline> --showlog

# List last 10 pipelineruns with status
tkn pipelinerun list --limit 10

# Get logs for a specific run
tkn pipelinerun logs <name> -f

# Describe a run and see all TaskRun statuses
tkn pipelinerun describe <name>

# Cancel a running PipelineRun
tkn pipelinerun cancel <name>

# Delete all runs older than 1 hour
tkn pipelinerun delete --keep-since 60

# Search and install a task from Hub
tkn hub search <keyword>
tkn hub install task <name> --version <ver>

# Check Tekton controller logs
kubectl logs -n tekton-pipelines \
  -l app=tekton-pipelines-controller -f

# Check Triggers logs
kubectl logs -n tekton-pipelines \
  -l app=tekton-triggers-controller -f
```

Conditional task execution (Tekton v0.43+):

```yaml
when:
  - input: $(params.run-tests)
    operator: in
    values: ["true"]
```

---

## Top 10 Interview Questions

<details>
<summary><strong>Q: What makes Tekton different from Jenkins or GitHub Actions?</strong></summary>

Tekton runs entirely as Kubernetes custom resources — every pipeline is a CRD, every step is a container, and the cluster scheduler handles execution. There is no separate server to maintain. This gives you native RBAC, resource limits, and pod-level isolation, at the cost of more YAML verbosity compared to the simpler config files of hosted tools.

</details>

<details>
<summary><strong>Q: What is the relationship between Pipeline, PipelineRun, Task, and TaskRun?</strong></summary>

A Task is a reusable template containing Steps (containers). A TaskRun instantiates a Task into a Pod. A Pipeline is an ordered graph of Tasks. A PipelineRun instantiates a Pipeline, creating one TaskRun per Task. The hierarchy is: Pipeline contains Tasks; PipelineRun creates TaskRuns; TaskRun creates a Pod.

</details>

<details>
<summary><strong>Q: How do Tasks share data in a Tekton pipeline?</strong></summary>

Through Workspaces. A Pipeline declares named Workspaces, and the PipelineRun binds them to actual storage (PVC, emptyDir, Secret, ConfigMap). The most common pattern is a `volumeClaimTemplate` that creates an ephemeral PVC per run — both the clone Task and the build Task mount the same PVC, so cloned source code is visible to subsequent Tasks.

</details>

<details>
<summary><strong>Q: What is the difference between `runAfter` and a result dependency?</strong></summary>

`runAfter` creates soft ordering — Task B waits for Task A to finish but does not consume any output from it. A result reference like `$(tasks.build.results.IMAGE_URL)` creates a hard dependency — Task B cannot start until Task A produces that specific result. Use result references when you need the data; use `runAfter` when you only need sequencing.

</details>

<details>
<summary><strong>Q: How do Tekton Triggers work?</strong></summary>

Three resources collaborate: an EventListener pod receives HTTP webhooks, a TriggerBinding extracts fields from the payload into variables, and a TriggerTemplate uses those variables to instantiate a PipelineRun. You expose the EventListener via an Ingress and register the URL as a webhook in your Git provider. Always configure the interceptor secret to prevent unauthorized PipelineRun creation.

</details>

<details>
<summary><strong>Q: What is Tekton Chains and why does it matter for supply chain security?</strong></summary>

Chains automatically signs TaskRun and PipelineRun attestations using cosign. Every completed build gets a signed SLSA provenance attestation stored alongside the image in your registry. This provides tamper-evident proof of what was built, from what source, by which pipeline — critical for compliance and software supply chain security.

</details>

<details>
<summary><strong>Q: What is the result size limit and how do you work around it?</strong></summary>

Results are stored as annotations on the TaskRun object, capped at 4096 bytes total by default. If you try to pass a large artifact (an SBOM, a JSON blob) through results, the TaskRun fails with an annotation size error. Pass large data through a Workspace (a mounted volume) instead of results — results are for small values like image digests or commit SHAs.

</details>

<details>
<summary><strong>Q: How do you handle PVC access mode conflicts in multi-node clusters?</strong></summary>

`ReadWriteOnce` PVCs can only mount to one node. If Tasks in a Pipeline get scheduled on different nodes, the second Task fails to mount. Use `ReadWriteMany` storage (NFS, AWS EFS, Longhorn with RWX) for Workspaces shared across Tasks. Alternatively, use `volumeClaimTemplate` with a storage class that supports RWX access.

</details>

<details>
<summary><strong>Q: How does Tekton integrate with a GitOps tool like Argo CD?</strong></summary>

Tekton handles CI (build, test, push). Its final Task updates a GitOps repository with the new image digest via a git commit. Argo CD watches that repo and applies the diff to the cluster. Tekton never talks to Argo CD directly — Git is the interface between CI and CD. This separation keeps cluster credentials out of the CI pipeline.

</details>

<details>
<summary><strong>Q: When would you choose Tekton over a simpler CI tool?</strong></summary>

Choose Tekton when you need full control over the execution environment, Kubernetes-native RBAC for pipeline permissions, air-gapped or on-prem operation, and supply chain security via Chains. It is stronger than hosted tools for regulated environments where you must audit exactly what container image ran each step. If your needs are simpler and you are already on GitHub or GitLab, their built-in CI is easier to start with.

</details>

---

## Part 5 — Next Steps

- `ArgoCD.md` — Wire the GitOps half. Tekton pushes an image and updates a manifest; ArgoCD reconciles the cluster to match.
- `Kubernetes.md` — Go deeper on PVCs, RBAC, and resource limits — the three areas where Tekton pipelines most often break in production.
- `GitHub-Actions.md` — Compare the model. Actions is simpler to start with and harder to isolate. Understanding both helps you choose deliberately.

---

## The Mantra

> Every step is a container. Every pipeline is Kubernetes. You already have the primitives — now use them with intention.

When a pipeline breaks, you debug it the same way you debug any Kubernetes workload: `kubectl describe pod`, `kubectl logs`, check events in the namespace. Tekton adds no new debugging surface. That is both its constraint and its strength.
