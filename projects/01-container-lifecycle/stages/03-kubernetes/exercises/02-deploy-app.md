# Exercise 2: Deploy Cutlink to Kubernetes

**Goal:** Deploy the full Cutlink application (PostgreSQL, Redis, backend API, frontend) into your kind cluster.

**Prerequisites:** Exercise 1 completed — your kind cluster is running and you have kubectl access.

**Manifests location:** `../manifests/` (relative to this file)

---

## Step 1: Build and Push Container Images

Kubernetes needs to pull container images from somewhere. With kind, the simplest approach is to load images directly into the cluster's Docker daemon — no registry needed.

### Build the images (from the sample-app directory)

```bash
# Build backend
cd ../sample-app/backend
docker build -t cutlink-backend:latest .

# Build frontend
cd ../frontend
docker build -t cutlink-frontend:latest .
```

### Load images into kind

kind runs each "node" as a Docker container. Those containers don't have access to your local Docker images by default. You must explicitly load them:

```bash
kind load docker-image cutlink-backend:latest --name cutlink
kind load docker-image cutlink-frontend:latest --name cutlink
```

Verify the images are available on the nodes:
```bash
# Exec into a worker node and check
docker exec -it cutlink-worker crictl images | grep cutlink
```

> **Alternative: Using a registry**
> 
> In a real workflow, you'd push images to a container registry (Docker Hub, ECR, GCR) and reference the full URL in your Deployment manifests:
> ```yaml
> image: my-registry.example.com/cutlink-backend:v1
> ```
> 
> kind can also run a local registry — see the kind docs for the `local-registry` example.

---

## Step 2: Review the Manifests

Before applying anything, let's understand what each manifest does:

| File | Creates | Purpose |
|------|---------|---------|
| `namespace.yaml` | Namespace: cutlink | Isolated environment for the app |
| `postgres.yaml` | ConfigMap, PVC, StatefulSet, Service | PostgreSQL database |
| `redis.yaml` | Deployment, Service | Redis cache |
| `backend.yaml` | ConfigMap, Secret, Deployment, Service | Flask API |
| `frontend.yaml` | Deployment, Service | nginx web server |
| `ingress.yaml` | Ingress | External HTTP routing (used later) |
| `hpa.yaml` | HorizontalPodAutoscaler | Auto-scaling (used later) |
| `kustomization.yaml` | (meta) | Groups all resources for one-command apply |

Open each file and read the comments — every field is explained inline.

---

## Step 3: Deploy Everything

Because we're using Kustomize, one command deploys the entire application:

```bash
# From the stages/03-kubernetes directory
kubectl apply -k manifests/
```

Expected output:
```
namespace/cutlink created
configmap/postgres-init created
persistentvolumeclaim/postgres-pvc created
service/postgres created
statefulset.apps/postgres created
service/redis created
deployment.apps/redis created
configmap/backend-config created
secret/cutlink-secrets created
service/backend created
deployment.apps/backend created
service/frontend created
deployment.apps/frontend created
ingress.networking.k8s.io/cutlink-ingress created
horizontalpodautoscaler.autoscaling/backend-hpa created
```

One command, 15 resources, a complete application stack. This is the power of declarative configuration — you describe the desired state, and Kubernetes makes it happen.

---

## Step 4: Watch the Deployment

```bash
# Watch all Pods come up in the cutlink namespace
kubectl get pods -n cutlink -w
```

You'll see:

```
NAME                        READY   STATUS              RESTARTS   AGE
postgres-0                  0/1     ContainerCreating   0          2s
redis-6b8d6f9d5d-x9k2l      0/1     ContainerCreating   0          2s
backend-7d4f8b9c6c-a1b2c    0/1     ContainerCreating   0          2s
backend-7d4f8b9c6c-d3e4f    0/1     ContainerCreating   0          2s
frontend-5c9f7b8d4f-g5h6i   0/1     ContainerCreating   0          2s
frontend-5c9f7b8d4f-j7k8l   0/1     ContainerCreating   0          2s
```

