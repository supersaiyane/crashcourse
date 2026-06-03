# Exercise 3: Sync Waves and Rollback

In this exercise, you will:

1. Configure sync waves to control the order of resource deployment
2. Test ordered deployment of infrastructure → backend → frontend
3. Perform a Git revert to roll back a bad deployment
4. Use `argocd app rollback` for a cluster-state rollback

---

## Prerequisites

- ArgoCD is installed (Exercise 1)
- Cutlink Application exists and is Synced (Exercise 2)
- Your Helm chart has multiple resource types (ConfigMap, Secret, Deployment, Service)
- You understand the basic Application manifest structure

---

## Part 1: Configure Sync Waves

### Why Sync Waves Matter

Without sync waves, ArgoCD applies all resources in a single parallel batch. This works for simple applications but fails when dependencies exist:

- The Deployment tries to start before the ConfigMap is created → pod crashes, restarts with correct config
- The backend tries to connect to a database that doesn't exist yet → crash loop
- The frontend tries to reach an API endpoint that hasn't registered yet → 503 errors

Sync waves solve this by defining an ordered execution plan:

```
Wave 0 (default): Namespace, ServiceAccount, RBAC
Wave 1:           PersistentVolumeClaim, StatefulSet (PostgreSQL)
Wave 2:           ConfigMap, Secret, Deployment (backend)
Wave 3:           Deployment (frontend), Service, Ingress
```

ArgoCD waits for all resources in a wave to report as **Healthy** before proceeding to the next wave. Resources within the same wave are applied in parallel.

### Step 1: Add Sync Wave Annotations

Edit your Helm chart templates to add sync wave annotations. If you don't have individual template files for each resource, create them.

**Templates to create:**

`sample-app/helm/cutlink/templates/postgres-pvc.yaml` — Wave 1:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "cutlink.fullname" . }}-postgres
  namespace: {{ .Release.Namespace }}
  annotations:
    argocd.argoproj.io/sync-wave: "1"
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: {{ .Values.postgres.storageSize | default "10Gi" }}
```

`sample-app/helm/cutlink/templates/postgres-statefulset.yaml` — Wave 1:
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: {{ include "cutlink.fullname" . }}-postgres
  namespace: {{ .Release.Namespace }}
  annotations:
    argocd.argoproj.io/sync-wave: "1"
spec:
  serviceName: {{ include "cutlink.fullname" . }}-postgres
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/component: postgres
  template:
    metadata:
      labels:
        app.kubernetes.io/component: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              value: cutlink
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ include "cutlink.fullname" . }}-postgres
                  key: password
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: {{ .Values.postgres.storageSize | default "10Gi" }}
```

`sample-app/helm/cutlink/templates/backend-deployment.yaml` — Wave 2:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "cutlink.fullname" . }}-backend
  namespace: {{ .Release.Namespace }}
  annotations:
    argocd.argoproj.io/sync-wave: "2"
spec:
  replicas: {{ .Values.replicaCount | default 1 }}
  selector:
    matchLabels:
      app.kubernetes.io/component: backend
  template:
    metadata:
      labels:
        app.kubernetes.io/component: backend
    spec:
      containers:
        - name: backend
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: {{ .Values.service.backendPort | default 8080 }}
          env:
            - name: DATABASE_URL
              value: postgres://postgres:$(POSTGRES_PASSWORD)@{{ include "cutlink.fullname" . }}-postgres:5432/cutlink
          envFrom:
            - configMapRef:
                name: {{ include "cutlink.fullname" . }}-backend
            - secretRef:
                name: {{ include "cutlink.fullname" . }}-backend
```

`sample-app/helm/cutlink/templates/frontend-deployment.yaml` — Wave 3:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "cutlink.fullname" . }}-frontend
  namespace: {{ .Release.Namespace }}
  annotations:
    argocd.argoproj.io/sync-wave: "3"
spec:
  replicas: {{ .Values.replicaCount | default 1 }}
  selector:
    matchLabels:
      app.kubernetes.io/component: frontend
  template:
    metadata:
      labels:
        app.kubernetes.io/component: frontend
    spec:
      containers:
        - name: frontend
          image: "{{ .Values.frontend.image.repository }}:{{ .Values.frontend.image.tag }}"
          ports:
            - containerPort: 80
          env:
            - name: API_URL
              value: http://{{ include "cutlink.fullname" . }}-backend:{{ .Values.service.backendPort | default 8080 }}
```

