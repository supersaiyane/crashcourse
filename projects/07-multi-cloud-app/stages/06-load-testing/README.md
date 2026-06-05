# Stage 6: Load Testing

**Goal:** Use k6 to load-test CloudPlatform under realistic conditions — baseline, stress, spike (salary-day traffic), and cross-cloud comparison — so you know exactly where it breaks and how each cloud handles pressure.

**Prerequisites:** Stage 5 complete. CloudPlatform deployed on all three clouds. k6 installed locally (`brew install k6` or `apt install k6`).

---

## Part 1 — Theory: What & Why

### The problem load testing solves

Every system has a breaking point. You either find it in a controlled test on a Tuesday morning, or your users find it for you on salary day with 50,000 employees checking their bank balance simultaneously. Load testing answers three questions that no amount of code review or unit testing can:

1. **How fast is it?** — baseline latency under normal traffic
2. **How much can it take?** — maximum throughput before errors start
3. **How does it recover?** — behaviour when the spike passes

Without load testing, you are guessing your system's capacity. Guessing works until it does not — and in BFSI, "it does not" happens on the 1st of every month when salary credits hit, or on the last day of the financial year when every compliance report runs simultaneously.

### How k6 works

k6 is an open-source load testing tool written in Go. You write test scripts in JavaScript, and k6 executes them with Go's concurrency model — meaning a single k6 process can simulate thousands of concurrent users without the overhead of running actual browser instances.

```text
Architecture of a k6 test run:

  +------------------+
  |  k6 process      |
  |                  |
  |  +-----------+   |        +------------------+
  |  | VU 1      |---+------->|                  |
  |  +-----------+   |        |  CloudPlatform   |
  |  | VU 2      |---+------->|  API             |
  |  +-----------+   |        |  (target under   |
  |  | VU 3      |---+------->|   test)          |
  |  +-----------+   |        |                  |
  |  | ...       |   |        +------------------+
  |  | VU N      |---+------->
  |  +-----------+   |
  |                  |
  |  Metrics engine  |        +------------------+
  |  (p50, p95, p99) +------->| Results output   |
  |                  |        | (stdout, JSON,   |
  +------------------+        |  Prometheus, etc)|
                              +------------------+

  Each Virtual User (VU) = one goroutine running your script in a loop.
  k6 collects timing data from every HTTP request and computes percentiles.
```

**Mental model:** k6 is a crowd simulator. Each VU is one person in a queue at the bank counter, independently performing actions (check balance, submit transfer, wait). k6 watches how the bank counter (your API) copes as the queue grows.

### k6 test types

| Test type | What it measures | VU pattern | When to use |
|-----------|-----------------|-----------|-------------|
| **Baseline** | Normal performance | Constant low VUs (10-50) | First test — establish the norm |
| **Stress** | Breaking point | Ramp up until errors appear | Find capacity limits |
| **Spike** | Sudden burst handling | Flat, then sharp spike, then flat | BFSI salary-day / flash-sale scenario |
| **Soak** | Long-term stability | Constant moderate VUs for hours | Memory leaks, connection pool exhaustion |

```text
VU patterns over time:

Baseline:          Stress:            Spike:             Soak:
  VUs                VUs                VUs                VUs
  50|  ________      800|         /\    300|      ___      100|  __________________________
    | /        \       |       /    \     |    /     \       | /                          \
    |/          \      |     /       \    |   /       \      |/                            \
  0 +----------> t   0 +---/         \> t 0 +-/       \-> t 0 +--------------------------> t
    0    5min          0    10min          0    7min           0         4 hours
```

### Vocabulary

| Term | Meaning |
|------|---------|
| **Virtual User (VU)** | One simulated user running your test script in a loop. 50 VUs = 50 concurrent users. |
| **Threshold** | An automated pass/fail rule. If breached, k6 exits with code 99 — useful in CI pipelines. |
| **Check** | An assertion inside the script (e.g. "status is 200"). Checks do not stop the test; they record pass/fail rates. |
| **Stage** | A VU ramp segment — duration + target VU count. Chain stages to build ramp-up/hold/ramp-down patterns. |
| **Think time** | A `sleep()` between requests to simulate real user pausing. Without it, traffic is unrealistically dense. |
| **p95 / p99** | Percentile latencies. p95 = 95% of requests faster than this. p99 = the tail — 1 in 100 requests. |
| **RPS** | Requests per second — your throughput metric. RPS = VUs / (avg response time + think time). |
| **Iteration** | One complete execution of the default function. One VU runs many iterations over the test duration. |

### Understanding k6 output — the metrics that matter

