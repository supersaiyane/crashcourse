# Stage 7: Grafana — Visualizing Everything

**Prerequisites:** Stage 6 (Prometheus deployed, PromQL basics). You should be comfortable writing `rate()`, `histogram_quantile()`, and basic PromQL aggregations. You should have `kube-prometheus-stack` installed in the `monitoring` namespace with the Cutlink ServiceMonitor and PrometheusRules from Stage 6.

---

## Part 1: Why Grafana?

### The Problem with Raw Metrics

Prometheus gives you a powerful query language and a basic table/graph UI, but it's not designed for daily operational use. The Prometheus expression browser is great for debugging a query — it's terrible for:

- **Monitoring at a glance**: You shouldn't need to type a query to see if your service is healthy.
- **Correlating signals**: Is the latency spike caused by higher traffic, or is it a code regression? You need metrics, logs, and traces side by side.
- **Sharing context**: A Prometheus console is personal. A Grafana dashboard is team-wide, annotated with deploy events and runbook links.
- **Alerting with context**: Prometheus Alertmanager fires alerts, but Grafana can show you the graph that triggered the alert alongside the notification.

Grafana solves all of these. It is the visualization layer that turns Prometheus's raw time series into actionable operational intelligence.

### Unified Observability

Grafana's superpower is **data source abstraction**. You connect it to any data source, and it provides a consistent visualization experience:

| Data Source | What It Gives You | Typical Use |
|-------------|------------------|-------------|
| **Prometheus** | Metrics (time series) | CPU, memory, request rates, latency |
| **Loki** | Logs | Application log lines, error stacks |
| **Tempo** | Traces | Distributed request tracing |
| **CloudWatch** | AWS metrics | RDS, ALB, Lambda metrics |
| **Elasticsearch** | Logs + metrics | Existing ELK stack integration |
| **Graphite** | Metrics | Legacy monitoring data |
| **InfluxDB** | Metrics + events | Time series with event annotations |

This means a single Grafana instance can show you:
- A metric spike in Prometheus
- The log lines from that moment in Loki
- The trace of a slow request in Tempo
- The database CPU that caused the slowdown from CloudWatch

All in one dashboard. All correlated by the same time range.

### Dashboard-as-Code

Grafana dashboards are JSON documents. This is a crucial property for Platform Engineering:

```json
{
  "title": "Cutlink Service Health",
  "panels": [...],
  "templating": {...},
  "annotations": {...}
}
```

Because dashboards are JSON:
- **They go in git**: Every dashboard change is reviewed, versioned, and auditable.
- **They deploy via GitOps**: A ConfigMap update rolls out dashboard changes automatically.
- **They are diffable**: `git diff` shows exactly what changed in a dashboard.
- **They can be generated**: Scripts can create dashboards programmatically from service definitions.

This is the same philosophy as Infrastructure as Code: treat your dashboards as code, not click-ops artifacts.

### Grafana vs Other Visualization Tools

| Tool | Best For | Limitations |
|------|----------|-------------|
| **Grafana** | Unified observability, dashboards, alerting | Steeper learning curve for complex queries |
| **Prometheus UI** | Ad-hoc query debugging | No dashboard persistence, no alert management |
| **Datadog** | SaaS-first observability | Vendor lock-in, expensive at scale |
| **Kibana** | Log analytics with Elasticsearch | Metrics visualization is secondary |
| **Chronograf** | Simple InfluxDB dashboards | Limited ecosystem, smaller community |

---

## Part 2: Grafana Architecture

### The Component Stack

Grafana is not a single binary. A production Grafana deployment involves several layers:

