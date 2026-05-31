# Reliability Patterns — A 2-Day Crash Course

Battle-tested patterns for building resilient distributed systems — retries, circuit breakers, timeouts, bulkheads, and graceful degradation.

---

## Part 0 — Why This Matters

Distributed systems don't fail completely — they fail partially. A database goes slow. A downstream API returns 503 for 30 seconds. A third-party provider drops packets intermittently. In a monolith, one bad component crashes the process and you restart it. In a distributed system, one bad component can drag every other component down with it through unbounded queues, thread exhaustion, and cascading timeouts.

The patterns in this course exist to contain blast radius. They give you tools to detect failure early, stop retrying things that won't recover, isolate failure to one subsystem, and keep your system partially functional when a dependency degrades.

You don't need all of these everywhere. You need the right ones in the right places.

---

## Vocabulary

**Retry (with jitter)** — Attempt a failed operation again after a delay. Jitter adds randomness to the delay so retrying clients don't all hammer the recovering service at the same moment (the "thundering herd" problem).

**Circuit Breaker** — A state machine that wraps a remote call. It has three states: closed (calls pass through normally), open (calls fail immediately without hitting the dependency), and half-open (a probe request tests whether the dependency has recovered). Named after the electrical component that prevents overload.

**Timeout** — The maximum time you're willing to wait for an operation. Without timeouts, a slow dependency holds your threads indefinitely. Every network call needs one.

**Bulkhead** — Isolating resources (thread pools, connection pools, semaphores) by dependency so that one slow service can't consume all your threads and starve calls to other services. Named after the watertight compartments in a ship's hull.

**Rate Limiting** — Capping how many requests a client can make in a time window. Protects your service from being overwhelmed. Applied at ingress.

**Backpressure** — Signaling to producers that consumers can't keep up, so they slow down rather than overwhelming the system. The honest alternative to silently dropping work.

**Graceful Degradation** — Serving a reduced but functional response when a dependency is unavailable. Returning cached data instead of a live query. Showing a static page instead of a personalized one.

**Fallback** — The value or behavior you return when a call fails. Closely related to graceful degradation. Can be a cached value, a default, or an empty response.

**Idempotency** — An operation is idempotent if calling it multiple times produces the same result as calling it once. Critical for safe retries — you need to know that retrying a payment won't charge the customer twice.

**Health Check** — An endpoint your orchestration layer polls to determine if your service is fit to receive traffic. Kubernetes uses three types: liveness (is the process alive?), readiness (is it ready to handle requests?), and startup (has it finished initializing?).

---

## DAY 1

### 1. Timeouts — Set Them. Always.

The single most impactful thing you can do for reliability costs almost nothing. Set a timeout on every network call.

Without a timeout, your thread waits. Your thread pool fills up. New requests queue. The queue fills. Your service goes down — not because of your code, but because of someone else's slowness.

```python
import httpx

# Wrong — no timeout
response = httpx.get("https://payments.internal/charge")

# Right — explicit timeout
response = httpx.get(
    "https://payments.internal/charge",
    timeout=httpx.Timeout(connect=1.0, read=5.0, write=2.0, pool=1.0)
)
```

**Rules of thumb:**
- Internal service calls: 100ms–500ms
- Database queries (simple): 200ms–1s
- Database queries (complex): 1s–5s
- External API calls: 2s–10s
- Never use a single global timeout — differentiate by operation type

**Timeout budget:** If service A calls B which calls C, each with a 5s timeout, the user waits up to 15s. Design your timeout chain so the outer service's timeout is larger than the sum of inner service timeouts — or better, set tighter timeouts at each hop.

---

### 2. Retries with Exponential Backoff and Jitter

Retries are powerful and dangerous. Retrying too aggressively during an outage amplifies load on an already struggling service. Retrying non-idempotent operations creates duplicate side effects.

**When to retry:**
- Network errors (connection refused, reset)
- Transient errors (429 Too Many Requests, 503 Service Unavailable)
- Timeouts (if the operation is idempotent)

**When not to retry:**
- 4xx errors except 429 — the request is wrong, retrying won't help
- Non-idempotent operations without idempotency keys
- After your circuit breaker is open

**Exponential backoff with jitter:**