```text
     scenarios: (100.00%) 1 scenario, 50 max VUs, 5m30s max duration

     checks.....................: 100.00% 12500 out of 12500
     http_req_duration..........: avg=45ms  min=12ms  med=38ms  max=890ms  p(90)=78ms  p(95)=120ms  p(99)=340ms
     http_req_failed............: 0.12%  15 out of 12500
     http_reqs..................: 12500  41.6/s
     iteration_duration.........: avg=48ms  min=14ms  med=41ms  max=910ms  p(90)=82ms
     vus........................: 50     min=50  max=50
     vus_max....................: 50     min=50  max=50
```

How to read this:
- **p(50) / med** — half of requests are faster than this. This is your typical user experience. If your median is 38ms, most users have a snappy experience.
- **p(95)** — 95% of requests are faster. This is what SLOs usually target. "95th percentile latency under 200ms" is a common SLO for APIs.
- **p(99)** — the tail. 1 in 100 requests is slower than this. High p99 with low p50 means inconsistent experience — some users are suffering.
- **http_req_failed** — error rate. Above 1% means something is breaking. Above 5% means the system is under serious stress.
- **http_reqs** — total requests and throughput (requests/second). This is your capacity metric.

**BFSI context:** In banking, p99 matters more than p50. The person at p99 might be trying to complete a salary transfer before the bank's 4:00 PM NEFT cutoff. Their experience matters as much as the median user's.

### Thresholds — automated pass/fail

Thresholds turn subjective "feels slow" into objective, enforceable gates:

```javascript
export const options = {
  thresholds: {
    http_req_duration: ['p(95)<200'],   // 95th percentile must be under 200ms
    http_req_failed: ['rate<0.01'],     // less than 1% errors
  },
};
```

If a threshold is breached, k6 exits with code 99. In a CI pipeline, this fails the build — preventing performance regressions from reaching production.

### The relationship between VUs, RPS, and latency

```text
RPS = VUs / (average_response_time + think_time)

Example:
  50 VUs, avg response 40ms, 1s think time:
  RPS = 50 / (0.04 + 1.0) = 48 req/s

  If latency increases to 200ms under load:
  RPS = 50 / (0.2 + 1.0) = 42 req/s   <-- throughput drops as latency rises
```

This explains why load testing has diminishing returns: as you add VUs, latency increases, which reduces per-VU throughput. At some point, the system saturates and adding VUs only increases queue depth — not throughput.

### Load testing vs the alternatives

| Approach | What it catches | What it misses |
|----------|-----------------|----------------|
| **Unit tests** | Logic bugs, edge cases | Performance, concurrency, resource exhaustion |
| **Integration tests** | API contract, DB queries | Behaviour under concurrent load |
| **Load testing** | Latency, throughput, breaking point, recovery | Correctness of business logic |
| **Chaos engineering** | Infrastructure failures (node death, network partition) | Gradual degradation under traffic |

Load testing and unit testing are complementary. A system that passes all unit tests can still fall over at 200 concurrent users because the database connection pool is sized for 10.

---

## Part 2 — Hands-on

### 1. Run baseline load test

Create the k6 test script for CloudPlatform:

```javascript
// load-tests/baseline.js
import http from 'k6/http';           // k6's built-in HTTP client
import { check, sleep } from 'k6';    // check = assertion, sleep = think time

// --- configuration ---
const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';  // override via -e TARGET_URL=...

export const options = {
  stages: [
    { duration: '30s', target: 10 },    // ramp up to 10 virtual users over 30s
    { duration: '2m',  target: 10 },    // hold at 10 VUs for 2 minutes (steady state)
    { duration: '30s', target: 0 },     // ramp down to 0 — graceful exit
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],    // 95th percentile under 200ms
    http_req_failed: ['rate<0.01'],      // less than 1% error rate
  },
};

export default function () {
  // --- health check endpoint ---
  const health = http.get(`${BASE_URL}/api/healthz`);
  check(health, {
    'healthz returns 200': (r) => r.status === 200,       // basic liveness
  });

  // --- list analytics events (read path) ---
  const events = http.get(`${BASE_URL}/api/events`);
  check(events, {
    'events returns 200': (r) => r.status === 200,
    'events response < 500ms': (r) => r.timings.duration < 500,  // individual request SLO
  });

  // --- create an analytics event (write path) ---
  const payload = JSON.stringify({
    event_type: 'page_view',
    user_id: `user-${Math.floor(Math.random() * 1000)}`,   // random user ID for diversity
    metadata: { page: '/dashboard', timestamp: Date.now() },
  });
  const create = http.post(`${BASE_URL}/api/events`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(create, {
    'create returns 201': (r) => r.status === 201,          // write succeeds
  });

  sleep(1);   // think time — simulate real user pausing between actions
}
```

