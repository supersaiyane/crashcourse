# Exercise 1: Install ArgoCD

In this exercise, you will install ArgoCD into your Kubernetes cluster, access the Web UI, and log in via the CLI.

---

## Step 1: Create the Namespace

ArgoCD runs in its own namespace. This keeps it isolated from application workloads.

```bash
kubectl create namespace argocd
```

**What this does:** Creates a dedicated namespace for all ArgoCD components (API Server, Repository Server, Application Controller, Redis).

---

## Step 2: Install ArgoCD Manifests

ArgoCD publishes a consolidated installation manifest. This single YAML file contains all the resources ArgoCD needs: Deployments, Services, ConfigMaps, RBAC rules, and CRDs.

```bash
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

This downloads and applies the manifest directly from the ArgoCD GitHub repo. The `stable` branch maps to the latest stable release.

**Wait for all pods to become Ready:**

```bash
kubectl get pods -n argocd -w
```

You should see these pods:
| Pod | Role |
|-----|------|
| `argocd-application-controller-*` | Reconciliation loop engine |
| `argocd-server-*` | API Server (CLI + Web UI) |
| `argocd-repo-server-*` | Git operations + manifest rendering |
| `argocd-redis-*` | Caching and rate limiting |
| `argocd-dex-server-*` | SSO / identity provider integration |
| `argocd-notifications-controller-*` | Notification engine |

Wait until all pods show `Running` and `1/1` Ready.

---

## Step 3: Expose ArgoCD Server

The API Server runs on port 443 (HTTPS) inside the cluster. Use port-forwarding to access it from your local machine:

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Leave this terminal window open. ArgoCD is now accessible at `https://localhost:8080`.

**Production note:** For a production installation, you would configure a proper Ingress with TLS termination, not port-forwarding.

---

## Step 4: Get the Admin Password

ArgoCD generates a random initial password for the `admin` user on first install. Retrieve it with:

```bash
argocd admin initial-password -n argocd
```

The output shows the password. Copy it — you'll need it for the next step.

**Note:** The password is stored in a Kubernetes Secret named `argocd-initial-admin-secret`. You can also retrieve it directly:
```bash
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d
```

---

## Step 5: Install the ArgoCD CLI

**macOS (Homebrew):**
```bash
brew install argocd
```

**Linux:**
```bash
curl -sSL -o /usr/local/bin/argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x /usr/local/bin/argocd
```

**Windows:**
```powershell
scoop install argocd
```

Verify the CLI works:
```bash
argocd version
```

---

## Step 6: Login via CLI

With `kubectl port-forward` still running, open a second terminal and run:

```bash
argocd login localhost:8080
```

You will be prompted for:
- **Username:** `admin`
- **Password:** (the password from Step 4)
- **WARNING:** The server uses a self-signed certificate. Type `y` to proceed.

You should see: `'admin' logged in successfully`

Verify you can see applications (empty list for now):
```bash
argocd app list
```

Expected output:
```
NAME  CLUSTER  NAMESPACE  PROJECT  STATUS  HEALTH  SYNCPOLICY  CONDITIONS
```

---

## Step 7: Login via Web UI

1. Open a browser and navigate to **https://localhost:8080**
2. You'll see a security warning because of the self-signed TLS certificate. Click "Advanced" → "Proceed to localhost" (or your browser's equivalent).
3. You'll see the ArgoCD login screen:

   ![ArgoCD Login Screen](https://argo-cd.readthedocs.io/en/stable/assets/login-page.png)

4. Enter:
   - **Username:** `admin`
   - **Password:** (the password from Step 4)

5. Click "Sign In".

You should now see the ArgoCD dashboard. The Applications page will be empty — we'll deploy one in the next exercise.

---

## Step 8: Change the Admin Password (Recommended)

For security, change the default admin password immediately:

```bash
argocd account update-password
```

You'll be prompted for the current password and the new password.

---

## Verification Checklist

- [ ] `kubectl get pods -n argocd` shows all pods Running
- [ ] `argocd login localhost:8080` succeeds
- [ ] Web UI loads at `https://localhost:8080`
- [ ] `argocd app list` returns an empty list (no errors)

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Pods stuck in `Pending` | Insufficient cluster resources | Check node capacity: `kubectl describe nodes` |
| `ImagePullBackOff` | Container registry rate limiting | Wait and retry, or configure registry credentials |
| Cannot connect to `localhost:8080` | Port-forward not running | Check the terminal running `kubectl port-forward` |
| `dial tcp: i/o timeout` | Firewall blocking | Ensure no network policies block the argocd namespace |
| CLI says `exit status 1` | Wrong release version | Run `argocd version --client` to check CLI matches server |

---

## What You Learned

- Installed ArgoCD using the official install manifest
- Accessed ArgoCD via port-forwarding
- Logged in using both the CLI and Web UI
- Changed the default admin password

ArgoCD is now running and ready to manage deployments. Proceed to **Exercise 2: Deploy Cutlink via GitOps**.
