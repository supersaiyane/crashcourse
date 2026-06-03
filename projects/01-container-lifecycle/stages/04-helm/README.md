# Stage 4: Helm — Kubernetes Package Manager

**Goal:** Master Helm by packaging the Cutlink URL shortener into a reusable, parameterized Helm chart with multi-environment values, subchart dependencies, hooks, and testing.

**Prerequisites:** Stage 3 (Kubernetes) completed. You should understand Deployments, Services, ConfigMaps, Secrets, StatefulSets, Ingress, and `kubectl`. A working kind cluster from Stage 3 is recommended but not required — you can inspect `helm template` output without a cluster.

**Sample App:** Cutlink — a URL shortener with Flask backend, PostgreSQL, Redis cache, and nginx frontend. Same app from Stages 2 and 3, now packaged as a Helm chart.

---

## 1. Theory

### 1.1 Why Helm?

Raw Kubernetes YAML is repetitive. Every Deployment needs the same boilerplate: `apiVersion`, `kind`, `metadata`, `spec.template.spec.containers`, ports, probes, resource limits, labels, selectors. Multiply that by microservices, environments, and teams, and you end up with thousands of lines of copy-pasted YAML.

**The problems with raw YAML at scale:**

| Problem | Example |
|---------|---------|
| **Repetition** | Every Deployment has the same label structure, probe config, resource limits pattern |
| **Copy-paste errors** | Forgetting to update the selector `matchLabels` when you change Pod labels |
| **Environment drift** | Dev and prod YAML files diverge over time — subtle differences cause surprise failures |
| **No packaging** | No standard way to distribute, version, or share a set of Kubernetes resources |
| **No lifecycle management** | Installing, upgrading, rolling back a set of related resources requires custom scripts |

**Helm solves these problems with four concepts:**

1. **Templating** — YAML files become Go templates with variables. The same chart produces dev, staging, and prod manifests by changing values.
2. **Packaging** — Charts are packaged as `.tgz` files with a standard directory structure. You can distribute them via HTTP repositories or OCI registries.
3. **Versioning** — Every chart has a `version` and every release tracks its revision history. `helm rollback` reverts to any previous revision.
4. **Releases** — Installing a chart creates a release: a named, versioned deployment of that chart. You can install the same chart multiple times with different names in the same cluster.

**Helm vs Kustomize:**

Both solve the "I need different configs for different environments" problem, but with different philosophies:

| Aspect | Helm | Kustomize |
|--------|------|-----------|
| **Approach** | Template-driven (Go templates) | Patch-driven (base + overlays) |
| **Learning curve** | Steeper (template syntax) | Gentler (plain YAML with patches) |
| **Expressiveness** | Full programming constructs (range, if/else, functions) | Limited to strategic merge patches and JSON patches |
| **Packaging** | Built-in (.tgz charts, repositories) | Not built-in (uses kustomize build) |
| **Lifecycle** | Helm manages releases, revisions, rollbacks | kubectl apply manages nothing |
| **Ecosystem** | Thousands of community charts (Bitnami, etc.) | Growing, but smaller |

For Cutlink, we use Helm because it's the industry standard for distributing complex applications (like databases, monitoring stacks, and CI/CD tools). Most production Kubernetes deployments use either Helm or Kustomize — knowing both is essential.

**Real-world Helm usage:**

- Install Prometheus/Grafana: `helm install prometheus prometheus-community/kube-prometheus-stack`
- Install NGINX Ingress: `helm install ingress ingress-nginx/ingress-nginx`
- Install cert-manager: `helm install cert-manager jetstack/cert-manager`
- Install your own apps: `helm install cutlink ./cutlink-chart`

Almost every major cloud-native project ships a Helm chart. Learning Helm unlocks the entire ecosystem.

---

### 1.2 Architecture (Helm v3)

Helm v3 removed Tiller (the server-side component from v2). The architecture is simple:

```
                    ┌──────────────────┐
                    │   Helm Client     │
                    │  (CLI binary)     │
                    └────────┬─────────┘
                             │ reads
                             ▼
                    ┌──────────────────┐
                    │   Chart (.tgz)    │
                    │   or directory    │
                    └────────┬─────────┘
                             │ renders templates with values
                             ▼
                    ┌──────────────────┐
                    │   Manifests      │
                    │  (final YAML)    │
                    └────────┬─────────┘
                             │ kubectl apply
                             ▼
                    ┌──────────────────┐
                    │  K8s API Server   │
                    └──────────────────┘
```

**Key differences from v2:**

| v2 (deprecated) | v3 (current) |
|-----------------|-------------|
| Tiller runs in-cluster with cluster-admin RBAC | No server-side component |
| Tiller stores release data in ConfigMaps inside the cluster | Helm stores release data in Secrets inside the cluster (or in your local filesystem with `--driver` options) |
| Tiller is a security risk (it has broad access) | Client-only — uses your kubeconfig context for auth |
| `helm init` installs Tiller | No init needed — just install the CLI |

**Helm v3 is a single binary.** It reads your kubeconfig (~/.kube/config), connects to the cluster using the same auth as kubectl, and applies manifests. No in-cluster agent required.

**Release storage:**

When you run `helm install`, Helm creates a Secret in the target namespace that stores the entire release (chart name, values, rendered manifests, revision number). This is how `helm list`, `helm upgrade`, and `helm rollback` work — they read from these Secrets.

```bash
# See release secrets in the namespace
kubectl get secret -n cutlink -l owner=helm
```

**The chart -> release -> revision chain:**

```
Chart (template) ──install──> Release v1 (first install)
                     │
                     ├──upgrade──> Release v2 (revision 2)
                     │               └──rollback──> Release v2 (re-revisioned as v3, same content as v1)
                     │
                     └──uninstall──> Release deleted (can be --keep-history to retain secrets)
```

---

### 1.3 Chart Structure

A Helm chart is a directory with a specific structure. Here's the canonical layout:

```
mychart/
├── Chart.yaml          # Chart metadata (name, version, description, dependencies)
├── values.yaml         # Default configuration values
├── values-dev.yaml     # Environment-specific overrides (optional, naming convention)
├── values-prod.yaml    # Environment-specific overrides (optional, naming convention)
├── templates/          # Go template files that generate Kubernetes manifests
│   ├── _helpers.tpl    # Named templates (functions) shared across templates
│   ├── NOTES.txt       # Post-install message (displayed after helm install)
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── pvc.yaml
│   ├── serviceaccount.yaml
│   ├── networkpolicy.yaml
│   └── tests/          # Test pods that run during helm test
│       └── test-connection.yaml
├── charts/             # Subchart dependencies (either .tgz files or unpacked chart dirs)
│   └── postgresql/     # Example: unpacked Bitnami PostgreSQL subchart
├── crds/               # Custom Resource Definitions (installed first, before templates)
├── .helmignore         # Patterns to exclude when packaging the chart
└── README.md           # Chart documentation (not rendered, but good practice)
```

