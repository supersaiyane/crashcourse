# Exercise 2: Build the Cutlink Service Health Dashboard

In this exercise, you will build a multi-panel Grafana dashboard from scratch. By the end, you will have a production-quality "Cutlink / Service Health" dashboard with SLO stat panels, time series traffic analysis, error analysis, infrastructure monitoring, and a top URLs table.

## Prerequisites

- Exercise 1 completed (or comfortable with Grafana Explore)
- Prometheus data source configured and working

---

## Step 1: Create a New Dashboard

1. Click the **Dashboards** icon (four squares) in the left sidebar.
2. Click **New** > **New Dashboard**.
3. Click **Save dashboard** (disk icon in the top bar).
4. Set:
   - **Name**: `Cutlink / Service Health`
   - **Folder**: (leave as General, or create a `Cutlink` folder)
5. Click **Save**.

## Step 2: Configure Dashboard Settings

Click **Dashboard settings** (gear icon) and configure:

**General:**
- **Description**: `Service health dashboard for Cutlink URL shortener`
- **Tags**: `cutlink`, `kubernetes`, `prometheus`, `service-health`
- **Auto-refresh**: Every `30s`
- **Time range**: Last `6h` (default)

**Annotations:**
1. Click **Annotations** in the left nav.
2. Click **Add annotation query**.
3. Create the Prometheus Alerts annotation:
   - **Name**: `Prometheus Alerts`
   - **Data source**: Prometheus
   - **Query**: `ALERTS{alertname=~"Cutlink.*"}`
   - **Title**: `Alert: {{ alertname }}`
   - **Tags**: `severity`
   - **Icon color**: Red
4. Click **Add annotation query** again for K8s events:
   - **Name**: `K8s Events`
   - **Data source**: Prometheus
   - **Query**: `count_over_time({namespace="$namespace"} |= "Started" [1m])`
   - **Icon color**: Blue

**Links:**
1. Click **Links** in the left nav.
2. Click **Add link**.
3. **Title**: `Prometheus Targets`
4. **URL**: `http://localhost:9090/targets`
5. **Icon**: `external link`
6. Check **Include time range** and **Include variables**.

## Step 3: Add Dashboard Variables

1. In dashboard settings, click **Variables**.
2. Click **Add variable**.

**Variable 1 — Namespace:**
- **Name**: `namespace`
- **Type**: Query
- **Label**: Namespace
- **Data source**: Prometheus
- **Query**: `label_values(namespace)`
- **Include All option**: Yes
- **Custom all value**: `.*`
- **Default value**: `cutlink`

**Variable 2 — Pod:**
- **Name**: `pod`
- **Type**: Query
- **Label**: Pod
- **Data source**: Prometheus
- **Query**: `label_values(up{namespace="$namespace"}, instance)`
- **Include All option**: Yes
- **Multi-value**: Yes
- **Refresh**: On time range change

**Variable 3 — Interval (hidden):**
- **Name**: `interval`
- **Type**: Interval
- **Hide**: Variable (hidden)
- **Values**: `30s,1m,5m,15m,30m,1h`
- **Default**: `30s`

3. Click **Save dashboard** to persist variables.

## Step 4: Add the Overview Row

1. Click **Add panel** (+) > **Add a new panel**.
2. In the panel editor, click the **Toggle text mode** button (pencil with `</>` icon).
3. Paste:
   ```html
   Overview — SLOs
   ```
4. In the right sidebar, set:
   - **Panel type**: Row (or leave as Text and change type to Row later)
5. Click **Apply**.

## Step 5: Add Request Rate Stat Panel

1. Click **Add panel** > **Add a new panel**.
2. In the query editor, select **Prometheus** data source.
3. Enter query:
   ```promql
   sum(rate(flask_http_request_total{namespace="$namespace"}[$__rate_interval]))
   ```
4. Set **Legend**: `Request Rate`
5. In the right sidebar:
   - **Visualization**: Stat
   - **Unit**: `rps` (requests per second)
   - **Color**: Thresholds (green for any value)
   - **Graph mode**: Area (shows sparkline)
6. Click **Apply**.

## Step 6: Add Error Ratio Stat Panel

1. Repeat Step 5 with query:
   ```promql
   sum(rate(flask_http_request_total{namespace="$namespace", status=~"5.."}[$__rate_interval])) / sum(rate(flask_http_request_total{namespace="$namespace"}[$__rate_interval]))
   ```
2. Set **Legend**: `Error Ratio`
3. **Visualization**: Stat
4. **Unit**: `percentunit`
5. **Thresholds**:
   - Green: `0` to `0.01` (1%)
   - Yellow: `0.01` to `0.05` (1–5%)
   - Red: `> 0.05`
6. Click **Apply**.

## Step 7: Add P95 Latency Stat Panel

1. Create a new panel with query:
   ```promql
   histogram_quantile(0.95, sum(rate(flask_http_request_duration_seconds_bucket{namespace="$namespace"}[$__rate_interval])) by (le))
   ```
