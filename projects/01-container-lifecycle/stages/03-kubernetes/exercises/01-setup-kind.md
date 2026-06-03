# Exercise 1: Local Cluster with kind

**Goal:** Create a local Kubernetes cluster using kind (Kubernetes IN Docker).

**What you'll learn:**
- Installing kind and kubectl
- Multi-node cluster configuration
- Verifying cluster health
- Installing the metrics-server (needed for HPA)

---

## Step 1: Install Tools

### Install kind

kind runs Kubernetes nodes as Docker containers. Your "worker nodes" are just Docker processes on your laptop.

**macOS:**
```bash
brew install kind kubectl
```

**Linux:**
```bash
# Download kind
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.23.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# Download kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x ./kubectl
sudo mv ./kubectl /usr/local/bin/kubectl
```

**Windows (PowerShell):**
```powershell
# Install kind
winget install Kubernetes.kind
# Install kubectl
winget install Kubernetes.kubectl
```

Verify everything is installed:
```bash
kind --version
kubectl version --client
```

---

## Step 2: Create a kind Configuration File

kind uses a YAML configuration to define your cluster topology. Here we create a 3-node cluster: 1 control-plane + 2 workers.

Create `kind-config.yaml` in a working directory:

```yaml
# kind-config.yaml
# 
# This file defines the cluster topology for kind.
# kind runs each "node" as a Docker container.
# The control-plane runs the Kubernetes control plane components.
# Worker nodes run your application Pods.
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
# Number of nodes and their roles.
# A "real" cluster might have 3+ control-plane nodes for HA,
# but for learning, 1 control-plane + 2 workers is perfect.
nodes:
  # The control-plane node runs:
  #   - kube-apiserver (the brain)
  #   - etcd (the database)
  #   - kube-scheduler (the matchmaker)
  #   - kube-controller-manager (the fixer)
  - role: control-plane
    # Expose port 80 and 443 from the kind cluster to your host.
    # This lets the NGINX Ingress Controller receive traffic on
    # localhost:80 without needing NodePort or port-forward.
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
  # Worker nodes run your application Pods.
  # Each worker has a kubelet (node agent) and kube-proxy (networking).
  - role: worker
  - role: worker
```

> **What are these roles?**
> - **control-plane** — runs the cluster brain. In production you'd have 3 or 5 of these for high availability.
> - **worker** — runs your actual applications (Pods). You can have 1 or 1000 workers.
> 
> kind runs each as a Docker container with systemd inside to bootstrap the K8s components.

---

## Step 3: Create the Cluster

```bash
kind create cluster --name cutlink --config kind-config.yaml
```

This command:
1. Pulls the kindest/node Docker image (which contains a full Kubernetes installation)
2. Starts 3 Docker containers (control-plane + 2 workers)
3. Initializes the Kubernetes control plane inside the first container
4. Joins the worker nodes to the cluster
5. Writes a kubeconfig file (`~/.kube/config`) so kubectl can talk to the cluster

Watch the output. It should look like:
```
Creating cluster "cutlink" ...
 ✓ Ensuring node image (kindest/node:v1.30.0) 🖼
 ✓ Preparing nodes 📦 📦 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
 ✓ Joining worker nodes 🚜
Set your kubectl context to "kind-cutlink"
```

---

## Step 4: Verify the Cluster

```bash
# Show cluster info (API server version, etc.)
kubectl cluster-info

# List all nodes and their status
kubectl get nodes

# Show detailed node info
kubectl describe node
```

You should see 3 nodes, all with `STATUS: Ready`. If any show `NotReady`, wait 30 seconds and check again — the first boot takes a moment.

```bash
# List all Pods in the kube-system namespace
kubectl get pods -n kube-system
```

You'll see coreDNS and kube-proxy Pods running. These are the cluster's own infrastructure.

**kubectl context explained:**

`kubectl` can talk to multiple clusters. Each cluster's connection details (server URL, certs, user) is called a "context."

```bash
# Show current context
kubectl config current-context
# → kind-cutlink

# List all available contexts
kubectl config get-contexts

# Switch to a different cluster
kubectl config use-context kind-cutlink
```

When you're done with this cluster later, destroy it with:
```bash
kind delete cluster --name cutlink
```

---

## Step 5: Install metrics-server

The metrics-server collects resource usage (CPU/memory) from each node and Pod. It's required for:
- `kubectl top nodes` / `kubectl top pods`
- HorizontalPodAutoscaler (which we'll use in Exercise 4)

kind clusters don't come with metrics-server pre-installed. Install it:

```bash
# Apply the metrics-server manifest from the official repo
# The --kubelet-insecure-tls flag is needed because kind uses
# self-signed certs on the kubelets (it's a dev cluster, no real CA).
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Patch the deployment to accept self-signed kubelet certs (required for kind)
kubectl patch deployment metrics-server -n kube-system \
  --type='json' \
  -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'
```

Wait for the metrics-server Pod to become ready:
```bash
kubectl wait --namespace kube-system \
  --for=condition=ready pod \
  --selector=k8s-app=metrics-server \
  --timeout=120s
```

Verify it works:
```bash
# Show node resource usage
kubectl top nodes

# Show Pod resource usage (should show kube-system Pods)
kubectl top pods -n kube-system
```

Expected output:
```
NAME                      CPU(cores)   MEMORY(bytes)
cutlink-control-plane     582m         1427Mi
cutlink-worker            245m         875Mi
cutlink-worker2           210m         810Mi
```

---

## Troubleshooting

### kind create fails with port conflicts

Port 80 and 443 must be free on your host. If something else is using them (like a local web server), either stop it or remove the `extraPortMappings` from your kind config. Without the mappings, you'll use `kubectl port-forward` instead.

### Nodes stuck on NotReady

```bash
# Check what's wrong
kubectl describe node cutlink-worker

# Check if the node container is actually running
docker ps | grep cutlink

# Restart the kind cluster
kind delete cluster --name cutlink
kind create cluster --name cutlink --config kind-config.yaml
```

### kubectl can't connect

```bash
kind export kubeconfig --name cutlink
```

### Permission denied on kubectl

If your kubeconfig has wrong permissions:
```bash
chmod 600 ~/.kube/config
```