```python
import random
import time

def retry_with_backoff(fn, max_attempts=4, base_delay=0.5, max_delay=30.0):
    for attempt in range(max_attempts):
        try:
            return fn()
        except TransientError as e:
            if attempt == max_attempts - 1:
                raise
            # Exponential backoff: 0.5s, 1s, 2s, 4s...
            delay = min(base_delay * (2 ** attempt), max_delay)
            # Full jitter: spread retries across [0, delay]
            jitter = random.uniform(0, delay)
            time.sleep(jitter)
```

**Jitter variants:**
- Full jitter: `sleep(random(0, cap))` — spreads load best, increases average latency
- Equal jitter: `sleep(cap/2 + random(0, cap/2))` — guarantees minimum spacing
- Decorrelated jitter: `sleep(random(base, last_sleep * 3))` — good general default

Use a library in production. Python: `tenacity`. Java: `resilience4j`. Go: `github.com/cenkalti/backoff`. Don't hand-roll retry logic in critical paths.

---

### 3. Circuit Breakers — The State Machine

A circuit breaker sits in front of a remote call and tracks recent failures. When failures exceed a threshold, it opens — calls fail immediately instead of waiting for a timeout. This gives the dependency time to recover and prevents your threads from piling up.

```
         Failure threshold exceeded
CLOSED ─────────────────────────────► OPEN
  ▲                                      │
  │    Probe succeeds                    │ Wait (cooldown period)
  │                                      ▼
  └─────────────────────────────── HALF-OPEN
```

**State transitions:**
- CLOSED → OPEN: failure rate exceeds threshold (e.g., 50% of last 20 calls)
- OPEN → HALF-OPEN: after cooldown period (e.g., 30s)
- HALF-OPEN → CLOSED: probe request succeeds
- HALF-OPEN → OPEN: probe request fails

```python
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=30, expected_exception=ServiceError)
def call_payment_service(payload):
    return requests.post("https://payments.internal/charge", json=payload, timeout=3)
```

**Configuration guidance:**
- Failure threshold: 5–10 failures, or 50% failure rate over a rolling window
- Cooldown: 10s–60s depending on how long your dependency typically takes to recover
- Half-open probe: 1 request — don't let a flood through immediately

**What to return when open:** This is where fallback logic lives. Return a cached result, a default, a queue-the-request response, or an explicit error that your caller handles.

---

### 4. Health Checks and Kubernetes Probes

Health checks are how your platform knows whether to send traffic to your instance.

**Liveness probe** — "Is this process alive?" If it fails, Kubernetes kills and restarts the pod. Use this for deadlock detection. Keep it cheap — don't check dependencies here. A process that can't reach its database is not "dead" — restarting it won't fix the database.

**Readiness probe** — "Is this instance ready to serve traffic?" If it fails, the pod is removed from the load balancer but not restarted. Use this to check dependency health. If your database connection pool is exhausted, return 503.

**Startup probe** — "Has this instance finished initializing?" Prevents liveness and readiness probes from running until the app has had time to start. Critical for slow-starting JVM or Python apps.

```yaml
livenessProbe:
  httpGet:
    path: /healthz/live
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /healthz/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 2

startupProbe:
  httpGet:
    path: /healthz/startup
    port: 8080
  failureThreshold: 30
  periodSeconds: 10
```

```python
# /healthz/live — just confirm the process can respond
@app.get("/healthz/live")
def liveness():
    return {"status": "ok"}

# /healthz/ready — check critical dependencies
@app.get("/healthz/ready")
def readiness():
    if not db.can_connect():
        raise HTTPException(status_code=503, detail="database unavailable")
    return {"status": "ok"}
```

---

## DAY 2

### 5. Bulkhead Pattern — Isolate Failure Domains

If every downstream call shares the same thread pool, a slow dependency starves all other operations. Bulkheads give each dependency its own resource allocation.

```python
from concurrent.futures import ThreadPoolExecutor

# Without bulkhead — all calls compete for the same threads
executor = ThreadPoolExecutor(max_workers=20)

# With bulkhead — each dependency has its own pool
payment_pool    = ThreadPoolExecutor(max_workers=5, thread_name_prefix="payment")
inventory_pool  = ThreadPoolExecutor(max_workers=5, thread_name_prefix="inventory")
notification_pool = ThreadPoolExecutor(max_workers=3, thread_name_prefix="notification")

def charge_customer(payload):
    future = payment_pool.submit(call_payment_service, payload)
    try:
        return future.result(timeout=3.0)
    except Exception:
        # Payment pool exhausted or call failed — doesn't affect inventory calls
        raise PaymentError()
```

