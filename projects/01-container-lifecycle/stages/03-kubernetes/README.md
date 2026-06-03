# Stage 3: Kubernetes — Orchestrating Containers at Scale

**Goal:** Run the Cutlink URL shortener on a multi-node Kubernetes cluster with rolling updates, self-healing, auto-scaling, and Ingress-based HTTP routing.

**Prerequisites:** Stage 2 (Docker) completed. You should be comfortable building container images, running containers, and using `docker-compose`. Docker Desktop or Docker Engine must be installed.

**Sample App:** Cutlink — a URL shortener with a Flask backend, PostgreSQL database, Redis cache, and nginx frontend. Same app you containerized in Stage 2.

---

## 1. Theory

### 1.1 Why Orchestration?

Running containers on a single host is straightforward:

```bash
docker run -d --name postgres postgres:16-alpine
docker run -d --name redis redis:7-alpine
docker run -d --name backend cutlink-backend
docker run -d --name frontend -p 8080:80 cutlink-frontend
```

Four commands and your app is running. So why do we need Kubernetes?

**The single-host limit:** Your laptop has finite CPU, memory, and disk. A production Cutlink would need:

- **50 backend replicas** to handle traffic spikes
- **3 PostgreSQL replicas** for high availability (primary + 2 standbys)
- **3 Redis Sentinel instances** for cache HA
- **Multiple frontend instances** distributed across geographic regions

You physically cannot run all of that on one machine. You need a **cluster** — a pool of machines (nodes) that act as one giant computer.

**Operational challenges at scale:**

| Problem | Docker alone | Kubernetes |
|---------|-------------|------------|
| **Rolling update** — replace all containers without downtime | Manual script with health checks | `kubectl set image` — built-in, configurable strategy |
| **Self-healing** — restart a crashed container | Docker will restart it (--restart=always) | K8s restarts it AND reschedules it on another node if the original node dies |
| **Service discovery** — how does the frontend find the backend? | Hardcoded hostname, Docker DNS (within compose) | Built-in DNS: `backend.cutlink.svc.cluster.local` |
| **Load balancing** — distribute requests across replicas | Manual reverse proxy config | Service object — automatic round-robin |
| **Scaling** — add more replicas under load | Manual `docker run` + proxy reconfig | `kubectl scale` or HPA — second, automated |
| **Secrets** — database passwords | Environment variables in files or compose | Secret objects — base64 encoded, optionally encrypted |
| **Config** — environment-specific settings | Multiple compose files, .env files | ConfigMap objects — environment-agnostic |
| **Storage** — persistent volumes across node failures | Local bind mounts — lost if the host dies | PV/PVC — storage survives node failures (with remote storage) |

**The Kubernetes promise:** Declare the desired state of your application in YAML files. Kubernetes continuously reconciles actual state to match desired state. You never SSH into servers to fix things — you edit YAML and let the cluster do the work.

**When NOT to use Kubernetes:**

