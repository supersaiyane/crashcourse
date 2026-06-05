# Exercise 1: Create Kubernetes Manifests

**Goal:** Write Deployment, Service, ConfigMap, and Secret manifests for all three CloudPlatform components (API, processor, frontend).

## Step 1: Create the directory structure

```bash
mkdir -p k8s/base                        # base manifests shared across all clouds
```

## Step 2: Write the ConfigMap

```bash
cat > k8s/base/configmap.yaml << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: cloudplatform-config
  labels:
    app.kubernetes.io/name: cloudplatform
data:
  DATABASE_HOST: "postgres"              # K8s service name for the database
  DATABASE_NAME: "analytics"
  KAFKA_BROKER: "kafka:9092"
  LOG_LEVEL: "info"
  PROCESSOR_WORKERS: "4"
EOF
```

## Step 3: Write the Secret

```bash
cat > k8s/base/secret.yaml << 'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: cloudplatform-secrets
  labels:
    app.kubernetes.io/name: cloudplatform
type: Opaque
stringData:
  DATABASE_PASSWORD: "change-me-in-production"
  API_KEY: "cp-dev-key-replace-me"
EOF
# NOTE: never commit real secrets to Git — use External Secrets Operator in production
```

## Step 4: Write Deployment + Service for each component

Create `api-deployment.yaml`, `processor-deployment.yaml`, and `frontend-deployment.yaml` following the patterns in the stage README. Each should include:
- Pinned image tag (not `:latest`)
- `envFrom` referencing both ConfigMap and Secret
- Resource requests and limits
- Readiness and liveness probes (API and frontend)

```bash
ls k8s/base/
# configmap.yaml  secret.yaml  api-deployment.yaml  processor-deployment.yaml  frontend-deployment.yaml
```

## Step 5: Validate the YAML syntax

```bash
kubectl apply --dry-run=client -f k8s/base/    # validates without applying
# configmap/cloudplatform-config created (dry run)
# secret/cloudplatform-secrets created (dry run)
# deployment.apps/analytics-api created (dry run)
# ...
```

## Verify

```bash
kubectl apply --dry-run=client -f k8s/base/ 2>&1 | grep -c "created (dry run)"
```

You should see: a count matching the number of resources you created (at least 7: ConfigMap, Secret, 3 Deployments, 2+ Services). No errors in the output.