### Step 2: Commit and Deploy

```bash
git add sample-app/helm/cutlink/templates/
git commit -m "feat: add sync wave annotations for ordered deployment"
git push
```

### Step 3: Watch the Wave-Ordered Sync

Trigger a sync and watch the wave progression:

```bash
argocd app sync cutlink
```

In the CLI output, you'll see resources applying in wave order:

```
WAVE 1:  PersistentVolumeClaim/cutlink-postgres  Synced
WAVE 1:  StatefulSet/cutlink-postgres            Synced
...waiting for Wave 1 resources to become Healthy...
WAVE 2:  ConfigMap/cutlink-backend               Synced
WAVE 2:  Secret/cutlink-backend                  Synced
WAVE 2:  Deployment/cutlink-backend              Synced
...waiting for Wave 2 resources to become Healthy...
WAVE 3:  Deployment/cutlink-frontend             Synced
```

**In the Web UI:**
- Click the Application → **PARAMETERS** tab
- Under **SYNC WAVES**, you'll see:
  - Wave 1: PostgreSQL resources (Status: Healthy)
  - Wave 2: Backend resources (Status: Healthy)
  - Wave 3: Frontend resources (Status: Healthy)

---

## Part 2: Sync Hooks (Optional Advanced)

Sync hooks are special ArgoCD annotations that run jobs at specific points during a sync:

- `argocd.argoproj.io/hook: PreSync` — runs BEFORE the sync wave 0
- `argocd.argoproj.io/hook: PostSync` — runs AFTER all sync waves complete
- `argocd.argoproj.io/hook: SyncFail` — runs if the sync fails

Use cases:

```yaml
# PreSync: Database migration job — runs before the new backend deploys
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: cutlink/migration:latest
          env:
            - name: DATABASE_URL
              value: ...
      restartPolicy: Never
```

```yaml
# PostSync: Smoke test — runs after deployment is healthy
apiVersion: batch/v1
kind: Job
metadata:
  name: smoke-test
  annotations:
    argocd.argoproj.io/hook: PostSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  template:
    spec:
      containers:
        - name: test
          image: curlimages/curl
          command:
            - curl
            - -f
            - http://cutlink-frontend:80/health
      restartPolicy: Never
```

---

## Part 3: Git Revert (The GitOps Rollback)

The purest GitOps rollback is a Git revert. You don't touch ArgoCD directly — you revert the bad commit in Git, and ArgoCD reconciles automatically.

### Scenario: You pushed a bad change

Imagine you changed the image tag to a version that doesn't exist:

```bash
# Edit values-production.yaml to set a nonexistent tag
sed -i 's/tag: .*/tag: nonexistent-v99/' sample-app/helm/cutlink/values-production.yaml

git add sample-app/helm/cutlink/values-production.yaml
git commit -m "chore: bump image to v99"
git push
```

ArgoCD detects the change, attempts to sync, and the Application becomes **Degraded** because the new image doesn't exist and the pods crash.

### Step 1: Identify the Bad Commit

```bash
git log --oneline -5
```

Output:
```
a1b2c3d chore: bump image to v99
e4f5g6h feat: add sync wave annotations
...
```

### Step 2: Revert the Bad Commit

```bash
git revert a1b2c3d --no-edit
git push
```

This creates a new commit that undoes the bad change. The `git revert` command applies the inverse diff — it sets the image tag back to its previous value.

### Step 3: Watch ArgoCD Reconcile

```bash
argocd app get cutlink -w
```

You'll see:
1. Status flips to `OutOfSync` (ArgoCD detects the revert in Git)
2. Sync starts automatically (because `automated.sync: true`)
3. The Deployment rolls back to the working image tag
4. Status returns to `Synced` and `Healthy`

**The audit trail:**
```
a1b2c3d chore: bump image to v99          ← the bad commit
e4f5g6h feat: add sync wave annotations   ← previous good state
```

After revert:
```
z9y8x7w Revert "chore: bump image to v99" ← the fix
a1b2c3d chore: bump image to v99          ← the bad commit
e4f5g6h feat: add sync wave annotations   ← previous good state
```