- You have one service with one replica (a single Docker container is fine)
- Your team has 2-3 engineers (the operational overhead isn't worth it)
- You're prototyping an idea (Docker Compose is faster)
- Your app has no state and no scaling needs (a PaaS like Fly.io or Railway might be better)

Kubernetes shines at scale, but it adds complexity. For Cutlink, we use it because it's the best way to learn — the same concepts apply whether you're running 3 containers or 30,000.

---

### 1.2 Architecture

A Kubernetes cluster has two parts: the **control plane** (the brain) and **worker nodes** (the muscle).

```
┌─────────────────────────────────────────────────────┐
│                  CONTROL PLANE                       │
│  ┌──────────┐  ┌──────┐  ┌───────────┐  ┌────────┐ │
│  │apiserver │  │ etcd │  │scheduler  │  │  c-m   │ │
│  └────┬─────┘  └──────┘  └───────────┘  └────────┘ │
│       │                                             │
├───────┼─────────────────────────────────────────────┤
│       │               WORKER NODES                  │
│  ┌────┴──────────┐    ┌─────────────────────┐       │
│  │   kubelet     │    │     kubelet         │       │
│  │   kube-proxy  │    │   kube-proxy        │       │
│  │   ┌───────┐   │    │   ┌───────┐        │       │
│  │   │containerd│  │    │   │containerd│       │       │
│  │   │  redis   │   │    │   │backend │       │       │
│  │   │ backend  │   │    │   │frontend│       │       │
│  │   │ frontend │   │    │   │postgres│       │       │
│  │   └───────┘   │    │   └───────┘        │       │
│  └───────────────┘    └─────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

#### Control Plane Components

**kube-apiserver** — The front door to the cluster. Everything goes through the API server:
- `kubectl` sends requests to it (REST over HTTPS)
- The scheduler reads Pod data from it
- The controller-manager watches for state changes through it
- Worker node kubelets report status to it

It validates and processes all requests before storing them in etcd. If the API server goes down, you can't make changes — but running workloads continue.

**etcd** — The cluster's database. A consistent, distributed key-value store that holds:
- All cluster state (which Pods exist, which nodes, which Services)
- Secrets (encrypted at rest if configured)
- ConfigMaps
- Every resource you create with `kubectl apply`

etcd is the source of truth. If etcd is corrupted, the cluster is broken. In production, run 3 or 5 etcd replicas.

**kube-scheduler** — The matchmaker. Decides which node each new Pod runs on:
1. Filters nodes that don't have enough CPU/memory
2. Filters nodes with taints the Pod doesn't tolerate
3. Scores remaining nodes by resource availability (spreads Pods evenly)
4. Assigns the Pod to the highest-scoring node

**kube-controller-manager** — The fixer. Runs dozens of controller loops simultaneously:
- **Node controller** — notices when a node goes down and marks its Pods for rescheduling
- **ReplicaSet controller** — ensures the right number of Pod replicas are running
- **Deployment controller** — manages rolling updates and rollbacks
- **ServiceAccount controller** — creates default ServiceAccounts for namespaces
- **Namespace controller** — cleans up resources when a namespace is deleted

Each controller runs in a loop, reading desired state from the API server and taking actions to converge actual state toward desired state.

#### Worker Node Components

**kubelet** — The node agent. Runs on every worker node:
- Receives Pod specifications from the API server
- Instructs the container runtime to pull images and start containers
- Runs health checks (readiness, liveness, startup probes)
- Reports node and Pod status back to the API server

The kubelet is the only thing on the node that talks to the control plane. It uses the container runtime (containerd or CRI-O), not Docker directly.

**kube-proxy** — The network rule manager. Runs on every node:
- Maintains network rules on each node (using iptables, IPVS, or eBPF)
- Implements the Service abstraction — forwards traffic to healthy Pods
- Handles ClusterIP (internal), NodePort (external on each node), and LoadBalancer (cloud LB integration)

Think of kube-proxy as a distributed load balancer — every node knows how to reach every Service.

**Container runtime** — The software that actually runs containers:
- containerd (most common)
- CRI-O (another CRI-compliant runtime)
- Supports the OCI image spec — Docker images run unmodified

---

### 1.3 Core Objects

Kubernetes has a rich object model. Here are the objects you'll use most, ordered from foundational to advanced.

#### Pod

A Pod is the **smallest deployable unit** in Kubernetes. It represents one or more containers that share:
- A network namespace (same IP address, same port space)
- A PID namespace (containers can see each other's processes)
- An IPC namespace (containers can communicate via shared memory)
- Optionally: a shared volume

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: cutlink-backend
  labels:
    app: cutlink
    component: backend
spec:
  containers:
    - name: backend
      image: cutlink-backend:latest
      ports:
        - containerPort: 5000
```

**Why Pods instead of bare containers?**

A Pod is Kubernetes' wrapper around a container (or multiple containers). The Pod abstraction provides:
1. **Lifecycle management** — Kubernetes manages Pods, not containers. If a container dies, the Pod dies and gets recreated.
2. **Shared resources** — Sidecar containers share the network namespace with the main container (see below).
3. **Labeling** — Pods get labels that Services and Deployments use for selection.

**The Sidecar Pattern:**

Sometimes you need a helper container alongside your main application. A common example: a logging sidecar that tails log files from a shared volume and ships them to an external system.

```
┌──────────────────────────┐
│         Pod              │
│  ┌──────────────────┐    │
│  │ main container    │    │
│  │ (Flask backend)   │    │
│  └────────┬─────────┘    │
│           │ shared volume│
│  ┌────────▼─────────┐    │
│  │ sidecar container │    │
│  │ (log shipper)     │    │
│  └──────────────────┘    │
└──────────────────────────┘
```

In a Pod, both containers share the same IP, can communicate via localhost, and can share volumes. You don't use sidecars in Cutlink (it's simple enough), but they're essential for adding observability, service meshes (Istio/Envoy), and secret rotation to production apps.

