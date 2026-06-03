# Stage 6: Prometheus — Monitoring Your Cluster

**Prerequisites:** Stage 3 (Kubernetes basics — pods, services, Deployments), Stage 4 (Helm). You should understand what a Deployment and Service are and how to use `kubectl` before starting this stage. Our sample app is Cutlink — the URL shortener you've been deploying across previous stages.

---

## Part 1: Why Monitoring?

### You Can't Fix What You Can't See

Imagine you deploy a new version of Cutlink at 2:00 PM. By 2:15 PM, users are reporting that links aren't redirecting. You check the pod logs — nothing unusual. You check the Deployment — all pods are `Running`. You spend 30 minutes digging before someone notices the database connection pool is exhausted.

This is what happens without monitoring. Your cluster reports that everything is "up," but you have no visibility into *behavior*. Monitoring answers three fundamental questions:

1. **What is breaking right now?** — Alerts tell you something needs attention.
2. **What was happening when it broke?** — Historical metrics tell you what changed.
3. **What will break next?** — Trends tell you you're running out of disk, memory, or database connections before it becomes critical.

Without monitoring, you are flying blind. With it, you operate with confidence.

### The Four Golden Signals

Google's SRE book defines four golden signals — the minimum set of metrics every distributed system should track:

**1. Latency** — The time it takes to serve a request.
- Split into *success* latency (how fast do successful requests complete?) and *error* latency (how fast do failures complete?).
- Error latency matters: a failing endpoint that returns instantly tells you something different from one that times out after 30 seconds.
- For Cutlink: how long does it take to create a short link? To redirect? To access the dashboard?

**2. Traffic** — The demand on your system.
- HTTP requests per second (RPS), active connections, concurrent users.
- For Cutlink: `rate(http_requests_total[5m])` tells you how many users are hitting your service right now.

**3. Errors** — The rate of requests that fail.
- Explicit failures: HTTP 5xx, exceptions, panics.
- Implicit failures: successful HTTP 200 but wrong response (a redirect that goes to the wrong URL).
- For Cutlink: the ratio of 5xx to total requests is your error rate.

**4. Saturation** — How "full" your service is.
- The point at which increasing load causes latency to spike or errors to increase.
- CPU, memory, disk I/O, network bandwidth, connection pool usage.
- For Cutlink: database connection pool utilization, Redis memory usage, pod CPU.

### The USE Method (Infrastructure Focused)

Brendan Gregg's USE method targets infrastructure components (nodes, disks, network interfaces):

| Letter | Stands For | Question | Example Metric |
|--------|-----------|----------|----------------|
| **U** | Utilization | How busy is the resource? | CPU utilization %, disk throughput |
| **S** | Saturation | How much extra work is queued? | CPU run queue length, disk I/O wait |
| **E** | Errors | How many errors? | Disk CRC errors, network interface drops |

USE is for your *infrastructure* — the nodes, disks, and network that support your applications.

### The RED Method (Application Focused)

Tom Wilkie's RED method targets *services* and *applications*:

| Letter | Stands For | Example |
|--------|-----------|---------|
| **R** | Rate | Requests per second |
| **E** | Errors | Failed requests per second |
| **D** | Duration | Request latency distribution |

RED is for your *applications* — the services your users actually interact with. It's the golden signals simplified for microservices.

### Why Prometheus?

Prometheus is the dominant open-source monitoring system in the Kubernetes ecosystem because:

- **Kubernetes-native service discovery** — it automatically finds new pods and services as they scale up and down.
- **Pull model** — Prometheus scrapes targets at regular intervals. This is safer than push: if a target goes down, you know immediately (the scrape fails) rather than wondering if the target just hasn't pushed recently.
- **Multi-dimensional data model** — every metric has labels (key-value pairs). You can slice and aggregate any way you want.
- **Powerful query language (PromQL)** — enables complex aggregations, rate calculations, and percentile computations.
- **Part of CNCF** — graduated project with a massive ecosystem of exporters, integrations, and community support.

---

## Part 2: Prometheus Architecture

### Pull Model vs Push Model

