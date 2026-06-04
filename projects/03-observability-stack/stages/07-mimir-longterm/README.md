# Stage 7: Mimir Long-Term Storage

**Goal:** Configure Grafana Mimir for long-term metric storage, multi-tenancy, and high-availability — graduating from local Prometheus TSDB to production-grade storage.

**Prerequisites:** Stages 1-6 complete.

---

## 1. Theory (What & Why)

### The problem with local Prometheus

Prometheus stores data on local disk (TSDB). This works for days to weeks, but:
- **Disk fills up** — default retention is 15 days
- **No HA** — if the Prometheus pod dies, you lose recent data
- **No multi-tenancy** — one Prometheus per team/environment, separate dashboards
- **No global view** — can't query across clusters

### Why Mimir?

Mimir is a horizontally scalable, multi-tenant, long-term storage backend for Prometheus. It's Prometheus-compatible — your existing PromQL, recording rules, and alerts work unchanged.

```text
┌─────────────┐   remote_write   ┌──────────┐    query    ┌─────────┐
│  Prometheus  │ ───────────────> │  Mimir    │ <──────────│ Grafana  │
│  (short-term)│                 │ (S3/GCS)  │            │         │
└─────────────┘                 └──────────┘            └─────────┘
```

Key features:
- **Long-term retention** — months to years, stored in object storage (S3, GCS, Azure Blob)
- **Multi-tenancy** — isolate teams via `X-Scope-OrgID` header
- **Global view** — query across all Prometheus instances
- **HA** — replicated ingesters, deduplication

### Architecture (simplified)

| Component | Job |
|-----------|-----|
| **Distributor** | Receives samples via remote_write, validates, forwards to ingesters |
| **Ingester** | Writes to in-memory + WAL, flushes to object storage |
| **Querier** | Reads from ingesters (recent) + object storage (old) |
| **Compactor** | Merges and deduplicates blocks in object storage |
| **Store-gateway** | Serves queries against long-term blocks |

---

## 2. Hands-On

### 2.1 Configure Prometheus remote_write

Add to `ObservaShop/prometheus.yml`:

```yaml
remote_write:
  - url: http://mimir:9009/api/v1/push
    headers:
      X-Scope-OrgID: observashop
```

This sends all metrics to Mimir while Prometheus continues to serve short-term queries locally.

### 2.2 Add Mimir as a Grafana datasource

In Grafana → Data Sources → Add → Prometheus:
- Name: `Mimir`
- URL: `http://mimir:9009/prometheus`
- Custom header: `X-Scope-OrgID: observashop`

Now you can query Mimir with the same PromQL — it has all historical data.

### 2.3 Compare retention

- **Prometheus:** last 15 days (local TSDB)
- **Mimir:** unlimited (object storage)

Query the same metric in both datasources with a 30-day range. Prometheus returns nothing beyond 15 days. Mimir has it all.

### 2.4 Multi-tenancy

Different teams can send metrics with different `X-Scope-OrgID` values. Each tenant's data is completely isolated — team A cannot query team B's metrics.

```yaml
# Team payments
remote_write:
  - url: http://mimir:9009/api/v1/push
    headers:
      X-Scope-OrgID: payments-team

# Team platform
remote_write:
  - url: http://mimir:9009/api/v1/push
    headers:
      X-Scope-OrgID: platform-team
```

---

## 3. Key patterns

### Recording rules in Mimir

Move expensive PromQL queries to recording rules — Mimir evaluates them once, stores the result as a new time series:

```yaml
groups:
  - name: observashop.recordings
    rules:
      - record: observashop:request_rate:5m
        expr: sum(rate(gateway_requests_total[5m])) by (endpoint)
      - record: observashop:error_rate:5m
        expr: sum(rate(gateway_requests_total{status=~"4..|5.."}[5m])) / sum(rate(gateway_requests_total[5m]))
```

### Mimir vs Thanos

Both solve long-term storage. Key difference:
- **Mimir:** Push-based (remote_write). Simpler to operate. Grafana-native.
- **Thanos:** Sidecar-based (uploads TSDB blocks). More complex. CNCF project.

For Grafana-centric stacks, Mimir is the natural choice.

---

## 4. What you've built

Across all 7 stages, you now have:

```text
ObservaShop ──> Prometheus (metrics) ──> Mimir (long-term)
           ──> Loki (logs)                     │
           ──> Tempo (traces)                  v
                     │                    Grafana (dashboards)
                     └──> Alertmanager (routing)
                     └──> OTel Collector (unified pipeline)
```

This is a production-grade observability stack. The same architecture runs at companies processing millions of requests per second.

---

## Exercises

1. [Exercise 1 — Configure remote_write to Mimir](exercises/01-remote-write.md)
2. [Exercise 2 — Multi-tenant queries](exercises/02-multi-tenant.md)

**Congratulations — you've completed the Full Observability Stack project.**