#### Deployment

A Deployment provides **declarative updates** for Pods. You describe the desired state (3 replicas of the backend, image version 2.0, rolling update strategy), and the Deployment controller makes it happen.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: cutlink
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cutlink
      component: backend
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: cutlink
        component: backend
    spec:
      containers:
        - name: backend
          image: cutlink-backend:latest
          ports:
            - containerPort: 5000
```

**How Deployments work:**

```
Deployment (spec.replicas=2)
    └─> ReplicaSet (version 1)
            ├── Pod (backend-abc)
            └── Pod (backend-def)

During rolling update to v2:
Deployment (spec.replicas=2, strategy=RollingUpdate)
    ├── ReplicaSet (version 1)  →  newly scaled to 1 replica
    └── ReplicaSet (version 2)  ←  newly created with 2 replicas
            ├── Pod (backend-xyz)  ← new Pod, v2 image
            ├── Pod (backend-uvw)  ← new Pod, v2 image
            └── Pod (backend-abc)  ← old Pod, currently 1 remaining
```

1. You change the image tag in the Deployment.
2. The Deployment controller creates a new ReplicaSet with the new spec.
3. The new ReplicaSet creates a new Pod (maxSurge allows 1 extra).
4. Once the new Pod is ready, the old ReplicaSet terminates one old Pod.
5. Repeat until all Pods are running the new spec.

**Rolling update benefits:**
- Zero downtime (if maxUnavailable is 0)
- Canary testing (gradual traffic shift)
- Automatic rollback (`kubectl rollout undo`)
- Pause/resume (`kubectl rollout pause`)

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `RollingUpdate` (default) | Gradually replace Pods | Production — zero downtime |
| `Recreate` | Delete all Pods, then create new ones | Dev/Staging — faster but has downtime |

#### Service

A Service provides a **stable network endpoint** for a set of Pods. Pods are ephemeral — they come and go, their IPs change. A Service gives you a fixed IP and DNS name that load-balances across the currently healthy Pods.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: cutlink
spec:
  type: ClusterIP
  ports:
    - port: 5000
      targetPort: 5000
      protocol: TCP
  selector:
    app: cutlink
    component: backend
```

**Service types:**

| Type | Reachability | Use Case |
|------|-------------|----------|
| **ClusterIP** (default) | Internal cluster only | Backend, database, cache |
| **NodePort** | External on every node:port | Dev access without Ingress |
| **LoadBalancer** | External via cloud LB | Production internet-facing services |
| **ExternalName** | DNS alias to external service | Integrating with services outside the cluster |

**How Service discovery works:**

When you create a Service, Kubernetes also creates a DNS entry (via coreDNS):
- `backend.cutlink.svc.cluster.local` — resolves to the Service's ClusterIP (a virtual IP)
- The ClusterIP maps to kube-proxy rules on every node
- kube-proxy forwards traffic to healthy Pods (round-robin by default)

Pods in the same namespace can reach it as just `backend`. Cross-namespace: `backend.cutlink.svc`.

**Label selectors are the glue:**

```yaml
# Service selects Pods by labels
selector:
  app: cutlink
  component: backend
```

The Service watches the API server for Pods matching those labels. When you scale the backend from 2 to 5 replicas, the Service automatically includes all 5. When a Pod fails its readiness probe, the Service removes it. This dynamic membership is what makes Services work.

#### ConfigMap & Secret

**ConfigMap** stores non-sensitive configuration as key-value pairs. It decouples configuration from container images — the same image can run in dev, staging, and production with different ConfigMaps.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: backend-config
  namespace: cutlink
data:
  DB_HOST: "postgres"
  DB_NAME: "cutlink"
  BASE_URL: "http://cutlink.local"
```

**Secret** is similar but intended for sensitive data (passwords, API keys, TLS certs). Values are base64-encoded:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: cutlink-secrets
type: Opaque
data:
  DB_PASS: Y3V0bGlua19zZWNyZXRfMjAyNA==  # base64 of "cutlink_secret_2024"
```