```
┌─────────────────────────────────────────────────────┐
│                  Web UI (Browser)                     │
│  Dashboards │ Explore │ Alerting │ Configuration      │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (3000)
┌──────────────────────┴──────────────────────────────┐
│              Grafana Server (grafana-server)          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Dashboard │ │  Query   │ │  Alert   │ │  Auth   │ │
│  │   Engine  │ │  Engine  │ │  Engine  │ │  (OAuth)│ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │            Data Source Proxy Layer                │ │
│  │  (Prometheus, Loki, CloudWatch, etc.)             │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│               Data Stores                             │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ Grafana  │  │   SQLite │  │  External Data     │ │
│  │  SQLite  │  │  (Sessions│  │  Sources (Prom,    │ │
│  │ (Dash-   │  │  Alerts, │  │  Loki, etc.)       │ │
│  │ boards)  │  │  Users)  │  │                    │ │
│  └──────────┘  └──────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Key Components:**

1. **Grafana Server** — The main process. Handles HTTP, serves the UI, runs queries, evaluates alerts.
2. **Dashboard Engine** — Renders panels from JSON model. Manages layout, refresh, time ranges, variables.
3. **Query Engine** — Converts panel queries into data source–specific requests. Handles caching and query cancellation.
4. **Alert Engine** — Evaluates alert rules on a schedule (not real-time like Prometheus). Manages alert state, silence, and notification routing.
5. **Data Source Proxy** — Proxies requests from the browser to data sources. Avoids CORS issues and can inject auth credentials.

### Grafana Data Model

Grafana organizes content hierarchically:

```
Organization
  └── Folders
       └── Dashboards
            ├── Rows (collapsible sections, optional)
            └── Panels
                 ├── Queries (one or more data source queries)
                 ├── Transformations (post-query processing)
                 ├── Thresholds (colored bands / lines)
                 ├── Field overrides (per-series formatting)
                 └── Links (drill-down to other dashboards)
```

**Panels** are the atomic visualization unit. Each panel has:
- A **visualization type** (time series, stat, table, gauge, etc.)
- One or more **queries** targeting specific data sources
- **Transformations** that reshape data between query and display
- **Thresholds** that color the panel based on values
- **Field overrides** for per-metric formatting exceptions

**Rows** group panels into collapsible sections. Not all dashboards use rows — modern Grafana best practice favors a flat layout with well-named panels over nested rows.

**Dashboards** have:
- A **time range** picker (relative: "Last 6 hours" or absolute date range)
- **Variables** for templating
- **Annotations** that overlay events on time series
- **Links** to related dashboards
- **Refresh interval** (auto-refresh every 30s, 1m, 5m, etc.)

### Data Sources

A data source is a configured connection to a metrics/logs/traces backend. Grafana ships with built-in support for dozens of data sources and a plugin SDK for custom ones.

When you configure a Prometheus data source, you specify:
- **URL**: `http://prometheus-operated.monitoring:9090` (in-cluster) or forwarded local address
- **Access**: Server (proxy via Grafana) or Browser (direct from browser — CORS must be configured)
- **Scrape interval**: Must match Prometheus's scrape interval for correct `$__rate_interval` calculations
- **Custom HTTP headers**: For authentication (basic auth, bearer token)

### Explore Mode

Explore is Grafana's ad-hoc query interface. Unlike dashboards, Explore is:
- **Ephemeral**: No save, no sharing. You use it to debug a query before putting it in a dashboard.
- **Split-pane**: You can compare two queries side by side, or compare the same query against two different time ranges.
- **Multi-data-source**: Each pane can use a different data source (e.g., Prometheus on the left, Loki on the right).

Explore is where you answer questions like:
- "What does this metric actually look like over the last hour?"
- "Is this PromQL query returning the data I expect?"
- "What was the error rate around the time of the last deploy?"

Every Grafana user's workflow should be: **Explore first, then Dashboard**.

---

## Part 3: Dashboard Design Principles

This section is the most important part of this stage. A dashboard that visualizes everything is a dashboard that communicates nothing. Good dashboard design is a skill — and it follows principles.

### The Visual Hierarchy

A well-designed dashboard reads like a newspaper:

```
┌─────────────────────────────────────────────────────┐
│  Top: Overview (SLOs, health, high-level metrics)    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Uptime   │ │ Error %  │ │  RPS     │ │ P95    │ │
│  │ 99.9%    │ │ 0.5%     │ │ 1,200    │ │ 120ms  │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│                                                       │
│  Middle: Trends (time series for deeper analysis)     │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Request Rate (last 6h)                          │ │
│  │   ╱╲    ╱╲    ╱╲                                │ │
│  │  ╱  ╲  ╱  ╲  ╱  ╲                               │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Latency (p50, p95, p99)                          │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  Bottom: Details (tables, granular breakdown)         │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Top URLs by Clicks                               │ │
│  │ ┌────────┬──────────┬───────────┬──────────────┐│ │
│  │ │  Code  │   URL    │  Clicks  │  Last Click   ││ │
│  │ └────────┴──────────┴───────────┴──────────────┘│ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Key Principle: Overview first, drill-down below.** The top row should answer "is the service healthy?" in under 5 seconds. Everything below adds detail for debugging.

### Consistent Time Ranges

Every panel on a dashboard should use the same time range. When you set the dashboard time picker to "Last 6 hours," every panel should reflect that same window. Exceptions:

- **Comparative panels**: "This week vs last week" legitimately uses a different time range.
- **Long-term trend panels**: A "7-day CPU trend" panel in an otherwise 6-hour dashboard is fine, but label it clearly.

In Grafana, the dashboard time range is inherited by all panels by default. Only override it with a specific reason.

### Color Semantics

Color coding should be intuitive and consistent across all dashboards:

| Color | Meaning | Example |
|-------|---------|---------|
| **Green** | Healthy, good, nominal | Error rate < 1%, latency < 200ms |
| **Yellow** | Warning, degraded | Error rate 1–5%, disk > 80% |
| **Red** | Critical, failing | Error rate > 5%, service down |
| **Blue** | Informational, neutral | Total requests, active users |
| **Orange** | Needs attention soon | Error rate trending up, nearing threshold |

**Never use red for "good" values or green for "bad" values.** This seems obvious, but it's easy to accidentally reverse a threshold.

### Choosing the Right Visualization

Grafana offers many panel types. Using the wrong one confuses your viewers:

| Panel Type | Best For | Avoid When |
|-----------|----------|------------|
| **Time series** | Trends over time (latency, rates, CPU) | You need a single current value |
| **Stat** | Single current value with sparkline | You need to show history clearly |
| **Gauge** | Value relative to a range (0–100%) | The range is unbounded or unclear |
| **Bar gauge** | Comparing multiple values horizontally | Showing change over time |
| **Table** | Raw data, sorted columns, granular details | Visualization — use a graph instead |
| **Heatmap** | Distribution over time (latency buckets) | You don't have histogram data |
| **Logs** | Real-time log streaming and searching | Metrics — use time series for metrics |

**Special note on pie charts:** Avoid them. Humans are terrible at comparing the relative sizes of pie slices. A bar chart or stacked time series is almost always better. The only exception is showing parts-of-a-whole for a single point in time where the exact proportions matter (and even then, a table with percentages is often clearer).

### Panel-Specific Guidance

**Time Series (the workhorse):**
- Use `step` to match the data resolution (don't plot 15s data points for a 30d range — it's millions of points)
- Enable tooltips with all series values
- Use `alias` or `legend` templates to make series readable
- Stack series only when the total matters (e.g., stacked request rates by status code)
- Use null values as "gaps" to show missing data explicitly

**Stat panels for SLOs/SLIs:**
- Always show the threshold line (color the background or value)
- Show the current value prominently, the sparkline for trend context
- Format as percentage, duration, or count — not raw bytes or seconds
- Use "instant" queries for the current value, not range queries

**Tables for granular data:**
- Sort by the most important column (usually a count or percentage)
- Highlight rows that exceed thresholds (red for errors, yellow for warnings)
- Limit to 10–25 rows; paginate beyond that
- Use `calculated` columns for aggregated values

### Naming Conventions

Consistent naming makes dashboards usable:

- **Dashboard title**: `[Service Name] — [What It Shows]` (e.g., `Cutlink — Service Health`)
- **Panel titles**: Start with a verb or metric name (e.g., "Request Rate," "Error Ratio," "P95 Latency")
- **Variables**: Prefix with `$` and use lowercase (e.g., `$namespace`, `$pod`, `$app`)
- **Annotations**: Start with a noun describing the event source (e.g., "Deploy Events," "Prometheus Alerts")

---

## Part 4: Templating & Variables

### Why Templates?

Hard-coding `namespace="cutlink"` in every panel query means your dashboard only works for Cutlink. With templating, the same dashboard works for any namespace, any pod, any application.

Templates make dashboards **reusable** — a single "Service Health" dashboard can monitor every microservice in your cluster by changing a dropdown.

### Variable Types

Grafana supports several variable types:

| Type | Description | Example |
|------|-------------|---------|
| **Query** | Populated by a query to a data source | `label_values(namespace)` from Prometheus |
| **Custom** | Static list of values | `dev, staging, production` |
| **Constant** | Single hidden value | `cutlink` (used in queries) |
| **Interval** | Time interval options | `1m, 5m, 15m, 30m, 1h` |
| **Data source** | Switch between Prometheus instances | `prometheus-prod`, `prometheus-dev` |
| **Ad hoc** | Build key=value filter expressions | `namespace=cutlink, pod=web-1` |
| **Text box** | Free-form text input | Custom pod name pattern |

### Query Variables with Prometheus

The most powerful pattern is populating variables from Prometheus label values:

**Variable: `$namespace`**
```
Type: Query
Query: label_values(namespace)
```

This returns all namespace labels across all metrics. When the user selects a namespace, all other variables and panels filter to that namespace.

**Variable: `$pod`**
```
Type: Query
Query: label_values(up{namespace="$namespace"}, instance)
```

This returns only the pods in the currently selected namespace. This is called a **chained variable** — `$pod` depends on `$namespace`.

**Variable: `$app`**
```
Type: Query
Query: label_values(flask_http_request_total{namespace="$namespace"}, app)
```

Returns the app label values from request metrics, filtered by namespace.

### Multi-value and All Options

Variables support selecting multiple values or "All":

```
label_values(namespace)
Include All option: true
Custom all value: .*
```

When "All" is selected, your PromQL query changes:
```promql
# Without All: specific namespace
sum(rate(flask_http_request_total{namespace="$namespace"}[5m]))

