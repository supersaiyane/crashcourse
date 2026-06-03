# Exercise 3: App of Charts (Dependencies)

**Goal:** Create a parent chart that composes Cutlink with PostgreSQL and Redis as subcharts.

## Step 1 — Create the parent chart

```bash
helm create sample-app/helm/cutlink-app
rm -rf sample-app/helm/cutlink-app/templates/*.yaml
```

## Step 2 — Add dependencies to Chart.yaml

Edit `sample-app/helm/cutlink-app/Chart.yaml` to add:

```yaml
dependencies:
  - name: cutlink-backend
    version: "0.1.0"
    repository: "file://../cutlink"
    condition: cutlink-backend.enabled
```

## Step 3 — Add Bitnami repository

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

## Step 4 — Add PostgreSQL and Redis as dependencies

Add to `Chart.yaml` dependencies:

```yaml
  - name: postgresql
    version: "~12.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
  - name: redis
    version: "~17.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: redis.enabled
```

## Step 5 — Download dependencies

```bash
helm dependency update sample-app/helm/cutlink-app/
```

## Step 6 — Create parent values.yaml

Write `values.yaml` for the parent chart with per-subchart overrides:
- cutlink-backend: `replicaCount: 3`
- postgresql: auth details, 5Gi persistence
- redis: standalone mode, auth disabled

## Step 7 — Render and inspect

```bash
helm template cutlink-app sample-app/helm/cutlink-app/ --debug
```

## Step 8 — Install the full stack (optional)

```bash
kind load docker-image cutlink-backend:latest
kind load docker-image cutlink-frontend:latest
helm install cutlink-stack sample-app/helm/cutlink-app/ --namespace cutlink-prod --create-namespace
```

## Step 9 — Verify

```bash
helm list
kubectl get pods -n cutlink-prod
```

Notice the naming convention: `{release}-{subchart-name}-{replica}`.
