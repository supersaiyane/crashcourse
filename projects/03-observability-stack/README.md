# Project 3: Full Observability Stack

**App:** ObservaShop — an e-commerce microservices platform (order-svc, payment-svc, inventory-svc, gateway)

**What you'll build:** A complete observability stack from scratch — metrics, logs, traces, dashboards, alerts, and long-term storage. By the end, you'll have four instrumented microservices with full end-to-end visibility: Prometheus scraping metrics, Loki aggregating logs, Tempo correlating traces, Grafana unifying everything, Alertmanager routing alerts, OpenTelemetry standardising telemetry, and Mimir storing it all long-term.

**Tier:** Foundation (1-3 years experience)

**Duration:** 6-8 weeks

**Courses covered:** Prometheus, Loki, Tempo, Grafana, Alertmanager, OpenTelemetry, Mimir

## Stages

| # | Stage | Course | What you'll do |
|---|-------|--------|---------------|
| 1 | Prometheus Metrics | `Prometheus.md` | Instrument the app, configure scrape targets, write PromQL queries |
| 2 | Loki Logs | `Loki.md` | Structured logging, log aggregation, LogQL queries |
| 3 | Tempo Traces | `Tempo.md` | Distributed tracing, trace-to-log correlation |
| 4 | Grafana Dashboards | `Grafana.md` | Unified dashboards with variables and drill-downs |
| 5 | Alertmanager | `Alertmanager.md` | Alert routing, silences, escalation policies |
| 6 | OpenTelemetry | `OpenTelemetry.md` | OTel SDK, collector pipelines, auto-instrumentation |
| 7 | Mimir Long-Term | `Mimir.md` | Long-term metric storage, multi-tenancy |

## The app: ObservaShop

A simplified e-commerce backend with four services:

```text
                    ┌──────────┐
        HTTP ──────>│ Gateway  │
                    └────┬─────┘
              ┌──────────┼──────────┐
              v          v          v
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Order    │ │ Payment  │ │ Inventory │
        │ Service  │ │ Service  │ │ Service   │
        └──────────┘ └──────────┘ └──────────┘
```

- **Gateway** (Python/Flask, port 8080) — routes requests, fan-out to downstream services
- **Order Service** (Python/Flask, port 8081) — creates and tracks orders
- **Payment Service** (Python/Flask, port 8082) — processes payments (simulated)
- **Inventory Service** (Python/Flask, port 8083) — manages stock levels

Each service exposes a `/metrics` endpoint (Prometheus format), emits structured JSON logs, and propagates trace context via W3C traceparent headers.

## Getting started

```bash
cd ObservaShop
docker-compose up -d
```

This starts all four services plus the observability stack (Prometheus, Loki, Tempo, Grafana).

Then work through each stage in order — start at `stages/01-prometheus-metrics/README.md`.
