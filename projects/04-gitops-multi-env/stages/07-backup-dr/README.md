# Stage 7: Backup & Disaster Recovery

**Goal:** Set up cluster-level backups with Velero, test disaster recovery by destroying and restoring the BillFlow namespace.

**Prerequisites:** Stages 1-6 complete. Velero CLI installed. An object storage bucket (S3, GCS, or MinIO).

---

## 1. Theory (What & Why)

### Why backups when you have GitOps?

GitOps recreates your manifests from Git. But it does not restore:
- **Persistent data** — PVCs, databases, StatefulSets
- **Custom resources** — CRDs and their instances
- **Cluster state** — RBAC, namespaces, resource quotas
- **Secrets** — even SealedSecrets need the controllers private key

Velero backs up everything — manifests, PV snapshots, and cluster metadata — to object storage. If the cluster dies, Velero restores it completely.

### Velero architecture

```text
velero CLI ──> Velero server (in-cluster) ──> Object Storage (S3/GCS)
                     │
                     v
              Volume Snapshots (CSI/cloud provider)
```

### Backup strategies

- **Scheduled:** Daily full backup at 02:00 UTC
- **On-demand:** Before risky operations (cluster upgrades, migrations)
- **Namespace-scoped:** Back up only billflow-production, not the whole cluster

---

## 2. Hands-On

### 2.1 Install Velero

```bash
velero install --provider aws --bucket velero-backups --secret-file ./credentials --backup-location-config region=us-east-1,s3ForcePathStyle=true,s3Url=http://minio:9000
```

### 2.2 Create a backup

```bash
velero backup create billflow-backup --include-namespaces billflow-production
velero backup describe billflow-backup
```

### 2.3 Simulate disaster

```bash
kubectl delete namespace billflow-production
```

### 2.4 Restore

```bash
velero restore create --from-backup billflow-backup
kubectl get pods -n billflow-production
```

Everything is back — deployments, services, configmaps, secrets.

---

## Exercises

1. [Exercise 1 — Backup and restore](exercises/01-backup-restore.md)
2. [Exercise 2 — Scheduled backups](exercises/02-scheduled-backups.md)

**Congratulations — you have completed the GitOps Multi-Environment project.**