2. **Visualization**: Stat
3. **Unit**: `s` (seconds)
4. **Thresholds**:
   - Green: `< 0.5`
   - Yellow: `0.5` to `1.0`
   - Red: `> 1.0`
5. Click **Apply**.

## Step 8: Add Total Short URLs Stat Panel

1. Create a new panel with query:
   ```promql
   url_shortener_total_urls{namespace="$namespace"}
   ```
2. **Visualization**: Stat
3. **Unit**: `short` (plain number with comma separators)
4. Click **Apply**.

## Step 9: Arrange the Overview Row

Drag the four stat panels to sit side by side in a row:
- Request Rate (w: 6, x: 0, y: 1)
- Error Ratio (w: 6, x: 6, y: 1)
- P95 Latency (w: 6, x: 12, y: 1)
- Total Short URLs (w: 6, x: 18, y: 1)

Each stat panel is `gridPos.w=6` (6 columns out of 24 = one-quarter width).

## Step 10: Add Traffic Analysis Section

Add a row panel titled "Traffic Analysis".

**Panel 5 — Request Rate by Status Code:**
- **Type**: Time series
- **Queries**:
  - `A`: `sum(rate(flask_http_request_total{namespace="$namespace", status=~"2.."}[$__rate_interval])) by (status)` → Legend: `2xx`
  - `B`: `sum(rate(flask_http_request_total{namespace="$namespace", status=~"3.."}[$__rate_interval])) by (status)` → Legend: `3xx`
  - `C`: `sum(rate(flask_http_request_total{namespace="$namespace", status=~"4.."}[$__rate_interval])) by (status)` → Legend: `4xx`
  - `D`: `sum(rate(flask_http_request_total{namespace="$namespace", status=~"5.."}[$__rate_interval])) by (status)` → Legend: `5xx`
- **Stack series**: Normal
- **Override 5xx color**: Red
- **Unit**: `rps`
- Width: 12, Height: 8

**Panel 6 — Request Latency (p50 / p95 / p99):**
- **Type**: Time series
- **Queries**:
  - `A`: `histogram_quantile(0.50, sum(rate(...)) by (le))` → Legend: `p50`
  - `B`: `histogram_quantile(0.95, sum(rate(...)) by (le))` → Legend: `p95`
  - `C`: `histogram_quantile(0.99, sum(rate(...)) by (le))` → Legend: `p99`
- **Thresholds**: Dashed red line at `1.0`
- **Override p99**: Line width 3
- **Unit**: `s`
- Width: 12, Height: 8

## Step 11: Add Error Analysis Section

Add a row panel titled "Error Analysis".

**Panel 7 — Error Ratio (time series):**
- **Type**: Time series
- **Query**: `sum(rate(flask_http_request_total{namespace="$namespace", status=~"5.."}[$__rate_interval])) / sum(rate(flask_http_request_total{namespace="$namespace"}[$__rate_interval]))`
- **Fill opacity**: 30
- **Thresholds**: Dashed lines at 0.01 (yellow) and 0.05 (red)
- **Unit**: `percentunit`
- Width: 8

**Panel 8 — Error Rate by Status Code:**
- **Type**: Time series
- **Query**: `rate(flask_http_request_total{namespace="$namespace", status=~"5.."}[$__rate_interval])`
- **Legend**: `{{ status }}`
- **Stack**: Normal
- **Unit**: `rps`
- Width: 8

**Panel 9 — Latency Distribution Heatmap:**
- **Type**: Heatmap
- **Query**: `sum(increase(flask_http_request_duration_seconds_bucket{namespace="$namespace"}[$__rate_interval])) by (le)`
- **Bucket bound**: `le` label
- **Color scheme**: Oranges
- **Y-axis unit**: `s`
- Width: 8

## Step 12: Add Infrastructure Section

Add a row panel titled "Infrastructure".

**Panel 10 — CPU Usage:**
- **Type**: Time series
- **Query**: `rate(container_cpu_usage_seconds_total{namespace="$namespace", container!=""}[$__rate_interval])`
- **Legend**: `{{ pod }}`
- **Stack**: Normal
- **Unit**: `rps` (CPU cores as rate)
- Width: 8

**Panel 11 — Memory Usage:**
- **Type**: Time series
- **Query**: `container_memory_working_set_bytes{namespace="$namespace", container!=""}`
- **Legend**: `{{ pod }}`
- **Stack**: Normal
- **Unit**: `bytes`
- Width: 8

**Panel 12 — Network I/O:**
- **Type**: Time series
- **Queries**:
  - `A`: `rate(container_network_receive_bytes_total{namespace="$namespace"}[$__rate_interval])` → Legend: `rx: {{ pod }}`
  - `B`: `rate(container_network_transmit_bytes_total{namespace="$namespace"}[$__rate_interval])` → Legend: `tx: {{ pod }}`
