# Stage 6: Promotion Flow

**Goal:** Build an end-to-end promotion pipeline: code merges to main, auto-deploys to dev, auto-promotes to staging, manual approval gates production. This stage ties together everything from stages 1-5 into a working delivery pipeline.

**Prerequisites:** Stages 1-5 complete. Flux running with all three environments. BillFlow deployed and healthy in dev, staging, and production.

---

## 1. Theory (What & Why)

### The promotion ladder

In traditional deployment, someone picks a build artifact and manually deploys it to each environment. This is slow, error-prone, and requires access that should be restricted.

With GitOps promotion, the flow is:

```text
Developer pushes code to main
         |
         v
  +-----------+    auto     +----------+    auto     +------------+
  |    Dev    | ----------> | Staging  | ----------> | Production |
  | (instant) |             | (after   |             | (manual    |
  |           |             |  dev OK) |             |  approval) |
  +-----------+             +----------+             +------------+
```

The rules:
- **Dev:** Every merge to main deploys automatically. This is your fastest feedback loop. Break things here.
- **Staging:** Deploys automatically after dev is healthy. Run integration tests, performance tests, and manual QA. Mirrors production as closely as possible.
- **Production:** Manual approval gate. A human reviews staging, confirms it works, then triggers promotion. For BillFlow (a billing service), this extra gate prevents bad charges reaching real customers.

### How Flux implements this

Flux Kustomization resources have a `dependsOn` field:

```yaml
# Staging depends on dev
metadata:
  name: billflow-staging
spec:
  dependsOn:
    - name: billflow-dev

# Production depends on staging
metadata:
  name: billflow-production
spec:
  dependsOn:
    - name: billflow-staging
```

When you push a change to main:
1. Flux detects the new commit
2. Reconciles billflow-dev first
3. Waits for dev to be healthy (all pods running, health checks passing)
4. Only then reconciles billflow-staging
5. Waits for staging to be healthy
6. Only then reconciles billflow-production

If dev fails (pods crashing, health checks failing), staging and production are **not updated**. The broken code stays in dev. The blast radius is contained.

### Manual gates for production

Two approaches:

**Approach 1: Flux suspend/resume**

```bash
flux suspend kustomization billflow-production    # hold
# Test staging, review metrics
flux resume kustomization billflow-production     # release
```

**Approach 2: GitHub Environments**

Create an environment called "production" in repo settings with required reviewers. GitHub holds the deployment until a reviewer approves. Better audit trail for compliance.

---

## 2. Hands-On: End-to-End Promotion

### 2.1 Make a code change

Add a new endpoint to BillFlow. Edit `billing-service/server.js`:

```javascript
app.get('/api/status', (req, res) => {
  res.json({
    service: 'billflow',
    version: '1.1.0',
    uptime: process.uptime(),
    env: process.env.NODE_ENV,
    subscriptions: subscriptions.length,
    invoices: invoices.length
  });
});
```

### 2.2 Commit and push

```bash
git add billing-service/server.js
git commit -m "feat: add status endpoint with service health info"
git push origin main
```

### 2.3 Watch the promotion flow

```bash
flux get kustomizations --watch
```

You will see:
1. `billflow-dev` reconciles first (within 1-5 minutes)
2. Dev pods restart with the new code
3. Once dev health checks pass, `billflow-staging` reconciles
4. Staging pods restart
5. `billflow-production` follows (if not suspended)

### 2.4 Confirm each environment

```bash
# Dev
kubectl port-forward svc/billflow -n billflow-dev 3001:80 &
curl http://localhost:3001/api/status
# {"service":"billflow","version":"1.1.0","env":"dev",...}

# Staging
kubectl port-forward svc/billflow -n billflow-staging 3002:80 &
curl http://localhost:3002/api/status
# {"service":"billflow","version":"1.1.0","env":"staging",...}

# Production
kubectl port-forward svc/billflow -n billflow-production 3003:80 &
curl http://localhost:3003/api/status
# {"service":"billflow","version":"1.1.0","env":"production",...}
```

### 2.5 Test the safety net: break dev

Push a change that breaks the health check:

```javascript
app.get('/health', (req, res) => res.status(500).json({ status: 'broken' }));
```

```bash
git commit -am "test: intentionally break health check"
git push
```

Watch Flux:
- `billflow-dev` reconciles — pods deploy but health checks fail
- `billflow-dev` shows "health check failed" status
- `billflow-staging` does **NOT** reconcile — the dependency blocks it
- `billflow-production` is safe — still running the previous version

This is the power of the dependency chain. Broken code in dev cannot reach staging or production.

### 2.6 Fix and watch recovery

```bash
git revert HEAD
git push
```

Flux detects the revert:
- Dev reconciles with the fixed code
- Health checks pass
- Staging and production follow automatically

No manual intervention. No kubectl. Just Git.

### 2.7 Manual production gate

For extra safety, suspend production before risky changes:

```bash
flux suspend kustomization billflow-production
# Push, let dev and staging deploy, test staging thoroughly
flux resume kustomization billflow-production
```

---

## 3. Key patterns

### Canary promotion

Instead of promoting the full deployment, promote a canary first:
- 1 production pod runs the new version
- 9 pods run the old version
- Monitor error rates and latency for 15 minutes
- If healthy, promote the rest

Flux supports this via Flagger — a progressive delivery controller.

### Rollback

In GitOps, rollback is just `git revert`:

```bash
git log --oneline -5
git revert abc1234
git push
```

No `kubectl rollout undo`. No SSH. No emergency access. Just Git.

### Drift detection

If someone manually scales production to 10 replicas during an incident:

```bash
kubectl scale deployment billflow -n billflow-production --replicas=10
```

Flux will detect the drift on the next reconciliation and scale it back to 3 (what Git says). If you need to keep the change, update Git:

```bash
git commit -am "feat: scale production to 10 replicas for peak traffic"
git push
```

Now Git and the cluster agree.

---

## 4. Common mistakes

- **No dependency chain:** Without `dependsOn`, all environments update simultaneously. A bug hits production at the same time as dev.
- **Suspending and forgetting:** If you suspend production and forget to resume, production falls behind. Set a reminder or use an alert.
- **Testing in production instead of staging:** Staging exists for a reason. If it does not match production closely enough, fix staging.
- **Reverting the wrong commit:** When multiple commits land between reconciliations, reverting the latest might not fix the issue. Check `flux get kustomizations` to see which revision is deployed.
- **Not monitoring after promotion:** Even if the deployment succeeds, watch metrics for 15-30 minutes. A successful rollout is not the same as a healthy service.

---

## Exercises

1. [Exercise 1 — End-to-end promotion](exercises/01-promotion.md)
2. [Exercise 2 — Rollback a bad deploy](exercises/02-rollback.md)

**Next stage:** [07-backup-dr](../07-backup-dr/README.md) — cluster backup and disaster recovery.