**Semaphore-based bulkhead** — lighter weight than thread pools, good for async code:

```python
import asyncio

payment_semaphore = asyncio.Semaphore(10)  # max 10 concurrent payment calls

async def charge_customer(payload):
    async with payment_semaphore:
        return await call_payment_service(payload)
```

Size your bulkheads based on the expected concurrency and latency of each dependency. If you expect 100 RPS and each call takes 50ms on average, you need approximately 5 concurrent slots (Little's Law: N = λ × W).

---

### 6. Rate Limiting — Token Bucket and Sliding Window

Rate limiting protects your service from being overwhelmed by any single client. Apply it at your API gateway or service mesh before requests reach your application code.

**Token bucket** — A bucket holds N tokens. Each request consumes one token. Tokens refill at a fixed rate. Allows short bursts while enforcing average rate.

**Sliding window** — Count requests in a rolling time window. More accurate than fixed window (which can allow 2x the limit at window boundaries). More memory-intensive.

**Fixed window** — Simple but allows bursting at window edges. Use only when precision doesn't matter.

```python
# Token bucket — atomic via Redis Lua script
import redis, time, json

r = redis.Redis()

RATE_LIMIT_SCRIPT = """
local tokens_key = KEYS[1]
local last_key   = KEYS[2]
local rate       = tonumber(ARGV[1])
local burst      = tonumber(ARGV[2])
local now        = tonumber(ARGV[3])

local last   = tonumber(redis.call('get', last_key) or now)
local tokens = math.min(burst, tonumber(redis.call('get', tokens_key) or burst))
local delta  = math.max(0, now - last)

tokens = math.min(burst, tokens + delta * rate)

if tokens >= 1 then
    redis.call('set', tokens_key, tokens - 1, 'EX', 60)
    redis.call('set', last_key,   now,         'EX', 60)
    return 1
end
return 0
"""

def allow_request(client_id: str, rate: int, burst: int) -> bool:
    now = time.time()
    result = r.eval(
        RATE_LIMIT_SCRIPT, 2,
        f"tokens:{client_id}", f"last:{client_id}",
        rate, burst, now
    )
    return bool(result)
```

In practice, use your API gateway (Kong, NGINX, Envoy) for rate limiting rather than application code — it's faster, doesn't consume your app threads, and applies before your service is reached.

---

### 7. Backpressure — Reject, Queue, or Shed

When your service receives more work than it can handle, you have three options:

**Reject** — Return 429 or 503 immediately. Fast, honest, simple. The caller knows to back off. Best default.

**Queue** — Buffer excess work and process it later. Hides latency spikes but creates new failure modes: queue grows unbounded, latency increases silently, and you process stale requests.

**Shed** — Drop low-priority work. Process important requests; discard or defer others. Requires priority classification.

```python
import asyncio

class BoundedWorker:
    def __init__(self, concurrency: int, queue_size: int):
        self.semaphore = asyncio.Semaphore(concurrency)
        self.queue     = asyncio.Queue(maxsize=queue_size)

    async def submit(self, work):
        try:
            self.queue.put_nowait(work)
        except asyncio.QueueFull:
            # Explicit rejection — caller gets 429
            raise BackpressureError("service at capacity")
```

⚠️ Unbounded queues are one of the most common reliability failures. Always set a max queue size. A full queue that rejects work is better than a queue that accepts work and delivers it 10 minutes late.

---

### 8. Graceful Degradation — Serve Something Useful

When a dependency fails, decide in advance what "degraded but functional" looks like for your service.

**Serve stale data** — Cache responses from successful calls. Serve from cache when the live call fails. Be explicit about staleness — include a `data-stale: true` header or equivalent.

**Disable non-critical features** — If your recommendation engine is down, show a static "popular items" list. Don't fail the whole checkout because of it.

**Return a safe default** — If you can't load a user's preferences, use sensible defaults instead of failing the request.

```python
import functools
from datetime import datetime

cache = {}

def with_stale_fallback(stale_ttl_seconds=3600):
    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            cache_key = str(args) + str(kwargs)
            cached    = cache.get(cache_key)
            try:
                result = await fn(*args, **kwargs)
                cache[cache_key] = {"value": result, "at": datetime.utcnow()}
                return result
            except Exception:
                if cached:
                    age = (datetime.utcnow() - cached["at"]).total_seconds()
                    if age < stale_ttl_seconds:
                        return cached["value"]  # serve stale
                raise  # no cache — propagate
        return wrapper
    return decorator

@with_stale_fallback(stale_ttl_seconds=600)
async def get_product_recommendations(user_id: str):
    return await recommendation_service.get(user_id)
```

---

### 9. Idempotency Keys — Safe Retries for Mutations

Retrying read operations is safe. Retrying mutations (payments, email sends, order placements) is not — unless you implement idempotency keys.

An idempotency key is a unique identifier for a specific operation. The server executes the operation on the first call and stores the result. Subsequent calls with the same key return the stored result without re-executing.

```python
import uuid, json, redis

r = redis.Redis()

def charge_customer_idempotent(customer_id: str, amount: int, idempotency_key: str):
    cached = r.get(f"idem:{idempotency_key}")
    if cached:
        return json.loads(cached)  # return previous result — no duplicate charge

    result = payment_gateway.charge(customer_id, amount)
    r.setex(f"idem:{idempotency_key}", 86400, json.dumps(result))
    return result

# Caller generates the key before the first attempt and reuses it on retries
key = str(uuid.uuid4())
for attempt in range(3):
    try:
        result = charge_customer_idempotent(customer_id, amount, idempotency_key=key)
        break
    except TransientError:
        time.sleep(2 ** attempt)
```

Generate idempotency keys client-side before the first attempt, and reuse the same key on all retries of the same logical operation.

---

### 10. Load Shedding

Under extreme load, do less work — not more. Prioritize critical requests and reject or defer everything else.

Common strategies:
- Reject requests with low-priority headers first
- Protect authenticated users; reject unauthenticated traffic first
- Maintain a "minimum viable response" mode — serve only what's required to complete a transaction
- Track current concurrency or RPS and return 503 above a threshold before queuing begins

---

### 11. Infrastructure vs. Code

You don't have to implement all of this in application code. Your service mesh or proxy can handle much of it.

**Envoy (via Istio or standalone):**

```yaml
# Circuit breaker and outlier detection — Istio DestinationRule
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: payment-service
spec:
  host: payment-service
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        http1MaxPendingRequests: 50
        maxRequestsPerConnection: 10
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
```

**Retry policy in Istio VirtualService:**

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: payment-service
spec:
  http:
  - retries:
      attempts: 3
      perTryTimeout: 2s
      retryOn: gateway-error,connect-failure,retriable-4xx
    timeout: 8s
```

Use infrastructure-level patterns for cross-cutting concerns. Use application-level patterns when you need business logic in your fallbacks — serving stale data, writing to a fallback queue, logging degraded state with context.

---

## Worked Example — Protecting a Payment Service

You're building an order service that calls a third-party payment provider with occasional latency spikes and brief outages.

**The failure scenario without protection:** The payment provider goes down for 45 seconds. All order requests pile up waiting for a 30s timeout. Thread pool exhausts. The order service stops responding to all traffic — including health checks. Kubernetes restarts the pod. During restart, more requests pile up. A 45-second payment outage causes a multi-minute order service outage.

**The protected design:**

```python
from circuitbreaker import circuit
from tenacity import retry, stop_after_attempt, wait_exponential_jitter, retry_if_exception_type

PAYMENT_TIMEOUT = 3.0
payment_pool    = ThreadPoolExecutor(max_workers=10, thread_name_prefix="payment")
payment_cache   = TTLCache(maxsize=1000, ttl=3600)

@circuit(
    failure_threshold=5,
    recovery_timeout=30,
    expected_exception=(PaymentServiceError, TimeoutError)
)
@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential_jitter(initial=0.5, max=5),
    retry=retry_if_exception_type(TransientPaymentError)
)
def _call_payment_provider(payload: dict, idempotency_key: str) -> dict:
    return requests.post(
        "https://payments.example.com/charge",
        json={**payload, "idempotency_key": idempotency_key},
        timeout=PAYMENT_TIMEOUT
    ).json()

