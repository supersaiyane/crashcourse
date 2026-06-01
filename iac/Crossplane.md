# Crossplane — A 2-Day Crash Course

> Crossplane turns Kubernetes into a universal control plane for cloud infrastructure. Before starting, make sure you are comfortable with `Kubernetes.md` and `Terraform.md`.

---

## Part 0 — Why Crossplane Exists

You already know Kubernetes reconciles desired state with actual state for pods, deployments, and services. Crossplane extends that same loop to cloud resources — S3 buckets, RDS instances, GKE clusters, DNS records. Instead of a separate Terraform workflow with its own state file, locking mechanism, and CI pipeline, you write a YAML manifest and `kubectl apply` it. The control plane watches the real resource and continuously drives it toward what you declared.

Platform teams are standardizing on Crossplane because it collapses two operational surfaces — application infra and cloud infra — into one. Your developers stop dealing with Terraform modules and start consuming Kubernetes-native APIs your team designs for them.

The tradeoff: Crossplane is more complex to set up than Terraform for a single-team workflow. The payoff comes when you serve multiple teams who need self-service infrastructure without touching cloud credentials or Terraform state.

---

## Vocabulary

Before you touch a terminal, internalize these seven terms. Everything else builds on them.

| Term | What It Is |
|---|---|
| **Provider** | A Crossplane controller that knows how to talk to a specific cloud API (AWS, GCP, Azure, Helm, etc.). Installed as a Kubernetes resource. |
| **Managed Resource (MR)** | A single cloud resource managed directly by a Provider — for example, `Bucket.s3.aws.upbound.io`. One MR maps to one cloud API object. |
| **Composite Resource (XR)** | A higher-level resource you define. It can represent multiple Managed Resources. Platform team owns XR definitions; developers consume them. |
| **Composition** | The template that tells Crossplane how to translate an XR into one or more Managed Resources. The implementation behind the API. |
| **XRD (CompositeResourceDefinition)** | The schema for an XR — the CRD that registers your custom API. You define fields, validation, and the group/version/kind here. |
| **Claim** | A namespace-scoped proxy for an XR. Developers in a team namespace create Claims; Crossplane binds them to XRs, enforcing isolation. |
| **ProviderConfig** | Configuration for a Provider instance — credentials, region, default tags. Referenced by Managed Resources. |

The mental model: `XRD` defines the shape → `Composition` defines the behavior → developers create `Claims` → Crossplane creates `XRs` → Compositions expand XRs into `Managed Resources` → `Providers` call the cloud API.

---

## DAY 1 — Install, Connect a Provider, Provision Real Resources

### 1.1 Prerequisites

You need a Kubernetes cluster (kind works fine), `kubectl`, and `helm`. For the AWS examples below you also need an IAM user with S3 and RDS permissions.

### 1.2 Install Crossplane

```bash
helm repo add crossplane-stable https://charts.crossplane.io/stable
helm repo update
helm install crossplane crossplane-stable/crossplane \
  --namespace crossplane-system --create-namespace --wait

kubectl get pods -n crossplane-system
# Expect: crossplane and crossplane-rbac-manager Running
```

If either pod is crash-looping, confirm your cluster version is >= 1.26.

### 1.3 Install the AWS Provider

```yaml
# provider-aws.yaml
apiVersion: pkg.crossplane.io/v1
kind: Provider
metadata:
  name: provider-aws-s3
spec:
  package: xpkg.upbound.io/upbound/provider-aws-s3:v1.1.0
```

```bash
kubectl apply -f provider-aws.yaml
kubectl get providers   # wait for HEALTHY=True, INSTALLED=True
```

⚠️ Provider packages can exceed 100 MB. On slow connections this takes several minutes. Do not move on until `HEALTHY=True`.

### 1.4 Configure Credentials

```bash
kubectl create secret generic aws-creds -n crossplane-system \
  --from-literal=creds="[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
```

```yaml
# providerconfig-aws.yaml
apiVersion: aws.upbound.io/v1beta1
kind: ProviderConfig
metadata:
  name: default
spec:
  credentials:
    source: Secret
    secretRef:
      namespace: crossplane-system
      name: aws-creds
      key: creds
```

