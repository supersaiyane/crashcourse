# Stage 3: Tempo Traces

**Goal:** Understand distributed tracing, follow requests across ObservaShop services, and correlate traces with logs and metrics.

**Prerequisites:** Stages 1-2 complete. Stack running.

---

## 1. Theory (What & Why)

### The problem traces solve

Metrics tell you *something* is slow. Logs tell you *what* happened in one service. But when a request flows through gateway → order-svc → payment-svc → inventory-svc, neither metrics nor logs alone show you **where the time went**.

A trace is a tree of spans — one span per operation, linked by a shared trace ID:

```text
Trace: abc-123
├─ gateway: POST /api/orders (450ms)
│  ├─ inventory-svc: POST /check (20ms)
│  ├─ order-svc: POST /orders (15ms)
│  └─ payment-svc: POST /pay (380ms)  ← bottleneck!
```

Now you know: payment-svc is the bottleneck, not the gateway.

### How context propagates

ObservaShop uses W3C `traceparent` headers:

```text
traceparent: 00-<trace-id>-<span-id>-<flags>
```

The gateway generates this header if missing, then passes it to every downstream call. Each service creates a child span with the same trace ID but a new span ID.

### Why Tempo?

Tempo is Grafana's trace backend. It stores traces cheaply (object storage), integrates with Grafana for visualisation, and correlates with Loki (trace → logs) and Prometheus (trace → metrics).

---

## 2. Hands-On

### 2.1 Generate a traced request

```bash
curl -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{"items": [{"sku": "PHONE-001", "quantity": 2}], "total": 1799.98}'
```

### 2.2 Find the trace in Grafana

Open Grafana → Explore → select **Tempo** datasource.

Search by: service name = "gateway", operation = "POST /api/orders"

Click a trace to see the waterfall view — each span shows timing, service name, and status.

### 2.3 Trace-to-log jump

In the trace waterfall, click a span → "Logs for this span" → Grafana jumps to Loki with the trace ID pre-filled. This is the correlation that makes the three pillars powerful together.

### 2.4 Trace-to-metrics

From a slow trace, note the time range. Switch to Prometheus and query:
```promql
histogram_quantile(0.95, rate(gateway_request_duration_seconds_bucket[5m]))
```

If the trace latency matches the p95 spike, you've confirmed the issue isn't a one-off.

---

## 3. Key patterns

### Sampling

In production, you don't trace 100% of requests — it's too expensive. Common strategies:
- **Head-based:** Decide at the start (random 10%)
- **Tail-based:** Decide after the trace completes (keep errors + slow traces)
- **Adaptive:** Adjust rate based on load

### Span attributes

Rich spans include:
- `http.method`, `http.status_code`, `http.url`
- `db.system`, `db.statement` (for database calls)
- Custom attributes: `order_id`, `payment_status`

---

## Exercises

1. [Exercise 1 — Trace a request end-to-end](exercises/01-trace-request.md)
2. [Exercise 2 — Find the slowest span](exercises/02-find-bottleneck.md)

**Next stage:** [04-grafana-dashboards](../04-grafana-dashboards/README.md) — unified dashboards.
