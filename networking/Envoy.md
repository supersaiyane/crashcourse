# Envoy — A 2-Day Crash Course

Envoy is a high-performance L4/L7 proxy designed for service mesh and modern microservices — the data plane behind Istio, Ambassador, and most service meshes.

---

## Part 0 — Why Envoy Exists

Nginx and HAProxy are excellent proxies. They've served the industry well. But they were designed for a different era — one with static config files, human operators, and monolithic services.

When you move to microservices, three things change:

**Service discovery is dynamic.** You no longer know at deploy time which IP addresses are running your upstream service. Kubernetes replaces pods constantly. Nginx's `upstream` block doesn't refresh unless you reload. Envoy treats this as a first-class concern — its cluster membership is driven by APIs, not files.

**Observability becomes the product.** In a monolith, one service fails and you look at one log. In a mesh, a request crosses a dozen services. You need per-request tracing, per-route latency histograms, and circuit breaker state — baked into the proxy, not bolted on after. Envoy emits all of this by default.

**The proxy must run as a sidecar.** Next to every pod, every container — not as a shared edge node. Nginx wasn't designed for this deployment model. It has no native notion of a management plane pushing config at runtime. Envoy was designed from day one to receive config via gRPC APIs while running.

That's the gap Envoy fills. Once you understand it, you'll see why Istio, Consul Connect, and Ambassador all chose it as their data plane rather than building their own.

---

## Vocabulary

Before you touch a config file, commit these terms to memory. Envoy has precise definitions that differ from other proxies.

**Listener** — The thing that binds to an address and port and accepts incoming connections. A listener defines what Envoy receives. You can have multiple listeners on different ports.

**Cluster** — A named group of upstream hosts that Envoy can forward requests to. A cluster holds the load-balancing policy, health check config, and TLS settings for connecting to a backend. Think of it as Envoy's representation of a service.

**Route** — A rule that maps an incoming request (matched by virtual host, path, headers, etc.) to a cluster. Routes live inside a route configuration, which is attached to a listener via an HTTP connection manager filter.

**Endpoint** — A single IP:port within a cluster. A cluster named `backend` might have three endpoints: `10.0.0.1:8080`, `10.0.0.2:8080`, `10.0.0.3:8080`.

**Filter** — A processing unit in the filter chain. Envoy processes each connection and request through a chain of filters. Network filters handle raw bytes (e.g., `tcp_proxy`). HTTP filters handle HTTP semantics (e.g., `router`, `rate_limit`, `jwt_authn`). Filters compose — you stack them.

**xDS (x Discovery Service)** — The family of gRPC APIs Envoy uses to receive dynamic configuration. The "x" is a placeholder: LDS (Listener DS), CDS (Cluster DS), RDS (Route DS), EDS (Endpoint DS), SDS (Secret DS). A management plane like Istiod pushes xDS updates to Envoy at runtime without restarts.

**Upstream** — The service behind Envoy that receives forwarded requests. When a client calls Envoy, Envoy is the proxy; the service it calls is upstream.

**Downstream** — The client connecting to Envoy. The browser, the other microservice, the CLI — whoever initiated the connection is downstream.

**Admin API** — A local HTTP server (typically port 9901) that Envoy exposes for introspection. You can query live config, cluster health, stats, and drain connections through it.

**Access Log** — Per-request log emitted after each request completes. Configurable format, configurable destination (stdout, file, gRPC access log service). Includes upstream latency, response code, bytes transferred, and any custom headers you want.

---

## DAY 1 — Static Configuration, Core Concepts

### Install

The fastest way to get Envoy running locally:

```bash
# Docker — the standard path
docker pull envoyproxy/envoy:v1.29-latest

# Or via Homebrew on macOS
brew install envoy

# Verify
envoy --version
```

For everything in Day 1, Docker is fine. You'll mount a config file and run it directly.

### The Static Config Model

Envoy's config is YAML (or JSON). A minimal static config has three sections: `static_resources` (listeners and clusters), `admin`, and optionally `layered_runtime`.

Create `envoy.yaml`:

```yaml
admin:
  address:
    socket_address:
      address: 0.0.0.0
      port_value: 9901

static_resources:
  listeners:
    - name: listener_0
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 10000
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: ingress_http
                access_log:
                  - name: envoy.access_loggers.stdout
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match:
                            prefix: "/"
                          route:
                            cluster: service_backend
                            timeout: 15s
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  clusters:
    - name: service_backend
      connect_timeout: 0.25s
      type: LOGICAL_DNS
      dns_lookup_family: V4_ONLY
      load_assignment:
        cluster_name: service_backend
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: httpbin.org
                      port_value: 80
```

Run it:

```bash
docker run --rm \
  -v $(pwd)/envoy.yaml:/etc/envoy/envoy.yaml \
  -p 10000:10000 \
  -p 9901:9901 \
  envoyproxy/envoy:v1.29-latest

# Test it
curl -v http://localhost:10000/get
```

You should see the httpbin response proxied through Envoy.

### Admin Interface

With Envoy running, explore the admin API:

```bash
# Live config dump — everything Envoy currently knows
curl http://localhost:9901/config_dump | jq .

# Cluster health and stats
curl http://localhost:9901/clusters

# Per-stat counters
curl http://localhost:9901/stats

# Filter just HTTP stats
curl "http://localhost:9901/stats?filter=http"

# Ready check (returns 200 when Envoy is initialized)
curl http://localhost:9901/ready

# Drain listeners (graceful shutdown prep)
curl -X POST http://localhost:9901/drain_listeners
```

The admin API is your first debugging tool. Before you grep logs, check `/config_dump` — it shows you exactly what Envoy loaded and whether xDS has applied updates.

### Access Logs

The config above writes access logs to stdout in the default format. You'll see lines like:

```
[2026-05-31T10:00:00.123Z] "GET /get HTTP/1.1" 200 - 0 1234 45 42 "-" "curl/7.88.1" "abc123" "httpbin.org" "34.202.1.1:80"
```

The fields: timestamp, method/path/protocol, response code, response flags, bytes sent, bytes received, duration, upstream duration, referer, user-agent, request ID, authority, upstream host.

You can customize this with `format_string` or use JSON format for structured logging.

---

## DAY 2 — Dynamic Config, Resilience, Observability

### Dynamic Configuration — xDS

Static config works for learning. In production, you want Envoy to receive updates without restarting. That's what xDS is for.

Instead of `static_resources`, you point Envoy at a management plane:

```yaml
dynamic_resources:
  lds_config:
    resource_api_version: V3
    api_config_source:
      api_type: GRPC
      transport_api_version: V3
      grpc_services:
        - envoy_grpc:
            cluster_name: xds_cluster
  cds_config:
    resource_api_version: V3
    api_config_source:
      api_type: GRPC
      transport_api_version: V3
      grpc_services:
        - envoy_grpc:
            cluster_name: xds_cluster

static_resources:
  clusters:
    - name: xds_cluster
      connect_timeout: 1s
      type: STRICT_DNS
      load_assignment:
        cluster_name: xds_cluster
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: control-plane.example.com
                      port_value: 18000
```

The management plane (Istiod, Consul, or your own go-control-plane server) pushes LDS, CDS, RDS, and EDS updates over gRPC. Envoy applies them atomically — no reload, no dropped connections.

For local testing, `go-control-plane` and `envoy-control` are solid reference implementations.

### Health Checks

Envoy can actively health-check upstream endpoints and remove failing ones from the load-balancing pool:

```yaml
clusters:
  - name: service_backend
    connect_timeout: 0.25s
    type: STRICT_DNS
    health_checks:
      - timeout: 1s
        interval: 5s
        unhealthy_threshold: 2
        healthy_threshold: 1
        http_health_check:
          path: "/healthz"
    load_assignment:
      # ...
```

Two consecutive failures eject the endpoint. One success restores it. Combine this with outlier detection (passive health checking based on error rates) for defense in depth.

### Circuit Breaking

Circuit breaking prevents cascade failures. Configure it per cluster:

```yaml
clusters:
  - name: service_backend
    circuit_breakers:
      thresholds:
        - priority: DEFAULT
          max_connections: 1000
          max_pending_requests: 1000
          max_requests: 1000
          max_retries: 3
          track_remaining: true
```

When thresholds are exceeded, Envoy immediately returns a 503 rather than queuing more work upstream. Check the `upstream_cx_overflow` and `upstream_rq_pending_overflow` stats to know when the circuit is tripping.

### Retries

Configure retries at the route level:

```yaml
routes:
  - match:
      prefix: "/"
    route:
      cluster: service_backend
      retry_policy:
        retry_on: "5xx,connect-failure,retriable-4xx"
        num_retries: 3
        per_try_timeout: 5s
        retry_back_off:
          base_interval: 0.1s
          max_interval: 1s
```

`retry_on` accepts a comma-separated list of conditions. Common values: `5xx` (any 5xx response), `connect-failure` (upstream TCP failure), `retriable-4xx` (408 Request Timeout), `reset` (upstream reset connection).

⚠️ Retries amplify load on a struggling upstream. Always set `max_retries` in circuit breakers to cap total concurrent retry attempts across all requests.

### Rate Limiting

Envoy supports local and global rate limiting. Local rate limiting runs in the proxy itself:

```yaml
http_filters:
  - name: envoy.filters.http.local_ratelimit
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
      stat_prefix: http_local_rate_limiter
      token_bucket:
        max_tokens: 1000
        tokens_per_fill: 1000
        fill_interval: 1s
      filter_enabled:
        runtime_key: local_rate_limit_enabled
        default_value:
          numerator: 100
          denominator: HUNDRED
      filter_enforced:
        runtime_key: local_rate_limit_enforced
        default_value:
          numerator: 100
          denominator: HUNDRED
```

For distributed rate limiting, integrate with the external `ratelimit` service via `envoy.filters.http.ratelimit`. The external service uses Redis to coordinate limits across all Envoy instances.

### TLS

Terminate TLS on the listener:

```yaml
filter_chains:
  - transport_socket:
      name: envoy.transport_sockets.tls
      typed_config:
        "@type": type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.DownstreamTlsContext
        common_tls_context:
          tls_certificates:
            - certificate_chain:
                filename: /etc/ssl/certs/server.crt
              private_key:
                filename: /etc/ssl/private/server.key
          alpn_protocols: ["h2,http/1.1"]
```

For mTLS (mutual TLS), add `validation_context` to verify client certificates. In Istio, this entire block is managed by the control plane via SDS — you never touch cert files directly.

### Observability

**Stats to Prometheus:**

Envoy exposes stats in its own format at `/stats`. To expose them as Prometheus metrics, scrape the admin endpoint directly:

```bash
curl http://envoy:9901/stats/prometheus
```

Key metrics to watch:

- `envoy_cluster_upstream_rq_total` — request count per cluster
- `envoy_cluster_upstream_rq_time` — latency histogram per cluster
- `envoy_cluster_upstream_cx_active` — active connections per cluster
- `envoy_http_downstream_rq_5xx` — 5xx errors on the listener
- `envoy_cluster_circuit_breakers_default_rq_open` — circuit breaker state

**Distributed Tracing:**

Envoy integrates with Zipkin, Jaeger, Datadog, and OpenTelemetry. Example with OpenTelemetry:

```yaml
tracing:
  provider:
    name: envoy.tracers.opentelemetry
    typed_config:
      "@type": type.googleapis.com/envoy.config.trace.v3.OpenTelemetryConfig
      grpc_service:
        envoy_grpc:
          cluster_name: opentelemetry_collector
        timeout: 0.250s
      service_name: my-service
```

Envoy propagates `x-b3-traceid`, `x-b3-spanid`, and `x-b3-sampled` headers automatically. Your services need to forward these headers downstream for the trace to be complete — Envoy handles the ingress and egress span, but the middle is up to your code.

### Front Proxy vs Sidecar

These are the two deployment models you'll encounter.

**Front Proxy:** Envoy runs at the edge. All traffic enters through it. It handles TLS termination, routing, rate limiting, and auth before traffic reaches any service. One Envoy instance (or a small cluster) serves the entire application. Ambassador and Contour use this model.

**Sidecar:** Envoy runs as a container alongside every application pod. It intercepts all inbound and outbound traffic via iptables rules. Each service gets its own proxy. Observability is per-service. Policy is per-service. This is how Istio deploys Envoy — as the data plane in a service mesh.

The tradeoffs:

| Concern | Front Proxy | Sidecar |
|---|---|---|
| Operational complexity | Low | High |
| Blast radius of misconfiguration | High | Low |
| Per-service policy | Hard | Easy |
| Latency added | ~0.5ms at edge | ~1ms per hop |
| Visibility | Edge only | Every service |

Start with front proxy. Graduate to sidecar when you genuinely need per-service observability and policy.

### WASM Filters