**CRITICAL: Base64 is NOT encryption.** It's just encoding. Anyone with `kubectl get secret` can decode it. For real security:
- Enable encryption at rest in etcd (--encryption-provider-config)
- Use External Secrets Operator or Sealed Secrets
- Use cloud-native secret stores (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault)

**Consuming ConfigMaps and Secrets:**

Pods can consume them as environment variables or mounted files:

```yaml
envFrom:
  - configMapRef:
      name: backend-config
  - secretRef:
      name: cutlink-secrets
```

Or individually:

```yaml
env:
  - name: DB_HOST
    valueFrom:
      configMapKeyRef:
        name: backend-config
        key: DB_HOST
  - name: DB_PASS
    valueFrom:
      secretKeyRef:
        name: cutlink-secrets
        key: DB_PASS
```

**The 12-Factor App connection:** Factor 3 (Config) says "store config in the environment." ConfigMaps and Secrets are Kubernetes' implementation of this principle. The same container image runs everywhere — only the configuration changes.

#### Ingress

An Ingress provides **HTTP/HTTPS routing** to Services. While a Service works at Layer 4 (TCP), Ingress works at Layer 7 (HTTP) and can route based on hostnames, paths, headers, and more.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cutlink-ingress
  namespace: cutlink
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - cutlink.local
      secretName: cutlink-tls
  rules:
    - host: cutlink.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

Without Ingress, you'd need a Service of type LoadBalancer for every public-facing app, each with its own public IP and cost. With Ingress, one load balancer routes to many services based on hostname/path rules.

```
                          ┌──────────────┐
Internet ──► Load Balancer ──► Ingress ──┼──► Service A (api.cutlink.local)
(port 80/443)              │ Controller │  └──► Service B (cutlink.local/*)
                           └──────────────┘
```

**Ingress vs Ingress Controller:**
- **Ingress** = YAML resource (rules, TLS, backends)
- **Ingress Controller** = the actual reverse proxy software (NGINX, Traefik, HAProxy, Envoy) that reads Ingress resources and configures itself

You install the Controller once per cluster. Then you create as many Ingress resources (rules) as you need.

#### PersistentVolume & PersistentVolumeClaim

Containers are ephemeral. When a Pod dies, its filesystem dies with it. Stateful applications (databases, file storage) need persistent storage that survives Pod restarts.

**PV (PersistentVolume)** — the actual storage resource (a disk in the cloud, an NFS share, a local SSD). Cluster-admin provisioned.

**PVC (PersistentVolumeClaim)** — a request for storage by a user. Pods consume PVCs, not PVs directly.

```
User creates PVC ──► Kubernetes finds/binds PV ──► Pod mounts PVC
   (storage: 1Gi)         (disk provisioned)         ( /var/lib/postgresql/data )
```

In kind (and most cloud clusters), PVs are provisioned dynamically. When you create a PVC, a StorageClass automatically creates the underlying disk.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: cutlink
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

**Access modes:**

| Mode | Meaning | Example |
|------|---------|---------|
| ReadWriteOnce | One node can read/write | Single Postgres instance |
| ReadOnlyMany | Many nodes can read | Shared config file |
| ReadWriteMany | Many nodes can read/write | Shared filesystem (NFS) |

#### Namespace

A Namespace is a **virtual cluster** inside your physical cluster. It provides:

- **Isolation** — resources in one namespace are invisible to another by default
- **Organization** — group resources by team, project, or environment
- **Policy** — attach ResourceQuota, LimitRange, and NetworkPolicy to a namespace

```bash
# List resources in a namespace
kubectl get pods -n cutlink

# List all namespaces
kubectl get namespaces
```

Default namespaces in a cluster: `default`, `kube-system` (cluster internals), `kube-public` (publicly readable resources), `kube-node-lease` (node heartbeats).

**RBAC + Namespace = multi-tenancy.** You can give Team A full access to namespace `team-a` but no access to namespace `team-b`.

#### ResourceQuota & LimitRange

Without limits, one team could consume all cluster resources. **ResourceQuota** sets aggregate limits per namespace. **LimitRange** sets default requests/limits per Pod.

