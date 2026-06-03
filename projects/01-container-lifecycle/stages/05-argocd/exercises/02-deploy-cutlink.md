# Exercise 2: Deploy Cutlink via GitOps

In this exercise, you will deploy the Cutlink Helm chart (built in Stage 4) through ArgoCD. You will:

1. Push the Helm chart to a Git repository
2. Create an ArgoCD Application that points to it
3. Watch ArgoCD sync the application automatically
4. Make a change in Git and watch ArgoCD auto-reconcile

---

## Prerequisites

- ArgoCD is installed and running (Exercise 1 completed)
- The Cutlink Helm chart exists at `sample-app/helm/cutlink/` in your project
- You have a Git repository (GitHub, GitLab, or any reachable Git server)
- ArgoCD CLI is logged in (`argocd login localhost:8080`)

---

## Step 1: Push the Helm Chart to Git

If the Helm chart is not already in version control, initialize the repo:

```bash
cd /path/to/container-lifecycle-course
git init
git add sample-app/helm/cutlink/
git commit -m "feat: add Cutlink Helm chart"
git remote add origin https://github.com/your-org/cutlink.git
git push -u origin main
```

**Important:** The repo must be accessible from ArgoCD. For a private repo, you'll need to configure repository credentials (Step 1b below). For this exercise, you can use a public repo if security allows.

### Step 1b (Optional): Add a Private Repository

If your repo is private, register it with ArgoCD:

```bash
argocd repo add https://github.com/your-org/cutlink.git \
  --username your-github-username \
  --password your-github-token
```

Alternatively, use SSH:
```bash
argocd repo add git@github.com:your-org/cutlink.git \
  --ssh-private-key-path ~/.ssh/id_rsa
```

Verify the repo was added:
```bash
argocd repo list
```

---

## Step 2: Create the Application Manifest

Create a file named `application-cutlink.yaml` with the following content:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: cutlink
  namespace: argocd
  labels:
    app: cutlink
    tier: application
    environment: production
spec:
  project: default
  source:
    repoURL: https://github.com/your-org/cutlink.git
    path: sample-app/helm/cutlink
    targetRevision: HEAD
    helm:
      valueFiles:
        - values-production.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: cutlink
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

**Replace `https://github.com/your-org/cutlink.git` with your actual repository URL.**

---

## Step 3: Apply the Application

```bash
kubectl apply -f application-cutlink.yaml
```

This creates an Application CRD in the `argocd` namespace. ArgoCD's Application Controller detects the new CRD and begins the reconciliation loop.

---

## Step 4: Watch the Sync in the CLI

Check the Application status:

```bash
argocd app get cutlink
```

This shows:
- **Source:** the Git repo, path, and revision
- **Destination:** the target cluster and namespace
- **Status:** Synced or OutOfSync
- **Health:** Healthy, Degraded, or Progressing

Watch live sync progress:

```bash
argocd app sync cutlink
```

During sync, you'll see ArgoCD create each Kubernetes resource:

```
TIMESTAMP  GROUP        KIND           NAMESPACE  NAME        STATUS   HEALTH
2026-06-03 ConfigMap    cutlink        cutlink-config    Synced   Healthy
2026-06-03 Secret       cutlink        cutlink-secret    Synced   Healthy
2026-06-03 Service      cutlink        cutlink           Synced   Healthy
2026-06-03 Deployment   cutlink        cutlink           Synced   Healthy
```

---

## Step 5: Watch the Sync in the Web UI

1. Open **https://localhost:8080** in your browser
2. Log in as `admin`
3. You should see the `cutlink` Application on the main dashboard

   The UI shows:
   - **App name** and namespace
   - **Sync status** (Synced / OutOfSync) — shown as a colored circle
   - **Health status** (Healthy / Degraded / Progressing)
   - **Last sync** time and revision

