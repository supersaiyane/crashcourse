# Stage 5: Application Deployment

**Goal:** Deploy the CloudPlatform analytics application on all three clouds — EKS (AWS), GKE (GCP), AKS (Azure) — using the same Kubernetes manifests and Nginx ingress, proving that a well-structured containerised app is genuinely portable.

**Prerequisites:** Stages 1-4 complete. Kubernetes clusters running on all three clouds. kubectl configured with contexts for each cluster. Docker images pushed to a registry accessible from all three (e.g. Docker Hub, or one ECR/GCR/ACR per cloud).

---

## Part 1 — Theory: What & Why

### The problem Kubernetes deployment solves

Without Kubernetes, deploying the same application across three clouds means learning three completely different deployment models. AWS has ECS with task definitions, GCP has Cloud Run with service configs, Azure has Container Instances with ARM templates. Each speaks a different dialect, uses different CLI commands, and requires different IAM patterns. If an engineer learns ECS deeply, none of that knowledge transfers to Cloud Run.

Kubernetes changes this equation. It provides a **single deployment API** that works identically on every cloud. A Deployment manifest written for EKS works verbatim on GKE and AKS. The kubectl commands are the same. The debugging workflow is the same. The mental model is the same. The differences — how the cloud provisions load balancers, allocates persistent storage, and maps IAM — live below the Kubernetes abstraction layer, handled by cloud-specific controllers you rarely touch directly.

This is why Kubernetes is the foundation of any serious multi-cloud strategy: it is the one layer where true portability exists.

**Mental model:** Kubernetes is the universal power socket. AWS, GCP, and Azure are different power grids with different voltages and frequencies — but your appliance plugs in the same way everywhere. The adapter (cloud provider integration) is built into the wall, not into your device.

### How Kubernetes deployment works

When you run `kubectl apply -f deployment.yaml`, the following happens:

```text
                    You
                     |
                     v
              kubectl apply
                     |
                     v
            +--------+--------+
            |  API Server     |  <-- validates, persists to etcd
            +--------+--------+
                     |
                     v
            +--------+--------+
            | Controller Mgr  |  <-- sees "desired: 2 replicas, actual: 0"
            +--------+--------+     creates 2 Pod objects
                     |
                     v
            +--------+--------+
            |   Scheduler     |  <-- assigns each Pod to a Node
            +--------+--------+
                     |
          +----------+----------+
          |                     |
    +-----v-----+        +-----v-----+
    |  Node 1   |        |  Node 2   |
    |  kubelet  |        |  kubelet  |
    |  pulls    |        |  pulls    |
    |  image    |        |  image    |
    |  starts   |        |  starts   |
    |  container|        |  container|
    +-----------+        +-----------+
```

This reconciliation loop is the same on EKS, GKE, and AKS. The API server, controller manager, and scheduler behave identically. The only cloud-specific components are the **cloud controller manager** (provisions load balancers, persistent disks) and the **CNI plugin** (networking).

### Deployment topology — CloudPlatform across three clouds

```text
                    +-----------+
                    |   Users   |
                    +-----+-----+
                          |
          +---------------+---------------+
          |               |               |
    +-----v-----+   +----v------+   +-----v-----+
    |  AWS EKS  |   |  GCP GKE  |   | Azure AKS |
    |           |   |           |   |           |
    | +-------+ |   | +-------+ |   | +-------+ |
    | | Nginx | |   | | Nginx | |   | | Nginx | |
    | |Ingress| |   | |Ingress| |   | |Ingress| |
    | +---+---+ |   | +---+---+ |   | +---+---+ |
    |     |     |   |     |     |   |     |     |
    | +---v---+ |   | +---v---+ |   | +---v---+ |
    | |  API  | |   | |  API  | |   | |  API  | |
    | | (x2)  | |   | | (x2)  | |   | | (x2)  | |
    | +---+---+ |   | +---+---+ |   | +---+---+ |
    |     |     |   |     |     |   |     |     |
    | +---v---+ |   | +---v---+ |   | +---v---+ |
    | |Proces-| |   | |Proces-| |   | |Proces-| |
    | |sor(x2)| |   | |sor(x2)| |   | |sor(x2)| |
    | +---+---+ |   | +---+---+ |   | +---+---+ |
    |     |     |   |     |     |   |     |     |
    | +---v---+ |   | +---v---+ |   | +---v---+ |
    | |  DB   | |   | |  DB   | |   | |  DB   | |
    | +-------+ |   | +-------+ |   | +-------+ |
    +-----------+   +-----------+   +-----------+
```