```yaml
# ResourceQuota — total limits per namespace
apiVersion: v1
kind: ResourceQuota
metadata:
  name: cutlink-quota
  namespace: cutlink
spec:
  hard:
    requests.cpu: "2"
    requests.memory: "4Gi"
    limits.cpu: "4"
    limits.memory: "8Gi"
    persistentvolumeclaims: "5"
    pods: "20"
```

```yaml
# LimitRange — defaults per container if not specified
apiVersion: v1
kind: LimitRange
metadata:
  name: cutlink-limits
  namespace: cutlink
spec:
  limits:
    - default:
        cpu: 500m
        memory: 256Mi
      defaultRequest:
        cpu: 100m
        memory: 128Mi
      type: Container
```

Without a LimitRange, a Pod could request unlimited CPU. With one, every Pod that doesn't specify resources gets these defaults.

#### NetworkPolicy

By default, all Pods can talk to all other Pods. NetworkPolicy implements **pod-level firewalling** — you control ingress (incoming) and egress (outgoing) traffic based on labels and ports.

```yaml
# Allow frontend to reach backend only on port 5000
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-network-policy
  namespace: cutlink
spec:
  podSelector:
    matchLabels:
      component: backend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              component: frontend
      ports:
        - port: 5000
```

This policy says: "Only Pods labeled `component: frontend` can reach backend Pods on port 5000. Everything else is blocked."

NetworkPolicy requires a **CNI plugin** that supports it (Calico, Cilium, Weave Net). kind's default CNI (kindnet) doesn't enforce NetworkPolicy, but cloud clusters do.

#### HorizontalPodAutoscaler

HPA automatically scales the number of Pod replicas based on observed CPU, memory, or custom metrics.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: cutlink
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

**The math:**

```
desiredReplicas = currentReplicas × (currentMetricValue / targetMetricValue)
```

If you have 2 backend Pods, average CPU is 90%, and target is 70%:
```
desiredReplicas = 2 × (90 / 70) = 2 × 1.29 = 2.58 → ceil → 3 replicas
```

HPA has built-in **stabilization** to prevent flapping:
- Scale up: waits for the metric to be exceeded for 3 minutes by default
- Scale down: waits for 5 minutes

**Prerequisites for HPA:**
- metrics-server must be installed (collects resource usage from kubelets)
- Pods must have `resources.requests.cpu` defined (HPA uses utilization relative to requests)

#### StatefulSet

A StatefulSet is like a Deployment but with guarantees for stateful applications:

1. **Stable, unique network identities** — Pods get ordinal names (postgres-0, postgres-1) instead of random hashes
2. **Stable, persistent storage** — each replica gets its own PVC that persists across reschedules
3. **Ordered, graceful deployment** — Pods are created/terminated one at a time, in order

**StatefulSet vs Deployment:**

| Feature | Deployment | StatefulSet |
|---------|-----------|-------------|
| Pod names | Random (backend-abc123) | Ordinal (postgres-0, postgres-1) |
| Storage | Shared PVC (all Pods share one volume) | Unique PVC per Pod |
| Scaling | Any number, any order | One at a time, in order |
| Use case | Stateless apps (API, frontend) | Stateful apps (databases, queues) |

**When to use which:**
- **Deployment** — backend API, frontend web server, Redis cache, any stateless service
- **StatefulSet** — PostgreSQL, MySQL, MongoDB, Kafka, Elasticsearch, any database or clustered stateful app

Cutlink uses a StatefulSet for PostgreSQL (needs stable identity and persistent storage per replica) and Deployments for everything else.

---

### 1.4 kubectl Essentials

`kubectl` is your Swiss Army knife for Kubernetes. These commands will cover 90% of your daily work:

| Command | What it does | Example |
|---------|-------------|---------|
| `kubectl get` | List resources | `kubectl get pods -n cutlink` |
| `kubectl describe` | Detailed info about a resource | `kubectl describe pod backend-abc` |
| `kubectl logs` | View container logs | `kubectl logs deployment/backend -n cutlink` |
| `kubectl exec` | Run a command in a container | `kubectl exec -n cutlink deploy/backend -- env` |
| `kubectl apply` | Create or update resources | `kubectl apply -f manifest.yaml` |
| `kubectl delete` | Remove resources | `kubectl delete -k manifests/` |
| `kubectl port-forward` | Tunnel a local port to a Pod/Service | `kubectl port-forward svc/frontend 8080:80` |
| `kubectl scale` | Change replica count | `kubectl scale deploy/backend --replicas=5` |
| `kubectl rollout` | Manage deployments | `kubectl rollout status deploy/backend` |
| `kubectl top` | Show resource usage | `kubectl top pods -n cutlink` |

