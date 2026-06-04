# Stage 7: Backup and Disaster Recovery

**Goal:** Set up cluster-level backups with Velero, test disaster recovery by destroying and restoring the BillFlow namespace, and establish a backup strategy that covers what GitOps cannot.

**Prerequisites:** Stages 1-6 complete. Velero CLI installed. An object storage bucket (S3, GCS, or MinIO for local testing).

---

## 1. Theory (What & Why)

### Why backups when you have GitOps?

GitOps recreates your manifests from Git. But Git does not contain everything in your cluster:

| What Git has | What Git does NOT have |
|-------------|----------------------|
| Deployment, Service, Ingress YAML | Persistent Volume data (databases, uploads) |
| ConfigMaps, SealedSecrets | Custom Resource instances (CRDs with state) |
| Kustomize overlays | Dynamic state (leader election, locks, leases) |
| Flux sync manifests | Manually-applied RBAC, quotas, network policies |

If your cluster dies and you only have Git, you get back the containers and services — but the database is empty, the CRD instances are gone, and any manually-applied RBAC is missing.

Velero fills the gap: it backs up everything — manifests, persistent volume snapshots, and cluster metadata — to object storage.

### Velero architecture

```text
velero CLI                     Velero Server (in-cluster)
    |                               |
    | create backup                 | 1. Discover resources
    |------------------------------>| 2. Serialize to JSON
                                    | 3. Snapshot PVs (CSI/cloud)
                                    | 4. Upload to object storage
                                    |
                                    v
                            +------------------+
                            | Object Storage   |
                            | (S3/GCS/MinIO)   |
                            | - manifests.tar  |
                            | - PV snapshots   |
                            +------------------+
```

### Backup strategies

| Strategy | When | What | Retention |
|----------|------|------|-----------|
| **Scheduled daily** | Every night at 02:00 UTC | Full cluster or selected namespaces | 7 days |
| **Pre-change** | Before cluster upgrades, migrations | Full cluster | Until change confirmed safe |
| **Namespace-scoped** | Continuous | Only production namespaces | 30 days |
| **On-demand** | Before risky operations | Specific namespace | Manual cleanup |

For BillFlow, we use namespace-scoped backups of `billflow-production` on a daily schedule, plus on-demand backups before upgrades.

### RTO vs RPO

| Metric | Definition | BillFlow target |
|--------|-----------|----------------|
| **RPO** | Maximum acceptable data loss (time since last backup) | 24 hours (daily backup) |
| **RTO** | Maximum acceptable downtime (time to restore) | 1 hour |

With daily backups and Velero's restore taking 5-15 minutes for a namespace, both targets are achievable.

---

## 2. Hands-On: Backup and Restore BillFlow

### 2.1 Install Velero with MinIO (local testing)

Start MinIO:

```bash
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"

# Create the backup bucket
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/velero-backups
```

Create a credentials file (`/tmp/velero-creds.ini`):

```ini
[default]
aws_access_key_id = minioadmin
aws_secret_access_key = minioadmin
```

Install Velero:

```bash
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.10.0 \
  --bucket velero-backups \
  --secret-file /tmp/velero-creds.ini \
  --backup-location-config region=us-east-1,s3ForcePathStyle=true,s3Url=http://minio:9000 \
  --use-node-agent
```

### 2.2 Confirm Velero is running

```bash
velero version
kubectl get pods -n velero
# velero-xxx        1/1   Running
# node-agent-xxx    1/1   Running
```

### 2.3 Create an on-demand backup

```bash
velero backup create billflow-prod-backup \
  --include-namespaces billflow-production \
  --wait

velero backup describe billflow-prod-backup
# Phase:  Completed
# Items backed up: 15
```

### 2.4 See what was backed up

```bash
velero backup describe billflow-prod-backup --details
# apps/v1/Deployment:  billflow-production/billflow
# v1/Service:          billflow-production/billflow
# v1/Secret:           billflow-production/billflow-db-creds
# v1/Secret:           billflow-production/billflow-tls
# v1/ConfigMap:        billflow-production/billflow-config
```