Run it against local docker-compose first:

```bash
# start the local stack
docker compose up -d

# run the baseline test
k6 run load-tests/baseline.js

# expected output (healthy system):
#
#      checks.....................: 100.00% 5000 out of 5000
#      http_req_duration..........: avg=32ms  p(95)=85ms    <-- well under 200ms threshold
#      http_req_failed............: 0.00%                   <-- no errors
#      http_reqs..................: 1800     10/s            <-- steady throughput
#
# All thresholds passed. Exit code 0.
```

### 2. Run stress test — find the breaking point

The stress test ramps VUs progressively until the system degrades. The goal is to identify the exact VU count where errors exceed your tolerance.

```javascript
// load-tests/stress.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';

export const options = {
  stages: [
    { duration: '1m',  target: 50 },     // warm up to 50 VUs
    { duration: '2m',  target: 100 },    // moderate load
    { duration: '2m',  target: 200 },    // heavy load
    { duration: '2m',  target: 400 },    // extreme — expect degradation here
    { duration: '2m',  target: 800 },    // beyond capacity — expect failures
    { duration: '1m',  target: 0 },      // ramp down — does it recover cleanly?
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],     // relaxed — stress tests push limits
    http_req_failed: ['rate<0.05'],       // allow up to 5% errors
  },
};

export default function () {
  // read path — list events
  const events = http.get(`${BASE_URL}/api/events`);
  check(events, {
    'status is 200': (r) => r.status === 200,
    'response < 1s': (r) => r.timings.duration < 1000,
  });

  // write path — create event (simulates transaction data)
  const payload = JSON.stringify({
    event_type: 'transaction',
    user_id: `user-${Math.floor(Math.random() * 10000)}`,       // wider user range
    metadata: { amount: Math.floor(Math.random() * 100000), currency: 'INR' },
  });
  http.post(`${BASE_URL}/api/events`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  sleep(0.5);   // shorter think time — stress test pushes harder
}
```

```bash
# run the stress test
k6 run load-tests/stress.js

# watch for the breaking point in the progressive output:
#   at 100 VUs:  p(95)=85ms,   errors=0.0%    <-- comfortable
#   at 200 VUs:  p(95)=180ms,  errors=0.2%    <-- still within SLO
#   at 400 VUs:  p(95)=890ms,  errors=3.1%    <-- degrading
#   at 800 VUs:  p(95)=4200ms, errors=12.5%   <-- broken
```

**Identifying the bottleneck** — while the stress test runs, open a second terminal:

```bash
# CPU and memory per pod — find what is saturating
kubectl top pods -n cloudplatform
# NAME                                  CPU(cores)   MEMORY(bytes)
# analytics-api-7b9d5c6f8-k2m4n        450m         380Mi         <-- near 500m limit
# analytics-processor-5f4d3c2b1-r7t9w  890m         720Mi         <-- CPU-bound

# check database connection count — the most common bottleneck
kubectl exec -it deploy/postgres -n cloudplatform -- \
  psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
# 95  <-- dangerously close to max_connections (100 default)

# check node-level resources
kubectl top nodes
# NAME              CPU(cores)  CPU%   MEMORY(bytes)  MEMORY%
# ip-10-0-1-100     1800m       90%    6200Mi         77%      <-- near saturation
```

**Common bottleneck hierarchy** (most to least frequent):

```text
1. Database connection pool exhaustion     (fix: increase pool, add pgbouncer)
2. CPU saturation on processor pods         (fix: increase replicas or CPU limits)
3. Memory pressure causing OOMKills         (fix: increase memory limits, fix leaks)
4. Ingress controller throughput ceiling    (fix: increase controller replicas)
5. Node-level resource exhaustion           (fix: add nodes or use larger instances)
```

### 3. Run spike test — salary-day traffic

In BFSI, salary day (1st or last working day of the month) produces a 10-15x traffic spike between 10:00-11:00 AM as salary credits process and employees check balances, initiate transfers, and review statements. The system must absorb this without downtime.