```bash
kubectl apply -f providerconfig-aws.yaml
```

In production use IRSA or Workload Identity instead of static keys. Set `source: InjectedIdentity` in the ProviderConfig.

### 1.5 Provision an S3 Bucket

```yaml
# bucket.yaml
apiVersion: s3.aws.upbound.io/v1beta1
kind: Bucket
metadata:
  name: my-crossplane-bucket-20260531
  annotations:
    crossplane.io/external-name: my-crossplane-bucket-20260531
spec:
  forProvider:
    region: us-east-1
  providerConfigRef:
    name: default
```

```bash
kubectl apply -f bucket.yaml
kubectl get buckets   # READY=True, SYNCED=True when the bucket exists in AWS
```

If `SYNCED=False`, run `kubectl describe bucket my-crossplane-bucket-20260531` and read `status.conditions[*].message`.

### 1.6 Provision an RDS Instance

Install the RDS provider (same pattern as S3), then:

```yaml
# rds-instance.yaml
apiVersion: rds.aws.upbound.io/v1beta1
kind: Instance
metadata:
  name: demo-postgres
spec:
  forProvider:
    region: us-east-1
    dbInstanceClass: db.t3.micro
    engine: postgres
    engineVersion: "15.4"
    username: adminuser
    skipFinalSnapshot: true
    allocatedStorage: 20
    passwordSecretRef:
      name: rds-password
      namespace: crossplane-system
      key: password
  providerConfigRef:
    name: default
```

```bash
kubectl create secret generic rds-password -n crossplane-system \
  --from-literal=password=SuperSecret1234
kubectl apply -f rds-instance.yaml
kubectl get instances.rds.aws.upbound.io
```

RDS instances take 5–15 minutes to reach `READY=True` — that is AWS API latency, not Crossplane.

### Day 1 Checkpoint

You can install Crossplane, wire a Provider, configure credentials, and `kubectl apply` Managed Resources that create and delete real cloud infrastructure. Everything from here is abstraction on top of this loop.

---

## DAY 2 — Compositions, XRDs, Claims, GitOps, and the Terraform Comparison

### 2.1 Why You Need Compositions

Managed Resources expose raw cloud APIs. A developer provisioning a database should not need to know which VPC subnets are approved, which parameter groups satisfy your security policy, or what `db.t4g.medium` means. Compositions let your platform team encode those decisions once. Developers get a simple, stable API.

### 2.2 Define Your API — the XRD

An XRD is a CRD factory. You write it once; Crossplane registers the CRD cluster-wide.

```yaml
# xrd-database.yaml
apiVersion: apiextensions.crossplane.io/v1
kind: CompositeResourceDefinition
metadata:
  name: xpostgresdatabases.platform.example.com
spec:
  group: platform.example.com
  names:
    kind: XPostgresDatabase
    plural: xpostgresdatabases
  claimNames:
    kind: PostgresDatabase
    plural: postgresdatabases
  versions:
    - name: v1alpha1
      served: true
      referenceable: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                parameters:
                  type: object
                  required: [size]
                  properties:
                    size:
                      type: string
                      enum: [small, medium, large]
                    storageGB:
                      type: integer
                      default: 20
```

```bash
kubectl apply -f xrd-database.yaml && kubectl get xrd
```

### 2.3 Write the Composition

The Composition maps XR fields to Managed Resource fields via patches. Transforms let you convert values — here, `size: small` becomes `db.t3.micro`.

```yaml
# composition-postgres.yaml
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: postgres-aws
  labels:
    provider: aws
spec:
  compositeTypeRef:
    apiVersion: platform.example.com/v1alpha1
    kind: XPostgresDatabase
  resources:
    - name: rds-instance
      base:
        apiVersion: rds.aws.upbound.io/v1beta1
        kind: Instance
        spec:
          forProvider:
            region: us-east-1
            engine: postgres
            engineVersion: "15.4"
            username: adminuser
            skipFinalSnapshot: true
            passwordSecretRef:
              name: rds-password
              namespace: crossplane-system
              key: password
          providerConfigRef:
            name: default
      patches:
        - type: FromCompositeFieldPath
          fromFieldPath: spec.parameters.storageGB
          toFieldPath: spec.forProvider.allocatedStorage
        - type: FromCompositeFieldPath
          fromFieldPath: spec.parameters.size
          toFieldPath: spec.forProvider.dbInstanceClass
          transforms:
            - type: map
              map:
                small: db.t3.micro
                medium: db.t3.medium
                large: db.r6g.large
```