Everything in the namespace — deployments, services, secrets, configmaps, ingresses.

### 2.5 Simulate disaster

```bash
# Delete the entire production namespace
kubectl delete namespace billflow-production

# Confirm it is gone
kubectl get all -n billflow-production
# No resources found
```

In a real disaster: accidental deletion, failed cluster upgrade, cloud provider outage.

### 2.6 Restore from backup

```bash
velero restore create --from-backup billflow-prod-backup --wait

velero restore describe billflow-prod-backup-xxx
# Phase: Completed
# Items restored: 15
```

### 2.7 Confirm everything is back

```bash
kubectl get all -n billflow-production
# pod/billflow-xxx    1/1   Running
# service/billflow    ClusterIP   10.96.xxx   80/TCP

kubectl get secrets -n billflow-production
# billflow-db-creds
# billflow-tls

kubectl port-forward svc/billflow -n billflow-production 3000:80 &
curl http://localhost:3000/health
# {"status":"ok","env":"production"}
```

Everything restored — pods, services, secrets, TLS certificates.

---

## 3. Key patterns

### Scheduled backups

```bash
velero schedule create daily-prod-backup \
  --schedule="0 2 * * *" \
  --include-namespaces billflow-production \
  --ttl 168h    # retain 7 days

velero schedule get
# NAME                 STATUS    SCHEDULE      LAST BACKUP
# daily-prod-backup    Enabled   0 2 * * *     2026-06-04 02:00:00
```

The `--ttl 168h` ensures old backups are automatically cleaned up.

### Backup hooks for databases

Run commands inside containers before or after backup:

```yaml
metadata:
  annotations:
    pre.hook.backup.velero.io/container: postgres
    pre.hook.backup.velero.io/command: '["/bin/bash", "-c", "pg_dump -U billflow > /tmp/backup.sql"]'
```

This runs `pg_dump` before Velero snapshots the PV, ensuring consistency.

### Cross-cluster restore

Velero backups are portable. Restore to a different cluster:

```bash
# On new cluster, install Velero pointing to the same bucket
velero install --provider aws --bucket velero-backups ...

# Backup appears automatically
velero backup get

# Restore
velero restore create --from-backup billflow-prod-backup
```

This is how you do cluster migration.

### Disaster recovery runbook

```text
1. Assess: namespace deleted? cluster dead? cloud region down?
2. Namespace deleted:
   - velero restore create --from-backup <latest>
   - Flux reconciles any drift after restore
   - Validate: curl /health on all services
3. Cluster dead:
   - Provision new cluster (Terraform)
   - Install Flux, Velero
   - Restore from backup
   - Bootstrap Flux to reconnect GitOps
4. Cloud region down:
   - Failover to DR cluster in different region
   - Restore from cross-region backup
5. Post-recovery:
   - All services healthy?
   - Secrets and TLS certs valid?
   - Run integration tests
   - Update incident timeline
```

---

## 4. Common mistakes

- **Not testing restores:** A backup you have never restored is a backup you cannot trust. Test monthly.
- **Backing up too much:** Full cluster backups are slow and expensive. Scope to namespaces that matter.
- **No TTL on backups:** Without TTL, old backups accumulate and storage costs grow.
- **Forgetting PV snapshots:** Velero backs up manifests by default but may need explicit configuration for volume snapshots. Test that PV data is actually captured.
- **Not backing up the Sealed Secrets private key:** If you lose the controller key, you cannot decrypt SealedSecrets on a new cluster.
- **Single-region backups:** If your backup bucket is in the same region as your cluster, a regional outage loses both. Use cross-region replication.

---

## Exercises

1. [Exercise 1 — Backup and restore](exercises/01-backup-restore.md)
2. [Exercise 2 — Scheduled backups](exercises/02-scheduled-backups.md)

**Congratulations — you have completed the GitOps Multi-Environment project.**

You now have a complete GitOps pipeline: trunk-based development, Kustomize multi-environment overlays, Flux continuous delivery, encrypted secrets, automated TLS, promotion gates, and disaster recovery. This is production-grade infrastructure management.
