# Exercise 3: Spike Test (Salary-Day Scenario)

**Goal:** Simulate a BFSI salary-day traffic spike (20 to 300 VUs in 10 seconds) and measure recovery time.

## Step 1: Run the spike test

```bash
k6 run load-tests/spike.js
```

The test simulates: normal traffic (20 VUs) -> sudden spike to 300 VUs -> sustained spike -> return to normal.

## Step 2: Record spike behaviour

Watch the output and note three key metrics during the spike phase:

```text
During spike (300 VUs):
  p95 latency:    ___ ms     (target: <1000ms)
  Error rate:     ___%       (target: <2%)

After spike (back to 20 VUs):
  Recovery time:  ___ seconds (time until p95 returns to pre-spike baseline)
```

## Step 3: Classify the result

```text
[ ] GOOD:     p95 < 500ms during spike, recovery < 30s, errors < 1%
[ ] BAD:      p95 > 1s during spike, recovery > 2 min, errors > 5%
[ ] TERRIBLE: pods OOMKilled during spike, no recovery without restart
```

## Step 4: Check for pod restarts

```bash
kubectl get pods -n cloudplatform          # check RESTARTS column
# Any non-zero restart count during spike indicates OOMKill or crash
```

## Step 5: Evaluate autoscaling response (if configured)

```bash
kubectl get hpa -n cloudplatform           # did HPA scale up during spike?
kubectl get pods -n cloudplatform          # did replica count increase?
```

## Verify

You have measured p95 during spike, error rate during spike, and recovery time. You can explain whether CloudPlatform would survive a real salary-day scenario and what changes would be needed if it would not.
