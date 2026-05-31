# Cloud-Native Patterns — A 2-Day Crash Course

Cloud-native patterns are the architectural building blocks for applications designed to run on Kubernetes and cloud platforms — sidecar, ambassador, adapter, init container, and the patterns that make containers composable.

---

## Part 0 — Why This Matters

The container changed the unit of deployment. Before it, you shipped applications. After it, you ship processes — isolated, reproducible, composable. That shift sounds small. It is not.

When your unit is a process in a container, everything downstream changes: how you configure, how you log, how you route traffic, how you initialize dependencies, how you handle failure. The cloud-native patterns in this document are the community's accumulated answers to those questions. The CNCF ecosystem — Kubernetes, Istio, Prometheus, Fluentd, Envoy — is built around these patterns. If you understand the patterns first, the tooling makes sense. If you skip the patterns, you end up cargo-culting YAML.

Two days. Day 1 covers how to make a single pod work well. Day 2 covers how to make a fleet of services work together.

---

## Vocabulary

**Sidecar** — A secondary container in the same pod that augments the primary container without modifying it. Shares the pod's network namespace and volumes.

**Ambassador** — A sidecar that proxies outbound connections from the main container to external services. The main container talks to localhost; the ambassador handles service discovery, retries, and protocol translation.

**Adapter** — A sidecar that normalizes the output of the main container to a standard interface expected by the platform. Example: transforming a legacy log format into JSON for a centralized log aggregator.

**Init Container** — A container that runs to completion before any app container in the pod starts. Used for setup tasks: database migrations, secret fetching, config rendering.

**Leader Election** — A pattern where multiple replicas of a service coordinate to designate exactly one active leader, preventing split-brain on tasks that must not run in parallel.

**Work Queue** — Producers push tasks to a durable queue; a pool of workers pull and process them independently. Decouples rate of arrival from rate of processing.

**Scatter/Gather** — A fan-out pattern. One coordinator dispatches sub-requests to N workers in parallel, collects results, and merges them into a single response.

**Multi-Container Pod** — A Kubernetes pod running more than one container, where containers share the same network and can share volumes. The foundation for sidecar, ambassador, and adapter patterns.

**Service Discovery** — The mechanism by which services locate each other at runtime without hardcoded addresses. In Kubernetes this is handled by DNS + kube-proxy + optional service mesh.

**Health Check Pattern** — Exposing `/healthz` (liveness) and `/readyz` (readiness) endpoints so the platform can determine whether a container is alive and ready to serve traffic.

**Anti-Corruption Layer** — A translation boundary between two systems with incompatible models. Prevents a legacy system's domain concepts from leaking into a new system's model.

---

## DAY 1 — Container and Pod-Level Patterns

### 1.1 Health Checks

Every container you deploy should expose two HTTP endpoints.

**Liveness probe** — answers the question: is this container broken beyond recovery? If it fails, Kubernetes restarts the container.

**Readiness probe** — answers the question: is this container ready to serve traffic right now? If it fails, Kubernetes removes the pod from the service's endpoints but does not restart it.

These are not the same thing. A container can be alive but not ready — for example, during a cold start while it loads a large ML model. Getting this distinction wrong causes cascading failures during deployments and under load.

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 15
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 2
```

A startup probe is a third option — use it when containers take a long time to initialize and you do not want the liveness probe killing them before they are ready.

### 1.2 Graceful Shutdown

When Kubernetes terminates a pod, it sends `SIGTERM`. Your process has `terminationGracePeriodSeconds` (default 30) to finish in-flight requests before `SIGKILL` arrives.

What graceful shutdown looks like in practice:
1. Receive `SIGTERM`.
2. Stop accepting new connections (remove yourself from load balancing — readiness probe fails).
3. Drain in-flight requests.
4. Release resources: close DB connections, flush buffers, unregister from registries.
5. Exit with code 0.

If your process ignores `SIGTERM` and dies to `SIGKILL`, you drop requests and leave dangling connections. This is one of the most common sources of 5xx errors during rolling deployments.

### 1.3 Config Injection

The Twelve-Factor App says: store config in the environment. Kubernetes gives you two mechanisms.

**Environment variables** — good for simple scalar values (feature flags, mode strings, service URLs).

**ConfigMaps and Secrets mounted as volumes** — good for structured config files, TLS certificates, and anything that benefits from being a file.

Never bake config into the container image. The same image must be deployable to staging and production by changing only the config. If you build separate images per environment, you have broken this principle and you will pay for it during incident response.

```yaml
env:
  - name: DB_HOST
    valueFrom:
      secretKeyRef:
        name: db-credentials
        key: host
