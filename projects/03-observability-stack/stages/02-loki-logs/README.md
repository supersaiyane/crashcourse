# Stage 2: Loki Logs

**Goal:** Aggregate structured logs from all ObservaShop services into Loki and query them with LogQL.

**Prerequisites:** Stage 1 complete. The observability stack running via `docker-compose up -d`.

---

## 1. Theory (What & Why)

### Why structured logging?

Traditional logs are free-form strings — hard to search, impossible to aggregate reliably. Structured logging emits JSON objects with consistent fields:

```json
{"ts": 1718000000, "service": "payment-svc", "level": "error", "msg": "payment failed", "order_id": "abc123", "amount": 1299.99}
```

Every field is queryable. You can filter by service, level, order_id — without regex guessing.

### Why Loki?

Loki is "like Prometheus, but for logs." It indexes **labels** (metadata), not the full log content. This makes it:
- **Cheap to run** — stores compressed log chunks, not a full-text index
- **Fast to query by labels** — `{service="payment-svc", level="error"}`
- **Integrated with Grafana** — logs and metrics on the same dashboard

```text
┌──────────┐     push      ┌──────┐    query     ┌─────────┐
│ Promtail  │ ───────────> │ Loki  │ <─────────── │ Grafana  │
│ (shipper) │              │       │              │          │
└──────────┘              └──────┘              └─────────┘
      ↑
  container logs
  (/var/log, docker)
```

### LogQL basics

LogQL has two query types:
- **Log queries** — return log lines: `{service="gateway"} |= "error"`
- **Metric queries** — return numbers from logs: `rate({service="gateway"}[5m])`

Key operators:
| Operator | What it does | Example |
|----------|-------------|---------|
| `\|=` | Contains string | `{job="app"} \|= "error"` |
| `!=` | Does not contain | `{job="app"} != "debug"` |
| `\|~` | Regex match | `{job="app"} \|~ "order_id=.*abc"` |
| `\| json` | Parse JSON fields | `{job="app"} \| json \| level="error"` |
| `\| line_format` | Reformat output | `\| line_format "{{.service}}: {{.msg}}"` |

---

## 2. Hands-On

### 2.1 Verify logs are flowing

ObservaShop services emit JSON to stdout. Promtail (running in docker-compose) ships them to Loki.

Open Grafana at `http://localhost:3000` (admin / observashop). Go to Explore → select Loki datasource.

Query:
```logql
{container=~"observashop.*"}
```

You should see logs from all four services.

### 2.2 Filter by service and level

```logql
# Only payment service errors
{container=~".*payment.*"} | json | level="error"

# Gateway requests taking > 500ms
{container=~".*gateway.*"} | json | latency > 0.5

# All logs for a specific order
{container=~"observashop.*"} |= "order_id" | json | order_id="abc123"
```

### 2.3 Metric queries from logs

```logql
# Error rate per service (errors per second)
sum(rate({container=~"observashop.*"} | json | level="error" [5m])) by (service)

# Log volume per service
sum(rate({container=~"observashop.*"}[5m])) by (container)

# Count of payment failures in the last hour
count_over_time({container=~".*payment.*"} | json | level="error" [1h])
```

### 2.4 Trace-to-log correlation

Each ObservaShop log includes a `trace` field (W3C traceparent). In Grafana, you can click a trace ID in Tempo and jump directly to the matching logs in Loki — and vice versa. This is the power of correlated observability.

---

## 3. Key patterns

### Label cardinality

Loki indexes labels, not log content. High-cardinality labels (like `user_id` or `request_id`) will **kill performance**. Use:
- **Good labels:** `service`, `environment`, `level`, `namespace`
- **Bad labels:** `user_id`, `trace_id`, `order_id` — query these with `| json | field="value"` instead

### Log levels as a signal

```logql
# Error ratio — are errors increasing?
sum(rate({container=~"observashop.*"} | json | level="error" [5m]))
/
sum(rate({container=~"observashop.*"} [5m]))
```

If this ratio spikes, something is wrong — even if metrics look fine.

---

## Exercises

1. [Exercise 1 — Query logs in Grafana](exercises/01-query-logs.md)
2. [Exercise 2 — Build a log-based alert](exercises/02-log-alert.md)

**Next stage:** [03-tempo-traces](../03-tempo-traces/README.md) — distributed tracing and trace-to-log correlation.