# With All: regex matches everything
sum(rate(flask_http_request_total{namespace=~"$namespace"}[5m]))
```

Note: when using "All" with Prometheus, change `=` to `=~` (regex match) and use `.*` as the custom all value.

### Using Variables in Queries

Once defined, variables are referenced in panel queries:

```promql
sum(rate(flask_http_request_total{namespace="$namespace"}[5m]))
```

When the user selects `cutlink` in the namespace dropdown, this becomes:
```promql
sum(rate(flask_http_request_total{namespace="cutlink"}[5m]))
```

### Best Practices for Templating

1. **Always define `$namespace`** — it's the universal filter across all Kubernetes dashboards.
2. **Use chained variables** — `$pod` should depend on `$namespace`, not show all pods in the cluster.
3. **Label your variables** — `$namespace` should show as "Namespace" in the dropdown, not "namespace".
4. **Hide intermediate variables** — if `$app` is derived from `$namespace`, mark `$namespace` as visible and `$app` as hidden.
5. **Set a default value** — always set a sensible default so the dashboard loads immediately.
6. **Use "All" sparingly** — it breaks certain PromQL functions (like `histogram_quantile`).

---

## Part 5: Annotations

### What Are Annotations?

Annotations overlay events on time series graphs. They answer the question: "Did something happen right before this metric changed?"

Common annotation sources:
- **Deploy events**: A new version was deployed at 14:32. At 14:35, latency spiked.
- **Alert firings**: The "High Error Rate" alert fired here. This graph shows why.
- **Config changes**: A database connection pool was resized at this time.
- **Scaling events**: HPA added 3 more pods at this time.

### Configuring Annotations

In Grafana, annotations are configured at the dashboard level:

```
Dashboard Settings → Annotations → New Annotation
```

**From a Prometheus query:**
```
Query: ALERTS{alertname=~".*", severity="critical"}
Title: $alertname — $labels
Text: Severity: {{ severity }}, Value: {{ value }}
```

This creates annotation markers whenever a Prometheus alert is firing, labeled with the alert name.

**Annotation tags** let you color-code different annotation types:
- `deploy` → blue markers
- `alert:critical` → red markers  
- `alert:warning` → yellow markers
- `scaling` → green markers

### Annotations vs Dashboard Overlays

If you have many annotations (hundreds per day), they clutter the graph. Options:
- **Limit by severity**: Only show `critical` alerts, not `info`.
- **Use annotation queries with time ranges**: Only show annotations within the dashboard's time range.
- **Use tags to filter**: Group by tag and let users toggle annotation groups.

---

## Part 6: Alerting

### Unified Alerting (Grafana 8+)

Grafana 8 introduced **unified alerting**, which combines Prometheus-style alert rules with Grafana's notification system. Before unified alerting, Grafana could only show alerts from Prometheus Alertmanager — it couldn't create or manage them. Now Grafana can do both:

| Capability | Prometheus Alertmanager | Grafana Unified Alerting |
|-----------|------------------------|------------------------|
| **Rule evaluation** | Prometheus server | Grafana alert engine |
| **Data source** | Prometheus only | Any Grafana data source |
| **Notification channels** | Receiver config | Contact points (Slack, email, PagerDuty, webhook, etc.) |
| **Silences** | Yes | Yes |
| **Alert grouping** | By labels | By notification policy |
| **UI** | alertmanager UI (basic) | Grafana UI (full) |

Grafana unified alerting can be used:
1. **Standalone** — No Prometheus Alertmanager needed. Grafana evaluates everything.
2. **Combined** — Prometheus evaluates and alerts, Grafana receives them and routes notifications.

### When to Use Which

**Use Prometheus Alertmanager when:**
- You need sub-minute alert evaluation (Grafana evaluates every 30–60s minimum)
- You want alerting to survive a Grafana outage
- You have complex alert routing with many team-specific receivers
- You already have a working Prometheus + Alertmanager setup

**Use Grafana Unified Alerting when:**
- You need alerts across multiple data sources (e.g., Prometheus + Loki + CloudWatch)
- You want to alert on dashboard queries you've already built
- You want a single UI for alert management
- Your team prefers UI-based alert configuration over YAML

**The pragmatic approach** (recommended for this course):
- Use PrometheusRules for latency-sensitive, high-velocity alerts (error rate, pod down)
- Use Grafana alerts for synthetic checks, multi-source alerts, and dashboard-derived conditions

### Anatomy of a Grafana Alert

A Grafana alert rule consists of:

1. **Query** — A PromQL query (or any data source query) that returns a numeric value.
2. **Condition** — Evaluate the query against a threshold: `WHEN last() OF query(A, 5m) IS ABOVE 0.05`.
3. **No Data & Error Handling** — What happens if the query returns no data or an error (Alerting, NoData, OK, KeepLast).
4. **Evaluation group** — A group of rules that share an evaluation interval (e.g., every 30s).
5. **Labels** — Key-value pairs for routing (e.g., `severity: critical`, `team: backend`).

### Alert Evaluation States

```
                    ┌──────────┐
                    │   OK     │
                    └────┬─────┘
                         │ condition breaches threshold
                         ▼
                    ┌──────────┐
              ┌─────│ Pending  │─────┐
              │     └──────────┘     │
              │ for: 5m not elapsed  │ for: 5m elapsed
              ▼                     ▼
        ┌──────────┐          ┌──────────┐
        │   OK     │          │ Alerting │
        └──────────┘          └────┬─────┘
                                    │ condition resolves
                                    ▼
                              ┌──────────┐
                              │   OK     │
                              └──────────┘