```bash
kubectl apply -f composition-postgres.yaml
```

### 2.4 Developers Use Claims

A Claim is namespace-scoped. A developer on `team-alpha` creates this:

```yaml
apiVersion: platform.example.com/v1alpha1
kind: PostgresDatabase
metadata:
  name: my-app-db
  namespace: team-alpha
spec:
  parameters:
    size: small
    storageGB: 30
  compositionSelector:
    matchLabels:
      provider: aws
  writeConnectionSecretToRef:
    name: my-app-db-conn
```

Crossplane creates an XR cluster-wide, binds the Claim to it, runs the Composition, and writes the connection string into `my-app-db-conn` in `team-alpha`. The developer never touched a Terraform module or an AWS console.

### 2.5 GitOps Integration

Crossplane manifests are plain YAML. Commit them to Git and let Argo CD or Flux apply them:

```
infra/crossplane/providers/     # Provider + ProviderConfig manifests
infra/crossplane/xrds/          # XRD definitions
infra/crossplane/compositions/  # Composition templates
platform/team-alpha/claims/     # team-scoped Claims
platform/team-beta/claims/
```

Argo CD watches `infra/` with `--server-side` apply. Platform team PRs update Compositions. Team PRs add Claims in their namespace only. RBAC prevents cross-team access.

The reconciliation loop never stops — if someone deletes the S3 bucket in the AWS console, Crossplane recreates it at the next poll. This is both the feature and the gotcha (see Pitfalls).

### 2.6 Crossplane vs Terraform — When to Use Which

| Dimension | Crossplane | Terraform |
|---|---|---|
| **State management** | Kubernetes etcd — no separate state file | `.tfstate` file; S3 + DynamoDB locking in prod |
| **Drift correction** | Continuous — reconciler runs forever | On-demand — only during `terraform apply` |
| **Developer self-service** | Native — `kubectl apply` a Claim | Requires CI pipeline or Terraform Cloud |
| **Multi-cloud abstractions** | First-class via Compositions | Via modules; no built-in abstraction layer |
| **Ecosystem maturity** | Younger; some providers are incomplete | Mature; broad provider coverage |
| **Learning curve** | High — Kubernetes fluency required | Moderate — HCL is learnable standalone |
| **Secret management** | Stays in Kubernetes secrets | Plaintext in state — needs vault integration |
| **Best for** | Platform teams, K8s-native orgs | Single-team infra, greenfield, non-K8s orgs |

You can run both. Many teams use Terraform for foundational infra (VPCs, IAM, EKS itself) and Crossplane for application-level resources developers provision on demand.

---

## Worked Example — Platform API for Databases

Goal: any developer can provision a production Postgres database with a three-field YAML, zero AWS knowledge required.

**XRD additions** — add `highAvailability` to the parameters block:

```yaml
highAvailability:
  type: boolean
  default: false
```

**Composition patch** — map the flag to Multi-AZ:

```yaml
- type: FromCompositeFieldPath
  fromFieldPath: spec.parameters.highAvailability
  toFieldPath: spec.forProvider.multiAz
```

**Connection details** — surface the endpoint from the Managed Resource:

```yaml
connectionDetails:
  - name: endpoint
    fromFieldPath: status.atProvider.address
  - name: port
    fromFieldPath: status.atProvider.port
    type: FromFieldPath
```

**RBAC** — developers can manage Claims in their namespace, nothing else:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: crossplane-developer
rules:
  - apiGroups: [platform.example.com]
    resources: [postgresdatabases]
    verbs: [get, list, watch, create, update, patch, delete]