- **Unit**: `Bps`
- Width: 8

## Step 13: Add Top URLs & Details Section

Add a row panel titled "Top URLs & Details".

**Panel 13 — Top URLs by Click Count:**
- **Type**: Table
- **Query**: `topk(20, url_shortener_url_clicks_total{namespace="$namespace"})`
- **Format**: Table
- **Transform**: Organize fields — rename `Value` → `Click Count`, `short_code` → `Short Code`
- **Sort by**: Click Count (descending)

**Panel 14 — Health Check Status:**
- **Type**: Stat
- **Query**: `up{namespace="$namespace", job="$namespace-backend"}`
- **Value mapping**: `0` → "DOWN" (red), `1` → "UP" (green)
- **Color mode**: Background

**Panel 15 — Pod Restarts:**
- **Type**: Stat
- **Query**: `sum(kube_pod_container_status_restarts_total{namespace="$namespace"}) by (pod)`
- **Legend**: `{{ pod }}`
- **Thresholds**: Green `< 1`, Yellow `< 5`, Red `>= 5`
- **Color mode**: Background

## Step 14: Final Arrangement

Arrange panels using drag-and-drop (or edit `gridPos` in JSON) to match this layout:

```
Row: Overview — SLOs
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Request  │ │  Error   │ │   P95    │ │  Total   │
│ Rate     │ │  Ratio   │ │ Latency  │ │   URLs   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

Row: Traffic Analysis
┌──────────────────────────┐ ┌──────────────────────────┐
│   Request Rate by Status  │ │   Latency Percentiles    │
└──────────────────────────┘ └──────────────────────────┘

Row: Error Analysis
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Error Ratio ││  Error Rate  ││   Latency    │
│  (timeseries)││  by Status   ││   Heatmap    │
└──────────────┘ └──────────────┘ └──────────────┘

Row: Infrastructure
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  CPU Usage   ││    Memory    ││  Network I/O  │
└──────────────┘ └──────────────┘ └──────────────┘

Row: Top URLs & Details
┌──────────────────────────┐ ┌──────────┐ ┌──────────┐
│   Top URLs by Clicks     │ │  Health  │ │ Pod Rest │
└──────────────────────────┘ └──────────┘ └──────────┘
```

## Step 15: Save and Test

1. Click **Save dashboard**.
2. Test the namespace variable by selecting different namespaces from the dropdown.
3. Verify the time range picker works (try "Last 24 hours").
4. Hover over time series lines to see tooltips with exact values.
5. Check that annotation markers appear (you may need to wait for alerts to fire or pods to restart).

## Step 16: Export the Dashboard

1. Click **Share dashboard** (arrow icon).
2. Click the **Export** tab.
3. Uncheck **Export for sharing externally** (this includes data source references).
4. Click **Save to file**.
5. Save the JSON to `dashboards/cutlink-service-health.json` in your course repo.

## Step 17: Provision via ConfigMap (Optional)

Create a Kubernetes ConfigMap from the exported JSON:

```bash
kubectl create configmap cutlink-service-health \
  --namespace monitoring \
  --from-file=dashboards/cutlink-service-health.json \
  --dry-run=client -o yaml | sed 's/creationTimestamp: null//' > dashboards/cutlink-service-health.yaml
```

Then add the `grafana_dashboard: "1"` label:

```bash
kubectl label configmap cutlink-service-health \
  -n monitoring grafana_dashboard="1" --overwrite
```

Apply it:

```bash
kubectl apply -f dashboards/cutlink-service-health.yaml -n monitoring
```

The dashboard should appear in Grafana within 30–60 seconds (the sidecar container polls for new ConfigMaps).

## Troubleshooting

### Panels Show "No Data"

- Confirm the namespace variable is set to `cutlink` (or the namespace where Cutlink is deployed).
- Verify Prometheus is scraping Cutlink: check Targets page in Prometheus UI.
- Run the query in Explore first to verify it returns data.

### Variables Don't Populate

- Ensure the Prometheus data source is configured and labeled as `prometheus` (the default UID).
- Check variable query syntax: `label_values(namespace)` not `label_values("namespace")`.

### Dashboard Looks Wrong

- Reset to the reference dashboard at `dashboards/cutlink-service-health.json` (provided in the repo).
- Compare panel settings: some visualizations reset options when you change panel types.
- Check `gridPos` values if panels overlap or are invisible (y-values must be sequential).

---

## Summary

You have built a complete Grafana dashboard with:
- **15 panels** across 5 sections covering SLOs, traffic, errors, infrastructure, and details
- **3 variables** for namespace, pod, and interval templating
- **2 annotation sources** for alert and deploy events
- **Dashboard links** to related tools
- **ConfigMap provisioning** for GitOps deployment

In the next exercise, you will configure Grafana unified alerting to send notifications when your dashboard thresholds are breached.