```

- **OK**: The condition is not breached.
- **Pending**: The condition is breached, but the `for` duration hasn't elapsed yet.
- **Alerting**: The condition has been breached for the full `for` duration. Notifications fire.
- **NoData**: The query returned no data (optionally maps to Alerting).
- **Error**: The query execution failed (optionally maps to Alerting).

Alert states transition on every evaluation cycle. The `for` duration prevents alert fatigue from transient spikes.

### Contact Points

A contact point defines **how** to send a notification. Common types:

| Type | Configuration | Use Case |
|------|--------------|----------|
| **Slack** | Webhook URL, channel, optional user/group mentions | Team communication |
| **Email** | SMTP server, from/to addresses | Formal notification, compliance |
| **PagerDuty** | Routing key, integration key | On-call escalation |
| **Webhook** | Custom URL, JSON payload | Custom integrations |
| **Discord** | Webhook URL | Gaming/open-source teams |
| **Telegram** | Bot token, chat ID | Lightweight notifications |

### Notification Policies

A notification policy defines **who** gets notified and **when**. Policies are organized as a tree:

```
Default policy (match all)
  ├── Team: Backend (severity = critical)
  │     └── Slack: #backend-alerts
  ├── Team: Infrastructure (severity = warning)
  │     └── Slack: #infra-alerts + Email: infra@team.com
  └── Team: On-Call (severity = critical)
        └── PagerDuty: on-call rotation
