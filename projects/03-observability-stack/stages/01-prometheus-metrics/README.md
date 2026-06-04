# Stage 1: Prometheus Metrics

**Goal:** Instrument the ObservaShop microservices with Prometheus metrics, configure scrape targets, and write PromQL queries to understand system behaviour.

**Prerequisites:** Docker and Docker Compose installed. The ObservaShop app running via `docker-compose up -d` from the `ObservaShop/` directory.

---

## 1. Theory (What & Why)

### What is observability?

Observability is the ability to understand what's happening inside a system by examining its outputs. Three pillars:

| Pillar | What it tells you | Tool in this project |
|--------|------------------|---------------------|
| **Metrics** | How much, how fast, how full | Prometheus |
| **Logs** | What happened, in what order | Loki |
| **Traces** | Which service called which, how long each hop took | Tempo |

Metrics come first because they're the cheapest signal — a single counter costs almost nothing to increment, but tells you instantly if something changed.

### Why Prometheus?

Prometheus is a pull-based monitoring system. It **scrapes** HTTP endpoints at regular intervals, stores time-series data locally, and lets you query it with PromQL.

```text
┌─────────────┐     GET /metrics     ┌──────────────┐
│  Prometheus  │ ──────────────────> │  Your App     │
│  (scraper)   │ <────────────────── │  (exporter)   │
└──────┬──────┘    metric samples    └──────────────┘
       │
       v
  ┌─────────┐
  │  TSDB   │  ← time-series database (local disk)
  └─────────┘
```

Key concepts:
- **Metric types:** Counter (only goes up), Gauge (goes up and down), Histogram (buckets of observations), Summary (quantiles)
- **Labels:** Key-value pairs that let you slice and dice metrics — `{service="gateway", endpoint="/api/orders"}`
- **PromQL:** The query language — `rate()`, `histogram_quantile()`, aggregation operators

### The four golden signals

Google's SRE book defines four signals every service should expose:

| Signal | What to measure | Prometheus metric type |
|--------|----------------|----------------------|
| **Latency** | How long requests take | Histogram |
| **Traffic** | How many requests per second | Counter |
| **Errors** | How many requests fail | Counter with status label |
| **Saturation** | How full your resources are | Gauge |

ObservaShop already instruments all four — this stage teaches you to query them.

---

## 2. Hands-On: Explore the metrics

### 2.1 Start the stack

```bash
cd ObservaShop
docker-compose up -d
```

Verify services are running:
```bash
curl http://localhost:8080/health    # gateway
curl http://localhost:8081/health    # order-svc
curl http://localhost:8082/health    # payment-svc
curl http://localhost:8083/health    # inventory-svc
curl http://localhost:9090/-/healthy # prometheus
```

### 2.2 See raw metrics

Each service exposes a `/metrics` endpoint in Prometheus exposition format:

```bash
curl http://localhost:8080/metrics
```

You'll see lines like:
```text
# HELP gateway_requests_total Total requests
# TYPE gateway_requests_total counter
gateway_requests_total{method="POST",endpoint="/api/orders",status="200"} 0.0
```

### 2.3 Generate some traffic

```bash
# Create an order
curl -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{"items": [{"sku": "LAPTOP-001", "quantity": 1}], "total": 1299.99}'

# List orders
curl http://localhost:8080/api/orders

# Check inventory
curl http://localhost:8080/api/inventory
```

Run these a few times to generate metric data.

### 2.4 Query in Prometheus UI

Open `http://localhost:9090` in your browser.

Try these PromQL queries:

```promql
# Total requests by endpoint
gateway_requests_total

# Request rate (per second) over 5 minutes
rate(gateway_requests_total[5m])

# p95 latency
histogram_quantile(0.95, rate(gateway_request_duration_seconds_bucket[5m]))

# Payment success rate
sum(rate(payments_total{status="success"}[5m])) / sum(rate(payments_total[5m]))

# Current inventory levels
inventory_stock_level

# Orders created per minute
rate(orders_created_total[1m]) * 60
```

### 2.5 Understand the scrape config

Look at `ObservaShop/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: "gateway"
    static_configs:
      - targets: ["gateway:8080"]
```

Each job scrapes one service. Prometheus adds `job` and `instance` labels automatically. In production, you'd use service discovery (Kubernetes SD, Consul, EC2) instead of static targets.

---

## 3. Key PromQL patterns

### Rate vs increase

```promql
# rate() = per-second average over a window
rate(gateway_requests_total[5m])      # "2.5 requests/second"

# increase() = total increase over a window
increase(gateway_requests_total[5m])  # "750 requests in 5 minutes"
```

Use `rate()` for dashboards (smoother). Use `increase()` for "how many in the last hour" questions.

### Histogram quantiles

```promql
# p99 latency across all endpoints
histogram_quantile(0.99,
  sum(rate(gateway_request_duration_seconds_bucket[5m])) by (le)
)

# p50 (median) per endpoint
histogram_quantile(0.50,
  sum(rate(gateway_request_duration_seconds_bucket[5m])) by (le, endpoint)
)
```

### Aggregation

```promql
# Sum across all instances
sum(rate(gateway_requests_total[5m]))

# Group by status
sum(rate(gateway_requests_total[5m])) by (status)

# Top 3 busiest endpoints
topk(3, sum(rate(gateway_requests_total[5m])) by (endpoint))
```

---

## 4. What you should understand by now

- Every service exposes `/metrics` in Prometheus format
- Prometheus pulls (scrapes) these endpoints on a schedule
- Counters only go up; use `rate()` to get per-second values
- Histograms store observations in buckets; use `histogram_quantile()` for percentiles
- Labels let you filter and group — `{status="200"}`, `by (endpoint)`
- The four golden signals (latency, traffic, errors, saturation) map directly to metric types

---

## Exercises

1. [Exercise 1 — Explore metrics endpoints](exercises/01-explore-metrics.md)
2. [Exercise 2 — Write PromQL queries](exercises/02-promql-queries.md)
3. [Exercise 3 — Add a custom metric](exercises/03-custom-metric.md)

**Next stage:** [02-loki-logs](../02-loki-logs/README.md) — add structured logging and LogQL queries.