def charge_order(order_id: str, amount: int, customer_id: str) -> ChargeResult:
    key = f"charge:{order_id}"  # stable per order — safe to reuse on retries

    try:
        future = payment_pool.submit(
            _call_payment_provider,
            {"amount": amount, "customer": customer_id},
            key
        )
        result = future.result(timeout=PAYMENT_TIMEOUT + 1)
        payment_cache[key] = result
        return ChargeResult(success=True, data=result)

    except CircuitBreakerOpen:
        # Fast fail — queue for async retry, keep order service healthy
        queue_for_async_processing(order_id, amount, customer_id, key)
        return ChargeResult(success=False, status="pending")

    except Exception as e:
        log.error("payment failed", order_id=order_id, error=str(e))
        return ChargeResult(success=False, status="failed")
```

**What this buys you:** The first 5 failures open the circuit. Subsequent requests fail fast — no timeout wait — and get queued. The order service stays healthy. When the payment provider recovers, the circuit probes, succeeds, closes, and queued orders process. A 45-second provider outage stays a 45-second payment delay, not a cascading service failure.

---

## Pitfalls

**Retry amplification** — 100 clients each retrying 3 times sends 300 requests to an already overloaded service. Add jitter. Consider a retry budget (e.g., only 10% of in-flight requests allowed to retry at any moment).

**Timeout misconfiguration** — Too low causes false failures on slow-but-healthy dependencies. Too high defeats the purpose. Profile your p99 latency and set timeouts at 2–3x that value.

**Circuit breaker on shared state** — Don't share circuit breaker state across different endpoints. A failing `/search` endpoint shouldn't open the circuit for `/checkout`.

**Bulkhead over-partitioning** — Too many small thread pools wastes resources. Start coarse-grained — one pool per external dependency — then refine under load.

**No fallback after adding a circuit breaker** — Implementing a circuit breaker without a useful fallback just changes your error message. The fallback is half the value.

**Stale data without signaling** — Serving stale data without telling callers is a hidden correctness bug. Always signal degraded responses explicitly in headers or response fields.

**Idempotency key scope** — Keys must be unique per logical operation, not per HTTP request. Reuse the same key on retries of the same operation.

**Chatty health checks** — Probes that check 10 dependencies add latency and can cause cascading readiness failures. Keep readiness probes focused on the one or two dependencies that truly block request handling.

---

## Quick Reference

### Pattern Decision Tree

```
Is the operation failing?
├── Is it a read?
│   └── Retry with backoff → serve stale on exhaustion
├── Is it a write?
│   ├── Idempotent? → Retry with idempotency key
│   └── Not idempotent? → Queue for async, return pending state