Before we dive into the components, understand the fundamental design choice Prometheus makes:

**Pull Model (Prometheus):**
```
Prometheus ──scrape──► /metrics endpoint on target
              every 15s
```
- Prometheus connects to targets and pulls metrics.
- Targets must be reachable from Prometheus.
- Pro: you know immediately if a target is down (scrape fails).
- Pro: centralized control over scrape frequency and behavior.
- Con: targets must be network-accessible.
- Con: cannot scrape ephemeral jobs that complete before the next scrape cycle.

**Push Model (Graphite, Datadog):**
```
Target ──push──► Central aggregator
         every 15s
```
- Targets push metrics to a central collector.
- Pro: targets don't need to be reachable; they can be behind NATs or firewalls.
- Pro: batch jobs can push their metrics before exiting.
- Con: you can't tell if a target is down or just not pushing yet.
- Con: no centralized control — each target decides when and what to push.

For Kubernetes, pull is the right choice: Prometheus uses the Kubernetes API to discover targets, and pods are always reachable within the cluster.

### Core Components

```
                         ┌──────────────────┐
                         │  Alertmanager     │
                         │  (grouping,       │
                         │   inhibition,     │
                         │   routing)        │
                         └────────┬─────────┘
                                  │ alerts
                                  │
┌──────────────┐    scrape    ┌───▼──────────┐   query    ┌──────────────┐
│   Targets    │◄─────────────│  Prometheus   │◄───────────│   Grafana    │
│  (exporters, │              │  Server       │            │ (dashboards) │
│   apps,      │              │  (TSDB,       │            │              │
│   K8s APIs)  │              │   PromQL)     │            └──────────────┘
└──────────────┘              └───────────────┘
```

#### Prometheus Server

The Prometheus server is the brain. It contains:

- **Retrieval layer** — manages scrape targets, performs HTTP scrapes, ingests metrics.
- **Time-Series Database (TSDB)** — stores all metrics with efficient compression.
- **PromQL engine** — evaluates queries, handles aggregation, range functions.
- **Rule evaluation** — evaluates recording rules and alerting rules on a schedule.

#### Alertmanager