volumeMounts:
  - name: app-config
    mountPath: /etc/app
    readOnly: true
volumes:
  - name: app-config
    configMap:
      name: app-config
```

### 1.4 Sidecar Pattern

The sidecar augments the main container without modifying it. The main container does one thing. The sidecar does the cross-cutting concern.

**Logging sidecar** — The app writes logs to stdout or a shared volume. The sidecar (Fluentd, Fluent Bit, Filebeat) tails that volume and ships logs to Elasticsearch or Loki. You never change the app to support a new logging backend — you swap the sidecar.

**Proxy sidecar** — Envoy or Linkerd injects a sidecar that intercepts all inbound and outbound traffic. This is how Istio works. The app thinks it is talking directly to other services; the sidecar handles mTLS, retries, circuit breaking, and observability.

```yaml
containers:
  - name: app
    image: myapp:1.0
    ports:
      - containerPort: 8080
  - name: log-shipper
    image: fluent/fluent-bit:2.1
    volumeMounts:
      - name: log-volume
        mountPath: /var/log/app
volumes:
  - name: log-volume
    emptyDir: {}
```

The key constraint: sidecars share the pod lifecycle. They start when the pod starts and die when the pod dies. If you need a more loosely coupled relationship, you want a separate service, not a sidecar.

### 1.5 Ambassador Pattern

Your app needs to talk to a Redis cluster, a legacy database that requires connection pooling, or an external API that requires OAuth token refresh. You do not want that complexity in your app.

The ambassador container sits in the same pod and listens on localhost. Your app connects to `localhost:6379` and thinks it is talking to Redis directly. The ambassador handles the cluster topology, connection pooling, failover, and anything else the app should not know about.

This is particularly useful during migrations. You can point the ambassador at the old system, the new system, or both — without touching the app container.

```yaml
containers:
  - name: app
    image: myapp:1.0
    env:
      - name: REDIS_URL
        value: "localhost:6379"
  - name: redis-ambassador
    image: envoyproxy/envoy:v1.28
    # Envoy config handles upstream cluster discovery
```

### 1.6 Adapter Pattern

You have a container that emits metrics in a format nobody else uses — say, a legacy Java app that outputs StatsD. Your platform expects Prometheus `/metrics`. You cannot modify the app.

The adapter sidecar reads the old format and exposes the standard format. The platform sees a standard Prometheus endpoint. The app is unchanged.

This pattern extends to log format normalization (structured JSON vs. unstructured text), health check protocol translation (TCP vs. HTTP), and API schema transformation.

### 1.7 Init Containers

Init containers run sequentially, to completion, before any app container starts. Each one must exit 0 before the next begins.

Use them for:
- Waiting for a dependency (database, message broker) to be ready before starting the app.
- Running database migrations exactly once per pod start.
- Fetching secrets from Vault and writing them to a shared volume.
- Rendering config templates with environment-specific values.
- Seeding a local cache.

```yaml
initContainers:
  - name: wait-for-db
    image: busybox:1.36
    command: ['sh', '-c', 'until nc -z postgres-service 5432; do sleep 2; done']
  - name: run-migrations
    image: myapp:1.0
    command: ['./migrate', '--up']
    env:
      - name: DB_URL
        valueFrom:
          secretKeyRef:
            name: db-credentials
            key: url