**kubectl output flags:**

```bash
# Wide output (shows node IP, Pod IP)
kubectl get pods -n cutlink -o wide

# YAML output (full resource definition)
kubectl get pod backend-abc -n cutlink -o yaml

# JSON output (useful for scripting)
kubectl get pods -n cutlink -o json

# Custom columns
kubectl get pods -n cutlink -o custom-columns=NAME:.metadata.name,STATUS:.status.phase

# Watch mode (live updates)
kubectl get pods -n cutlink -w

# Label filtering
kubectl get pods -n cutlink -l component=backend
```

**The `-n` flag (namespace):**

If you omit `-n`, kubectl uses the namespace from your current context (usually `default`). Always specify `-n cutlink` when working with Cutlink resources, or set it as your default:

```bash
kubectl config set-context --current --namespace=cutlink
```

---

### 1.5 RBAC (Role-Based Access Control)

RBAC controls who can do what in the Kubernetes cluster. It's essential for securing production clusters but optional for local learning.

**RBAC objects:**

| Object | Scope | What it does |
|--------|-------|-------------|
| **Role** | Namespace | Defines allowed actions within a namespace |
| **ClusterRole** | Cluster-wide | Defines allowed actions across all namespaces or on cluster-scoped resources |
| **RoleBinding** | Namespace | Binds a Role to users/groups within a namespace |
| **ClusterRoleBinding** | Cluster-wide | Binds a ClusterRole to users/groups cluster-wide |

**Example: Read-only access for a developer**

```yaml
# Role that allows read-only access in the cutlink namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: cutlink
  name: pod-reader
rules:
  - apiGroups: [""]           # Core API group (pods, services, etc.)
    resources: ["pods", "services", "configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]       # Apps API group (deployments, statefulsets)
    resources: ["deployments"]
    verbs: ["get", "list", "watch"]
```

```yaml
# Bind the role to a ServiceAccount
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: cutlink
  name: pod-reader-binding
subjects:
  - kind: ServiceAccount
    name: cutlink-viewer
    namespace: cutlink
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

**ServiceAccount vs User:**

- **User** — a human (authenticated via certs, OIDC, or external provider)
- **ServiceAccount** — a machine identity (used by Pods to authenticate to the API server)

Every namespace gets a default ServiceAccount. Pods use it to talk to the API server (e.g., the Kubernetes client library inside your app authenticates via the mounted ServiceAccount token).

**RBAC best practices:**
1. Least privilege — grant only the permissions each user/Pod needs
2. Use Roles (namespace-scoped) instead of ClusterRoles when possible
3. Never bind cluster-admin to a user unless absolutely necessary
4. Create a distinct ServiceAccount for each application component

---

## 2. Hands-On Exercises

The exercises are in the `exercises/` directory. Complete them in order:

### Exercise 1: Local Cluster with kind

**File:** `exercises/01-setup-kind.md`

Create a 3-node Kubernetes cluster on your laptop using kind (Kubernetes IN Docker). Install kubectl and the metrics-server.

**Key commands you'll learn:**
```bash
kind create cluster --name cutlink --config kind-config.yaml
kubectl cluster-info
kubectl get nodes
kubectl top nodes
```

**What you'll build:**
```
┌─────────────────────────────────────┐
│         kind cluster: cutlink        │
│  ┌────────────────┐                 │
│  │ control-plane  │  (kube-apiserver│
│  │                │   etcd, scheduler)│
│  └────────────────┘                 │
│  ┌────────────────┐ ┌──────────────┐│
│  │ worker         │ │ worker2      ││
│  │ (kubelet,      │ │ (kubelet,    ││
│  │  kube-proxy)   │ │  kube-proxy) ││
│  └────────────────┘ └──────────────┘│
└─────────────────────────────────────┘
```

Estimated time: 15 minutes.

### Exercise 2: Deploy Cutlink to Kubernetes

**File:** `exercises/02-deploy-app.md`

Build and load container images into kind. Apply all manifests with `kubectl apply -k manifests/`. Verify the full stack is running and accessible via port-forward.

**Key commands:**
```bash
kind load docker-image cutlink-backend:latest --name cutlink
kubectl apply -k manifests/
kubectl get all -n cutlink
kubectl port-forward svc/frontend 8080:80
```

**What you'll deploy:**
```
┌───────────────────────────────────────────────┐
│             namespace: cutlink                 │
│                                                │
│  backend:5000    frontend:80    postgres:5432  │
│  ┌─────────┐   ┌──────────┐   ┌────────────┐ │
│  │backend  │◄──│ frontend │   │ postgres-0 │ │
│  │ x2      │   │ x2       │   │ (Stateful) │ │
│  └────┬────┘   └──────────┘   └────────────┘ │
│       │                              ▲        │
│       ▼                              │        │
│  ┌─────────┐                        │        │
│  │  redis  │────────────────────────┘        │
│  │  x1     │  (cache read-through)           │
│  └─────────┘                                 │
└───────────────────────────────────────────────┘
```

Estimated time: 20 minutes.

### Exercise 3: Ingress, Scaling, and Self-Healing

**File:** `exercises/03-scaling-selfhealing.md`

Install the NGINX Ingress Controller, configure host-based routing with TLS, scale the backend up and down, perform a rolling update with rollback, kill Pods and watch them respawn, and drain nodes to simulate failure.

**Key commands:**
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/...
kubectl scale deployment/backend --replicas=3
kubectl set image deployment/backend backend=cutlink-backend:v2
kubectl rollout undo deployment/backend
kubectl delete pod backend-xxx
kubectl drain cutlink-worker --ignore-daemonsets
kubectl uncordon cutlink-worker
```