```javascript
// load-tests/spike.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';

export const options = {
  stages: [
    { duration: '1m',  target: 20 },     // normal morning traffic — 9:00 AM
    { duration: '30s', target: 20 },     // steady state before the storm
    { duration: '10s', target: 300 },    // 10:00 AM — salary credits hit — SPIKE
    { duration: '3m',  target: 300 },    // sustained spike for 3 minutes
    { duration: '10s', target: 20 },     // spike passes — employees have checked
    { duration: '2m',  target: 20 },     // recovery — does latency return to normal?
    { duration: '30s', target: 0 },      // cool down
  ],
  thresholds: {
    http_req_duration: ['p(99)<2000'],    // even p99 must stay under 2s during spike
    http_req_failed: ['rate<0.02'],       // max 2% errors during spike
  },
};

export default function () {
  // simulate salary-day API pattern:
  //   1. Check balance  2. List recent transactions  3. Initiate transfer

  const balance = http.get(`${BASE_URL}/api/events?type=balance_check`);
  check(balance, { 'balance check OK': (r) => r.status === 200 });

  const payload = JSON.stringify({
    event_type: 'salary_credit',
    user_id: `emp-${Math.floor(Math.random() * 50000)}`,    // 50K employees
    metadata: { amount: 75000, currency: 'INR', employer: 'acme-corp' },
  });
  const transfer = http.post(`${BASE_URL}/api/events`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(transfer, {
    'transfer accepted': (r) => r.status === 201 || r.status === 200,
  });

  sleep(0.3);   // very short think time — users are anxiously refreshing
}
```

```bash
# run the spike test
k6 run load-tests/spike.js

# key things to watch:
#   1. p95 during spike — does it stay under 1s?
#   2. error rate during spike — any 502/503 from overwhelmed pods?
#   3. recovery time — how quickly does p95 return to baseline after spike ends?
#
# GOOD result:     p95 spikes to 400ms, recovers in <30s,  0.5% errors
# BAD result:      p95 hits 5s+, recovery takes 2+ min,   10% errors
# TERRIBLE result: pods crash (OOMKilled), no recovery without manual restart
```

### 4. Cross-cloud comparison

Run the identical baseline test against each cloud deployment and collect results in JSON format for later analysis in Stage 7:

```bash
# create results directory
mkdir -p results

# test against AWS EKS
k6 run --out json=results/aws-baseline.json \
  -e TARGET_URL=https://aws.cloudplatform.example.com \
  load-tests/baseline.js
# save summary: p50=32ms, p95=85ms, p99=210ms, RPS=41.6, err=0.00%

# test against GCP GKE
k6 run --out json=results/gcp-baseline.json \
  -e TARGET_URL=https://gcp.cloudplatform.example.com \
  load-tests/baseline.js
# save summary: p50=28ms, p95=72ms, p99=185ms, RPS=43.2, err=0.00%

# test against Azure AKS
k6 run --out json=results/azure-baseline.json \
  -e TARGET_URL=https://azure.cloudplatform.example.com \
  load-tests/baseline.js
# save summary: p50=35ms, p95=91ms, p99=240ms, RPS=40.1, err=0.00%
```

Collect the results into a comparison table:

```text
Baseline comparison (10 VUs, 3 min, identical k6 script):

+----------+----------+----------+----------+----------+-----------+
|  Cloud   |  p50(ms) |  p95(ms) |  p99(ms) |  RPS     | Error %   |
+----------+----------+----------+----------+----------+-----------+
|  AWS     |    32    |    85    |   210    |   41.6   |   0.00%   |
|  GCP     |    28    |    72    |   185    |   43.2   |   0.00%   |
|  Azure   |    35    |    91    |   240    |   40.1   |   0.00%   |
+----------+----------+----------+----------+----------+-----------+
```

Run the stress and spike tests against each cloud too — the results feed into Stage 7:

```bash
# stress test — all three clouds (run sequentially, each takes ~10 min)
for cloud in aws gcp azure; do
  k6 run --out json=results/${cloud}-stress.json \
    -e TARGET_URL=https://${cloud}.cloudplatform.example.com \
    load-tests/stress.js
done

# spike test — all three clouds
for cloud in aws gcp azure; do
  k6 run --out json=results/${cloud}-spike.json \
    -e TARGET_URL=https://${cloud}.cloudplatform.example.com \
    load-tests/spike.js
done
```

### 5. Export results to Prometheus/Grafana (optional)

For richer visualisation, pipe k6 metrics to Prometheus:

```bash
# run k6 with Prometheus Remote Write output
k6 run --out experimental-prometheus-rw \
  -e K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
  -e TARGET_URL=https://aws.cloudplatform.example.com \
  load-tests/stress.js

# then in Grafana, import the k6 dashboard (ID: 18030)
# to visualise VUs, RPS, latency percentiles, and error rate over time
```

This produces time-series data rather than point-in-time summaries, letting you see exactly when degradation starts and correlate it with Kubernetes pod metrics.

---

## Part 3 — Key Patterns

