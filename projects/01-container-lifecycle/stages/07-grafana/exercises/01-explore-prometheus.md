# Exercise 1: Explore Mode — Ad-Hoc PromQL Queries

In this exercise, you will use Grafana's Explore mode to run PromQL queries against live Cutlink metrics. Explore is the debugging sandbox — no dashboard needed, no save required. You test queries here before putting them in a dashboard panel.

## Prerequisites

- Stage 6 completed (Prometheus with kube-prometheus-stack deployed)
- Cutlink deployed and generating traffic (use `scripts/generate-traffic.sh` from earlier stages)
- Grafana accessible at `http://localhost:3000` (port-forward: `kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring`)
- Login: `admin` / `prom-operator`

---

## Step 1: Open Explore

1. Log in to Grafana at `http://localhost:3000`.
2. Click the **Compass** icon in the left sidebar (or press `Shift+E`).
3. In the top-left data source dropdown, select **Prometheus**.
4. Set the time range to **Last 1 hour** using the time picker in the top-right.

You should see an empty query editor with a "Metric" dropdown. This is your PromQL sandbox.

## Step 2: Discover Available Metrics

Click the **Metric** dropdown next to the query input. Grafana will fetch all metric names from Prometheus. This list confirms your Prometheus data source is working.

Notable Cutlink-related metrics:
- `flask_http_request_total` — Total HTTP requests (counter)
- `flask_http_request_duration_seconds_bucket` — Request latency histogram
- `flask_http_request_duration_seconds_count` — Request duration count
- `flask_http_request_duration_seconds_sum` — Request duration sum
- `url_shortener_total_urls` — Total shortened URLs (gauge)
- `url_shortener_url_clicks_total` — Clicks per short URL (counter with `short_code` label)
- `up` — Scrape target health
- `container_cpu_usage_seconds_total` — CPU usage per container
- `container_memory_working_set_bytes` — Memory usage per container

If you don't see `url_shortener_*` metrics, you skipped the custom metrics exercise in Stage 6. The dashboard will still work — those panels will simply show no data.

## Step 3: Run Basic Queries

**Query 1 — Total HTTP requests:**
```promql
flask_http_request_total
```

Click **Run query** (blue button top-right). This returns raw counter values — monotonically increasing per series. Not useful on its own, but it confirms the metric exists.

**Query 2 — HTTP request rate:**
```promql
rate(flask_http_request_total[5m])
```

This returns the per-second request rate averaged over 5 minutes. You should see one or more lines trending. If the graph is flat at zero, generate traffic: `curl http://localhost:8080/` a few times.

**Query 3 — Filter by namespace:**
```promql
rate(flask_http_request_total{namespace="cutlink"}[5m])
```

Only requests from the `cutlink` namespace. Add `, status=~"5.."` to see only server errors.

**Query 4 — Error ratio:**
```promql
sum(rate(flask_http_request_total{status=~"5.."}[5m])) / sum(rate(flask_http_request_total[5m]))
```

If no errors exist, this returns 0 or no data. That is a good sign — it means your service is healthy.

## Step 4: Use Split Mode

1. Click the **Split** button (vertical dashed line icon next to the time picker).
2. In the right pane, select the same Prometheus data source.
3. Enter this query: `flask_http_request_duration_seconds_bucket{namespace="cutlink"}`

Now you can see raw traffic (left pane) and latency bucket data (right pane) side by side, with the same time range.

## Step 5: Query Latency Percentiles

**P95 latency:**
```promql
histogram_quantile(0.95, sum(rate(flask_http_request_duration_seconds_bucket{namespace="cutlink"}[5m])) by (le))
```

This applies `histogram_quantile` to the aggregated bucket rates. The result is a single line showing the 95th percentile request duration in seconds.

Compare it with P50:
```promql
histogram_quantile(0.50, sum(rate(flask_http_request_duration_seconds_bucket{namespace="cutlink"}[5m])) by (le))
```

In a healthy system, p50 should be significantly lower than p95. The gap between them indicates request latency variance.

## Step 6: Use Built-in Template Variables

Grafana provides special template variables in Explore. Try these:

**Using `$__rate_interval`:**
```promql
rate(flask_http_request_total{namespace="cutlink"}[$__rate_interval])
```

`$__rate_interval` auto-selects an optimal rate calculation interval (usually 4x the scrape interval). This avoids the "rate() needs at least 4 samples" warning and is the recommended approach for production dashboards.

**Using `$__interval`:**
```promql
avg by(instance) (rate(container_cpu_usage_seconds_total{namespace="cutlink"}[$__interval]))
```

`$__interval` adjusts dynamically with the time range — wider range = larger interval, preventing too many data points from being returned.

## Step 7: Query with Table Format

Some queries work better as tables. Click the **Table** icon next to the query input and run:

```promql
topk(10, url_shortener_url_clicks_total{namespace="cutlink"})
```

This returns the top 10 most-clicked short URLs. In table view, you see exact values per series with sortable columns. This is the same data the dashboard's "Top URLs" table uses.

## Step 8: Compare Time Ranges

1. In the left pane, set time range to **Last 30 minutes**.
2. In the right pane, set time range to **Last 24 hours**.
3. Run `rate(flask_http_request_total{namespace="cutlink"}[5m])` in both panes.

You now see a short-term and long-term view of the same metric. This is useful for answering: "Is the current spike unusual compared to the past day?"

## Step 9: Add Labels to Your Query

The `label_values()` function returns available label values. This is how dashboard variables are populated. In Explore, you cannot run `label_values()` directly (it's a Grafana template function, not PromQL), but you can see the effect in the dashboard's namespace dropdown.

To see available label values in PromQL, use:
```promql
count by(namespace) (up)
```

This shows every namespace that has an `up` metric — which is every namespace with a scrape target.

## Troubleshooting

### No Data Returns

**Possible causes:**
- No traffic: run `curl http://localhost:8080/` a few times.
- Wrong namespace: confirm Cutlink is deployed to `cutlink` with `kubectl get pods -n cutlink`.
- Wrong data source: confirm you selected "Prometheus" and not a different data source.

### "Error executing query"

**Possible causes:**
- Typo in PromQL: `rate(flask...` is valid, `rate[5m](flask...)` is not.
- Missing closing brace on label matchers.
- Prometheus data source not configured: Go to **Configuration > Data Sources > Prometheus** and verify the URL.

### Query Returns "No Data" for url_shortener Metrics

This is expected if you skipped the custom metrics exercise in Stage 6. The `url_shortener_*` metrics are not auto-generated — they require adding the `@app.route('/metrics')` endpoint to Cutlink. Without them, the dashboard's "Total Short URLs" and "Top URLs" panels will appear empty.

---

## Summary

You have used Grafana Explore to:
- Discover available metrics from the Prometheus data source
- Run raw counter, rate, and histogram_quantile queries
- Use split-pane to compare metrics or time ranges side by side
- Use `$__rate_interval` and `$__interval` template variables
- View time series results as a table

In the next exercise, you will build a multi-panel dashboard from scratch using these same PromQL queries.