```

Policy matching is label-based. An alert with labels `{severity="critical", team="backend"}` matches the "Team: Backend" policy and sends to `#backend-alerts`.

**Key concepts:**
- **Group by**: Alerts are grouped by label values (e.g., group by `alertname` so firing and resolved notifications for the same alert are merged).
- **Timing**: `group_wait` (how long to wait before sending the first notification), `group_interval` (how long to wait before sending updates about already-firing alerts), `repeat_interval` (how long to wait before re-sending a resolved alert).
- **Mute timings**: Silence notifications during specific times (e.g., "don't page on-call between midnight and 6 AM for warning-level alerts").

### Silences

Silences suppress notifications for a specific time period. Use cases:
- **Scheduled maintenance**: Silence alerts about the database while you're migrating it.
- **Known issues**: Silence alerts about a known bug until the fix deploys.
- **Testing**: Silence alerts while you run load tests that intentionally trigger thresholds.

Grafana silences support:
- **Duration**: Start and end time.
- **Matchers**: Label-based matching (same as notification policies).
- **Comment**: Why the silence was created (audit trail).
- **Created by**: Who or what created the silence.

---

## Part 7: Dashboard Provisioning

### Why GitOps for Dashboards?

Click-ops dashboards have problems:
- "Who changed the error rate threshold?" — No one knows, there's no audit trail.
- "Can you export that dashboard?" — Someone has to remember to export it.
- "Why does staging have a different dashboard than production?" — Drift happened.

GitOps solves this: dashboards live in git as JSON, deploy via CI/CD, and any manual change gets overwritten on the next sync.

### Provisioning via ConfigMap

The `kube-prometheus-stack` automatically loads ConfigMaps with the label `grafana_dashboard: "1"` as Grafana dashboards. This is the standard way to provision dashboards in Kubernetes:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cutlink-dashboard
  namespace: monitoring
  labels:
    grafana_dashboard: "1"    # <-- This label triggers auto-loading
data:
  cutlink-service-health.json: |-
    {
      "title": "Cutlink / Service Health",
      ...
    }
