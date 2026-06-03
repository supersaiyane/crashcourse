# Exercise 3: Ingress, Scaling, and Self-Healing

**Goal:** Install an Ingress Controller, expose Cutlink via a proper hostname, scale the app up and down, and watch Kubernetes heal itself.

**Prerequisites:** Exercise 2 completed — Cutlink is running and accessible via port-forward.

---

## Part A: Install NGINX Ingress Controller

### Why an Ingress Controller?

An Ingress resource (the YAML we wrote) does nothing by itself. It's a set of routing rules. The **Ingress Controller** is the actual software (usually an nginx or Envoy proxy) that watches for Ingress resources and configures itself to route traffic accordingly.

Think of it this way:
- **Ingress resource** = configuration ("route cutlink.local to the frontend Service")
- **Ingress Controller** = the program that reads that config and implements it

kind doesn't ship with an Ingress Controller. We install the NGINX one:

```bash
# Apply the official NGINX Ingress Controller manifest for kind
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

Wait for the controller to be ready:
```bash
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
```

Verify:
```bash
kubectl get pods -n ingress-nginx
```

You should see one `ingress-nginx-controller` Pod running.

### What just happened?

The manifest we applied creates:
1. A Namespace: `ingress-nginx`
2. A Deployment: `ingress-nginx-controller` (1 replica)
3. A Service: `ingress-nginx-controller` (type NodePort — forwards host ports 80/443 into the cluster)
4. ServiceAccounts, ClusterRoles, and ClusterRoleBindings for RBAC
5. A ConfigMap for nginx configuration

Since we added `extraPortMappings` to our kind config (ports 80 and 443 on the host), the Controller can receive traffic directly on localhost:80.

---

## Part B: Configure DNS

Add the following line to your `/etc/hosts` file:

```
127.0.0.1 cutlink.local
```

On macOS/Linux:
```bash
echo "127.0.0.1 cutlink.local" | sudo tee -a /etc/hosts
```

On Windows (admin PowerShell):
```powershell
Add-Content C:\Windows\System32\drivers\etc\hosts "`n127.0.0.1 cutlink.local"
```

Now verify the Ingress routes traffic:

```bash
# If you have curl
curl -k https://cutlink.local/

# Or open in browser
open https://cutlink.local
```

The `-k` flag (or the browser warning) is because the NGINX Ingress Controller generated a self-signed TLS certificate. In production, you'd use cert-manager to get real certificates from Let's Encrypt.

**Test the full flow:**
```bash
curl -k -X POST https://cutlink.local/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/test"}'


# Follow the short URL (replace SHORT_CODE with the result)
curl -k -L https://cutlink.local/SHORT_CODE
```

---

## Part C: Scale the Application

### Manual Scaling

```bash
# Scale backend to 3 replicas
kubectl scale deployment/backend -n cutlink --replicas=3

# Watch new Pods spin up
kubectl get pods -n cutlink -w
```

You'll see a new `backend-xxxxx` Pod transition from `Pending` -> `ContainerCreating` -> `Running`.

**What happens behind the scenes:**

1. The Deployment controller sees `replicas: 3` but only 2 Pods exist.
2. It creates a new ReplicaSet (or updates the existing one) with 3 replicas.
3. The ReplicaSet creates a new Pod.
4. The Scheduler finds a node with available resources.
5. The kubelet on that node pulls the image and starts the container.
6. Once the readiness probe passes, the new Pod is added to the backend Service's endpoints.
7. Traffic automatically starts flowing to the new Pod.

Check the Service endpoints:
```bash
kubectl get endpoints -n cutlink backend
```

You should see 3 IP addresses now (one for each backend Pod).

### Scale down

```bash
kubectl scale deployment/backend -n cutlink --replicas=2
```

Kubernetes gracefully terminates one Pod:
1. Removes it from the Service endpoints (no new traffic).
2. Sends SIGTERM to the container process.
3. Waits for `terminationGracePeriodSeconds` (default: 30s).
4. Sends SIGKILL if the process hasn't exited.

---

## Part D: Rolling Updates

### Update the backend image

A rolling update replaces old Pods with new ones gradually, with zero downtime:

```bash
# Change the image tag
kubectl set image deployment/backend -n cutlink backend=cutlink-backend:v2
```

Since we don't actually have a `v2` image, this will cause the rollout to hang (the new Pods can't find the image). That's educational too!

Watch what happens:
```bash
kubectl rollout status deployment/backend -n cutlink
```

You'll see:
```
Waiting for deployment "backend" rollout to finish: 1 out of 3 new replicas have been updated...
```

The rollout blocks because the new Pods can't start (image pull error).

### Check rollout history

```bash
# See all past revisions
kubectl rollout history deployment/backend -n cutlink

# Show details of revision 1
kubectl rollout history deployment/backend -n cutlink --revision=1
```

### Rollback

Since our `v2` image doesn't exist, rollback to the previous version:

```bash
# Undo the rollout (go back to revision 1)
kubectl rollout undo deployment/backend -n cutlink