Is the dependency slow or flapping?
├── Set / tighten timeout
├── Add circuit breaker
└── Add bulkhead (isolate thread pool)

Is your service overloaded?
├── Rate limiting at ingress
├── Backpressure (reject at queue boundary)
└── Load shedding (prioritize critical paths)

Is a non-critical feature failing?
└── Graceful degradation — disable feature, serve default
```

### Configuration Templates

**Retry — safe defaults**
```
max_attempts  : 3
base_delay    : 500ms
max_delay     : 30s
jitter        : full
retry_on      : 429, 503, network_error, timeout (idempotent ops only)
```

**Circuit breaker — safe defaults**
```
failure_threshold : 5 failures in last 20 requests (50%)
cooldown          : 30s
half_open_probes  : 1
```

**Timeout — safe defaults**
```
internal_service    : 500ms
database_simple     : 1s
database_complex    : 5s
external_api        : 5s–10s
```

**Bulkhead sizing**
```
pool_size = (expected_RPS × p99_latency_seconds) × 1.5
minimum   : 3
start at  : 10, tune with load testing
```

---

## Next Steps

- `SRE-Process.md` — incident response, SLOs, error budgets, and the operational context for these patterns
- `Chaos-Engineering.md` — how to validate that these patterns actually work under real failure conditions
- `Istio.md` — implementing circuit breakers, retries, and timeouts at the infrastructure layer
- `Kubernetes.md` — health probes, pod disruption budgets, and rolling deployments
- `Capacity-Planning.md` — sizing your bulkheads and rate limits with real traffic data

---

## The Mantra

> Design for failure. Fail fast. Recover gracefully. Never let one broken thing break everything else.

---

*Reads: 0/4. Tier reached: PEAK. Lessons added: 0.*