**What you'll demonstrate:**
```
Normal state:           Rolling update:          After kill:
┌────┬────┐            ┌────┬────┬────┐         ┌────┬────┐
│ B1 │ B2 │            │ B1 │ B2 │ B3 │         │ B3 │ B4 │
│v1  │v1  │            │v1  │v1  │v2  │         │v2  │v2  │
└────┴────┘            └────┴────┴────┘         └────┴────┘
2 replicas             maxSurge=1 creates       New pods after
                       extra pod for v2         self-healing
```

Estimated time: 30 minutes.

### Exercise 4: Advanced — ConfigMaps, Secrets, HPA

(Referenced but included inline in the README theory section for brevity. Create a ConfigMap and Secret if not already done, set up HPA, generate load, and watch the HPA scale the backend.)

**Key commands:**
```bash
kubectl get configmap backend-config -n cutlink -o yaml
kubectl get secret cutlink-secrets -n cutlink -o yaml
kubectl autoscale deployment/backend --min=2 --max=10 --cpu-percent=70
kubectl get hpa -n cutlink -w
```

**Generate load to trigger HPA:**

Open a terminal and run a load test loop:
```bash
# Install hey (HTTP load generator)
brew install hey

# Run load against the backend
while true; do
  hey -n 1000 -c 10 http://localhost:5000/health
  sleep 2
done
```

In another terminal, watch the HPA:
```bash
kubectl get hpa -n cutlink -w
```

You'll see the CPU percentage increase, and after the stabilization window, the replica count will increase:
```
NAME          REFERENCE            TARGETS    MINPODS   MAXPODS   REPLICAS
backend-hpa   Deployment/backend   45%/70%    2         10        2
backend-hpa   Deployment/backend   85%/70%    2         10        2
backend-hpa   Deployment/backend   125%/70%   2         10        3
backend-hpa   Deployment/backend   90%/70%    2         10        4
backend-hpa   Deployment/backend   60%/70%    2         10        4
```

After stopping the load, watch the HPA scale back down after the stabilization window.

---

## 3. Summary

### What You Learned