4. Click on the `cutlink` Application to see the full details page:

   - **APPLICATION DETAILS** — tabs for summary, manifests, logs
   - **APP TREE** — visual tree of all resources (Deployment → ReplicaSet → Pod)
   - **NETWORK** — Services and Ingresses
   - **RESOURCES** — flat list of all resources with sync and health status

5. Click the **APP TREE** tab. You should see:
   - `cutlink` namespace
   - A Deployment (cutlink)
   - The ReplicaSet
   - Each Pod
   - The Service
   - The ConfigMap
   - The Secret (shown as masked)

---

## Step 6: Change Values in Git and Watch Auto-Sync

This is the most important part — you'll see GitOps reconciliation in action.

1. **Edit the values file:**

   ```bash
   # Open sample-app/helm/cutlink/values-production.yaml
   # Change replicaCount from 1 to 3
   # Change image.tag to a newer version
   ```

2. **Commit and push:**

   ```bash
   git add sample-app/helm/cutlink/values-production.yaml
   git commit -m "feat: scale cutlink to 3 replicas, update image tag"
   git push
   ```

3. **Wait for ArgoCD to detect the change** (default reconciliation interval is 3 minutes, or you can force it):

   ```bash
   # Force immediate reconciliation (don't wait 3 minutes):
   argocd app sync cutlink
   ```

4. **Watch the roll-out:**

   ```bash
   # Watch the live sync:
   argocd app get cutlink -w
   ```

   You should see:
   - Status changes from `Synced` to `OutOfSync`
   - Then back to `Synced` as ArgoCD applies the change
   - The Deployment rolling out new pods

5. **Verify in Kubernetes:**

   ```bash
   kubectl get pods -n cutlink
   kubectl get deployment cutlink -n cutlink -o yaml | grep replicas
   ```

---

## Step 7: Test Self-Healing

GitOps isn't about preventing manual changes — it's about correcting them.

1. **Manually break something:**

   ```bash
   # Scale the deployment down manually:
   kubectl scale deployment cutlink -n cutlink --replicas=0
   ```

2. **Watch what happens:**

   ```bash
   kubectl get pods -n cutlink -w
   ```

   ArgoCD's self-heal mechanism will detect the drift (the Deployment manifest in Git says `replicas: 3`, but the cluster has `replicas: 0`), and it will scale back up to 3 within minutes (or instantly if you trigger `argocd app sync cutlink`).

3. **Also check the Web UI:**
   - The Application will briefly show `OutOfSync`
   - Then return to `Synced` and `Healthy`

---

## Step 8: Clean Up (Optional)

To remove the Application without removing the resources (orphan):

```bash
kubectl delete application cutlink -n argocd
```

To remove everything including the resources:

```bash
argocd app delete cutlink
```

---

## Verification Checklist

- [ ] `argocd app list` shows `cutlink` with `Synced` status
- [ ] `kubectl get pods -n cutlink` shows running pods
- [ ] Changing `values-production.yaml` and pushing triggers auto-sync
- [ ] Manually scaling down is reverted by self-heal
- [ ] Web UI shows the Application and its resource tree

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `Connection refused` to repo | Private repo without credentials | Register the repo with `argocd repo add` |
| `Unable to generate manifests` | Invalid Helm chart or values | Run `helm template` locally to verify |
| Sync stuck in `Progressing` | Resource taking too long to become healthy | `kubectl describe pod -n cutlink` to check events |
| `CreateNamespace=true` not working | RBAC restriction | ArgoCD might not have permission to create namespaces |
| Self-heal not reverting changes | `selfHeal: false` in syncPolicy | Update the Application manifest |

---

## What You Learned

- Deployed an application through ArgoCD using a Helm chart from Git
- Watched Git-to-cluster reconciliation in real-time
- Triggered auto-sync by pushing a Git commit
- Verified self-healing by breaking the cluster state manually

This is GitOps in action: Git as the source of truth, ArgoCD as the reconciliation engine.

Proceed to **Exercise 3: Sync Waves and Rollback**.
