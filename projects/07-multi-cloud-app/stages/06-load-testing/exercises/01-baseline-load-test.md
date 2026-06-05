# Exercise 1: Baseline Load Test

**Goal:** Run a k6 baseline test against local docker-compose and interpret the results.

## Step 1: Start the local stack

```bash
docker compose up -d                     # start CloudPlatform locally
docker compose ps                        # verify all services are healthy
```

## Step 2: Verify the test script exists

```bash
ls load-tests/baseline.js                # should exist from the README walkthrough
```

If not, copy `baseline.js` from the stage README into `load-tests/baseline.js`.

## Step 3: Run the baseline test

```bash
k6 run load-tests/baseline.js
```

Expected output (healthy system):
- `http_req_duration` p(95) well under 200ms
- `http_req_failed` at 0.00%
- All checks pass at 100%
- Throughput around 10-15 req/s with 10 VUs

## Step 4: Interpret the key metrics

Look at the summary output and answer:
- What is the **p50** (median) latency? This is the typical user experience.
- What is the **p95** latency? This is your SLO target.
- What is the **p99** latency? This is the tail — the worst 1%.
- What is the **error rate**? Should be 0% for a healthy baseline.
- What is the **RPS** (requests per second)? This is your throughput.

## Step 5: Save results for later comparison

```bash
mkdir -p results
k6 run --out json=results/local-baseline.json load-tests/baseline.js
```

## Verify

The test completes with exit code 0 (all thresholds passed). You can articulate what p50, p95, p99, and RPS mean for your CloudPlatform deployment.