WebAssembly filters let you write custom logic in C++, Rust, Go, or AssemblyScript and load it into Envoy at runtime without recompiling. The filter runs in a sandbox — it can read and modify headers, access shared data, and call external services.

```yaml
http_filters:
  - name: envoy.filters.http.wasm
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.filters.http.wasm.v3.Wasm
      config:
        name: "my_plugin"
        vm_config:
          runtime: "envoy.wasm.runtime.v8"
          code:
            local:
              filename: "/etc/envoy/filters/my_plugin.wasm"
```

WASM filters are how Istio extensions work. They're also how you add custom auth, header manipulation, or request transformation without forking Envoy.

⚠️ WASM filter performance is meaningfully worse than native Envoy filters on hot paths. Benchmark before deploying to high-throughput routes.

---

## Worked Example — Front Proxy with Circuit Breaking and Retries

Scenario: you have two upstream services. `api-v1` is stable. `api-v2` is a new deployment that occasionally returns 503. You want Envoy to retry once on 5xx, circuit-break if the service is overwhelmed, and expose metrics to Prometheus.

```yaml
admin:
  address:
    socket_address:
      address: 127.0.0.1
      port_value: 9901

static_resources:
  listeners:
    - name: http_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 8080
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: ingress_http
                access_log:
                  - name: envoy.access_loggers.stdout
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
                route_config:
                  name: main_route
                  virtual_hosts:
                    - name: api_service
                      domains: ["*"]
                      routes:
                        - match:
                            prefix: "/v2"
                          route:
                            cluster: api_v2
                            timeout: 10s
                            retry_policy:
                              retry_on: "5xx,connect-failure"
                              num_retries: 1
                              per_try_timeout: 4s
                        - match:
                            prefix: "/"
                          route:
                            cluster: api_v1
                            timeout: 10s
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  clusters:
    - name: api_v1
      connect_timeout: 0.5s
      type: STRICT_DNS
      health_checks:
        - timeout: 1s
          interval: 10s
          unhealthy_threshold: 3
          healthy_threshold: 1
          http_health_check:
            path: "/healthz"
      load_assignment:
        cluster_name: api_v1
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: api-v1
                      port_value: 8080

    - name: api_v2
      connect_timeout: 0.5s
      type: STRICT_DNS
      circuit_breakers:
        thresholds:
          - priority: DEFAULT
            max_connections: 512
            max_pending_requests: 512
            max_requests: 512
            max_retries: 5
      outlier_detection:
        consecutive_5xx: 5
        interval: 10s
        base_ejection_time: 30s
        max_ejection_percent: 50
      load_assignment:
        cluster_name: api_v2
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: api-v2
                      port_value: 8080
```

What this config does:

- Routes `/v2/*` to `api-v2`, everything else to `api-v1`
- Retries `api-v2` once on 5xx or connection failure
- Ejects endpoints from `api-v2` after 5 consecutive 5xx errors (outlier detection)
- Circuit-breaks `api-v2` at 512 concurrent requests
- Health-checks `api-v1` every 10 seconds
- Binds admin to localhost only — not exposed publicly

Test the circuit breaker by sending traffic while `api-v2` returns 503:

```bash
# Watch circuit breaker stats live
watch -n1 'curl -s http://localhost:9901/stats | grep "circuit_breakers\|overflow"'
```

---

## Pitfalls

**Using v2 API types in v3 config.** Envoy is on v3. The `@type` fields must reference `envoy.extensions.*` and `envoy.config.*.v3.*` paths. Mixing v2 and v3 type URLs causes cryptic parse errors at startup.

**Forgetting `stat_prefix`.** Every `http_connection_manager` and many other components require a `stat_prefix`. It's how Envoy namespaces its stats. Omitting it causes a validation error that doesn't always clearly say why.

**Retries without circuit breaker `max_retries`.** Retries multiply load. If every request retries three times and upstream is down, you've tripled your request rate to a failing service. Always pair retry policy with `max_retries` in `circuit_breakers.thresholds`.

**Timeout misconfiguration.** Envoy has multiple timeout scopes: `connect_timeout` (TCP handshake to upstream), `timeout` (total request duration), `per_try_timeout` (per retry attempt), and `idle_timeout` (connection idle time). Setting only one and leaving the others at defaults — often 15s, or 0 which means infinity — leads to requests hanging longer than you expect.

