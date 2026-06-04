# Stage 6: Promotion Flow

**Goal:** Build an end-to-end promotion pipeline: code merges to main, auto-deploys to dev, auto-promotes to staging, manual approval gates production.

**Prerequisites:** Stages 1-5 complete. Flux running with all three environments.

---

## 1. Theory (What & Why)

### The promotion ladder

```text
Developer pushes code
    │
    v
┌──────┐   auto    ┌─────────┐   auto    ┌────────────┐
│ Dev  │ ────────> │ Staging │ ────────> │ Production │
│      │           │         │           │ (approval) │
└──────┘           └─────────┘           └────────────┘
```

- **Dev:** Every push to main deploys automatically. Break things here.
- **Staging:** Automatic after dev succeeds (Flux dependency). Run integration tests.
- **Production:** Manual approval gate. A human reviews staging, then triggers promotion.

### Flux dependencies

In `gotk-sync.yaml`, the staging Kustomization has `dependsOn: [billflow-dev]`. This means Flux wont reconcile staging until dev is healthy. Same for production depending on staging.

### Manual gates

For production, use Flux suspend/resume:
```bash
flux suspend kustomization billflow-production    # hold
flux resume kustomization billflow-production     # release after approval
```

Or use GitHub Environments with required reviewers for the production deployment.

---

## 2. Hands-On

### 2.1 Push a change and watch it flow

1. Change the billing service (add a new endpoint)
2. Push to main
3. Watch dev deploy: `flux get kustomizations --watch`
4. Watch staging follow after dev succeeds
5. Production remains suspended until you resume it

### 2.2 Rollback

If staging is broken:
```bash
git revert HEAD
git push
```

Flux detects the revert and reconciles — rolling back automatically. No manual kubectl needed.

---

## Exercises

1. [Exercise 1 — End-to-end promotion](exercises/01-promotion.md)
2. [Exercise 2 — Rollback a bad deploy](exercises/02-rollback.md)

**Next stage:** [07-backup-dr](../07-backup-dr/README.md)
