# Jaeger — A 2-Day Crash Course

Jaeger is a distributed tracing system originally built at Uber — it collects, stores, and visualizes request traces across microservices so you can see exactly where time is spent end-to-end. Before continuing, read `OpenTelemetry.md`; this guide assumes you understand the OTel data model.

---

## Part 0 — Why Jaeger Exists

You have ten microservices. A checkout request takes 4 seconds. Logs show nothing unusual. Metrics show individual services are healthy. You have no idea which service — or which hop between services — is responsible for the latency.

That is the problem distributed tracing solves. Jaeger gives every request a unique trace ID, propagates it through every service call, and assembles the result into a timeline you can inspect. Instead of asking "which service is slow?" you ask "show me this specific request" and the answer is a waterfall diagram with every span, duration, and tag.

Without tracing you are debugging distributed systems with a blindfold on.

---

## Vocabulary

**Trace** — the complete record of a single request as it travels through your system. A trace is a tree of spans sharing one trace ID.

**Span** — a named, timed operation within a trace. A span has a start time, duration, tags (key-value metadata), logs (timestamped events), and a reference to its parent span.

**SpanContext** — the minimal data that must cross process boundaries to connect spans: trace ID, span ID, and sampling flags. This is what gets injected into HTTP headers or message queue metadata.

**Collector** — the Jaeger component that receives spans from your instrumented services, validates them, and writes them to storage. Accepts OTLP, Thrift, and Protobuf.

**Agent** — a lightweight UDP-based daemon originally designed to run as a sidecar or DaemonSet. Its role is to receive spans from the application and forward them to the collector. In modern deployments the OTel Collector often replaces it.

**Query** — the Jaeger component that serves the UI and the API. It reads traces from storage and presents them.