**LOGICAL_DNS vs STRICT_DNS vs STATIC.** `LOGICAL_DNS` resolves the hostname once and uses that IP until the cluster is updated — wrong for Kubernetes where pod IPs change. `STRICT_DNS` re-resolves continuously and uses all returned A records — correct for Kubernetes headless services. `STATIC` uses a fixed list of endpoints you provide.

**Missing `host` header rewrite.** When Envoy proxies to a cluster, it forwards the original `Host` header. If your upstream validates the `Host` header, you need `auto_host_rewrite: true` or an explicit `host_rewrite_literal` in the route action.

**Admin API exposed publicly.** The admin API has no authentication. Never bind it to a public interface. Bind to `127.0.0.1` or an internal network only. It can drain listeners, change runtime config, and expose internal state you don't want public.

---

## Quick Reference

```bash
# Start Envoy with a config file
envoy -c /path/to/envoy.yaml

# Validate config without starting
envoy --mode validate -c envoy.yaml

# Config dump (live)
curl http://localhost:9901/config_dump

# Cluster membership and health
curl http://localhost:9901/clusters

# All stats
curl http://localhost:9901/stats

# Prometheus-format stats
curl http://localhost:9901/stats/prometheus

# Adjust logging level for a component
curl -X POST "http://localhost:9901/logging?http=debug"

# Drain listeners (graceful shutdown)
curl -X POST http://localhost:9901/drain_listeners

# Reset all stats counters
curl -X POST http://localhost:9901/reset_counters

# Ready check
curl http://localhost:9901/ready
```

Key stats to know:

| Stat | Meaning |
|---|---|
| `cluster.<name>.upstream_rq_total` | Total requests sent to cluster |
| `cluster.<name>.upstream_rq_time` | Latency histogram |
| `cluster.<name>.upstream_cx_active` | Active connections |
| `cluster.<name>.upstream_rq_pending_total` | Requests queued |
| `cluster.<name>.upstream_rq_retry` | Retry attempts |
| `cluster.<name>.circuit_breakers.default.rq_open` | Circuit breaker open flag |
| `cluster.<name>.upstream_rq_5xx` | 5xx responses from upstream |
| `http.<stat_prefix>.downstream_rq_total` | Total downstream requests |
| `http.<stat_prefix>.downstream_rq_time` | Downstream request latency |

---

## Next Steps

Once this is solid, continue with:

- `Nginx.md` — understand what Envoy replaces and when Nginx is still the right choice
- `Istio.md` — Envoy as a managed sidecar with a full control plane
- `Kubernetes.md` — the environment Envoy typically runs in
- `HTTP.md` — HTTP/2 and gRPC, which Envoy handles natively and which matter for mesh performance

---

## Recommended learning resources

**YouTube channels & playlists:**
- [CNCF — Envoy Proxy talks (KubeCon)](https://www.youtube.com/@cncf) — maintainer presentations on xDS, filter chains, and production deployment patterns
- [Hussein Nasser — Envoy and Service Mesh](https://www.youtube.com/@haboread) — deep dives on L4/L7 proxying, circuit breaking, and how Envoy compares to Nginx and HAProxy
- [Fireship — Service Mesh Explained](https://www.youtube.com/@Fireship) — quick conceptual overview of where Envoy fits in the mesh architecture
- [Tetrate — Envoy Fundamentals](https://www.youtube.com/@Tetrate) — structured course on Envoy configuration, clusters, routes, and observability
- [Computerphile — Proxy Servers](https://www.youtube.com/@Computerphile) — foundational concepts on forward and reverse proxies that contextualise Envoy's role

**Official docs & blogs:**
- [Envoy Proxy Official Documentation](https://www.envoyproxy.io/docs/envoy/latest/) — architecture overview, configuration reference, and xDS API specification
- [Envoy Blog](https://blog.envoyproxy.io/) — release notes, production case studies, and performance benchmarking
- [Tetrate — Learn Envoy](https://www.tetrate.io/learn-envoy/) — guided tutorials from basic routing to advanced traffic management

---

## The Mantra

> Envoy doesn't hide complexity — it makes complexity observable. Every timeout, every retry, every circuit trip is a metric. Your job is to read those metrics and set the right thresholds. The proxy tells you what's happening; you decide what to do about it.

`Reads: 1/4. Tier reached: PEAK. Lessons added: 0.`