# Watch it recover
kubectl rollout status deployment/backend -n cutlink
```

The old Pods (still running with the working image) are kept, and the failing new ones are terminated.

### Successful rolling update

To see a real rolling update, create a new image tag:

```bash
# Build a "v2" image (same code, different label)
cd ../sample-app/backend
docker build -t cutlink-backend:v2 .
kind load docker-image cutlink-backend:v2 --name cutlink

# Now deploy it
kubectl set image deployment/backend -n cutlink backend=cutlink-backend:v2

# Watch the rollout in slow motion
kubectl get pods -n cutlink -w
```

The rolling update strategy (`maxSurge: 1, maxUnavailable: 0`) means:
1. A new Pod is created with the v2 image.
2. Once its readiness probe passes, an old (v1) Pod is terminated.
3. Another new v2 Pod is created.
4. The second old Pod is terminated.
5. All 2 replicas are now running v2.

At no point were fewer than 2 Pods serving traffic.

---

## Part E: Self-Healing

This is one of Kubernetes' superpowers — it constantly reconciles **desired state** (what you declared) with **actual state** (what's running).

### Kill a Pod

```bash
# Get a backend Pod name
POD=$(kubectl get pods -n cutlink -l component=backend -o name | head -1)
echo "Killing $POD"

# Delete it
kubectl delete -n cutlink $POD

# Watch it come back
kubectl get pods -n cutlink -w
```

You'll see the Pod transition to `Terminating`, then a new Pod with a different name appear and start up. Total downtime: a few seconds (while the readiness probe checks the new Pod).

**This is the ReplicaSet at work.** The ReplicaSet is the controller that makes sure the exact number of Pods are always running. Your Deployment manages the ReplicaSet. The hierarchy:

```
Deployment → ReplicaSet → Pod
```

When you delete a Pod, the ReplicaSet immediately creates a replacement. The Deployment doesn't even notice — its job is managing ReplicaSet versions (for rolling updates).

### Kill a node

Want to see something more dramatic? Simulate a node failure:

```bash
# Get a worker node name
kubectl get nodes

# Drain a worker node (gracefully evict all Pods)
kubectl drain cutlink-worker --ignore-daemonsets --delete-emptydir-data

# Watch Pods on that node go Terminating and restart on another node
kubectl get pods -n cutlink -o wide -w
```

The Pods from `cutlink-worker` will be rescheduled onto `cutlink-worker2`. This is how Kubernetes survives entire server failures.

When you're done, uncordon the node so it can receive Pods again:
```bash
kubectl uncordon cutlink-worker
```

### What doesn't self-heal

Self-healing only covers Pod restarts. These things are NOT automatically fixed:

- **Persistent data loss** — if the node with your PVC-backed Postgres dies, the data survives on the PV, but the new Pod must be scheduled on the same node (or you need remote storage like EBS).
- **Application bugs** — if your app has a memory leak, Kubernetes will keep restarting it but the leak won't fix itself.
- **Configuration errors** — if your ConfigMap has a typo, every restart will fail the same way.

---

## Part F: Health Checks in Action

Remember the readiness and liveness probes we configured? Let's see what happens when they fail.

### Simulate a failed readiness probe

```bash
# Exec into a backend Pod and remove the /health endpoint temporarily
kubectl exec -n cutlink deploy/backend -it -- /bin/sh
```

Inside the Pod:
```sh
# Rename the app module (this breaks the health endpoint)
# Actually, let's just stop the server
kill 1
exit
```

Now watch what happens:
```bash
kubectl get pods -n cutlink -w
```

The Pod will show `STATUS: Running` but `READY: 0/1` — the container is running but failing its readiness probe. Kubernetes removes it from the Service's load-balancer pool. Traffic goes to the other healthy Pod.

After the liveness probe also fails (it uses the same `/health` endpoint), Kubernetes restarts the container:
```
backend-xxxxx   1/1     Running    1 (10s ago)   30s
```

The restart count increases. Check why with:
```bash
kubectl describe pod -n cutlink backend-xxxxx
```

Look under `Events` — you'll see:
```
Warning  Unhealthy  15s   kubelet  Readiness probe failed: HTTP probe failed with statuscode: 503
Warning  Unhealthy  5s    kubelet  Liveness probe failed: HTTP probe failed with statuscode: 503
Normal   Killing    5s    kubelet  Container backend failed liveness probe, will be restarted
```

---

## Summary

What you demonstrated in this exercise:

| Concept | How You Tested It |
|---------|------------------|
| **Ingress** | Installed NGINX Ingress Controller, configured host-based routing with TLS |
| **Manual scaling** | `kubectl scale` — changed replica count |
| **Rolling update** | `kubectl set image` — zero-downtime image update |
| **Rollback** | `kubectl rollout undo` — reverted to previous version |
| **Self-healing** | Deleted a Pod, watched it respawn |
| **Node failure** | Drained a node, Pods migrated to another node |
| **Health checks** | Broke a container, watched probes detect and restart it |

These capabilities — declarative management, zero-downtime deployments, and self-healing — are why Kubernetes is the standard for container orchestration. No scripting required.