containers:
  - name: app
    image: myapp:1.0
```

⚠️ Init containers share the same pod spec restart policy. If an init container keeps failing, the pod enters `CrashLoopBackOff`. Make sure your init containers are idempotent — they may run more than once.

---

## DAY 2 — Distributed System Patterns

### 2.1 Service Discovery

In Kubernetes, service discovery is largely solved for you — but you need to understand the layers.

**DNS-based discovery** — A Service object creates a DNS entry (`my-service.my-namespace.svc.cluster.local`). Pods resolve this name to the service's ClusterIP. kube-proxy routes traffic from ClusterIP to healthy pod endpoints.

**Headless services** — Set `clusterIP: None`. DNS returns the individual pod IPs instead of a single ClusterIP. Use this when your client needs to implement its own load balancing (gRPC, Cassandra, Kafka).

**Service mesh discovery** — Istio and Linkerd add a control plane that distributes endpoint information to sidecar proxies. Traffic routing rules become declarative configuration rather than client code.

The pattern you should internalize: never hardcode service addresses. Always resolve via DNS or a discovery client. Your service's address will change — pods restart, scale events happen, rolling deployments shift traffic.

### 2.2 Leader Election

You have a StatefulSet or Deployment with multiple replicas. One task — cache warming, database cleanup, external webhook processing — must run on exactly one replica at a time.

The pattern:
1. All replicas compete to acquire a lock (Kubernetes Lease object, Zookeeper, Redis `SET NX`).
2. One replica acquires the lock and becomes leader.
3. The leader renews the lock on a heartbeat interval.
4. If the leader fails to renew, the lock expires and another replica wins the next election.

Kubernetes has a built-in `coordination.k8s.io/v1` Lease object. The `client-go` library exposes a `leaderelection` package that implements this pattern. Do not implement distributed locking yourself.

```yaml
apiVersion: coordination.k8s.io/v1
kind: Lease
metadata:
  name: my-service-leader
  namespace: default
spec:
  leaseDurationSeconds: 15
  renewTime: "2026-05-31T00:00:00Z"
  holderIdentity: pod-xyz-abc
```

⚠️ Leader election adds latency to your startup path and introduces a failure mode where no leader is elected. Design your system to tolerate a gap in leader presence during election cycles.

### 2.3 Work Queue

A producer publishes tasks to a queue. A pool of worker pods pulls from the queue, processes tasks, and acknowledges completion. Kubernetes Jobs with `completions` and `parallelism` implement this pattern natively.

When to use it:
- Processing is slow and you want to decouple ingestion from processing.
- You need at-least-once delivery guarantees.
- Task volume is spiky and you want autoscaling.

The work queue pattern pairs naturally with KEDA (Kubernetes Event-Driven Autoscaling), which can scale your worker deployment based on queue depth.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: image-processor
spec:
  completions: 100
  parallelism: 10
  template:
    spec:
      containers:
        - name: worker
          image: image-processor:1.0
          env:
            - name: QUEUE_URL
              value: "amqp://rabbitmq-service:5672"
      restartPolicy: OnFailure
```

### 2.4 Scatter/Gather

One request arrives. You need to query N backends in parallel and merge the results. Search engines, aggregation APIs, and report generators all follow this shape.

The coordinator:
1. Receives the request.
2. Fans out N sub-requests to workers (via goroutines, async tasks, or separate pods).
3. Waits for all responses with a bounded timeout.
4. Merges and returns.

The critical detail is the timeout. If you wait indefinitely for the slowest worker, you inherit the tail latency of your entire fleet. Set a deadline and return partial results or a clear error for missing shards.

This pattern is often implemented at the application level (goroutines, `asyncio.gather`, `Promise.all`) rather than at the infrastructure level. That is fine — the pattern is the pattern regardless of where it lives.

### 2.5 Event-Driven Architecture

Services publish events to a durable log (Kafka, NATS JetStream, Google Pub/Sub). Other services subscribe and react asynchronously.