```

When this ConfigMap is created or updated:
1. Grafana's sidecar container (if using kube-prometheus-stack) detects the new/updated ConfigMap.
2. It imports the dashboard JSON into Grafana.
3. The dashboard appears in Grafana's UI within seconds.
4. Deleting the ConfigMap removes the dashboard.

### The Dashboard-as-Code Workflow

```
1. DEVELOP: Export dashboard as JSON from Grafana UI
2. COMMIT: Save JSON to git (e.g., dashboards/cutlink-service-health.json)
3. REVIEW: PR with dashboard changes is reviewed like any code change
4. DEPLOY: CI applies the ConfigMap to the cluster
5. VERIFY: Dashboard appears in Grafana automatically
```

For iteration during development, you can:
- Edit the JSON directly and re-apply the ConfigMap (`kubectl apply -f dashboard.yaml`)
- Or use Grafana's UI to tweak and re-export

**Pro tip:** Always re-export after UI tweaks and commit the updated JSON. Otherwise, the next GitOps sync overwrites your manual changes.

### The Dashboard JSON Model

Understanding the JSON model lets you debug dashboard issues without clicking through the UI:

```json
{
  "__inputs": [],         // Placeholder for provisioning metadata
  "__requires": [],       // Required plugins/data sources
  "panels": [...],        // Array of panel definitions
  "schemaVersion": 36,    // Grafana version schema
  "style": "dark",        // dark or light theme
  "tags": ["kubernetes", "cutlink"],
  "templating": {
    "list": [...]         // Variable definitions
  },
  "annotations": {
    "list": [...]         // Annotation queries
  },
  "time": {
    "from": "now-6h",     // Default time range
    "to": "now"
  },
  "timepicker": {...},    // Time range options
  "title": "Cutlink / Service Health",
  "uid": "cutlink-service-health"  // Unique identifier for URLs/links
}
```

Each panel in `panels` array has:
```json
{
  "datasource": "Prometheus",
  "fieldConfig": {
    "defaults": {
      "thresholds": {...},
      "unit": "rps",
      "min": 0,
      "max": null
    },
    "overrides": []
  },
  "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0},
  "id": 1,
  "options": {
    "legend": {"displayMode": "table", "placement": "bottom"},
    "tooltip": {"mode": "multi"}
  },
  "targets": [
    {
      "expr": "sum(rate(flask_http_request_total[5m]))",
      "legendFormat": "RPS",
      "refId": "A"
    }
  ],
  "title": "Request Rate",
  "type": "timeseries"
}
```

Key fields:
- `gridPos`: Panel position on the grid. `w=12` is half-width (24 columns total), `w=24` is full-width. `x` and `y` are column and row position.
- `fieldConfig.defaults.thresholds`: Defines color thresholds for the panel.
- `fieldConfig.defaults.unit`: Display units (rps, reqps, cps, s, ms, percent, short, bytes, etc.).
- `targets`: Array of queries. Multiple targets in one panel overlay multiple series.
- `options`: Visualization-specific options (legend, tooltip, stacking, etc.).

---

## Exercises Overview

You will complete four exercises in this stage:

1. **Explore Mode** — Use Grafana's ad-hoc query interface to run PromQL queries and inspect raw metric data.
2. **Build "Cutlink Service Health" Dashboard** — Create a multi-panel dashboard from scratch using the Prometheus data source.
3. **Templating & Variables** — Add namespace and pod variables to make your dashboard reusable.
4. **Annotations & Alerts** — Add deploy event annotations and create a Grafana alert for high error rates.

Each exercise builds on the previous one. By the end, you'll have a production-quality dashboard for Cutlink with alerts, templates, and annotations.

---

## Common Commands Reference

| Command | Description |
|---------|-------------|
| `kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring` | Access Grafana UI |
| `kubectl get configmap -n monitoring -l grafana_dashboard=1` | List provisioned dashboards |
| `kubectl apply -f dashboards/cutlink-service-health.yaml` | Deploy dashboard ConfigMap |
| `kubectl delete configmap cutlink-dashboard -n monitoring` | Remove provisioned dashboard |
| `curl -u admin:prom-operator http://localhost:3000/api/dashboards/db` | List dashboards via API |
| `curl -u admin:prom-operator http://localhost:3000/api/alerts` | List alerts via API |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `dashboards/cutlink-service-health.json` | Grafana dashboard JSON (exportable) |
| `dashboards/cutlink-service-health.yaml` | Kubernetes ConfigMap for dashboard provisioning |
| `exercises/01-explore-prometheus.md` | Explore mode walkthrough |
| `exercises/02-build-dashboard.md` | Dashboard building guide |
| `exercises/03-alerting.md` | Grafana unified alerting setup |

---

## Review Questions

1. What makes Grafana a "unified observability" platform? Name three data sources it can combine.
2. What is the difference between Explore mode and a Dashboard? When would you use each?
3. Explain the visual hierarchy of a well-designed dashboard. What goes at the top, middle, and bottom?
4. Why should you avoid pie charts in dashboards? What should you use instead?
5. What is a chained variable in Grafana templating? Give an example.
6. How does the `$__rate_interval` variable differ from using a hard-coded `[5m]` in a PromQL rate query?
7. What are annotations? Give three examples of events you might annotate on a dashboard.
8. Compare Prometheus Alertmanager with Grafana Unified Alerting. When would you choose each?
9. What happens when a Grafana alert is in "Pending" state? How is it different from "Alerting"?
10. How does dashboard provisioning via ConfigMap work? What label triggers the sidecar to load a dashboard?

---

**Next: Stage 8 — Loki: Log Aggregation.**
