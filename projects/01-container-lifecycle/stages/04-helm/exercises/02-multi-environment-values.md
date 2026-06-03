# Exercise 2: Multi-Environment Values

**Goal:** Understand how values compose across environments.

## Step 1 — Compare the values files

```bash
cat sample-app/helm/cutlink/values.yaml
cat sample-app/helm/cutlink/values-development.yaml
cat sample-app/helm/cutlink/values-staging.yaml
cat sample-app/helm/cutlink/values-production.yaml
```

Notice what differs per environment:
- Dev: `DEBUG=true`, no ingress, no HPA
- Staging: moderate replicas, staging ingress host
- Prod: 3+ replicas, bigger resources, ingress with TLS, HPA min=3 max=10, 5Gi PVC

## Step 2 — Render templates with different environments

```bash
helm template cutlink-dev sample-app/helm/cutlink/ -f sample-app/helm/cutlink/values-development.yaml > /tmp/cutlink-dev.yaml
helm template cutlink-prod sample-app/helm/cutlink/ -f sample-app/helm/cutlink/values-production.yaml > /tmp/cutlink-prod.yaml
diff /tmp/cutlink-dev.yaml /tmp/cutlink-prod.yaml
```

Notice the differences: replicas (1 vs 3), CPU limits, ingress/HPA presence, PVC size.

## Step 3 — Merge precedence demonstration

```bash
helm template cutlink-override sample-app/helm/cutlink/ \
  -f sample-app/helm/cutlink/values-production.yaml \
  --set backend.replicaCount=5
```

The `--set` overrides the values file.

## Step 4 — Install to the cluster (optional)

```bash
kind load docker-image cutlink-backend:latest
kind load docker-image cutlink-frontend:latest
helm install cutlink-dev sample-app/helm/cutlink/ -f sample-app/helm/cutlink/values-development.yaml --namespace cutlink-dev --create-namespace
```