| Concept | Key Insight |
|---------|-------------|
| **Orchestration** | Single-host Docker doesn't scale. K8s manages a cluster of machines as one. |
| **Architecture** | Control plane (API, etcd, scheduler, controllers) + worker nodes (kubelet, kube-proxy, runtime) |
| **Pod** | Smallest unit — one or more containers sharing network/filesystem. Sidecar pattern. |
| **Deployment** | Declarative updates with ReplicaSet. RollingUpdate strategy for zero-downtime deploys. |
| **Service** | Stable network endpoint. Labels select Pods dynamically. DNS-based discovery. |
| **ConfigMap/Secret** | Decouple config from images. Secrets are base64 encoded (NOT encrypted). |
| **Ingress** | L7 HTTP routing with TLS termination. Requires an Ingress Controller. |
| **PV/PVC** | Storage lifecycle managed separately from Pod lifecycle. StatefulSet for stable storage per replica. |
| **Namespace** | Virtual cluster isolation. Multi-tenancy via namespaces + RBAC. |
| **HPA** | Auto-scale based on metrics. Utilization = usage / request. |
| **Rolling update** | Gradual replacement with zero downtime. maxSurge + maxUnavailable control the pace. |
| **Self-healing** | ReplicaSet replaces dead Pods. Node drain reschedules workloads. |

### kubectl Cheat Sheet

```bash
# Cluster management
kubectl cluster-info                          # Show cluster info
kubectl get nodes                             # List nodes
kubectl top nodes                             # Node resource usage

# Namespace operations
kubectl get ns                                # List namespaces
kubectl config set-context --current --namespace=cutlink  # Set default ns

# Workloads
kubectl get pods -n cutlink -o wide           # Pods with IPs and nodes
kubectl get deployments -n cutlink            # Deployments
kubectl get statefulsets -n cutlink           # StatefulSets
kubectl get rs -n cutlink                     # ReplicaSets

# Networking
kubectl get svc -n cutlink                    # Services
kubectl get ingress -n cutlink                # Ingress rules
kubectl get endpoints -n cutlink              # Service endpoints
kubectl port-forward svc/frontend 8080:80     # Tunnel to service

# Configuration
kubectl get configmap -n cutlink              # ConfigMaps
kubectl get secret -n cutlink                 # Secrets

# Troubleshooting
kubectl describe pod -n cutlink backend-xxx   # Detailed pod info
kubectl logs -n cutlink deployment/backend    # Container logs
kubectl logs -n cutlink deployment/backend --previous  # Previous crash logs
kubectl exec -n cutlink deploy/backend -it -- /bin/sh  # Interactive shell
kubectl top pods -n cutlink                   # Pod resource usage

# Apply/Delete
kubectl apply -k manifests/                   # Apply all with Kustomize
kubectl delete -k manifests/                  # Delete all
kubectl apply -f file.yaml                    # Apply single file

# Rollout
kubectl rollout status deployment/backend     # Watch rollout progress
kubectl rollout history deployment/backend    # Show revisions
kubectl rollout undo deployment/backend       # Rollback to previous
kubectl rollout pause deployment/backend      # Pause rollout
kubectl rollout resume deployment/backend     # Resume rollout

# Scaling
kubectl scale deployment/backend --replicas=5 # Manual scale
kubectl autoscale deployment/backend --min=2 --max=10 --cpu-percent=70  # Auto-scale
kubectl get hpa                               # List autoscalers
```

### Next Steps

You've completed Stage 3. Your Cutlink app is running on Kubernetes with:
- Multi-node cluster (kind with 3 nodes)
- Persistent storage (PostgreSQL via StatefulSet + PVC)
- In-memory caching (Redis)
- Load-balanced backend (Deployment with 2+ replicas)
- Zero-downtime deployments (RollingUpdate strategy)
- Self-healing (Pods respawn automatically)
- Health checks (readiness + liveness probes)
- HTTP routing (NGINX Ingress with TLS)
- Auto-scaling (HPA based on CPU)

**Stage 4 (coming soon):** Monitoring and Observability — Prometheus metrics, Grafana dashboards, structured logging, and distributed tracing for the Cutlink stack.

**Further learning:**
- **Helm** — Package manager for Kubernetes (charts templatize YAML)
- **Kustomize overlays** — Environment-specific patches (dev/staging/prod)
- **GitOps** — ArgoCD or Flux to sync cluster state from Git
- **Service Mesh** — Istio or Linkerd for mTLS, traffic splitting, observability
- **Operators** — Custom controllers that encode operational knowledge (Crunchy Postgres Operator, Strimzi Kafka Operator)
- **CNCF Landscape** — The vast ecosystem of cloud-native projects building on Kubernetes