Each cloud runs the full stack independently. No cross-cloud traffic at this stage — each deployment is self-contained. This is intentional: it proves the manifests are portable before introducing cross-cloud complexity.

### Vocabulary

| Term | Meaning |
|------|---------|
| **Deployment** | Declares the desired state for a set of pods — replica count, image version, resource limits. Kubernetes ensures reality matches. |
| **Service** | A stable network endpoint that routes traffic to the correct pods, even as pods are created and destroyed. |
| **ConfigMap** | Non-sensitive configuration stored as key-value pairs, injected into pods as environment variables or mounted files. |
| **Secret** | Sensitive configuration (passwords, API keys) stored base64-encoded. Not encrypted by default — use external secrets in production. |
| **Ingress** | L7 HTTP(S) routing rules — maps external URLs to internal Services. Requires an ingress controller (e.g. Nginx). |
| **Ingress Controller** | The actual reverse proxy (Nginx, Traefik, HAProxy) that reads Ingress resources and configures routing. |
| **Readiness Probe** | A health check that tells Kubernetes when a pod is ready to receive traffic. Prevents 502 errors during startup. |
| **Liveness Probe** | A health check that tells Kubernetes when a pod is stuck and should be restarted. Prevents hung processes. |

### What changes per cloud (and what does not)

| Layer | Same across clouds? | What changes |
|-------|---------------------|--------------|
| **Deployment manifests** | Yes — identical YAML | Nothing |
| **Service (ClusterIP)** | Yes — identical YAML | Nothing |
| **ConfigMap / Secret** | Yes — identical YAML | Nothing |
| **Ingress annotations** | Mostly — minor differences | Cloud-specific LB annotations |
| **StorageClass** | No — cloud-specific | `gp3` (AWS), `pd-ssd` (GCP), `managed-premium` (Azure) |
| **Load balancer type** | No — provisioned by cloud | NLB (AWS), L4 ILB (GCP), Azure LB |
| **IAM for pod identity** | No — cloud-specific | IRSA (AWS), Workload Identity (GCP), Pod Identity (Azure) |

**Key insight:** 90% of your manifests are portable. The 10% that differs (storage, LB, IAM) should live in Kustomize overlays or Helm values, not in the base manifests.

### BFSI context — why portability matters in banking

In BFSI, regulatory requirements can force a cloud migration on short timescales. If your central bank mandates that all payment processing data must reside in a specific region, and your current cloud provider does not have a compliant data centre there, portable manifests are the difference between a three-week migration and a three-month re-architecture. Banks that treated deployment portability as a "nice to have" have been caught out by exactly this scenario.

---

## Part 2 — Hands-on

### 1. Create Kubernetes manifests

Write the manifests for the CloudPlatform stack. Each component gets a Deployment and a Service; shared configuration lives in a ConfigMap and Secret.

**ConfigMap — non-sensitive settings:**

```yaml
# k8s/base/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cloudplatform-config           # referenced by all Deployments
  labels:
    app.kubernetes.io/name: cloudplatform
data:
  DATABASE_HOST: "postgres"            # service name within the cluster
  DATABASE_NAME: "analytics"           # the analytics database
  KAFKA_BROKER: "kafka:9092"           # internal Kafka endpoint
  LOG_LEVEL: "info"                    # info for prod, debug for troubleshooting
  PROCESSOR_WORKERS: "4"               # parallelism for the event processor
```

**Secret — sensitive values:**

```yaml
# k8s/base/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: cloudplatform-secrets
  labels:
    app.kubernetes.io/name: cloudplatform
type: Opaque
stringData:                                        # stringData = plaintext, K8s base64-encodes it
  DATABASE_PASSWORD: "change-me-in-production"     # use External Secrets Operator in real life
  API_KEY: "cp-dev-key-replace-me"                 # never commit real keys to Git
```