This is the right choice when:
- The publisher does not need to know who consumed the event.
- You want temporal decoupling — consumers can be down and catch up later.
- You need an audit trail.
- Multiple consumers need the same event for different purposes.

The pattern requires you to think in terms of events (things that happened) rather than commands (things to do). "OrderPlaced" is an event. "ProcessOrder" is a command. The difference matters when you have multiple consumers — an event can be consumed by billing, inventory, and notification services independently.

### 2.6 Anti-Corruption Layer

You are building a new service that must interact with a legacy system. The legacy system has its own domain model — inconsistent naming, implicit state machines, odd data types. If you let that model leak into your new service, you inherit its accidental complexity.

The anti-corruption layer is an explicit translation boundary. It knows the legacy model. It translates to your model. Your service only sees your model.

In practice this is an adapter class, a translation microservice, or a Kubernetes Job that reads from the legacy database and writes to your system's events. The implementation is less important than the discipline: keep the translation in one place, test it thoroughly, and never let legacy concepts cross the boundary.

### 2.7 Pattern Composition

Real services combine multiple patterns. The composition is where the leverage is.

A typical production microservice might use:
- Init container (wait for dependencies, run migrations)
- App container with health checks and graceful shutdown
- Sidecar (Envoy for mTLS and observability)
- Service discovery (Kubernetes DNS + headless service for gRPC)
- Work queue (async processing of heavy tasks)
- Leader election (scheduled cleanup job)

The patterns do not conflict. Each addresses a different concern. The discipline is knowing which concern each pattern addresses so you reach for the right one.

### 2.8 Cloud-Native vs. Cloud-Hosted

This distinction matters and is frequently blurred.

**Cloud-hosted** — You took an application built for bare metal or VMs and ran it on a cloud provider. You have VMs, you SSH into them, you deploy with rsync or a shell script. You pay cloud prices for VM convenience.

**Cloud-native** — Your application is designed from the start to run on an orchestrator. It is stateless (or externalizes state). It configures via environment. It exposes health endpoints. It starts fast and shuts down gracefully. It is observable by design. It scales horizontally, not vertically.

The patterns in this document are the operational definition of cloud-native. If your application does not implement them, it will work on Kubernetes — until it does not, and then debugging will be painful because you are fighting the platform instead of using it.

---

## Worked Example — Designing a Cloud-Native Microservice

**Scenario:** A payment processing service. It must run migrations before starting, expose health endpoints, process webhook events asynchronously, and ship structured logs.

**Step 1 — Init container for migrations**

Before the app starts, run `./migrate --up` against the database. This is an init container. It runs once per pod start, blocks app container startup, and fails loudly if migrations fail.

**Step 2 — Health checks**

The app exposes `/healthz` (is the process running and not deadlocked?) and `/readyz` (is the database connection pool healthy? is the message queue connected?). Readiness is strict — the pod does not receive traffic until all dependencies are confirmed healthy.

**Step 3 — Sidecar for log shipping**

The app writes structured JSON logs to stdout. A Fluent Bit sidecar reads stdout via the shared Docker log socket and ships to the centralized log aggregator. The app has no Fluent Bit dependency in its code.

**Step 4 — Work queue for webhook processing**

Inbound webhooks are written immediately to a Kafka topic and acknowledged 200 OK. A separate worker deployment pulls from Kafka, processes payments, and updates state. This decouples webhook receipt (latency-sensitive) from payment processing (throughput-sensitive).

**Step 5 — Graceful shutdown**

On `SIGTERM`: stop accepting new webhooks (readiness probe fails), drain the in-flight Kafka consumer, commit offsets, close the database connection pool, exit 0.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
spec:
  replicas: 3
  template:
    spec:
      initContainers:
        - name: run-migrations
          image: payment-service:1.0
          command: ["./migrate", "--up"]
          envFrom:
            - secretRef:
                name: db-credentials
      containers:
        - name: app
          image: payment-service:1.0
          ports:
            - containerPort: 8080
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
            periodSeconds: 5
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 5"]
          terminationGracePeriodSeconds: 30
        - name: log-shipper
          image: fluent/fluent-bit:2.1
          volumeMounts:
            - name: varlog
              mountPath: /var/log
      volumes:
        - name: varlog
          emptyDir: {}