```

**What the developer writes:**

```yaml
apiVersion: platform.example.com/v1alpha1
kind: PostgresDatabase
metadata:
  name: payment-service-db
  namespace: team-payments
spec:
  parameters:
    size: large
    storageGB: 100
    highAvailability: true
  writeConnectionSecretToRef:
    name: payment-db-conn
```

Three parameters, one YAML, one `kubectl apply`. The platform team owns everything else.

---

## Pitfalls

**Deletion cascades.** Deleting a Claim deletes the XR, which deletes the Managed Resource, which deletes the real cloud resource. For databases this is catastrophic. Set `deletionPolicy: Orphan` in Compositions until you are confident, or enable RDS deletion protection in `forProvider`.

**Provider version skew.** Provider upgrades can rename fields. Test in a staging cluster first and run `kubectl diff` before applying.

**Reconciliation overwriting manual changes.** Crossplane reverts anything you change in the cloud console. Pause a resource with `crossplane.io/paused: "true"` while debugging. Remember to remove it.

**Composition sprawl.** Patch transforms are hard to read at scale. Keep Compositions under ~150 lines. If a Composition grows beyond that, split it into two and select by label.

**Secret proliferation.** Connection secrets land in Kubernetes namespaces. Encrypt etcd at rest and lock down RBAC to prevent cross-team reads.

**No plan/apply gate.** There is no `crossplane plan`. Use separate dev/staging/prod clusters and GitOps PR reviews as your change gate.

---

## Quick Reference

```bash
# Inventory
kubectl get providers
kubectl get providerconfigs
kubectl get managed          # all Managed Resources
kubectl get composite        # all XRs
kubectl get xrd              # all CompositeResourceDefinitions

# Inspect
kubectl describe <kind> <name>
kubectl get events --field-selector involvedObject.name=<name>

# Pause / unpause reconciliation
kubectl annotate <kind> <name> crossplane.io/paused=true
kubectl annotate <kind> <name> crossplane.io/paused-

# Trace Claim → XR → MR
kubectl get postgresdatabases -n <ns>          # find XR name in status.resourceRef
kubectl get xpostgresdatabases <xr-name>       # find MR names in spec.resourceRefs
kubectl get instances.rds.aws.upbound.io <mr>  # inspect the Managed Resource

# Debug Composition rendering
kubectl get xr <name> -o yaml | grep -A 20 status
```

---

## Next Steps

- `Terraform.md` — state management, drift detection, and when Terraform is still the right tool.
- `Kubernetes.md` — controllers, CRDs, and the reconciliation loop Crossplane builds on.
- `ArgoCD.md` — wire Crossplane manifests into a full GitOps pipeline so every infrastructure change goes through Git review.

---

## Recommended learning resources

**YouTube channels & playlists:**
- [DevOps Toolkit (Viktor Farcic) — Crossplane Deep Dives](https://www.youtube.com/@DevOpsToolkit) — comprehensive series on Compositions, XRDs, and Crossplane vs Terraform
- [Upbound — Official Crossplane Channel](https://www.youtube.com/@Upbound) — KubeCon talks, provider development, and platform building tutorials
- [TechWorld with Nana — Kubernetes Infrastructure](https://www.youtube.com/@TechWorldwithNana) — beginner-friendly Kubernetes concepts that Crossplane builds on
- [Spacelift — IaC Comparison](https://www.youtube.com/@spacelift-io) — where Crossplane fits in the IaC landscape alongside Terraform and Pulumi
- [CNCF — Crossplane Presentations](https://www.youtube.com/@cncf) — KubeCon presentations on Crossplane architecture and real-world adoption

**Official docs & blogs:**
- [Crossplane Documentation](https://docs.crossplane.io/) — provider reference, Composition guide, and getting started tutorials
- [Upbound Blog](https://blog.upbound.io/) — platform engineering patterns, provider updates, and production case studies
- [Crossplane GitHub](https://github.com/crossplane/crossplane) — examples, issue tracker, and community Compositions

## The Mantra

> Declare what you want. Let the control plane close the gap. Review the diff in Git, not in a console.
