# Exercise 2: Performance Analysis

**Goal:** Tabulate the k6 results from Stage 6 into baseline, stress, and spike comparison tables.

## Step 1: Gather your k6 results

Locate the JSON result files from Stage 6:

```bash
ls results/
# aws-baseline.json  gcp-baseline.json  azure-baseline.json
# aws-stress.json    gcp-stress.json    azure-stress.json
# aws-spike.json     gcp-spike.json     azure-spike.json
```

## Step 2: Fill in the baseline comparison

From each baseline test summary, extract p50, p95, p99, RPS, and error rate:

```text
Baseline (10 VUs, 3 minutes):
+----------+----------+----------+----------+----------+-----------+
|  Cloud   |  p50(ms) |  p95(ms) |  p99(ms) |  RPS     | Error %   |
+----------+----------+----------+----------+----------+-----------+
|  AWS     |          |          |          |          |           |
|  GCP     |          |          |          |          |           |
|  Azure   |          |          |          |          |           |
+----------+----------+----------+----------+----------+-----------+
```

## Step 3: Fill in the stress comparison

From each stress test, identify the breaking VU count, p95 at break, max RPS, and peak error rate:

```text
Stress (ramp to 800 VUs):
+----------+----------------+----------------+-----------+-----------+
|  Cloud   |  Breaking VU   |  p95 at break  |  Max RPS  | Peak err% |
+----------+----------------+----------------+-----------+-----------+
|  AWS     |                |                |           |           |
|  GCP     |                |                |           |           |
|  Azure   |                |                |           |           |
+----------+----------------+----------------+-----------+-----------+
```

## Step 4: Fill in the spike comparison

From each spike test, record p95 during spike, recovery time, and error rate:

```text
Spike (20 -> 300 VUs in 10s):
+----------+------------------+------------------+-------------------+
|  Cloud   |  p95 during spike|  Recovery time   |  Errors in spike  |
+----------+------------------+------------------+-------------------+
|  AWS     |                  |                  |                   |
|  GCP     |                  |                  |                   |
|  Azure   |                  |                  |                   |
+----------+------------------+------------------+-------------------+
```

## Step 5: Rank the clouds by performance

Which cloud ranks first across baseline, stress, and spike? Is it consistent?

## Verify

You have three completed comparison tables (baseline, stress, spike) with actual numbers from your k6 runs. You can identify the performance winner and explain why (network architecture, database handling, scaling speed).