**Storage backend** — where Jaeger persists traces. Options: Badger (embedded, dev only), Cassandra (wide-column, Uber's original choice), Elasticsearch/OpenSearch (most common in production), memory (tests only).

**Sampling** — the decision of whether to record a trace. Because every request generating a full trace is expensive at scale, Jaeger supports several strategies to reduce volume while keeping useful data.

**Service Map** — Jaeger's visualization of which services call which other services, derived from the parent-child relationships in collected spans. Also called the dependency graph.

**SPM — Service Performance Monitoring** — a Jaeger feature that aggregates span data into RED metrics (rate, error rate, duration percentiles) per service and operation, giving you a metrics-style view without a separate metrics pipeline.

---

## DAY 1 — Get Tracing Working

### 1.1 Run Jaeger All-in-One

The all-in-one binary bundles the agent, collector, query service, and Badger storage into a single process. It is the fastest way to see Jaeger working.

```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 16686:16686 \
  -p 14268:14268 \
  jaegertracing/all-in-one:1.57
```

Port 4317 accepts OTLP gRPC. Port 4318 accepts OTLP HTTP. Port 16686 serves the UI. Port 14268 accepts Jaeger Thrift over HTTP.

Open `http://localhost:16686`. You will see an empty UI waiting for traces.

### 1.2 Instrument a Service with the OTel SDK

Jaeger no longer ships its own SDK. You instrument with OpenTelemetry and export to Jaeger's OTLP endpoint. This is the recommended path as of Jaeger v1.35+.

**Python example:**

```bash
pip install opentelemetry-sdk \
            opentelemetry-exporter-otlp-proto-grpc
```

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
exporter = OTLPSpanExporter(endpoint="http://localhost:4317", insecure=True)
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("checkout-service")

def process_order(order_id: str):
    with tracer.start_as_current_span("process_order") as span:
        span.set_attribute("order.id", order_id)
        validate_payment(order_id)
        reserve_inventory(order_id)

def validate_payment(order_id: str):
    with tracer.start_as_current_span("validate_payment"):
        pass  # your logic here

def reserve_inventory(order_id: str):
    with tracer.start_as_current_span("reserve_inventory"):
        pass  # your logic here
```

**Go example:**

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
    "go.opentelemetry.io/otel/sdk/resource"
)

func initTracer(ctx context.Context) (*sdktrace.TracerProvider, error) {
    exp, err := otlptracegrpc.New(ctx,
        otlptracegrpc.WithInsecure(),
        otlptracegrpc.WithEndpoint("localhost:4317"),
    )
    if err != nil {
        return nil, err
    }
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exp),
        sdktrace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String("checkout-service"),
        )),
    )
    otel.SetTracerProvider(tp)
    return tp, nil
}
```

### 1.3 View Traces in the UI

After sending some requests, go to `http://localhost:16686`.

1. Select your service name from the dropdown.
2. Click **Find Traces**.
3. Click any trace to open the waterfall view.

The waterfall shows every span as a horizontal bar. Width equals duration. Nested bars are child spans. Tags and logs appear in the detail panel below.

Look for: spans that are wide (slow), gaps between spans (network or queue latency), spans with `error=true`.

### 1.4 Service Dependency Graph

In the Jaeger UI, click **System Architecture** in the top nav. Jaeger builds this graph from the parent-child relationships in collected spans. It updates as new traces arrive. This is your first look at the real topology of your system — which often differs from what the architecture diagram says.

---

## DAY 2 — Production-Ready Jaeger

### 2.1 Sampling Strategies

Sampling is the first thing you must configure before production. Recording 100% of traces at any meaningful traffic volume is expensive in CPU, network, and storage.

**Head-based sampling** — the decision is made at the root span, before the trace is complete. Fast and simple, but you may drop slow or errored requests if you sample by probability alone.

**Tail-based sampling** — the decision is made after the full trace is assembled, so you can keep all traces with errors or high latency and drop the rest. Requires buffering spans in memory. The OTel Collector's `tailsampling` processor implements this.

**Jaeger's built-in sampling types:**

| Strategy | Config | Behavior |
|---|---|---|
| Const | `type: const, param: 1` | Always sample (param: 0 = never) |
| Probabilistic | `type: probabilistic, param: 0.01` | Sample 1% of traces randomly |
| Rate-limiting | `type: ratelimiting, param: 100` | Max 100 traces/second |
| Remote | `type: remote` | Pull strategy from Jaeger agent/collector |

### 2.2 Remote Sampling

Remote sampling lets you change sampling rates without redeploying services. The collector serves a sampling config endpoint; clients poll it on startup and periodically thereafter.

```yaml
# jaeger-collector config
sampling:
  strategies-file: /etc/jaeger/sampling.json
```

```json
{
  "service_strategies": [
    {
      "service": "checkout-service",
      "type": "probabilistic",
      "param": 0.1
    },
    {
      "service": "payment-service",
      "type": "ratelimiting",
      "param": 50
    }
  ],
  "default_strategy": {
    "type": "probabilistic",
    "param": 0.01
  }
}
```

This is especially useful during incidents — you can temporarily raise sampling to 100% on a misbehaving service without a deploy.

### 2.3 Production Architecture

All-in-one is not for production. The production topology separates concerns:

```
Services
  |
  v  (OTLP gRPC/HTTP)
OTel Collector  (optional but recommended buffer)
  |
  v  (OTLP or Jaeger Thrift)
Jaeger Collector  (horizontally scalable, stateless)
  |
  v
Storage (Elasticsearch or Cassandra)
  |
  v  (reads)
Jaeger Query + UI  (horizontally scalable, stateless)
```

The OTel Collector in the middle is optional but gives you pipeline flexibility — fan-out to multiple backends, tail-based sampling, attribute filtering — without changing your service code.

Scale the Jaeger Collector horizontally behind a load balancer. It is stateless. Scale Query separately; it is also stateless.

### 2.4 Storage Backends: ES vs Cassandra

**Elasticsearch / OpenSearch** — the most common production choice. Fast full-text search, familiar operational model, good Kubernetes operator support. Index per day by default. At high volume, index rollover and ILM policies are mandatory.

```bash
docker run -d \
  -e SPAN_STORAGE_TYPE=elasticsearch \
  -e ES_SERVER_URLS=http://elasticsearch:9200 \
  jaegertracing/jaeger-collector:1.57
```

Key tuning options: `--es.num-shards`, `--es.num-replicas`, `--es.index-prefix`. Enable `--es.use-ilm` for automatic index lifecycle management to prevent unbounded disk growth.

**Cassandra** — Uber's original choice. Excellent write throughput, predictable latency at scale. More complex to operate than Elasticsearch. Best when you already run Cassandra and have the expertise.

**Badger** — embedded key-value store. Zero external dependencies. Use it for local development and single-node demos only. Data lives on local disk with no HA.

**Memory** — no persistence; everything lost on restart. Unit tests only.

**Choosing:** if you already run Elasticsearch for logs, use it for Jaeger too — one less system to operate. If you need maximum write throughput and already run Cassandra, use Cassandra. Otherwise Elasticsearch is the default safe choice.

### 2.5 Service Performance Monitoring (SPM)

SPM aggregates span data into rate, error, and duration (RED) metrics per service and operation. It requires a metrics store — Jaeger reads from Prometheus by default.

The pipeline: Jaeger Collector emits span metrics via the `spanmetrics` connector (or the OTel Collector's `spanmetrics` processor) → Prometheus scrapes them → Jaeger Query reads them for the SPM tab.

```yaml
# otel-collector config snippet
connectors:
  spanmetrics:
    histogram:
      explicit:
        buckets: [2ms, 4ms, 6ms, 8ms, 10ms, 50ms, 100ms, 200ms, 400ms, 800ms, 1s, 2s, 5s, 10s]
    dimensions:
      - name: http.method
      - name: http.status_code

exporters:
  prometheus:
    endpoint: "0.0.0.0:8889"

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [otlp/jaeger, spanmetrics]
    metrics/spanmetrics:
      receivers: [spanmetrics]
      exporters: [prometheus]
```

With SPM enabled, the Jaeger UI shows p50/p75/p95/p99 latency and error rates per operation alongside trace search, reducing the round-trip between metrics dashboards and trace queries.

### 2.6 Jaeger vs Tempo vs Zipkin

You will encounter these alternatives. Here is an honest comparison.

**Zipkin** — the original open-source distributed tracing system. Simpler than Jaeger, smaller feature set, mature. If you are already on Zipkin and it meets your needs, there is no urgent reason to migrate. Jaeger has a better UI, remote sampling, and more active development.

**Grafana Tempo** — trace storage backend designed for cost-efficient object storage (S3, GCS, Azure Blob). No index, searches by trace ID or via TraceQL. Pairs tightly with Grafana, Loki, and Prometheus via exemplars. If your team lives in Grafana and you want to minimize operational cost, Tempo is worth serious consideration.

**Jaeger** — better out-of-the-box UI, service map, SPM, remote sampling, more mature query API. Requires a real storage backend with associated operational overhead.

The practical rule: if you use the Grafana stack (Loki, Mimir/Prometheus, Grafana), evaluate Tempo first. If you want a standalone tracing system with a capable UI and your team does not already manage Grafana, Jaeger is the right choice.

### 2.7 Monitoring Jaeger Itself

Jaeger exposes Prometheus metrics on port 14269 (collector) and 16687 (query) by default.

Key metrics to alert on:

```promql
# Spans received vs spans saved — a widening gap means storage pressure
jaeger_collector_spans_received_total
jaeger_collector_spans_saved_total

# Spans dropped — non-zero means you are losing trace data
jaeger_collector_spans_dropped_total

# Queue depth — spikes indicate the collector cannot keep up with ingestion
jaeger_collector_queue_length
```

Health endpoint: `GET /` on port 14269 returns HTTP 200 when the collector is healthy. Use this for Kubernetes readiness probes.

---

## Worked Example — Tracing a Slow Checkout Flow

Your checkout endpoint averages 3.2 seconds. You want to find out why.

**Step 1: Find the slow traces.**

In the Jaeger UI, select `checkout-service`, set Min Duration to `2s`, click Find Traces. You see twelve traces in the last hour that exceeded 2 seconds.

**Step 2: Open the worst trace.**

Click the 4.1-second trace. The waterfall shows:

```
checkout-service: handle_checkout          4100ms
  ├─ checkout-service: validate_cart         12ms
  ├─ payment-service: charge_card           180ms
  ├─ inventory-service: reserve_items      3850ms   ← ⚠️
  │    ├─ inventory-service: db_query        45ms
  │    ├─ inventory-service: lock_row       3780ms   ← ⚠️
  │    └─ inventory-service: update_stock    25ms
  └─ notification-service: send_email        58ms
```

**Step 3: Inspect the slow span.**

Click `lock_row`. Tags show:

```
db.system: postgresql
db.statement: SELECT ... FOR UPDATE
lock.wait_time_ms: 3780
```

**Step 4: Cross-reference with logs.**

The span has a log event at t+45ms: `"waiting for row lock on inventory.items WHERE sku='SKU-9921'"`. Another service is holding a long transaction on that row.

**Step 5: Fix.**

You find that the recommendation engine runs a long read transaction on the same rows during checkout. You add a read-committed isolation level to the recommendation query. The lock contention disappears.

Without the trace, you would have suspected the payment service, the network, or the database host — and the real cause, an unrelated service holding a lock, would have been invisible.

---

## Pitfalls

**Not propagating context across async boundaries** — if you publish to a message queue without injecting the trace context into the message headers, the consumer starts a new root span and your trace breaks. Always inject SpanContext into Kafka/SQS/RabbitMQ message attributes. OTel provides `TextMapPropagator` for this.

**Sampling too aggressively before you understand your traffic** — setting `param: 0.001` on day one means errored requests may not get sampled. Start at 10–100% in development, profile storage cost, then tune down. Use tail-based sampling to ensure errors are always captured regardless of the probability setting.

**Using all-in-one in production** — Badger does not replicate. One node failure loses all traces. All-in-one also mixes collector, query, and storage on one process — one component under load starves the others.

**Ignoring cardinality in span attributes** — adding `user.id` or raw `request.url` with unbounded values to every span explodes your Elasticsearch index field count and your SPM metrics cardinality. Keep high-cardinality values in span logs (timestamped events), not span tags used for aggregation.

**Forgetting to set `service.name` in OTel resource attributes** — without this, all spans appear under an empty service name in the UI. Set it via the `OTEL_SERVICE_NAME` environment variable or in the SDK resource config at startup.

**Running Elasticsearch without ILM** — trace data grows linearly with traffic. Without index lifecycle management, you will fill disk and Jaeger will start dropping spans. Enable ILM with a retention policy on day one, not after your first disk-full incident.

**Treating the service map as ground truth** — Jaeger builds the service map from observed traffic. Services that have not received traffic since the last UI load will not appear. Low-traffic paths may be underrepresented. Supplement with your actual architecture documentation.

---

## Quick Reference

```bash
# Run all-in-one for development
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 4317:4317 -p 4318:4318 -p 16686:16686 \
  jaegertracing/all-in-one:1.57

# Check collector health
curl http://localhost:14269/

# Query traces via API — last 20 traces for a service
curl "http://localhost:16686/api/traces?service=checkout-service&limit=20"

# Get a specific trace by ID
curl "http://localhost:16686/api/traces/{traceID}"

# OTel SDK env vars — works for any language
export OTEL_SERVICE_NAME=checkout-service
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_TRACES_SAMPLER=parentbased_traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1

# Jaeger Collector with Elasticsearch
docker run -d \
  -e SPAN_STORAGE_TYPE=elasticsearch \
  -e ES_SERVER_URLS=http://elasticsearch:9200 \
  -p 4317:4317 -p 14269:14269 \
  jaegertracing/jaeger-collector:1.57

# Jaeger Query with Elasticsearch
docker run -d \
  -e SPAN_STORAGE_TYPE=elasticsearch \
  -e ES_SERVER_URLS=http://elasticsearch:9200 \
  -p 16686:16686 \
  jaegertracing/jaeger-query:1.57
```

**Port reference:**

| Port | Protocol | Purpose |
|---|---|---|
| 4317 | gRPC | OTLP trace ingestion |
| 4318 | HTTP | OTLP trace ingestion |
| 14268 | HTTP | Jaeger Thrift ingestion |
| 14269 | HTTP | Collector admin / health / metrics |
| 16686 | HTTP | Jaeger UI and query API |
| 16687 | HTTP | Query admin / health / metrics |
| 6831 | UDP | Jaeger agent Thrift compact |
| 6832 | UDP | Jaeger agent Thrift binary |

---

## Next Steps

- `OpenTelemetry.md` — the instrumentation layer that feeds Jaeger; understand propagation, context, and the collector pipeline
- `Tempo.md` — evaluate the Grafana-native alternative, especially if you use Loki and Grafana already
- `Grafana.md` — connect Jaeger as a datasource, correlate traces with logs and metrics, build unified dashboards
- `Prometheus.md` — the metrics backend for Jaeger's SPM feature and for monitoring Jaeger itself

---

## Recommended learning resources

**YouTube channels & playlists:**
- [CNCF — KubeCon Distributed Tracing Track](https://www.youtube.com/@caborstudio) — conference talks on Jaeger architecture, sampling strategies, and production deployments
- [Grafana Labs — Tracing with Jaeger & Tempo](https://www.youtube.com/@GrafanaLabs) — comparing tracing backends and integrating Jaeger as a Grafana datasource
- [OpenTelemetry Official — Instrumentation for Jaeger](https://www.youtube.com/@oaborstudio) — OTel SDK and Collector talks that apply directly to Jaeger ingestion
- [DevOps Toolkit (Viktor Farcic) — Jaeger vs Tempo](https://www.youtube.com/@DevOpsToolkit) — practical tracing tool comparisons with real-world Kubernetes setups
- [TechWorld with Nana — Distributed Tracing Explained](https://www.youtube.com/@TechWorldwithNana) — beginner-friendly introduction to tracing concepts and Jaeger setup

**Official docs & blogs:**
- [Jaeger Official Documentation](https://www.jaegertracing.io/docs/)
- [Jaeger GitHub — Architecture & Deployment](https://github.com/jaegertracing/jaeger) — source code, deployment guides, and issue discussions
- [OpenTelemetry Documentation — Traces](https://opentelemetry.io/docs/concepts/signals/traces/) — the instrumentation standard that feeds Jaeger

## The Mantra

A trace is a story. Every span is a sentence. If you cannot read the story of a single request end-to-end, you are not debugging — you are guessing.

Instrument everything. Sample intelligently. Store long enough to catch the slow Mondays. When something breaks at 2 AM, the trace will tell you exactly which sentence in the story went wrong.