Alertmanager is a separate binary (or pod) that handles alerts fired by Prometheus:
- **Grouping** — combines similar alerts into a single notification (e.g., "3 instances of cutlink-backend down" instead of 3 separate alerts).
- **Inhibition** — suppresses low-priority alerts when a high-priority one is firing (e.g., if a node is down, don't alert on individual pods on that node).
- **Silences** — temporarily mute alerts during maintenance windows.
- **Routing** — send different alerts to different receivers (PagerDuty for critical, Slack for warnings).

#### Exporters

Applications don't natively expose Prometheus metrics (unless instrumented). Exporters bridge the gap:
- **node-exporter** — exposes operating system metrics (CPU, memory, disk, network) for each node.
- **kube-state-metrics** — exposes Kubernetes object metrics (deployment replicas, pod status, node conditions).
- **cAdvisor** (built into kubelet) — exposes container-level metrics (CPU, memory, filesystem per container).
- **custom exporters** — you can write exporters for databases, message queues, or any application.

### Time-Series Database Concepts

Prometheus stores everything as time series. A time series is identified by:

- **Metric name** — e.g., `http_requests_total`
- **Labels** — key-value pairs that add dimensions: `{method="GET", endpoint="/api/links", status="200"}`

The combination `http_requests_total{method="GET", endpoint="/api/links", status="200"}` is one unique time series. If any label changes, it's a different time series.

**Efficient storage:**
- Prometheus compresses samples using Gorilla compression (delta-of-delta timestamps, XOR values).
- Typical storage: ~1.3 bytes per sample (compared to ~16 bytes in a naive implementation).
- Data is stored in 2-hour blocks, which are compacted over time.
- Retention is configurable (default: 15 days).

**Downsampling is NOT automatic** — Prometheus stores raw samples at full resolution. If you need long-term retention, you run a separate system like Thanos or Mimir that downsamples and stores data in object storage.

### PromQL Fundamentals

PromQL is the query language. It's powerful but has unique concepts that take practice to learn.

#### Data Types

Every PromQL expression evaluates to one of three types:

| Type | Description | Example |
|------|-------------|---------|
| **Instant Vector** | A set of time series, each with a single sample at the query timestamp | `node_cpu_seconds_total` |
| **Range Vector** | A set of time series, each with multiple samples over a time range | `node_cpu_seconds_total[5m]` |
| **Scalar** | A single number | `42` |

#### Selectors

**Instant vector selector** — returns the latest value for each matching time series:
```
http_requests_total
http_requests_total{status="200"}
http_requests_total{method=~"GET|POST", status!="500"}
```

**Range vector selector** — returns multiple samples over a time window:
```
http_requests_total[5m]        # last 5 minutes of data
http_requests_total[1h]         # last 1 hour of data
http_requests_total[5m:1m]      # last 5 minutes, sampled every 1 minute
```

#### Key Functions

| Function | What It Does | When To Use |
|----------|-------------|-------------|
| `rate()` | Per-second average rate of increase over a range | Counters (always increasing). `rate(http_requests_total[5m])` |
| `irate()` | Instant rate based on last two samples | Spiky metrics, short-term bursts. Noisier than `rate()`. |
| `increase()` | Total increase over a range | "How many requests in the last hour": `increase(http_requests_total[1h])` |
| `histogram_quantile()` | Calculate percentile from a histogram | p95, p99 latency: `histogram_quantile(0.95, rate(duration_bucket[5m]))` |
| `avg_over_time()` | Average of all values in a range | Gauges: `avg_over_time(node_memory_usage[5m])` |
| `max_over_time()` | Maximum value in a range | Peak usage: `max_over_time(node_cpu_usage[5m])` |

#### Common Query Patterns

**Error ratio:**
```
# Fraction of requests that are 5xx
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
```

**Per-second request rate by endpoint:**
```
sum by(endpoint) (rate(http_requests_total[5m]))
```

**p95 latency:**
```
histogram_quantile(0.95, sum by(le) (rate(http_request_duration_seconds_bucket[5m])))
```

**Memory usage per pod:**
```
sum by(pod) (container_memory_usage_bytes{namespace="cutlink"})
```

**CPU usage rate per container:**
```
rate(container_cpu_usage_seconds_total{namespace="cutlink"}[5m])
```

---

## Part 3: kube-prometheus-stack

### The Meta-Chart

`kube-prometheus-stack` is a Helm chart that installs an entire monitoring stack in one command. It's the standard way to deploy Prometheus on Kubernetes. The chart includes:

| Component | What It Does | Default Replicas |
|-----------|-------------|------------------|
| **Prometheus** | The TSDB and query engine | 1 (can be 2 for HA) |
| **Alertmanager** | Alert routing and notification | 1 (can be 3 for HA) |
| **Grafana** | Dashboard visualization | 1 |
| **node-exporter** | Host metrics per node | DaemonSet (1 per node) |
| **kube-state-metrics** | K8s object state metrics | 1 |
| **Prometheus Operator** | Manages Prometheus/Alertmanager instances via CRDs | 1 |

### Custom Resource Definitions (CRDs)

The chart installs several CRDs that extend the Kubernetes API. These are how you configure Prometheus in a Kubernetes-native way:

| CRD | Purpose |
|-----|---------|
| `ServiceMonitor` | Tells Prometheus which Services to scrape, on which port, at what interval |
| `PodMonitor` | Same as ServiceMonitor but targets individual Pods directly |
| `PrometheusRule` | Defines alerting and recording rules |
| `Prometheus` | Configures the Prometheus server instance itself (retention, resources, storage) |
| `Alertmanager` | Configures the Alertmanager instance (receivers, routing, inhibition) |

### How Prometheus Operator Uses CRDs

The Prometheus Operator watches these CRDs and dynamically updates Prometheus configuration. Here's the flow:

1. You create a `ServiceMonitor` YAML and `kubectl apply` it.
2. The Prometheus Operator detects the new CRD.
3. The Operator updates the Prometheus configuration to include the new scrape target.
4. Prometheus reloads its configuration (without restarting) and starts scraping.

This means you never edit Prometheus configuration files directly. You define monitoring through Kubernetes manifests, just like everything else.

---

## Part 4: ServiceMonitors & PodMonitors

### ServiceMonitor

A ServiceMonitor tells Prometheus: "scrape this Service's endpoints." It uses label selectors to find Services, then scrape their `/metrics` port.

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: cutlink-backend
spec:
  selector:
    matchLabels:
      app: cutlink-backend          # Which Services to scrape
  endpoints:
  - port: metrics                  # Name of the port in the Service
    interval: 15s                  # Scrape every 15 seconds
    path: /metrics                 # The metrics endpoint path
```

The selector looks for Services with matching labels in the same namespace (or across namespaces, if configured).

### PodMonitor

A PodMonitor works the same way but targets individual Pods instead of Services. Use this when your application doesn't have a Service that exposes the metrics port, or when you want to scrape directly for maximum granularity.

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: cutlink-backend
spec:
  selector:
    matchLabels:
      app: cutlink-backend          # Which Pods to scrape
  podMetricsEndpoints:
  - port: metrics                  # Name of the port in the Pod spec
    interval: 15s
    path: /metrics
```

### When to Use Which

| Use Case | Monitor Type |
|----------|-------------|
| You have a Service exposing `/metrics` | ServiceMonitor |
| Your pod exposes metrics but has no Service | PodMonitor |
| You want node-level metrics (node-exporter) | PodMonitor (targets DaemonSet pods) |
| You want to scrape a managed service (e.g., database via a proxy) | ServiceMonitor |

---

## Part 5: Recording Rules

### Why Recording Rules Matter

PromQL queries can be expensive. Consider this query:

```
histogram_quantile(0.95, sum by(le, namespace) (rate(http_request_duration_seconds_bucket[5m])))
```

Every time you run this in a dashboard, Prometheus:
1. Reads the histogram bucket data (potentially millions of samples)
2. Computes the rate over 5 minutes for each bucket
3. Aggregates by namespace
4. Calculates the p95 quantile

On a busy cluster, this can take seconds. Now imagine 10 dashboard panels each running different variants of this query.

**Recording rules pre-compute these queries on a schedule** — typically every 30-60 seconds. The results are stored as new time series, which dashboards can read instantly.

### Recording Rule Example

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: cutlink-recording-rules
spec:
  groups:
  - name: cutlink.rules
    interval: 30s            # Evaluate every 30 seconds
    rules:
    - record: namespace:http_requests:rate5m
      expr: sum by(namespace) (rate(http_requests_total[5m]))

    - record: namespace:http_errors:rate5m
      expr: sum by(namespace) (rate(http_requests_total{status=~"5.."}[5m]))
```

Now any dashboard can use `namespace:http_requests:rate5m` instead of recomputing the rate each time. The naming convention (`namespace:metric:operation`) is a best practice that makes rules self-documenting.

### When to Create Recording Rules

- **Expensive aggregations** — `histogram_quantile` with `sum by()` over many series.
- **Common subqueries** — dashboard panels that share the same base computation.
- **Joins** — queries that join multiple metrics (e.g., memory usage / memory limit).
- **Predictive queries** — `predict_linear()` or derivative-based predictions.

**Rule of thumb:** If a query takes longer than 1 second to execute or is used in more than 3 dashboard panels, create a recording rule.

---

## Part 6: Alerting

### The Alerting Pipeline

```
Metric ──► PrometheusRule ──► Alert fires ──► Alertmanager ──► Receiver
                                                     │
                                              (grouping, routing,
                                               inhibition, silences)
```

1. **Prometheus evaluates rules** — every N seconds (default: 15s), Prometheus checks all alerting rules.
2. **Alert transitions through states:**
   - **Pending** — the condition is true but the `for` duration hasn't elapsed yet. This prevents flapping.
   - **Firing** — the condition has been true for the full `for` duration. The alert is sent to Alertmanager.
   - **Resolved** — the condition is no longer true. Alertmanager is notified that the alert resolved.
3. **Alertmanager processes the alert** — applies grouping, inhibition, routing, and sends notifications.

### Alertmanager Configuration

Alertmanager configuration is defined in a Kubernetes Secret and referenced by the Alertmanager CRD:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: alertmanager-config
stringData:
  alertmanager.yaml: |
    global:
      resolve_timeout: 5m
      slack_api_url: 'https://hooks.slack.com/services/T...'

    route:
      receiver: 'team-alerts'
      group_by: ['alertname', 'severity']    # Group by these labels
      group_wait: 30s                         # Wait before sending first notification
      group_interval: 5m                      # Wait before sending additional notifications
      repeat_interval: 4h                     # Re-send if still firing

    receivers:
    - name: 'team-alerts'
      slack_configs:
      - channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ .CommonAnnotations.description }}'
```

### Grouping

Grouping prevents alert fatigue. Without grouping, if 10 pods go down simultaneously, you get 10 separate notifications. With grouping, you get one notification: "10 instances of cutlink-backend are down."

- `group_by: ['alertname', 'severity']` — alerts with the same name and severity are grouped together.
- `group_wait: 30s` — wait 30 seconds before sending a group, allowing more alerts to arrive.
- `group_interval: 5m` — after sending a group notification, wait 5 minutes before sending another for that group.

### Inhibition

Inhibition suppresses low-severity alerts when a high-severity one is firing. For example:

- If `NodeDown` fires, suppress all alerts from pods running on that node.
- If `ClusterDegraded` fires, suppress low-severity component alerts.

```yaml
inhibit_rules:
- source_matchers:           # Higher severity alert
    - severity = critical
  target_matchers:           # Lower severity alerts to suppress
    - severity =~ warning|info
  equal: ['namespace']       # Only inhibit if namespace matches
```

### Route Trees

Routes form a tree structure. Alerts traverse the tree from root to leaf, matching against `matchers` at each node:

```yaml
route:
  receiver: 'default'           # Catch-all
  routes:
  - matchers:
      - severity = critical
    receiver: 'pagerduty-critical'
    continue: true
  - matchers:
      - service = cutlink
    receiver: 'slack-cutlink'
```

An alert with `severity=critical, service=cutlink` would match both routes and be sent to both receivers.

### PrometheusRule CRD

PrometheusRule is the Kubernetes-native way to define alerting rules:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: cutlink-alerts
spec:
  groups:
  - name: cutlink.alerts
    interval: 30s
    rules:
    - alert: CutlinkHighErrorRate
      expr: |
        (rate(flask_http_request_total{status=~"5.."}[5m])
         /
        rate(flask_http_request_total[5m])) > 0.05
      for: 5m
      labels:
        severity: warning
        team: backend
        service: cutlink
      annotations:
        summary: "Cutlink backend error rate is high"
        description: "Error rate is {{ $value | humanizePercentage }} — above 5% threshold"
        runbook_url: "https://wiki.team.com/runbooks/cutlink-high-errors"
```

Key fields:

| Field | Purpose |
|-------|---------|
| `alert` | Alert name — must be unique within the rule group |
| `expr` | PromQL expression — alert fires when this evaluates to a non-zero value |
| `for` | Duration the condition must be true before alert fires (prevents flapping) |
| `labels` | Metadata attached to the alert (used for routing in Alertmanager) |
| `annotations` | Human-readable information (summary, description, runbook link) |

### Designing Good Alerts

**Bad alert:**
```
CPU > 80%
```
- Produces alarms that page someone at 3 AM for no actionable reason.
- CPU spikes are normal in many workloads.

**Better alert:**
```
CPU > 80% for > 15 minutes AND request latency > 500ms
```
- Combines two signals. High CPU alone isn't a problem if latency is fine.

**Best alert:**
```
(rate(http_errors[5m]) / rate(http_requests[5m])) > 0.05 for 5m
```
- Measures user-impacting behavior directly. Users are seeing errors. This is always actionable.

**Rule:** Alert on *symptoms* (errors, latency) not *causes* (CPU, memory). A pod using 90% CPU is not a problem unless users are affected.

---

## Part 7: Exporters

### node-exporter

node-exporter runs on every node (as a DaemonSet) and exposes host-level metrics:

- `node_cpu_seconds_total` — CPU time in seconds, broken down by mode (user, system, idle, iowait, etc.)
- `node_memory_MemTotal_bytes` / `node_memory_MemFree_bytes` — total/free memory
- `node_disk_io_time_seconds_total` — disk I/O time
- `node_network_receive_bytes_total` — network bytes received
- `node_filesystem_avail_bytes` — available disk space
- `node_load1` / `node_load5` / `node_load15` — system load averages

**Useful queries:**
```
# CPU utilization per node
1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))

