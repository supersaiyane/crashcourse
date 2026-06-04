# Project 4: GitOps Multi-Environment

**App:** BillFlow — a SaaS billing service promoting through dev → staging → production

**What you'll build:** A GitOps pipeline that manages three environments from a single Git repo. You'll use Kustomize for environment-specific overlays, Flux for continuous delivery, Sealed Secrets for encrypted credentials, cert-manager for TLS, and Velero for disaster recovery.

**Tier:** Intermediate (3-7 years experience)

**Duration:** 6-8 weeks

**Courses covered:** Git, Kustomize, Flux, Sealed Secrets, cert-manager, Velero

## Stages

| # | Stage | Course | What you'll do |
|---|-------|--------|---------------|
| 1 | Git Branching | `Git.md` | Trunk-based development, PR workflow, branch protection |
| 2 | Kustomize Overlays | `Kustomize.md` | Base manifests + per-environment overlays |
| 3 | Flux Bootstrap | `Flux.md` | GitOps operator, sources, kustomizations |
| 4 | Sealed Secrets | `Sealed-Secrets.md` | Encrypt secrets in Git safely |
| 5 | cert-manager | `cert-manager.md` | Automated TLS certificates with Let's Encrypt |
| 6 | Promotion Flow | *(synthesis)* | Dev → staging → production promotion pipeline |
| 7 | Backup & DR | `Velero.md` | Cluster backup, restore, disaster recovery |

## The app: BillFlow

A billing API that handles subscriptions, invoices, and payment webhooks.

```text
┌──────────┐     ┌──────────┐     ┌──────────┐
│   Dev    │ ──> │ Staging  │ ──> │Production│
│ (auto)   │     │ (auto)   │     │ (manual) │
└──────────┘     └──────────┘     └──────────┘
      Git push       PR merge        Approval
```

## Getting started

```bash
cd BillFlow
npm install
npm test
npm start  # http://localhost:3000
```

Then work through each stage starting at `stages/01-git-branching/README.md`.
