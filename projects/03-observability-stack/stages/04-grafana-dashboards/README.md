# Stage 4: Grafana Dashboards

**Goal:** Build unified dashboards that combine metrics, logs, and traces into a single pane of glass for ObservaShop.

**Prerequisites:** Stages 1-3 complete. All three datasources (Prometheus, Loki, Tempo) configured in Grafana.

---

## 1. Theory (What & Why)

### Why dashboards matter

Raw PromQL queries are powerful but ephemeral. Dashboards persist your most important questions as panels that anyone on the team can read at a glance. A good dashboard answers: "Is the system healthy right now?" in under 5 seconds.

### Dashboard design principles

| Principle | Why | Example |
|-----------|-----|---------|
| **Top-down layout** | Most important signals at the top | Request rate + error rate in row 1 |
| **USE method** | Utilisation, Saturation, Errors per resource | CPU %, queue depth, error count |
| **RED method** | Rate, Errors, Duration per service | req/s, error%, p95 latency |
| **Variables** | One dashboard for all services | `$service` dropdown filters all panels |
| **Links** | Drill from overview to detail | Click a service → jump to its detail dashboard |

### Pre-built dashboard

ObservaShop ships with `dashboards/observashop-overview.json` — a starter dashboard with request rate, latency, payment success rate, order count, inventory levels, and error logs.

---

## 2. Hands-On

### 2.1 Import the starter dashboard

In Grafana → Dashboards → Import → Upload JSON → select `ObservaShop/dashboards/observashop-overview.json`.

### 2.2 Add template variables

Edit the dashboard → Settings → Variables → Add:
- Name: `service`, Type: Query, Datasource: Prometheus
- Query: `label_values(up, job)`
- Now use `$service` in panel queries: `rate(gateway_requests_total{job="$service"}[5m])`

### 2.3 Build a RED dashboard from scratch

Create a new dashboard with three rows:

**Row 1: Rate**
```promql
sum(rate(gateway_requests_total[5m])) by (endpoint)
```

**Row 2: Errors**
```promql
sum(rate(gateway_requests_total{status=~"4..|5.."}[5m])) by (endpoint)
/
sum(rate(gateway_requests_total[5m])) by (endpoint)
```

**Row 3: Duration**
```promql
histogram_quantile(0.95, sum(rate(gateway_request_duration_seconds_bucket[5m])) by (le, endpoint))
```

### 2.4 Add a Loki logs panel

Add a panel with Loki datasource:
```logql
{container=~"observashop.*"} | json | level="error" | line_format "{{.service}}: {{.msg}}"
```

Set visualisation to "Logs". Now errors appear alongside your metrics.

### 2.5 Add trace links

In a table panel showing slow requests, add a data link:
- URL: `/explore?left={"datasource":"Tempo","queries":[{"refId":"A","query":"${__data.fields.trace_id}"}]}`
- This lets you click a trace ID and jump to Tempo.

---

## 3. Key patterns

### Annotations

Mark deployments, incidents, and config changes on your dashboards:
```bash
curl -X POST http://localhost:3000/api/annotations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api-key>" \
  -d '{"text": "Deployed v1.2.3", "tags": ["deploy"]}'
```

### Alert thresholds as lines

Add threshold lines to panels: p95 latency panel with a red line at 1s, error rate panel with a red line at 5%. Visual context for "is this bad?"

---

## Exercises

1. [Exercise 1 — Build a service overview dashboard](exercises/01-service-dashboard.md)
2. [Exercise 2 — Add variables and drill-down links](exercises/02-variables-drilldown.md)

**Next stage:** [05-alertmanager](../05-alertmanager/README.md) — alert routing and escalation.