The revert commit is a first-class citizen in your Git history. It has an author, timestamp, and message. Every team member knows exactly what happened, who fixed it, and when.

---

## Part 4: ArgoCD Rollback (Cluster-State Rollback)

Sometimes you need to roll back without reverting Git — for example, if the bad commit has other good changes mixed in. ArgoCD maintains a history of sync operations and can roll back to a previous sync.

### Step 1: View Sync History

```bash
argocd app get cutlink
```

Look for the `HISTORY` section:
```
HISTORY:
ID  DATE         REVISION
4  2026-06-03   e4f5g6h (HEAD)
3  2026-06-03   a1b2c3d
2  2026-06-02   e4f5g6h
1  2026-06-01   b0b1c2d
```

Each entry has:
- **ID:** sequential sync operation number
- **DATE:** when the sync occurred
- **REVISION:** the Git commit SHA that was synced

### Step 2: Perform the Rollback

```bash
argocd app rollback cutlink --prune
```

This command:
1. Shows you a list of the last N sync operations
2. Prompts you to select which one to roll back to
3. Re-applies the manifests from that revision
4. `--prune` removes any resources that didn't exist at the target revision

To roll back to a specific sync ID non-interactively:

```bash
argocd app rollback cutlink 2 --prune
```

This rolls back to sync ID 2 without prompting.

### Step 3: Verify the Rollback

```bash
argocd app get cutlink
kubectl get pods -n cutlink
kubectl get deployment cutlink -n cutlink -o yaml | grep image
```

The Deployment should now use the image tag from the rolled-back revision.

**Important:** This rollback only affects the cluster state. The Git repo still has the bad commit. If another sync triggers (e.g., auto-sync), ArgoCD will re-apply the bad state from Git. After an ArgoCD rollback, you should also revert Git to keep them in sync.

---

## Part 5: Rollback Comparison

| Aspect | Git Revert | ArgoCD Rollback |
|--------|-----------|-----------------|
| **What changes** | Git history | Cluster state only |
| **How** | `git revert <commit>` | `argocd app rollback <app> <id>` |
| **Audit trail** | Full Git history entry | Sync history entry |
| **Permanent?** | Yes — Git is the source of truth | No — next sync reverts to Git |
| **When to use** | Bad commit isolated | Emergency recovery, or mixed commits |
| **Best practice** | Preferred | Follow with a Git revert |

**For production, the recommended workflow is:**
1. `argocd app rollback cutlink --prune` — restore service immediately
2. `git revert <bad-commit>` — permanently fix the source of truth
3. Let auto-sync reconcile (it will be a no-op since step 2 matches step 1)

---

## Verification Checklist

- [ ] Sync waves are configured on resources via annotations
- [ ] `argocd app sync cutlink` shows wave-ordered deployment
- [ ] Web UI shows wave grouping in the PARAMETERS tab
- [ ] `git revert` of a bad commit triggers ArgoCD auto-sync
- [ ] `argocd app rollback` restores cluster to a previous sync ID
- [ ] Application returns to `Synced` and `Healthy` after rollback

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Sync wave not ordering correctly | Missing or incorrect annotation value | Verify `argocd.argoproj.io/sync-wave: "1"` on each resource |
| Wave stuck waiting | Resource in previous wave never becomes Healthy | `kubectl describe pod -n cutlink` to find the issue |
| `argocd app rollback` not showing history | No successful syncs recorded | Run a manual sync first |
| Rollback succeeds but cluster reverts to bad state | Auto-sync reapplies the bad Git commit | Do a Git revert immediately after the rollback |
| Hook job never completes | Job logic error | `kubectl logs job/db-migration -n cutlink` |

---

## What You Learned

- Configured sync waves to enforce ordered deployment
- Used Git revert to perform a source-of-truth rollback
- Used `argocd app rollback` for emergency cluster-state rollback
- Combined both rollback strategies for a best-practice workflow

Sync waves and rollback are essential tools for production GitOps. Sync waves prevent deployment order issues. Rollback strategies give you confidence that a bad deploy is never permanent.

---

**Next: Stage 6 — Observability with Prometheus, Grafana, and Loki.**
