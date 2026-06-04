# Stage 3: Policy Enforcement

**Goal:** Deploy OPA Gatekeeper on Kubernetes and enforce admission policies that prevent insecure workloads from running in the SecureBank cluster — no privileged containers, no latest tags, mandatory labels, mandatory resource limits.

**Prerequisites:** Stage 2 complete. A Kubernetes cluster. kubectl installed.

---

## 1. Theory (What & Why)

### The gap between scanning and enforcement

Stages 1-2 scan code before deployment. But scanning is advisory — it finds issues and reports them. A developer can ignore the report, skip the CI check, or manually apply a bad manifest with kubectl. Scanning tells you what is wrong. Enforcement prevents it.

### What is admission control?

When you run `kubectl apply`, the request goes through the Kubernetes API server. Before the resource is persisted to etcd, it passes through admission controllers — code that can validate, mutate, or reject the request:

```text
kubectl apply -f deployment.yaml
         |
         v
  +------------------+
  | API Server       |
  | 1. Authentication|
  | 2. Authorization |
  | 3. ADMISSION     | <-- OPA Gatekeeper lives here
  | 4. Persist       |
  +------------------+
```

If Gatekeeper rejects the request, the resource is never created. The developer gets an immediate error explaining why.

### How OPA Gatekeeper works

OPA (Open Policy Agent) is a general-purpose policy engine. Gatekeeper is its Kubernetes-native integration. You define policies in Rego (OPA's policy language) and Gatekeeper enforces them on every kubectl apply:

```text
Developer: kubectl apply -f deployment.yaml
Gatekeeper: "DENIED: Container uses :latest tag. Pin to a specific version."
Developer: fixes the tag, re-applies
Gatekeeper: "ALLOWED"
```

Key components:
- **ConstraintTemplate** — defines the policy logic (Rego)
- **Constraint** — applies the template to specific resources (which namespaces, which kinds)

### SecureBank policies

The project ships with four OPA policies in `policies/opa/`:

| Policy | What it enforces | Why it matters for banking |
|--------|-----------------|--------------------------|
| **require-labels** | All Deployments must have `app.kubernetes.io/name` and `environment` labels | Audit trail — "which team owns this workload?" |
| **require-resource-limits** | All containers must have CPU and memory limits | Prevents noisy neighbours — one service cannot starve others |
| **deny-privileged** | No privileged containers | Prevents container escape — a compromised container cannot access the host |
| **deny-latest-tag** | No `:latest` image tags | Reproducibility — "which exact version is deployed?" must have a clear answer |

---

## 2. Hands-On: Deploy Gatekeeper for SecureBank

### 2.1 Install Gatekeeper

```bash
kubectl apply -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/v3.16.0/deploy/gatekeeper.yaml

kubectl wait --for=condition=ready pod -l control-plane=controller-manager \
  -n gatekeeper-system --timeout=120s
```

### 2.2 Create a ConstraintTemplate

Convert the deny-latest-tag Rego policy into a Gatekeeper ConstraintTemplate:

```yaml
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8sdenylatestag
spec:
  crd:
    spec:
      names:
        kind: K8sDenyLatestTag
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8sdenylatestag
        violation[{"msg": msg}] {
          container := input.review.object.spec.template.spec.containers[_]
          endswith(container.image, ":latest")
          msg := sprintf("Container %s uses :latest tag. Pin to a specific version.", [container.name])
        }
```

```bash
kubectl apply -f constraint-template-latest-tag.yaml
```

### 2.3 Create a Constraint

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sDenyLatestTag
metadata:
  name: deny-latest-in-securebank
spec:
  match:
    kinds:
      - apiGroups: ["apps"]
        kinds: ["Deployment"]
    namespaces: ["securebank"]
```

```bash
kubectl apply -f constraint-latest-tag.yaml
```

### 2.4 Test the enforcement

Try deploying a pod with `:latest`:

```bash
kubectl apply -f - << 'K8SEOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-latest
  namespace: securebank
spec:
  replicas: 1
  selector:
    matchLabels:
      app: test
  template:
    metadata:
      labels:
        app: test
    spec:
      containers:
        - name: nginx
          image: nginx:latest
K8SEOF
```

Expected:

```text
Error from server (Forbidden): admission webhook "validation.gatekeeper.sh" denied the request:
[deny-latest-in-securebank] Container nginx uses :latest tag. Pin to a specific version.
```

The deployment is rejected. Fix the tag and re-apply:

```bash
# Change nginx:latest to nginx:1.27.0 — now it passes
```

### 2.5 Deploy all SecureBank policies

Apply the remaining policies (require-labels, require-resource-limits, deny-privileged) as ConstraintTemplates and Constraints.

### 2.6 Confirm SecureBank passes all policies

```bash
kubectl apply -f k8s/deployment.yaml -n securebank
# Should succeed — SecureBank manifests are already compliant
# (pinned image tag, resource limits, non-privileged, correct labels)
```

---

## 3. Key patterns

### Dry-run mode

Test policies without blocking:

```yaml
spec:
  enforcementAction: dryrun    # log violations but do not block
```

Use dryrun when rolling out new policies to see what would be blocked without breaking existing deployments.

### Audit existing resources

Gatekeeper continuously audits running resources:

```bash
kubectl get k8sdenylatestag deny-latest-in-securebank -o yaml
# status.violations lists all existing resources that violate the policy
```

### Mutation (not just validation)

Gatekeeper can also mutate requests — for example, automatically inject a sidecar or add default labels:

```yaml
apiVersion: mutations.gatekeeper.sh/v1
kind: Assign
metadata:
  name: default-resource-limits
spec:
  applyTo:
    - groups: ["apps"]
      kinds: ["Deployment"]
  location: "spec.template.spec.containers[name:*].resources.limits.memory"
  parameters:
    assign:
      value: "256Mi"
```

---

## 4. Common mistakes

- **Enforcing without dryrun first:** New policies can break existing deployments. Always start in dryrun, audit violations, fix them, then switch to enforce.
- **Too broad scope:** Applying policies to all namespaces blocks kube-system and Gatekeeper itself. Scope to application namespaces only.
- **No exception mechanism:** Some workloads legitimately need privileged access (e.g., CNI plugins). Use namespace exemptions or constraint exclusions.
- **Rego syntax errors:** Rego is not intuitive. Test policies with `opa eval` locally before deploying to Gatekeeper.
- **Forgetting to audit existing resources:** New policies only check new requests by default. Enable audit to find existing violations.

---

## Exercises

1. [Exercise 1 — Deploy Gatekeeper and test](exercises/01-deploy-gatekeeper.md)
2. [Exercise 2 — Write a custom policy](exercises/02-custom-policy.md)

**Next stage:** [04-supply-chain](../04-supply-chain/README.md) — sign and verify container images.