```

---

## Pitfalls

**Sidecar ordering is not guaranteed.** Your app container may start before the sidecar is ready. Use init containers for true ordering, not sidecar startup sequence.

**Init containers share the pod restart policy.** A flaky init container puts your pod into `CrashLoopBackOff`. Make them fast, idempotent, and observable.

**Health check endpoints that do too much.** Do not call external services inside your liveness probe. A slow external service will cause liveness failures and trigger unnecessary restarts. Liveness should check local process health only.

**Leader election with short lease durations.** Too short a lease causes frequent leadership churn under load. Too long a lease causes long gaps after a leader failure. Start with 15–30 seconds.

**Scatter/gather without a timeout.** One slow or stuck backend makes the entire request slow or stuck. Always set a context deadline.

**Ambassador pattern and localhost coupling.** If your app binds to the ambassador port on localhost and the ambassador sidecar is slow to start, your app will fail on startup. Use init containers or retry logic in the connection setup.

**Conflating cloud-hosted with cloud-native.** Running a stateful, configuration-baked, non-health-checked application on Kubernetes does not make it cloud-native. The patterns must be in the application, not just in the infrastructure.

---

## Quick Reference

### Pattern Decision Tree

```
Need to run setup before the app starts?
  → Init Container

Need to augment the app with a cross-cutting concern (logging, proxy, metrics)?
  → Sidecar

Need to simplify outbound connections to external systems?
  → Ambassador

Need to normalize app output to a platform standard?
  → Adapter

Have a task that must run on exactly one instance?
  → Leader Election

Have a task that is slow and bursty?
  → Work Queue

Need to query N sources in parallel and merge results?
  → Scatter/Gather

Integrating with a legacy system with a messy domain model?
  → Anti-Corruption Layer
```

### K8s YAML Templates Per Pattern

**Health Check (liveness + readiness)**
```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  periodSeconds: 5
```

**Init Container**
```yaml
initContainers:
  - name: init-task
    image: myapp:1.0
    command: ["./setup.sh"]
```

**Sidecar**
```yaml
containers:
  - name: app
    image: myapp:1.0
  - name: sidecar
    image: sidecar-tool:latest
    volumeMounts:
      - name: shared
        mountPath: /shared
volumes:
  - name: shared
    emptyDir: {}
```

**Work Queue Job**
```yaml
apiVersion: batch/v1
kind: Job
spec:
  completions: 50
  parallelism: 5
  template:
    spec:
      containers:
        - name: worker
          image: worker:1.0
      restartPolicy: OnFailure
```

**Headless Service (for gRPC / client-side load balancing)**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: grpc-service
spec:
  clusterIP: None
  selector:
    app: grpc-server
  ports:
    - port: 50051
```

**Graceful Shutdown**
```yaml
lifecycle:
  preStop:
    exec:
      command: ["/bin/sh", "-c", "sleep 5"]
terminationGracePeriodSeconds: 30
```

---

## Next Steps

- `Twelve-Factor-App.md` — The methodology that underpins why these patterns exist.
- `Kubernetes.md` — The platform where these patterns run.
- `Istio.md` — The service mesh that implements sidecar and ambassador at scale.
- `Microservices-Patterns.md` — How these container patterns compose into service-level patterns.
- `Docker.md` — The container runtime layer beneath all of this.

---

## The Mantra

> Build for the platform. Configure from outside. Fail loudly and recover fast. Separate concerns — one container, one responsibility. The platform handles orchestration; your code handles business logic. If your container cannot start cleanly, stop, init, and start again — that is not a bug, that is the design.

---

`Reads: 0/4. Tier reached: PEAK. Lessons added: 0.`
