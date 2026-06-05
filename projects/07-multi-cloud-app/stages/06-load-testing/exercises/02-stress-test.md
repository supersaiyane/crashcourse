# Exercise 2: Stress Test

**Goal:** Run a stress test to find CloudPlatform's breaking point and identify the bottleneck.

## Step 1: Run the stress test

```bash
k6 run load-tests/stress.js
```

Watch the progressive output as VUs ramp from 50 to 800.

## Step 2: Identify the breaking point

Note the VU count where:
- p95 latency exceeds 500ms
- Error rate exceeds 5%

```text
Record your findings:
  Breaking VU count: ___
  p95 at break:      ___ ms
  Error rate at break: ___%
```

## Step 3: Monitor resources during the test

In a second terminal, while the stress test runs:

```bash
kubectl top pods -n cloudplatform          # CPU and memory per pod
kubectl top nodes                          # node-level resource usage
```

Identify which component saturates first (API, processor, or database).

## Step 4: Check database connections

```bash
kubectl exec -it deploy/postgres -n cloudplatform -- \
  psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
# Compare against max_connections (default 100)
```

## Step 5: Document the bottleneck

```text
Primary bottleneck:   [ ] CPU  [ ] Memory  [ ] DB connections  [ ] Network
Affected component:   _________________________
Recommended fix:      _________________________
```

## Verify

You have identified the VU count where CloudPlatform breaks, the primary bottleneck (CPU, memory, or DB connections), and the component responsible. The stress test log shows a clear degradation curve.