**Chart.yaml (required):**

```yaml
apiVersion: v2          # v2 for Helm 3 (v1 is deprecated)
name: cutlink           # Chart name (used in release naming and packaging)
description: URL shortener Helm chart
version: 0.1.0          # Chart version (semver 2.0)
appVersion: "1.0.0"     # Version of the application inside the chart
type: application       # "application" or "library" (library charts have no templates)
dependencies:           # Optional: charts this chart depends on
  - name: postgresql
    version: "~12.0.0"
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
maintainers:
  - name: "Your Name"
    email: "your@email.com"
keywords:
  - url shortener
  - cutlink
```

**values.yaml (required — provides defaults):**

Every chart ships with a `values.yaml` that defines all configurable parameters with sensible defaults. This file is the contract between the chart author and the chart user.

**The template rendering pipeline:**

```
values.yaml  ──┐
values-prod.yaml ──┤
--set image.tag=v2 ──┤
                   ▼
         Merged Values
                   │
         ┌─────────▼────────┐
         │  template engine  │
         │  (Go + Sprig)     │
         └─────────┬────────┘
                   │
         ┌─────────▼────────┐
         │  Final Manifests │
         └──────────────────┘
```

Values are merged with this precedence (highest wins):
1. `--set` flags (command-line)
2. `--set-string` flags (as literal strings)
3. `--set-json` flags (as JSON)
4. `-f` / `--values` files (later files override earlier ones)
5. The chart's `values.yaml`

---

### 1.4 Template Language (Go Templates + Sprig)

Helm uses Go's `text/template` package extended with **Sprig** (a library of 70+ template functions) and **Helm-specific functions**. This is the heart of Helm — understanding the template language is what separates beginners from advanced users.

#### Template Delimiters

```yaml
{{ <expression> }}     # Renders the expression's value
{{- <expression> }}    # Trims whitespace BEFORE the delimiter
{{ <expression> -}}    # Trims whitespace AFTER the delimiter
{{- <expression> -}}   # Trims whitespace on both sides
```

**Whitespace control is critical in YAML.** Indentation matters, and Go templates can produce blank lines. The `-` syntax is your primary tool for clean YAML output.

**Before trimming:**
```yaml
ports:
{{- range .Values.ports }}
  - containerPort: {{ . }}
{{- end }}
```

**Without the `-`:**
```yaml
ports:
  # blank line because of newline after range
  - containerPort: 8080
```

**Correct:**
```yaml
ports:
  - containerPort: 8080
```

#### Built-in Objects

Helm injects several objects into every template scope:

| Object | Description | Example |
|--------|-------------|---------|
| `.Values` | Merged configuration values | `.Values.replicaCount` |
| `.Release` | Current release metadata | `.Release.Name`, `.Release.Namespace`, `.Release.Service` |
| `.Chart` | Chart.yaml data | `.Chart.Name`, `.Chart.Version`, `.Chart.AppVersion` |
| `.Files` | Access to files in the chart | `.Files.Get "config.toml"` |
| `.Capabilities` | Cluster capabilities | `.Capabilities.KubeVersion.Version`, `.Capabilities.APIVersions.Has "apps/v1"` |
| `.Template` | Current template info | `.Template.Name` (path to template) |

**`helm template --debug`** shows you exactly what these objects contain — useful for debugging.

#### Control Structures

**`if/else` — conditional resources:**

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
...
{{- end }}
```

Comparison operators: `eq` (==), `ne` (!=), `lt` (<), `le` (<=), `gt` (>), `ge` (>=).

```yaml
{{- if eq .Values.service.type "NodePort" }}
  nodePort: {{ .Values.service.nodePort }}
{{- end }}
```

Logical operators: `and`, `or`, `not`.

```yaml
{{- if and .Values.persistence.enabled (gt .Values.replicaCount 1) }}
  # Show info about HA persistence
{{- end }}
```

**`with` — scoping:**

`with` changes the current scope (`.`) to a specific value. Inside a `with` block, you reference `.` instead of repeating the full path.

```yaml
{{- with .Values.resources }}
resources:
  requests:
    cpu: {{ .cpu }}
    memory: {{ .memory }}
  limits:
    cpu: {{ .cpu }}
    memory: {{ .memory }}
{{- end }}
```

**`range` — iteration:**

`range` iterates over arrays, slices, or maps.

```yaml
# Iterating over an array of environment variables
{{- range .Values.extraEnv }}
- name: {{ .name }}
  value: {{ .value }}
{{- end }}

