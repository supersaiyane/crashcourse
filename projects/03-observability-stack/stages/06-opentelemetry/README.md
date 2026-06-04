# Stage 6: OpenTelemetry

**Goal:** Replace vendor-specific instrumentation with OpenTelemetry — a single, vendor-neutral standard for metrics, logs, and traces.

**Prerequisites:** Stages 1-5 complete. The OTel Collector is already in docker-compose.

---

## 1. Theory (What & Why)

### The problem OTel solves

Without OTel, each backend needs its own client library:
- Prometheus client for metrics
- Promtail/Loki client for logs  
- Jaeger/Tempo client for traces

Three libraries, three configurations, three sets of context propagation. If you switch from Jaeger to Tempo, you rewrite instrumentation code.

OpenTelemetry gives you **one SDK** that exports to **any backend** via the **OTel Collector**:

```text
┌──────────┐     OTLP      ┌───────────────┐     export     ┌────────────┐
│ Your App  │ ────────────> │ OTel Collector │ ─────────────> │ Prometheus │
│ (OTel SDK)│              │               │              │ Loki       │
└──────────┘              │               │              │ Tempo      │
                           └───────────────┘              └────────────┘
```

### The Collector pipeline

The Collector has three stages:

| Stage | What it does | Example |
|-------|-------------|---------|
| **Receivers** | Accept telemetry data | `otlp` (gRPC + HTTP) |
| **Processors** | Transform, batch, filter | `batch`, `attributes`, `filter` |
| **Exporters** | Send to backends | `prometheusremotewrite`, `loki`, `otlphttp/tempo` |

These are wired into **pipelines** — one per signal type (traces, metrics, logs).

### Auto-instrumentation

OTel can automatically instrument common libraries (Flask, requests, psycopg2) without code changes:

```bash
opentelemetry-instrument --service_name gateway python app.py
```

This wraps every Flask route and outgoing HTTP call with spans — zero code changes.

---

## 2. Hands-On

### 2.1 Check the Collector config

Open `ObservaShop/otel-collector.yml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

exporters:
  otlphttp/tempo:
    endpoint: http://tempo:3200
  prometheusremotewrite:
    endpoint: http://prometheus:9090/api/v1/write
  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/tempo]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheusremotewrite]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [loki]
```

One receiver (OTLP) feeds three pipelines — traces to Tempo, metrics to Prometheus, logs to Loki.

### 2.2 Add OTel SDK to the gateway

The services already have `opentelemetry-*` packages in `requirements.txt`. To enable auto-instrumentation, change the Dockerfile CMD:

```dockerfile
CMD ["opentelemetry-instrument", "--service_name", "gateway", "--traces_exporter", "otlp", "--metrics_exporter", "otlp", "--exporter_otlp_endpoint", "http://otel-collector:4317", "python", "app.py"]
```

This wraps Flask and requests with automatic span creation.

### 2.3 Verify in Tempo

After rebuilding (`docker-compose build gateway && docker-compose up -d gateway`), generate traffic and check Tempo — you should see richer spans with HTTP metadata (method, status_code, url) that OTel adds automatically.

### 2.4 Add custom span attributes

In the gateway code, add business context to spans:

```python
from opentelemetry import trace

tracer = trace.get_tracer("gateway")

@app.route("/api/orders", methods=["POST"])
def create_order():
    with tracer.start_as_current_span("create_order") as span:
        span.set_attribute("order.items_count", len(body.get("items", [])))
        span.set_attribute("order.total", body.get("total", 0))
        # ... existing code
```

---

## 3. Key patterns

### Resource attributes

Set global attributes for all telemetry from a service:
```python
from opentelemetry.sdk.resources import Resource

resource = Resource.create({
    "service.name": "gateway",
    "service.version": "1.0.0",
    "deployment.environment": "production",
})
```

### Baggage

Propagate key-value pairs across service boundaries (e.g., `user_id`, `tenant_id`) without adding them to every span:

```python
from opentelemetry import baggage
baggage.set_baggage("user_id", "user-123")
```

---

## Exercises

1. [Exercise 1 — Enable auto-instrumentation](exercises/01-auto-instrument.md)
2. [Exercise 2 — Add custom spans and attributes](exercises/02-custom-spans.md)

**Next stage:** [07-mimir-longterm](../07-mimir-longterm/README.md) — long-term metric storage.