# Memory utilization per node
1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes

# Disk space remaining
node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}
```

### kube-state-metrics

kube-state-metrics watches the Kubernetes API and generates metrics from Kubernetes objects:

- `kube_deployment_status_replicas` — how many replicas each Deployment has
- `kube_pod_status_phase` — pod phases (Running, Pending, Failed, etc.)
- `kube_node_status_condition` — node conditions (Ready, DiskPressure, MemoryPressure)
- `kube_namespace_status_phase` — namespace statuses

**Useful queries:**
```
# Deployments with unavailable replicas
kube_deployment_status_replicas_unavailable > 0

# Pods in CrashLoopBackOff state
kube_pod_status_phase{phase="Failed"} > 0

# Nodes that are not ready
kube_node_status_condition{condition="Ready", status="true"} != 1
```

### cAdvisor (built into kubelet)

cAdvisor is built into the kubelet and exposes container-level metrics. The `kube-prometheus-stack` automatically scrapes these via a ServiceMonitor targeting the kubelet:

- `container_cpu_usage_seconds_total` — CPU usage per container
- `container_memory_usage_bytes` — memory usage per container
- `container_network_receive_bytes_total` — network receive per container

**Useful queries:**
```
# Memory usage per pod (sorted)
topk(10, sum by(pod) (container_memory_usage_bytes{namespace="cutlink"}))