### Pattern 1: Always warm up before measuring

A cold cache, cold JIT, or freshly started connection pool produces artificially high latencies. Add a warm-up stage that you exclude from your analysis:

```javascript
export const options = {
  stages: [
    { duration: '30s', target: 5 },     // warm-up — not part of measurement
    { duration: '3m',  target: 50 },    // actual measurement window
    { duration: '30s', target: 0 },     // cool-down
  ],
};
```

### Pattern 2: Test from a realistic network location

Testing from the same VPC as your deployment measures best-case latency (~1ms). Real users connect over the internet with DNS lookups, TLS handshakes, and ISP routing (50-150ms). Run k6 from a different region or from a CI runner in a neutral network to get numbers that match reality.

### Pattern 3: Use tags for per-endpoint analysis

k6 groups all HTTP requests together by default. Tag requests to see per-endpoint latency:

```javascript
const health = http.get(`${BASE_URL}/api/healthz`, {
  tags: { name: 'healthz' },            // tag this request type
});
const events = http.get(`${BASE_URL}/api/events`, {
  tags: { name: 'list_events' },         // separate tag for event listing
});
```

Then in the output, each tagged endpoint gets its own latency metrics — revealing that `/api/events` is 5x slower than `/api/healthz`.

### Pattern 4: Custom metrics for business-specific SLOs

Beyond HTTP latency, track metrics that matter to the business:

```javascript
import { Trend, Counter } from 'k6/metrics';

const transferDuration = new Trend('transfer_duration');    // custom timing metric
const failedTransfers = new Counter('failed_transfers');    // custom counter

export default function () {
  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/events`, payload, { headers });
  transferDuration.add(Date.now() - start);                 // record per-transfer time

  if (res.status !== 201) {
    failedTransfers.add(1);                                 // count failed transfers
  }
}
```

### Pattern 5: CI integration — fail the build on performance regression

Add k6 to your CI pipeline so regressions are caught before merge:

```yaml
# .github/workflows/load-test.yml (snippet)
- name: Run baseline load test
  run: |
    k6 run load-tests/baseline.js \
      -e TARGET_URL=${{ secrets.STAGING_URL }}
  # k6 exits with code 99 if any threshold is breached
  # GitHub Actions treats non-zero exit as build failure
```

---

## Part 4 — Common Mistakes

- **No think time (sleep) between requests:** Without `sleep()`, k6 generates unrealistic closed-loop traffic where the next request fires instantly after the previous response. Real users pause between actions. Add 0.3-1s think time. Without it, 50 VUs can generate 2,500 RPS — 50x more than 50 real users would produce.

- **Testing from the same region as the deployment:** This measures intra-VPC latency of ~1ms, not what real users experience across the internet (50-150ms). Test from a different region or outside the cloud network entirely.

- **Ignoring p99 because p95 looks fine:** If p95 is 80ms but p99 is 3s, 1 in 100 users is having a terrible experience. In BFSI, that 1% might be 500 salary transfers per hour that time out. Always check the tail.

- **Running one test and declaring victory:** A single baseline test proves nothing about system behaviour under stress. You need baseline (what is normal?), stress (where does it break?), and spike (does it survive real-world bursts?). Each reveals different failure modes.

- **Not monitoring the target during tests:** k6 tells you the symptoms (high latency, errors). Resource monitoring (`kubectl top pods`, database metrics, Kafka consumer lag) tells you the cause. Without both, you know the system broke but not why.

- **Testing with unrealistic data:** If your test creates the same event payload every time, database caching behaves differently from production where data is diverse. Randomise user IDs, amounts, and event types.

- **Comparing results across different time windows:** Running the AWS test on Monday morning and the Azure test on Friday afternoon means network conditions and cloud load differ. Run all tests within the same window.

- **Not saving raw results:** The k6 summary output is useful but limited. Always use `--out json=results/test.json` to save the full time-series data. You will need to re-analyse it when comparing clouds or tracking regressions over time.

---

## Exercises

See the `exercises/` directory for guided walkthroughs:

1. [Baseline load test](exercises/01-baseline-load-test.md) — run k6 baseline against local docker-compose, interpret the results
2. [Stress test](exercises/02-stress-test.md) — run stress test, find the breaking point, identify the bottleneck
3. [Spike test](exercises/03-spike-test.md) — run salary-day spike test, measure recovery time
4. [Cross-cloud comparison](exercises/04-cross-cloud-comparison.md) — run identical tests against all three clouds, tabulate results

---

**Next stage:** [07-comparison](../07-comparison/README.md) — synthesise cost, performance, and developer experience into a multi-cloud decision framework.