Watch as each transitions to `Running` then `1/1` (meaning the container passed its readiness probe).

**The startup order matters:**

1. **Postgres** starts first (it's the slowest — creating the database, running init SQL)
2. **Redis** starts quickly (simple, no persistence)
3. **Backend** waits for both Postgres and Redis to be ready (it will crash-restart a few times as it retries the DB connection — that's normal)
4. **Frontend** starts quickly (static files, no dependencies)

Kubernetes doesn't enforce startup order automatically. Each Pod retries until its dependencies are available. This is called **self-healing**.

To watch the backend crash-loop until Postgres is ready:
```bash
kubectl logs -n cutlink -l app=cutlink,component=backend --tail=20
```

You'll see connection refused errors until Postgres is ready, then the app starts successfully.

---

## Step 5: Verify Everything

```bash
# List all resources in the cutlink namespace
kubectl get all -n cutlink

# Check PersistentVolumeClaim bound status
kubectl get pvc -n cutlink

# Check logs from a specific Pod
kubectl logs -n cutlink deployment/backend

# Stream logs from all backend Pods
kubectl logs -n cutlink -l component=backend --tail=50 -f
```

---

## Step 6: Access the Application

Since our Ingress Controller isn't installed yet (that's Exercise 3), we use `kubectl port-forward` to tunnel traffic from our laptop into the cluster:

```bash
# Forward localhost:8080 to the frontend Service
kubectl port-forward -n cutlink svc/frontend 8080:80
```

This creates a tunnel from your laptop's port 8080 to the frontend Service (which load-balances across the 2 frontend Pods).

Open your browser to `http://localhost:8080` — you should see the Cutlink UI.

Try shortening a URL:
1. Paste a URL (e.g., `https://www.example.com/very/long/url/that/you/want/to/shorten`)
2. Click "Shorten"
3. Click the resulting short link — it should redirect you to the original URL

If you see errors, check the frontend console (DevTools -> Console) and backend logs.

---

## Step 7: Explore with kubectl

Try these diagnostic commands:

```bash
# Describe a Pod (shows events, conditions, containers)
kubectl describe pod -n cutlink -l component=backend

# Exec into a container
kubectl exec -n cutlink deploy/backend -- python -c "import app; print('OK')"

# Interactive shell
kubectl exec -n cutlink deploy/backend -it -- /bin/sh

# Check environment variables
kubectl exec -n cutlink deploy/backend -- env | sort

# Port forward directly to a specific Pod (load-balancing bypass)
kubectl port-forward -n cutlink pod/backend-xxxxx 5000:5000
```

---

## Step 8: Clean Up (Optional)

To remove everything but keep the cluster running:

```bash
kubectl delete -k manifests/
```

To destroy the entire cluster (all data lost):

```bash
kind delete cluster --name cutlink
```

---

## Troubleshooting

### Pod stuck in ContainerCreating

```bash
kubectl describe pod -n cutlink <pod-name>
```

Common causes:
- **Image not found** — forgot to `kind load docker-image`
- **PVC not bound** — check `kubectl get pvc -n cutlink`
- **Resource limits too low** — check node capacity with `kubectl describe node`

### Backend keeps restarting

```bash
kubectl logs -n cutlink deployment/backend --previous
```

The `--previous` flag shows logs from the terminated container. Common cause: Postgres wasn't ready when the backend tried to connect. This resolves itself once Postgres is healthy.

### Port-forward fails

```bash
# Check if something is already using port 8080
lsof -i :8080

# Use a different port
kubectl port-forward -n cutlink svc/frontend 9090:80
```

### "No resources found"

Did you remember to include `-n cutlink`? Most kubectl commands default to the `default` namespace. If you forgot, you'll see nothing:

```bash
kubectl get pods  # Shows pods in "default" namespace — probably empty
kubectl get pods -n cutlink  # Shows Cutlink pods
```

Add `--all-namespaces` to search everywhere:
```bash
kubectl get pods --all-namespaces
```