# Iterating over a map
{{- range $key, $value := .Values.labels }}
{{ $key }}: {{ $value }}
{{- end }}
```

#### Functions

**Built-in Go template functions:**

| Function | Purpose | Example |
|----------|---------|---------|
| `quote` | Wrap value in double quotes | `{{ quote .Values.name }}` → `"cutlink"` |
| `default` | Provide fallback value | `{{ default "latest" .Values.image.tag }}` |
| `indent` | Indent a multi-line string by N spaces | `{{ .Files.Get "config.toml" | indent 4 }}` |
| `nindent` | Newline + indent | `{{ include "myapp.labels" . | nindent 4 }}` |
| `toYaml` | Convert value to YAML string | `{{ toYaml .Values.nodeSelector | nindent 8 }}` |

**Sprig functions (extended library):** 70+ functions at https://masterminds.github.io/sprig/

| Category | Functions |
|----------|-----------|
| String | `upper`, `lower`, `title`, `substr`, `repeat`, `trim`, `trimSuffix`, `nospace` |
| Encoding | `b64enc`, `b64dec`, `b32enc`, `b32dec` |
| Math | `add`, `sub`, `mul`, `div`, `max`, `min` |
| Lists | `list`, `append`, `prepend`, `first`, `last`, `initial`, `rest`, `reverse`, `uniq` |
| Dicts | `dict`, `hasKey`, `keys`, `values`, `merge`, `pick`, `omit` |
| Type | `typeOf`, `kindOf`, `typeIs`, `kindIs` |
| Regex | `regexMatch`, `regexFindAll`, `regexReplaceAll` |

**`include` — reusing template blocks:**

`include` renders a named template and returns the result as a string. This is the cornerstone of DRY charts.

```yaml
# Define a named template (usually in _helpers.tpl)
{{- define "myapp.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

# Use it (with nindent to fix alignment)
metadata:
  labels:
  {{- include "myapp.labels" . | nindent 4 }}
```

**The difference between `include` and `template`:**

- `template`: old way, doesn't support pipelines (`|`)
- `include`: preferred, supports piping (e.g., `include "x" . | nindent 4`)

#### Pipeline

Templates support Unix-style pipes:

```yaml
image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
```

This chains: if `.Values.image.tag` is set, use it; otherwise, fall back to `.Chart.AppVersion`.

More complex pipelines:

```yaml
configmap: |
{{ .Files.Get "config/app.conf" | b64enc | quote }}
```

---

### 1.5 Values & Overrides

One chart, many environments. This is Helm's killer feature.

**values.yaml (defaults — shipped with the chart):**

```yaml
replicaCount: 1
image:
  repository: cutlink-backend
  tag: latest
  pullPolicy: IfNotPresent
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi
service:
  type: ClusterIP
  port: 5000
ingress:
  enabled: false
```

**values-prod.yaml (overrides for production):**

```yaml
replicaCount: 3
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2
    memory: 1Gi
ingress:
  enabled: true
  host: cutlink.example.com
hpa:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPU: 70
```

**Install with specific environment:**

```bash
# Dev (values.yaml defaults)
helm install cutlink ./cutlink

# Dev with file override
helm install cutlink-dev ./cutlink -f values-dev.yaml

# Production
helm install cutlink-prod ./cutlink -f values-prod.yaml

# Override single value inline
helm install cutlink ./cutlink --set image.tag=v1.2.3

# Namespace per environment
helm install cutlink ./cutlink --namespace cutlink-prod -f values-prod.yaml
```

**The `--values` / `-f` flag precedence:**

```bash
# Later files override earlier ones
helm install cutlink ./cutlink \
  -f values.yaml \
  -f values-prod.yaml \
  --set image.tag=v1.2.3
```

In this case: `image.tag` is `v1.2.3` (highest priority: --set), everything else comes from `values-prod.yaml` (overriding values.yaml).

**Best practices for values files:**

1. `values.yaml` — safe defaults for development
2. `values-dev.yaml` — minimal overrides (1 replica, small resources)
3. `values-staging.yaml` — moderate resources, staging-specific configs
4. `values-prod.yaml` — production overrides (3+ replicas, large resources, HPA, PDB)
5. CI/CD can inject per-deployment overrides via `--set`

---

### 1.6 Chart Dependencies

Real applications consist of multiple services. Helm supports this through subcharts:

```
cutlink-app/              # Parent chart
├── Chart.yaml            # Dependencies listed here
│   dependencies:
│     - name: cutlink-backend
│       version: "~0.1.0"
│       repository: "file://../cutlink-backend"
│     - name: postgresql
│       version: "~12.0.0"
│       repository: https://charts.bitnami.com/bitnami
│     - name: redis
│       version: "~17.0.0"
│       repository: https://charts.bitnami.com/bitnami
├── charts/               # Populated by `helm dependency build`
│   ├── cutlink-backend-0.1.0.tgz
│   ├── postgresql-12.0.0.tgz
│   └── redis-17.0.0.tgz
└── values.yaml           # Global + per-subchart values
```

**Values scoping in parent charts:**

```yaml
# Parent values.yaml — prefix each subchart config with the subchart name
cutlink-backend:
  replicaCount: 2
  image:
    tag: v1.2.3

postgresql:
  auth:
    database: cutlink
    username: cutlink
  primary:
    persistence:
      size: 5Gi

redis:
  architecture: standalone
  auth:
    enabled: false
```

**Global values:**

```yaml
# Shared across all subcharts
global:
  environment: production
  imageRegistry: myregistry.com
```

Subcharts access global values through `.Values.global.*`.

**Commands:**

```bash
# Build/refresh dependencies (downloads charts into charts/ directory)
helm dependency build ./cutlink-app

# List dependencies
helm dependency list ./cutlink-app

# Update dependencies
helm dependency update ./cutlink-app

# Install the whole stack
helm install cutlink-release ./cutlink-app
```

**Conditional subcharts:**

```yaml
# In Chart.yaml dependencies:
  - name: postgresql
    condition: postgresql.enabled  # Only install if postgresql.enabled is true
  - name: redis
    condition: redis.enabled
```

```yaml
# In values.yaml:
postgresql:
  enabled: true   # Set to false to skip installing PostgreSQL
redis:
  enabled: true
```

This is useful for development (maybe you want to use an external database) or when migrating piece by piece.

---

### 1.7 Hooks

Helm hooks allow you to run specific resources at specific points in the release lifecycle. They're useful for:

- Running database migrations before a new version deploys
- Validating a deployment after installation
- Backing up data before an upgrade
- Cleaning up resources after a deletion

**Available hooks:**

| Hook | When it runs |
|------|-------------|
| `pre-install` | After templates are rendered, before any resources are created |
| `post-install` | After all resources are created |
| `pre-upgrade` | Before an upgrade |
| `post-upgrade` | After an upgrade |
| `pre-delete` | Before deletion |
| `post-delete` | After deletion |
| `pre-rollback` | Before a rollback |
| `post-rollback` | After a rollback |
| `test` | During `helm test` |

**Hook resource example (Job):**

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ .Release.Name }}-db-migrate
  annotations:
    "helm.sh/hook": pre-install,pre-upgrade
    "helm.sh/hook-delete-policy": hook-succeeded,before-hook-creation
    "helm.sh/hook-weight": "-5"
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: "{{ .Values.backend.image.repository }}:{{ .Values.backend.image.tag }}"
          command: ["python", "manage.py", "migrate"]
          envFrom:
            - configMapRef:
                name: {{ .Release.Name }}-config
            - secretRef:
                name: {{ .Release.Name }}-secrets
```

**Hook annotations:**

| Annotation | Purpose |
|------------|---------|
| `helm.sh/hook` | Which lifecycle events trigger this resource |
| `helm.sh/hook-weight` | Execution order (lower weight = earlier, default 0) |
| `helm.sh/hook-delete-policy` | When to clean up the hook resource |

**Important hook behaviors:**

1. Hooks run **synchronously** — `helm install` waits for `pre-install` Jobs to complete before creating regular resources
2. Hook resources are **not managed** by Helm after they run (deletion is controlled by `hook-delete-policy`)
3. Multiple hooks at the same weight run in parallel
4. Hook failures block the operation (`--no-hooks` skips them)

**Hook weights control ordering:**

```
Weight -10: Backup database (pre-upgrade)
Weight  -5: Run migrations (pre-upgrade)
Weight   0: Regular resources (normal install/upgrade)
Weight   5: Smoke test (post-install)
Weight  10: Performance validation (post-install)
```

---

### 1.8 Built-in Objects in Detail

Understanding Helm's built-in objects is essential for writing flexible charts. Here's a deeper look:

**`.Values` — the merged configuration:**

This is the result of merging `values.yaml` + `-f` files + `--set` flags. It's a nested dictionary:

```yaml
.Values:
  replicaCount: 3
  image:
    repository: cutlink-backend
    tag: v1.2.3
  backend:
    env:
      DEBUG: "false"
```

Access: `{{ .Values.image.repository }}`

**`.Release` — current release metadata:**

```go
.Release.Name        // "cutlink-prod" (the name you gave with --name or helm install)
.Release.Namespace   // "cutlink" or "cutlink-prod"
.Release.Revision    // int, incremented on every upgrade (1, 2, 3...)
.Release.IsInstall   // true if this is an install operation
.Release.IsUpgrade   // true if this is an upgrade operation
.Release.Service     // always "Helm"
```

**Using `.Release.Name` for resource naming:**

```yaml
metadata:
  name: {{ .Release.Name }}-backend
```

This allows multiple releases of the same chart in one namespace (e.g., `cutlink-dev`, `cutlink-staging`, `cutlink-feature-branch`).

**`.Chart` — metadata from Chart.yaml:**

```go
.Chart.Name          // "cutlink"
.Chart.Version       // "0.1.0"
.Chart.AppVersion    // "1.0.0"
.Chart.Description   // "URL shortener Helm chart"
```

**`.Files` — access files inside the chart:**

```yaml
# templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Release.Name }}-config
data:
  app.conf: |
{{ .Files.Get "config/app.conf" | indent 4 }}
  nginx.conf: |
{{ .Files.Get "config/nginx.conf" | indent 4 }}
```

**`Files.Get`** reads a file from the chart directory. Files in `templates/` are not accessible (they're processed as templates, not static files). Put static config files in a separate directory like `config/`.

**`Files.GetGlob`** returns multiple files matching a glob pattern:

```yaml
data:
{{- range $path, $content := .Files.Glob "config/*.json" }}
  {{ $path }}: |
{{ $content | indent 4 }}
{{- end }}
```

**`.Capabilities` — cluster information:**

```go
.Capabilities.KubeVersion.Version          // "1.28.0"
.Capabilities.KubeVersion.Major            // "1"
.Capabilities.KubeVersion.Minor            // "28"
.Capabilities.APIVersions.Has "apps/v1"    // true
.Capabilities.APIVersions.Has "networking.k8s.io/v1/Ingress"  // true
```

Use this to handle different Kubernetes versions:

```yaml
{{- if .Capabilities.APIVersions.Has "autoscaling/v2" }}
apiVersion: autoscaling/v2
{{- else }}
apiVersion: autoscaling/v2beta2
{{- end }}
```

**`.Template` — current template info:**

```go
.Template.Name    // "cutlink/templates/deployment.yaml"
.Template.BasePath // "templates"
```

Useful for debugging — you can add `{{ .Template.Name }}` to annotations to identify which template produced a resource.

---

## 2. Hands-On Exercises

The Helm chart for Cutlink is at `sample-app/helm/cutlink/`. Complete these exercises in order.

### Exercise 1: Create and Inspect the Helm Chart

**Goal:** Understand the chart structure, inspect default values, and verify template rendering.

**Step 1: Create the chart from scratch**

```bash
# Navigate to the course root
cd container-lifecycle-course

# Create the chart scaffold
helm create sample-app/helm/cutlink
```

This creates all the boilerplate files. For this course, we've pre-built the chart — but understanding what `helm create` produces is valuable.

**Step 2: Explore the chart structure**

```bash
tree sample-app/helm/cutlink/
```

```
sample-app/helm/cutlink/
├── Chart.yaml              # Metadata: name, version, appVersion, description
├── values.yaml             # All configurable parameters with defaults
├── values-dev.yaml         # Dev environment overrides
├── values-prod.yaml        # Production environment overrides
├── templates/
│   ├── _helpers.tpl        # Shared named templates (labels, selector labels)
│   ├── namespace.yaml      # Namespace resource
│   ├── deployment-backend.yaml
│   ├── deployment-frontend.yaml
│   ├── deployment-redis.yaml
│   ├── statefulset-postgres.yaml
│   ├── service-backend.yaml
│   ├── service-frontend.yaml
│   ├── service-redis.yaml
│   ├── service-postgres.yaml
│   ├── configmap.yaml      # Backend configuration
│   ├── secret.yaml         # Database credentials (parameterized)
│   ├── pvc.yaml            # PostgreSQL persistent volume claim
│   ├── ingress.yaml        # HTTP routing (conditional on ingress.enabled)
│   ├── hpa.yaml            # Auto-scaling (conditional on hpa.enabled)
│   ├── networkpolicy.yaml  # Pod-level firewalling
│   └── NOTES.txt           # Post-install instructions
├── charts/                 # Subchart dependencies (empty — add in Exercise 3)
└── crds/                   # Custom Resource Definitions (empty — not needed for Cutlink)
```

**Step 3: Inspect Chart.yaml**

```bash
cat sample-app/helm/cutlink/Chart.yaml
```

```yaml
apiVersion: v2
name: cutlink
description: Cutlink URL shortener — a Helm chart for Kubernetes
type: application
version: 0.1.0
appVersion: "1.0.0"
kubeVersion: ">=1.22.0-0"
keywords:
  - url-shortener
  - cutlink
  - helm
home: https://github.com/your-org/cutlink
maintainers:
  - name: Your Name
    email: your@email.com
```

**Key fields:**
- `apiVersion: v2` — Helm 3 charts use v2 (Helm 2 used v1)
- `type: application` — This chart deploys an application. The other option is `library` (reusable templates without resources).
- `version: 0.1.0` — The chart's version. Increment with every change.
- `appVersion: "1.0.0"` — The version of the application inside the chart. Independent of chart version.
- `kubeVersion: ">=1.22.0-0"` — Minimum Kubernetes version required.

**Step 4: Render the chart to verify it works**

```bash
# Render templates without installing (dry-run)
helm template cutlink-release sample-app/helm/cutlink/ --debug

# Or use the --dry-run flag with install
helm install cutlink-release sample-app/helm/cutlink/ --dry-run --debug
```

This produces the rendered YAML without talking to a cluster. The `--debug` flag shows the computed values.

**Step 5: Lint the chart**

```bash
# Check for YAML errors, missing required fields, best practices
helm lint sample-app/helm/cutlink/
```

A successful lint produces:
```
==> Linting sample-app/helm/cutlink/
[INFO] Chart.yaml: icon is recommended
1 chart(s) linted, 0 chart(s) failed
```

**Step 6: Package the chart**

```bash
# Package into a .tgz file
helm package sample-app/helm/cutlink/ -d sample-app/helm/

# Output: sample-app/helm/cutlink-0.1.0.tgz
```

The package filename follows the convention `{name}-{version}.tgz`.

**What you've learned:**
- Chart structure and metadata
- How to render templates without a cluster (`helm template`)
- How to validate charts (`helm lint`)
- How to package charts for distribution (`helm package`)

---

### Exercise 2: Multi-Environment Values

**Goal:** Read and understand the three values files and how they compose.

**Step 1: Compare the values files**

```bash
# View all three value files
cat sample-app/helm/cutlink/values.yaml
cat sample-app/helm/cutlink/values-dev.yaml
cat sample-app/helm/cutlink/values-prod.yaml
```

**values.yaml (defaults — shared baseline):**

```yaml
# Global settings
namespace: cutlink

# Backend configuration
backend:
  replicaCount: 1
  image:
    repository: cutlink-backend
    tag: latest
    pullPolicy: IfNotPresent
  service:
    port: 5000
    type: ClusterIP
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 256Mi
  env:
    DEBUG: "false"
    BASE_URL: "http://cutlink.local"
    FLASK_ENV: production

# Frontend configuration
frontend:
  replicaCount: 1
  image:
    repository: cutlink-frontend
    tag: latest
    pullPolicy: IfNotPresent
  service:
    port: 80
    type: ClusterIP
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 128Mi

# Redis configuration
redis:
  replicaCount: 1
  image:
    repository: redis
    tag: 7-alpine
    pullPolicy: IfNotPresent
  service:
    port: 6379
    type: ClusterIP
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 256Mi

# PostgreSQL configuration
postgresql:
  image:
    repository: postgres
    tag: 16-alpine
    pullPolicy: IfNotPresent
  service:
    port: 5432
    type: ClusterIP
  persistence:
    enabled: true
    size: 1Gi
    storageClass: ""
  resources:
    requests:
      cpu: 200m
      memory: 256Mi
    limits:
      cpu: 1
      memory: 512Mi

# Secrets (parameterized — NEVER commit real secrets!)
secret:
  dbUser: cutlink
  dbPass: cutlink_secret_2024
  dbName: cutlink

# Ingress
ingress:
  enabled: false
  className: nginx
  host: cutlink.local
  tls:
    enabled: false
  annotations: {}

# Horizontal Pod Autoscaler
hpa:
  enabled: false
  minReplicas: 1
  maxReplicas: 5
  targetCPUUtilizationPercentage: 70

# Network policy
networkPolicy:
  enabled: true

# Global image pull secret (optional)
imagePullSecrets: []
```

**values-dev.yaml (development overrides):**

```yaml
backend:
  replicaCount: 1
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 200m
      memory: 256Mi
  env:
    DEBUG: "true"
    FLASK_ENV: development

frontend:
  replicaCount: 1

redis:
  replicaCount: 1

ingress:
  enabled: false

hpa:
  enabled: false
```

**values-prod.yaml (production overrides):**

```yaml
backend:
  replicaCount: 3
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 2
      memory: 1Gi
  env:
    BASE_URL: "https://cutlink.example.com"

frontend:
  replicaCount: 3
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 256Mi

redis:
  replicaCount: 1
  resources:
    requests:
      cpu: 200m
      memory: 256Mi
    limits:
      cpu: 1
      memory: 512Mi

postgresql:
  persistence:
    size: 5Gi

ingress:
  enabled: true
  host: cutlink.example.com
  tls:
    enabled: true

hpa:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

networkPolicy:
  enabled: true
```

**Step 2: Render templates with different environments**

```bash
# Render with dev values
helm template cutlink-dev sample-app/helm/cutlink/ \
  -f sample-app/helm/cutlink/values-dev.yaml \
  --debug > /tmp/cutlink-dev.yaml

# Render with prod values
helm template cutlink-prod sample-app/helm/cutlink/ \
  -f sample-app/helm/cutlink/values-prod.yaml \
  --debug > /tmp/cutlink-prod.yaml

# Compare the differences
diff /tmp/cutlink-dev.yaml /tmp/cutlink-prod.yaml
```

**What to notice in the diff:**
- Backend replicas: 1 (dev) vs 3 (prod)
- Backend CPU limit: 200m (dev) vs 2 (prod)
- Frontend replicas: 1 (dev) vs 3 (prod)
- Ingress: not present (dev) vs fully configured (prod)
- HPA: not present (dev) vs configured with min=3 max=10 (prod)
- PostgreSQL PVC size: default (dev) vs 5Gi (prod)
- DEBUG env var: "true" (dev) vs not set (prod)

**Step 3: Merge precedence demonstration**

```bash
# Override a single value on top of prod values
helm template cutlink-prod sample-app/helm/cutlink/ \
  -f sample-app/helm/cutlink/values-prod.yaml \
  --set backend.replicaCount=5 \
  --debug | grep -A 2 "replicas"
```

This should show `replicas: 5` for the backend — demonstrating that `--set` overrides the values file.

**Step 4: Install to the cluster (optional)**

If you have a kind cluster from Stage 3:

```bash
# Load images into kind
kind load docker-image cutlink-backend:latest --name cutlink
kind load docker-image cutlink-frontend:latest --name cutlink

# Install dev
helm install cutlink-dev sample-app/helm/cutlink/ \
  -f sample-app/helm/cutlink/values-dev.yaml \
  --namespace cutlink-dev \
  --create-namespace

# Check status
helm list -n cutlink-dev
kubectl get all -n cutlink-dev
```

**What you've learned:**
- How values files compose with Helm's merge rules
- How one chart produces different manifests per environment
- How `--set` overrides individual values at deploy time
- How to use `helm template` to preview changes

---

### Exercise 3: Full App of Charts (Dependencies)

**Goal:** Create a parent chart that composes Cutlink with its infrastructure dependencies (PostgreSQL and Redis as subcharts from Bitnami).

**Step 1: Create the parent chart**

```bash
helm create sample-app/helm/cutlink-app
rm -rf sample-app/helm/cutlink-app/templates/*.yaml  # We'll compose from subcharts
```

**Step 2: Edit Chart.yaml with dependencies**

```yaml
# sample-app/helm/cutlink-app/Chart.yaml
apiVersion: v2
name: cutlink-app
description: Full Cutlink stack — backend, frontend, PostgreSQL, Redis
type: application
version: 0.1.0
appVersion: "1.0.0"

dependencies:
  - name: cutlink-backend
    version: "~0.1.0"
    repository: file://../cutlink
    condition: cutlink-backend.enabled
  - name: postgresql
    version: "~12.0.0"
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
  - name: redis
    version: "~17.0.0"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
```

**Dependency syntax explained:**
- `name` — Name of the dependency (used as the subchart name in values overrides)
- `version` — Semver constraint (`~0.1.0` means `>= 0.1.0, < 0.2.0`)
- `repository` — Where to find the chart (`file://` for local, URL for remote)
- `condition` — Which values.yaml key controls whether this subchart is installed
- `alias` (optional) — Use a different name for the subchart in values overrides

**Step 3: Add Bitnami repository**

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

**Step 4: Download dependencies**

```bash
helm dependency update sample-app/helm/cutlink-app/
```

This downloads:
1. The local `cutlink` chart into `charts/cutlink-backend-0.1.0.tgz`
2. The Bitnami PostgreSQL chart into `charts/postgresql-12.x.x.tgz`
3. The Bitnami Redis chart into `charts/redis-17.x.x.tgz`

**Step 5: Create a parent values.yaml with per-subchart overrides**

```yaml
# sample-app/helm/cutlink-app/values.yaml
# Global settings shared across all subcharts
global:
  environment: production

# Cutlink backend overrides
cutlink-backend:
  enabled: true
  backend:
    replicaCount: 3
    resources:
      requests:
        cpu: 500m
        memory: 512Mi
    env:
      BASE_URL: "https://cutlink.example.com"

# Bitnami PostgreSQL overrides
postgresql:
  enabled: true
  auth:
    database: cutlink
    username: cutlink
    password: cutlink_prod_secret
  primary:
    persistence:
      size: 5Gi
    resources:
      requests:
        cpu: 500m
        memory: 1Gi
  readReplicas:
    resources:
      requests:
        cpu: 300m
        memory: 512Mi

# Bitnami Redis overrides
redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: false
  master:
    resources:
      requests:
        cpu: 200m
        memory: 256Mi
  replica:
    replicaCount: 0
```

**Step 6: Render and inspect**

```bash
# Render the full stack
helm template cutlink-app sample-app/helm/cutlink-app/ --debug

# Just show the number of resources
helm template cutlink-app sample-app/helm/cutlink-app/ \
  | grep -c "^---"
```

The parent chart composes all subcharts into one unified deployment. A single `helm install` deploys the entire Cutlink stack with its dependencies.

**Step 7: Install the full stack**

```bash
helm install cutlink-stack sample-app/helm/cutlink-app/ \
  --namespace cutlink-prod \
  --create-namespace
```

**Step 8: List subchart releases**

```bash
# Helm tracks the parent chart as one release
helm list -n cutlink-prod

# But each subchart creates its own resources
kubectl get pods -n cutlink-prod
# NAME                                    READY   STATUS
# cutlink-stack-cutlink-backend-xxx       1/1     Running
# cutlink-stack-postgresql-0              1/1     Running
# cutlink-stack-redis-master-0            1/1     Running
```

Note the naming convention: `{release}-{subchart-name}-{replica}`.

**Dependency tree:**

```
cutlink-app (parent)
├── cutlink-backend (local file dependency)
│   ├── templates/deployment-backend.yaml
│   ├── templates/service-backend.yaml
│   ├── templates/configmap.yaml
│   └── templates/secret.yaml
├── postgresql (Bitnami external dependency)
│   ├── templates/statefulset.yaml
│   ├── templates/service.yaml
│   ├── templates/pvc.yaml
│   └── templates/secrets.yaml
└── redis (Bitnami external dependency)
    ├── templates/deployment.yaml
    ├── templates/service.yaml
    └── templates/configmap.yaml
```

**What you've learned:**
- Parent charts compose multiple subcharts into one deployment
- File-based dependencies for local charts
- Repository-based dependencies for external charts (Bitnami)
- Per-subchart values override via values.yaml
- Conditional subcharts with `condition` and `.enabled`
- The `helm dependency` workflow (update, build, list)

---

### Exercise 4: Helm Hooks & Testing

**Goal:** Add lifecycle hooks and test resources to the cutlink chart.

**Step 1: Create a pre-install migration job**

In `sample-app/helm/cutlink/templates/job-db-migrate.yaml`:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ .Release.Name }}-db-migrate
  namespace: {{ .Values.namespace | default .Release.Namespace }}
  annotations:
    "helm.sh/hook": pre-install,pre-upgrade
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
  labels:
    {{- include "cutlink.labels" . | nindent 4 }}
spec:
  template:
    metadata:
      labels:
        {{- include "cutlink.labels" . | nindent 8 }}
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: "{{ .Values.backend.image.repository }}:{{ .Values.backend.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.backend.image.pullPolicy }}
          command:
            - python
            - -c
            - |
              import os, psycopg2
              conn = psycopg2.connect(
                  host=os.getenv('DB_HOST', '{{ .Release.Name }}-postgres'),
                  dbname=os.getenv('DB_NAME', '{{ .Values.secret.dbName }}'),
                  user=os.getenv('DB_USER', '{{ .Values.secret.dbUser }}'),
                  password=os.getenv('DB_PASS', '{{ .Values.secret.dbPass }}')
              )
              cur = conn.cursor()
              cur.execute('''
                  CREATE TABLE IF NOT EXISTS urls (
                      id SERIAL PRIMARY KEY,
                      short_code VARCHAR(10) UNIQUE NOT NULL,
                      original_url TEXT NOT NULL,
                      created_at TIMESTAMP DEFAULT NOW(),
                      click_count INTEGER DEFAULT 0
                  )
              ''')
              cur.execute('''
                  CREATE TABLE IF NOT EXISTS clicks (
                      id SERIAL PRIMARY KEY,
                      short_code VARCHAR(10) NOT NULL,
                      clicked_at TIMESTAMP DEFAULT NOW(),
                      user_agent TEXT,
                      ip_address VARCHAR(45)
                  )
              ''')
              conn.commit()
              cur.close()
              conn.close()
              print("Migration completed successfully")
          env:
            - name: DB_HOST
              value: "{{ .Release.Name }}-postgres"
            - name: DB_NAME
              value: "{{ .Values.secret.dbName }}"
            - name: DB_USER
              value: "{{ .Values.secret.dbUser }}"
            - name: DB_PASS
              value: "{{ .Values.secret.dbPass }}"
```

**How hook annotations work:**

| Annotation | Meaning |
|------------|---------|
| `helm.sh/hook: pre-install,pre-upgrade` | Run this Job before install AND before every upgrade |
| `helm.sh/hook-weight: "-5"` | Run after weight -10 resources, before weight 0 resources |
| `helm.sh/hook-delete-policy: before-hook-creation` | Delete the old Job resource before creating a new one (prevents "already exists" errors on upgrade) |

**Step 2: Create a post-install smoke test job**

```yaml
# templates/job-smoke-test.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ .Release.Name }}-smoke-test
  namespace: {{ .Values.namespace | default .Release.Namespace }}
  annotations:
    "helm.sh/hook": post-install,post-upgrade
    "helm.sh/hook-weight": "5"
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
  labels:
    {{- include "cutlink.labels" . | nindent 4 }}
spec:
  template:
    metadata:
      labels:
        {{- include "cutlink.labels" . | nindent 8 }}
    spec:
      restartPolicy: Never
      containers:
        - name: smoke-test
          image: curlimages/curl:latest
          command:
            - /bin/sh
            - -c
            - |
              echo "Waiting for backend to be ready..."
              sleep 5
              curl -f http://{{ .Release.Name }}-backend:{{ .Values.backend.service.port }}/health || exit 1
              echo "Backend health check passed!"
```

**Step 3: Create a helm test pod**

```yaml
# templates/tests/test-connection.yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ .Release.Name }}-connection-test"
  namespace: {{ .Values.namespace | default .Release.Namespace }}
  annotations:
    "helm.sh/hook": test
  labels:
    {{- include "cutlink.labels" . | nindent 4 }}
spec:
  containers:
    - name: test-connection
      image: curlimages/curl:latest
      command:
        - /bin/sh
        - -c
        - |
          echo "=== Cutlink Smoke Tests ==="
          echo ""
          echo "1. Testing backend health endpoint..."
          curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" \
            http://{{ .Release.Name }}-backend:{{ .Values.backend.service.port }}/health || exit 1
          
          echo ""
          echo "2. Testing frontend..."
          curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" \
            http://{{ .Release.Name }}-frontend:{{ .Values.frontend.service.port }}/ || exit 1
          
          echo ""
          echo "3. Testing URL shortening..."
          SHORT_URL=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -d '{"url":"https://example.com"}' \
            http://{{ .Release.Name }}-backend:{{ .Values.backend.service.port }}/shorten)
          echo "Shorten response: $SHORT_URL"
          
          echo ""
          echo "=== All tests passed! ==="
  restartPolicy: Never
```

**Test hook pods are special:**
- They only run when you explicitly call `helm test`
- A non-zero exit code is treated as a test failure
- The output is shown to the user

**Step 4: Run the test**

```bash
# After installing the chart
helm install cutlink-test sample-app/helm/cutlink/ --namespace cutlink-test --create-namespace

# Wait for all resources to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=cutlink-test -n cutlink-test --timeout=120s

# Run the tests
helm test cutlink-test -n cutlink-test
```

Expected output:
```
NAME: cutlink-test
LAST DEPLOYED: ...
NAMESPACE: cutlink-test
STATUS: deployed

TEST SUITE:     cutlink-test-connection-test
Last Started:   ...
Last Completed: ...
Phase:          Succeeded
```

**Step 5: Debug a failing test**

```bash
# View test output
kubectl logs cutlink-test-connection-test -n cutlink-test

# If a hook job fails, check logs
kubectl logs job/cutlink-test-db-migrate -n cutlink-test

# Re-run after fixing
helm delete cutlink-test -n cutlink-test
helm install cutlink-test sample-app/helm/cutlink/ --namespace cutlink-test --create-namespace
```

**Hook execution order visualization:**

```
helm install cutlink-test
│
├── 1. pre-install hooks (weight -10 to -1)
│   └── Job: cutlink-test-db-migrate (weight -5)
│       └── Runs DB migrations ──► success
│
├── 2. Regular resources (weight 0, implicit)
│   ├── Namespace/cutlink-test
│   ├── ConfigMap/cutlink-test-config
│   ├── Secret/cutlink-test-secrets
│   ├── Service/cutlink-test-backend
│   ├── Service/cutlink-test-frontend
│   ├── Service/cutlink-test-redis
│   ├── Service/cutlink-test-postgres
│   ├── Deployment/cutlink-test-backend
│   ├── Deployment/cutlink-test-frontend
│   ├── StatefulSet/cutlink-test-postgres
│   └── PVC/cutlink-test-postgres-pvc
│
├── 3. post-install hooks (weight 1 to 10)
│   └── Job: cutlink-test-smoke-test (weight 5)
│       └── Curls /health endpoint ──► success
│
└── Release created (status: deployed)

helm test cutlink-test
│
└── Pod: cutlink-test-connection-test (annotation: helm.sh/hook=test)
    └── Runs full smoke test suite ──► passed
```

**What you've learned:**
- Hook annotations control lifecycle timing
- Pre-install hooks run blocking operations before resources are created
- Post-install hooks validate the deployment
- `helm test` runs test pods against the live release
- Hook weights control execution order
- `hook-delete-policy` prevents conflicts on subsequent upgrades

---

## 3. Helm Commands Cheat Sheet

```bash
# Chart lifecycle
helm create <name>                    # Scaffold a new chart
helm lint <chart>                     # Validate chart (YAML syntax, best practices)
helm package <chart> -d <dest>        # Package into .tgz
helm pull <repo>/<chart>              # Download a remote chart

# Repository management
helm repo add <name> <url>            # Add a chart repository
helm repo update                      # Update repo cache
helm repo list                        # List repositories
helm search repo <keyword>            # Search for charts in repos

# Install, upgrade, delete
helm install <release> <chart>        # Install a chart
helm install <release> <chart> --dry-run --debug   # Preview without installing
helm upgrade <release> <chart>        # Upgrade a release
helm upgrade --install <release> <chart>  # Install or upgrade (idempotent)
helm rollback <release> <revision>    # Rollback to a previous revision
helm uninstall <release>              # Delete a release
helm list                             # List releases
helm list --all-namespaces            # List releases across all namespaces

# Template rendering and inspection
helm template <release> <chart>       # Render templates locally (no cluster)
helm get manifest <release>           # Get the rendered manifests of a release
helm get values <release>             # Get the user-supplied values of a release
helm get notes <release>              # Get the NOTES.txt output
helm history <release>                # Show release revisions

# Testing
helm test <release>                   # Run test hooks
helm test <release> --logs            # Run tests and show logs

# Dependencies
helm dependency list <chart>          # List chart dependencies
helm dependency build <chart>         # Build dependencies (download .tgz)
helm dependency update <chart>        # Update to latest versions

# Values
helm show values <chart>              # Show chart's default values.yaml
helm install ... -f values.yaml       # Use a custom values file
helm install ... --set key=value      # Override a single value
helm install ... --set-json key='{"nested": "value"}'  # JSON value
```

---

## 4. Common Patterns & Best Practices

### Pattern 1: _helpers.tpl for DRY Labels

Always define your labels once in `_helpers.tpl` and reuse them across templates:

```yaml
{{- define "cutlink.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "cutlink.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "cutlink.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cutlink.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "cutlink.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}
```

### Pattern 2: Conditional Resource Inclusion

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
...
{{- end }}
```

This allows the same chart to create an Ingress in prod but not in dev.

### Pattern 3: toYaml for Complex Values

```yaml
{{- with .Values.backend.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
```

This avoids writing explicit YAML for every potential field. The user passes a dict in `values.yaml` and it's rendered directly.

### Pattern 4: range for Environment Variables

```yaml
env:
{{- range $key, $value := .Values.backend.env }}
  - name: {{ $key }}
    value: {{ $value | quote }}
{{- end }}
```

This lets the user add arbitrary environment variables without modifying templates.

### Pattern 5: Global Values

```yaml
# values.yaml
global:
  imageRegistry: "myregistry.com"
  imagePullSecrets:
    - name: myregistry-key
```

```yaml
# deployment.yaml
image: "{{ .Values.global.imageRegistry }}/{{ .Values.backend.image.repository }}:{{ .Values.backend.image.tag }}"
```

Global values cascade to all subcharts. Set them once, use everywhere.

### Pattern 6: Resource Limits as Variables

```yaml
resources:
  {{- toYaml .Values.backend.resources | nindent 2 }}
```

```yaml
# values.yaml
backend:
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 256Mi
```

### Pattern 7: Release Name Scoping

```yaml
metadata:
  name: {{ .Release.Name }}-backend
```

This allows multiple releases of the same chart in one namespace. Each release gets unique resource names.

### Pitfalls to Avoid

| Pitfall | Why it's bad | Fix |
|---------|-------------|-----|
| Hardcoding names | Can't install the chart twice in one namespace | Use `{{ .Release.Name }}` prefix |
| Not using `nindent` | Template output has wrong indentation, breaks YAML | `{{ include "labels" . | nindent 4 }}` |
| Sensitive values in values.yaml | Passwords committed to Git | Use `--set` at deploy time or External Secrets Operator |
| No resource limits | Pods can consume all node resources | Always set requests and limits in values.yaml |
| Reusing the same labels for selector and metadata | Rolling updates fail (selector labels must be immutable) | Separate `labels` (mutable) from `selectorLabels` (immutable) |
| Forgetting `helm dependency update` | Subchart changes not picked up | Run after any dependency change |
| Using `template` instead of `include` | Can't pipe results through functions | Use `include` always (`template` is deprecated pattern) |

---

## 5. Summary

### What You Learned

| Concept | Key Insight |
|---------|-------------|
| **Helm purpose** | Eliminates YAML repetition. Templating + packaging + versioning for K8s manifests. |
| **Architecture** | v3 is client-only. No Tiller. Uses kubeconfig for auth. Releases stored as Secrets. |
| **Chart structure** | Chart.yaml + values.yaml + templates/ + charts/ + crds/ + _helpers.tpl |
| **Template language** | Go templates + Sprig functions. `.Values`, `.Release`, `.Chart`, `.Files`, `.Capabilities`. |
| **Whitespace control** | `{{-` trims before, `-}}` trims after. Essential for clean YAML output. |
| **Control structures** | `if/else` for conditionals, `with` for scoping, `range` for iteration. |
| **Functions** | `quote`, `default`, `indent`, `nindent`, `toYaml`, `include`, `b64enc`, `upper`, etc. |
| **Values overrides** | values.yaml (lowest) < -f files < --set (highest). Layered for environments. |
| **Dependencies** | Parent charts compose subcharts. File:// and URL repositories. Conditional subcharts. |
| **Hooks** | pre/post install/upgrade/delete. Synchronous, weighted, deletable. |
| **Testing** | `helm test` runs pods with `helm.sh/hook: test` annotation. Exit code signals pass/fail. |

### The Helm Template Pipeline — Visual Summary

```
values.yaml ─────────────┐
                         │
values-dev.yaml ─────────┤  ┌────────────────────┐
                         ├──►  Values Merge       │
values-prod.yaml ────────┤  │  (precedence order) │
                         │  └─────────┬──────────┘
--set image.tag=v2 ──────┘            │
                                      ▼
                              ┌────────────────────┐
                              │  Templates/          │
                              │  *.yaml + _helpers   │
                              │  + NOTES.txt         │
                              └─────────┬──────────┘
                                        │ Go + Sprig
                                        ▼
                              ┌────────────────────┐
                              │  Rendered Manifests  │
                              │  (final YAML)        │
                              └─────────┬──────────┘
                                        │
               ┌────────────────────────┼────────────────────────┐
               │                        │                        │
               ▼                        ▼                        ▼
      ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
      │  helm template   │    │  helm install    │    │  helm package   │
      │  (local preview)  │    │  (to cluster)    │    │  (for sharing)  │
      └─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Next Steps

You've completed Stage 4. Your Cutlink app is now packaged as a Helm chart with:

- Complete chart structure (templates, helpers, values)
- Parameterized Deployments, Services, ConfigMaps, Secrets
- StatefulSet for PostgreSQL with persistent storage
- Conditional Ingress, HPA, and NetworkPolicy
- Multi-environment values (dev, prod)
- Subchart dependency knowledge (parent charts compose full stacks)
- Hook lifecycle management (pre/post install/upgrade)
- Chart testing with `helm test`

**What to do next with this chart:**
- Publish it to a chart repository (ChartMuseum, GitHub Pages, OCI registry)
- Use Helm in CI/CD (render with environment-specific values, then kubectl apply)
- Explore advanced patterns: Helmfile for multi-release orchestration, Helm + ArgoCD for GitOps
- Add the chart to a monorepo with automated version bumping via semantic-release

**Stage 5 (coming soon):** Monitoring and Observability — Prometheus, Grafana, structured logging, and distributed tracing for the Cutlink stack.