> **Security note:** Kubernetes Secrets are base64-encoded, not encrypted. In production, use the External Secrets Operator to fetch secrets from AWS Secrets Manager, GCP Secret Manager, or Azure Key Vault. Never store real credentials in YAML files committed to Git.

**Deployment — analytics API:**

```yaml
# k8s/base/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-api
  labels:
    app.kubernetes.io/name: cloudplatform
    app.kubernetes.io/component: api
spec:
  replicas: 2                                       # two replicas for availability
  selector:
    matchLabels:
      app.kubernetes.io/component: api
  template:
    metadata:
      labels:
        app.kubernetes.io/name: cloudplatform
        app.kubernetes.io/component: api
    spec:
      containers:
        - name: api
          image: yourregistry/cloudplatform-api:v1.0.0   # pin the tag — never use :latest
          ports:
            - containerPort: 8080                        # the port your app listens on
          envFrom:
            - configMapRef:
                name: cloudplatform-config               # inject all config as env vars
            - secretRef:
                name: cloudplatform-secrets               # inject all secrets as env vars
          resources:
            requests:                                    # guaranteed allocation
              cpu: 100m                                  # 0.1 CPU core
              memory: 128Mi                              # 128 MB RAM
            limits:                                      # hard ceiling
              cpu: 500m                                  # 0.5 CPU core
              memory: 512Mi                              # 512 MB RAM
          readinessProbe:                                # "am I ready to serve traffic?"
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5                       # wait 5s before first check
            periodSeconds: 10                            # check every 10s
          livenessProbe:                                 # "am I still alive?"
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 15                      # longer delay — let app fully start
            periodSeconds: 20                            # check every 20s
---
apiVersion: v1
kind: Service
metadata:
  name: analytics-api
spec:
  selector:
    app.kubernetes.io/component: api                     # routes to pods with this label
  ports:
    - port: 80                                           # service port (what clients connect to)
      targetPort: 8080                                   # container port (where app listens)
  type: ClusterIP                                        # internal only — Nginx handles external
```

**Deployment — event processor:**

```yaml
# k8s/base/processor-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-processor
  labels:
    app.kubernetes.io/name: cloudplatform
    app.kubernetes.io/component: processor
spec:
  replicas: 2                                            # scale with Kafka partition count
  selector:
    matchLabels:
      app.kubernetes.io/component: processor
  template:
    metadata:
      labels:
        app.kubernetes.io/name: cloudplatform
        app.kubernetes.io/component: processor
    spec:
      containers:
        - name: processor
          image: yourregistry/cloudplatform-processor:v1.0.0
          envFrom:
            - configMapRef:
                name: cloudplatform-config
            - secretRef:
                name: cloudplatform-secrets
          resources:
            requests:
              cpu: 200m                                  # processor is CPU-heavier than API
              memory: 256Mi
            limits:
              cpu: 1000m                                 # allow bursting to 1 full core
              memory: 1Gi
```

**Deployment — frontend:**

```yaml
# k8s/base/frontend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  labels:
    app.kubernetes.io/name: cloudplatform
    app.kubernetes.io/component: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/component: frontend
  template:
    metadata:
      labels:
        app.kubernetes.io/name: cloudplatform
        app.kubernetes.io/component: frontend
    spec:
      containers:
        - name: frontend
          image: yourregistry/cloudplatform-frontend:v1.0.0
          ports:
            - containerPort: 3000                        # React/Next.js default port
          resources:
            requests:
              cpu: 50m                                   # frontend is lightweight
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 256Mi
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  selector:
    app.kubernetes.io/component: frontend
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP                                        # internal — Nginx routes /
```

### 2. Deploy on AWS (EKS)

Switch kubectl context to EKS and apply the manifests:

```bash
# list available contexts to find your EKS cluster
kubectl config get-contexts
# CURRENT   NAME                                              CLUSTER
# *         arn:aws:eks:ap-south-1:123456789:cluster/cp-eks   cp-eks

# switch to the EKS cluster context
kubectl config use-context arn:aws:eks:ap-south-1:123456789:cluster/cloudplatform-eks

# create a dedicated namespace — isolates CloudPlatform from other workloads
kubectl create namespace cloudplatform

# apply all base manifests at once
kubectl apply -f k8s/base/ -n cloudplatform
# configmap/cloudplatform-config created
# secret/cloudplatform-secrets created
# deployment.apps/analytics-api created
# service/analytics-api created
# deployment.apps/analytics-processor created
# deployment.apps/frontend created
# service/frontend created

# watch pods come up — wait until all show Running + 1/1 Ready
kubectl get pods -n cloudplatform -w
# NAME                                  READY   STATUS    RESTARTS   AGE
# analytics-api-7b9d5c6f8-k2m4n        1/1     Running   0          45s
# analytics-api-7b9d5c6f8-p8x2q        1/1     Running   0          45s
# analytics-processor-5f4d3c2b1-r7t9w  1/1     Running   0          45s
# analytics-processor-5f4d3c2b1-a3b4c  1/1     Running   0          45s
# frontend-3a1b2c3d4-x5y6z             1/1     Running   0          45s
# frontend-3a1b2c3d4-w7v8u             1/1     Running   0          45s

# test the API via port-forward (no ingress needed yet)
kubectl port-forward svc/analytics-api 8080:80 -n cloudplatform &
# Forwarding from 127.0.0.1:8080 -> 8080

# verify the API responds
curl http://localhost:8080/healthz
# {"status": "healthy", "cloud": "aws"}

# check resource allocation matches requests
kubectl describe pod -l app.kubernetes.io/component=api -n cloudplatform | grep -A 4 "Requests:"
#     Requests:
#       cpu:     100m
#       memory:  128Mi
```

### 3. Deploy on GCP (GKE)

Same manifests, different context. This is the portability proof:

```bash
# switch to the GKE cluster
kubectl config use-context gke_myproject_asia-south1_cloudplatform-gke

# create namespace and apply — identical commands to AWS
kubectl create namespace cloudplatform
kubectl apply -f k8s/base/ -n cloudplatform

# verify — same output structure, different cloud
kubectl get pods -n cloudplatform
# NAME                                  READY   STATUS    RESTARTS   AGE
# analytics-api-7b9d5c6f8-m3n4o        1/1     Running   0          30s
# analytics-api-7b9d5c6f8-q5r6s        1/1     Running   0          30s
# analytics-processor-5f4d3c2b1-t7u8v  1/1     Running   0          30s
# analytics-processor-5f4d3c2b1-w9x0y  1/1     Running   0          30s
# frontend-3a1b2c3d4-a1b2c             1/1     Running   0          30s
# frontend-3a1b2c3d4-d3e4f             1/1     Running   0          30s

# test the API
kubectl port-forward svc/analytics-api 8081:80 -n cloudplatform &
curl http://localhost:8081/healthz
# {"status": "healthy", "cloud": "gcp"}
```

### 4. Deploy on Azure (AKS)

```bash
# switch to the AKS cluster
kubectl config use-context cloudplatform-aks

# create namespace and apply — same commands again
kubectl create namespace cloudplatform
kubectl apply -f k8s/base/ -n cloudplatform

# verify
kubectl get pods -n cloudplatform
# (same structure, same behaviour, different cloud)

# test
kubectl port-forward svc/analytics-api 8082:80 -n cloudplatform &
curl http://localhost:8082/healthz
# {"status": "healthy", "cloud": "azure"}
```

Three clouds, identical manifests, identical behaviour. The only difference is the kubectl context.

### 5. Nginx ingress — TLS termination and routing

Install the Nginx ingress controller. This command is the same on all three clouds — Helm abstracts the cloud-specific load balancer provisioning:

```bash
# add the official ingress-nginx Helm chart repo
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# install with 2 replicas for high availability
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.replicaCount=2                    # HA — one pod can restart without downtime

# verify the controller pods are running
kubectl get pods -n ingress-nginx
# NAME                                       READY   STATUS    RESTARTS   AGE
# ingress-nginx-controller-6f7b5c8d9-abc12   1/1     Running   0          60s
# ingress-nginx-controller-6f7b5c8d9-def34   1/1     Running   0          60s

# check the external IP assigned by the cloud load balancer
kubectl get svc -n ingress-nginx
# NAME                       TYPE           CLUSTER-IP     EXTERNAL-IP     PORT(S)
# ingress-nginx-controller   LoadBalancer   10.0.0.100     34.xx.xx.xx     80:30080,443:30443
```

Create the Ingress resource:

```yaml
# k8s/base/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cloudplatform-ingress
  namespace: cloudplatform
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"       # force HTTPS
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"     # max request body 10MB
    nginx.ingress.kubernetes.io/rate-limit: "100"          # 100 req/s per client IP
    cert-manager.io/cluster-issuer: "letsencrypt-prod"     # auto-provision TLS certs
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - cloudplatform.example.com
      secretName: cloudplatform-tls                         # cert-manager populates this
  rules:
    - host: cloudplatform.example.com
      http:
        paths:
          - path: /api                                     # API traffic
            pathType: Prefix
            backend:
              service:
                name: analytics-api
                port:
                  number: 80
          - path: /                                        # everything else to frontend
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

```text
Request flow through Nginx ingress:

  Client HTTPS request
       |
       v
  Cloud Load Balancer (NLB / L4 / Azure LB)
       |
       v
  Nginx Ingress Controller
       |
       +--- /api/*     --> analytics-api Service --> API pods
       |
       +--- /*         --> frontend Service     --> frontend pods
```

Apply and verify:

```bash
# apply the ingress resource
kubectl apply -f k8s/base/ingress.yaml -n cloudplatform

# check the ingress has an external address
kubectl get ingress -n cloudplatform
# NAME                    CLASS   HOSTS                        ADDRESS         PORTS     AGE
# cloudplatform-ingress   nginx   cloudplatform.example.com    34.xx.xx.xx     80, 443   60s

# test routing (once DNS points to the external IP)
curl -k https://cloudplatform.example.com/api/healthz
# {"status": "healthy"}

curl -k https://cloudplatform.example.com/
# <!doctype html>... (frontend HTML)
```

### 6. Verify deployment parity across clouds

Run a quick parity check to confirm all three deployments are identical:

```bash
# compare pod counts and status across all three clouds
for ctx in cloudplatform-eks gke_myproject_asia-south1_cloudplatform-gke cloudplatform-aks; do
  echo "=== $ctx ==="
  kubectl --context=$ctx get pods -n cloudplatform --no-headers | \
    awk '{print $1, $3}' | sort                              # show name + status
  echo ""
done
# === cloudplatform-eks ===
# analytics-api-...       Running
# analytics-api-...       Running
# analytics-processor-... Running
# analytics-processor-... Running
# frontend-...            Running
# frontend-...            Running
#
# (identical structure for all three clouds)
```

---

## Part 3 — Key Patterns

### Pattern 1: Kustomize overlays for cloud-specific differences

Keep base manifests identical; use overlays for the 10% that differs per cloud:

```text
k8s/
├── base/                        # shared across all clouds
│   ├── kustomization.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── api-deployment.yaml
│   ├── processor-deployment.yaml
│   ├── frontend-deployment.yaml
│   └── ingress.yaml
├── overlays/
│   ├── aws/                     # AWS-specific: IRSA annotations, gp3 StorageClass
│   │   └── kustomization.yaml
│   ├── gcp/                     # GCP-specific: Workload Identity, pd-ssd StorageClass
│   │   └── kustomization.yaml
│   └── azure/                   # Azure-specific: Pod Identity, managed-premium
│       └── kustomization.yaml
```

Deploy with: `kubectl apply -k k8s/overlays/aws/` — pulls the base, patches in the cloud-specific bits.

### Pattern 2: Rolling update with zero downtime

Configure the Deployment strategy to avoid downtime during image updates:

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0          # never kill a pod before its replacement is ready
      maxSurge: 1                # create 1 extra pod, then remove the old one
  minReadySeconds: 10            # wait 10s after readiness before proceeding
```

Combined with readiness probes, this ensures traffic is never sent to a pod that is not ready.

### Pattern 3: Resource quotas per namespace

Prevent a runaway deployment from consuming the entire cluster:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: cloudplatform-quota
  namespace: cloudplatform
spec:
  hard:
    requests.cpu: "4"            # total CPU across all pods in namespace
    requests.memory: "8Gi"       # total memory
    limits.cpu: "8"              # hard CPU ceiling
    limits.memory: "16Gi"        # hard memory ceiling
    pods: "20"                   # max pod count
```

### Pattern 4: Pod Disruption Budgets for maintenance

Ensure enough replicas stay available during node drains and cluster upgrades:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-pdb
  namespace: cloudplatform
spec:
  minAvailable: 1                # at least 1 API pod must always be running
  selector:
    matchLabels:
      app.kubernetes.io/component: api
```

### Pattern 5: Health check hierarchy for BFSI workloads

For financial services, implement a three-tier health check:

```text
Tier 1 — Liveness:    /healthz         "am I alive?"    (basic process check)
Tier 2 — Readiness:   /readyz          "can I serve?"   (DB connected, caches warm)
Tier 3 — Startup:     /startupz        "have I finished (schema migration, warmup)
                                        initialising?"
```

Startup probes run once and hand off to liveness/readiness. This prevents false-positive restarts for services with slow initialisation (e.g. loading large rule engines for transaction fraud detection).

---

## Part 4 — Common Mistakes

- **Using :latest tags in manifests:** Breaks reproducibility. Two deployments of the "same" manifest produce different behaviour if the latest tag moved between them. Pin every image to a specific version (`v1.0.0`, not `latest`). Use digest pinning (`image@sha256:abc...`) for maximum immutability.

- **Hardcoding secrets in YAML committed to Git:** The Secret resource is base64-encoded, not encrypted. Anyone with repo access reads the passwords. Use the External Secrets Operator (ESO) to fetch from AWS Secrets Manager, GCP Secret Manager, or Azure Key Vault. The ESO syncs cloud secrets into Kubernetes Secret objects automatically.

- **No resource limits:** Without limits, a misbehaving pod (memory leak, infinite loop) consumes all node resources and kills its neighbours via OOMKill. Always set both requests (guaranteed) and limits (ceiling). In BFSI, a runaway pod in a shared cluster can take down the payment processing API.

- **Skipping readiness probes:** Without readiness probes, Kubernetes sends traffic to pods that are not yet ready — users see 502 errors during every deployment. The Service routes traffic as soon as the pod reaches Running state, but the application inside may still be connecting to the database or loading configuration.

- **Cloud-specific annotations in base manifests:** Putting `service.beta.kubernetes.io/aws-load-balancer-type: nlb` in the base Ingress YAML means it fails on GCP and Azure. Keep cloud-specific annotations in Kustomize overlays or Helm values per cloud. The base should contain only cloud-agnostic configuration.

- **Forgetting to set imagePullPolicy correctly:** With pinned tags, `IfNotPresent` is correct (pull once, cache). With `:latest` (which you should not use), you need `Always` — but then you pay network latency on every pod restart. Another reason to pin tags.

- **Not testing manifests locally first:** Deploy to a local Kind or Minikube cluster before touching cloud clusters. Catches YAML typos, missing ConfigMap keys, and probe path errors without burning cloud credits or risking production-adjacent environments.

---

## Exercises

See the `exercises/` directory for guided walkthroughs:

1. [Create Kubernetes manifests](exercises/01-create-k8s-manifests.md) — write Deployment, Service, ConfigMap, Secret for all CloudPlatform components
2. [Deploy on EKS](exercises/02-deploy-on-eks.md) — deploy to AWS EKS, verify pods and API health
3. [Deploy on GKE and AKS](exercises/03-deploy-on-gke-aks.md) — deploy to GCP GKE and Azure AKS using the same manifests
4. [Nginx ingress with TLS](exercises/04-nginx-ingress.md) — configure Nginx ingress controller with TLS termination

---

**Next stage:** [06-load-testing](../06-load-testing/README.md) — stress-test CloudPlatform with k6 to find its breaking point before your users do.