# CPU usage per pod
sum by(pod) (rate(container_cpu_usage_seconds_total{namespace="cutlink"}[5m]))
```

### Custom Application Metrics

The most valuable metrics come from your application itself. For Cutlink, we expose Flask HTTP metrics using `prometheus_flask_exporter`. This automatically instruments Flask endpoints and exposes metrics at `/metrics`:

- `flask_http_request_total` — total requests, labeled by method, status, endpoint
- `flask_http_request_duration_seconds` — request duration histogram (bucket, sum, count)
- `flask_http_request_exceptions_total` — unhandled exceptions

**Useful queries:**
```
# Average request duration
rate(flask_http_request_duration_seconds_sum[5m])
/
rate(flask_http_request_duration_seconds_count[5m])

# Error rate per endpoint
rate(flask_http_request_total{status=~"5.."}[5m])
/
rate(flask_http_request_total[5m])
```

---

## Exercises Overview

The following exercises build on each other:

1. **Install kube-prometheus-stack** — Deploy the full monitoring stack using Helm and verify all components.
2. **Explore PromQL** — Run queries against real cluster metrics and understand the output.
3. **Add Custom Metrics & Alerts** — Create a ServiceMonitor for Cutlink, write PrometheusRules, and verify alerts.

---

## PromQL Cheat Sheet

### Rate & Increase (Counters)

| What You Want | PromQL |
|--------------|--------|
| Requests per second (last 5m) | `rate(http_requests_total[5m])` |
| Requests per second by endpoint | `sum by(endpoint) (rate(http_requests_total[5m]))` |
| Total requests in last hour | `increase(http_requests_total[1h])` |
| Instant request rate | `irate(http_requests_total[30s])` |

### Aggregation (Gauges)

| What You Want | PromQL |
|--------------|--------|
| Average CPU across all cores | `avg(rate(node_cpu_seconds_total{mode!="idle"}[5m]))` |
| Max memory usage by pod | `max by(pod) (container_memory_usage_bytes)` |
| Top 5 memory consumers | `topk(5, sum by(pod) (container_memory_usage_bytes))` |
| Sum of all memory usage in namespace | `sum(container_memory_usage_bytes{namespace="cutlink"})` |

### Percentiles (Histograms)

| What You Want | PromQL |
|--------------|--------|
| p50 request duration | `histogram_quantile(0.50, rate(http_duration_bucket[5m]))` |
| p95 request duration | `histogram_quantile(0.95, rate(http_duration_bucket[5m]))` |
| p99 request duration | `histogram_quantile(0.99, rate(http_duration_bucket[5m]))` |
| Average request duration | `rate(http_duration_sum[5m]) / rate(http_duration_count[5m])` |

### Availability & Health

| What You Want | PromQL |
|--------------|--------|
| Which targets are up | `up` |
| Unhealthy Deployments | `kube_deployment_status_replicas_unavailable > 0` |
| Nodes not ready | `kube_node_status_condition{condition="Ready",status="true"} != 1` |
| CrashLoopBackOff pods | `kube_pod_status_phase{phase="Failed"} > 0` |

### Error Ratios

| What You Want | PromQL |
|--------------|--------|
| 5xx error ratio | `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])` |
| Error ratio by endpoint | `sum by(endpoint) (rate(http_requests_total{status=~"5.."}[5m])) / sum by(endpoint) (rate(http_requests_total[5m]))` |
| Error ratio > 5% | `(rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])) > 0.05` |

### Resource Saturation

| What You Want | PromQL |
|--------------|--------|
| Node CPU utilization % | `100 * (1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))` |
| Node memory utilization % | `100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)` |
| Node disk utilization % | `100 * (1 - node_filesystem_avail_bytes / node_filesystem_size_bytes)` |
| Container CPU throttling | `rate(container_cpu_cfs_throttled_seconds_total[5m])` |

### Recording Rule Naming Convention

```
level:metric:operation
```

- `level` — the aggregation level (namespace, pod, node, cluster)
- `metric` — the base metric name
- `operation` — the transformation applied

Examples: `namespace:http_requests:rate5m`, `node:cpu_utilization:avg5m`, `cluster:memory_usage:sum`.

---

## Common Commands Reference

| Command | Description |
|---------|-------------|
| `helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace` | Install monitoring stack |
| `kubectl port-forward svc/prometheus-operated 9090:9090 -n monitoring` | Access Prometheus UI |
| `kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring` | Access Grafana |
| `kubectl get servicemonitors -A` | List all ServiceMonitors |
| `kubectl get prometheusrules -A` | List all PrometheusRules |
| `kubectl get prometheus -n monitoring` | Show Prometheus instance status |
| `kubectl get alertmanager -n monitoring` | Show Alertmanager instance status |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `config/servicemonitor.yaml` | ServiceMonitor for scraping Cutlink backend metrics |
| `config/prometheusrule.yaml` | Alerting rules for Cutlink (error rate, latency, downtime) |
| `config/podmonitor.yaml` | Example PodMonitor for node-exporter |
| `exercises/01-install-prometheus.md` | Step-by-step install guide for kube-prometheus-stack |
| `exercises/02-promql-queries.md` | PromQL query walkthrough with expected outputs |
| `exercises/03-custom-metrics.md` | Guide to adding application metrics and alerts for Cutlink |

---

## Review Questions

1. What are the four golden signals? Give a concrete example of each for a web application.
2. What is the difference between the USE method and the RED method? When would you use each?
3. How does Prometheus's pull model differ from a push-based system like Graphite? What are the tradeoffs?
4. What is a time series in Prometheus? How does labeling create multi-dimensional data?
5. What is the difference between an instant vector and a range vector in PromQL?
6. Why is `rate()` preferred over `irate()` for most alerting use cases?
7. What components does `kube-prometheus-stack` install? Name at least five.
8. How does a ServiceMonitor work? What happens when you create one?
9. What is the purpose of recording rules? Give an example of an expensive query that should be recorded.
10. Why should you alert on symptoms (errors) rather than causes (CPU)?

---

**Next: Stage 7 — Grafana: Visualization and Dashboards.**
