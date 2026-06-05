# Exercise 4: Cross-Cloud Comparison

**Goal:** Run the identical baseline test against all three cloud deployments and tabulate the results.

## Step 1: Run baseline against AWS EKS

```bash
mkdir -p results

k6 run --out json=results/aws-baseline.json \
  -e TARGET_URL=https://aws.cloudplatform.example.com \
  load-tests/baseline.js
```

Record: p50=___ms, p95=___ms, p99=___ms, RPS=___, err=___%

## Step 2: Run baseline against GCP GKE

```bash
k6 run --out json=results/gcp-baseline.json \
  -e TARGET_URL=https://gcp.cloudplatform.example.com \
  load-tests/baseline.js
```

Record: p50=___ms, p95=___ms, p99=___ms, RPS=___, err=___%

## Step 3: Run baseline against Azure AKS

```bash
k6 run --out json=results/azure-baseline.json \
  -e TARGET_URL=https://azure.cloudplatform.example.com \
  load-tests/baseline.js
```

Record: p50=___ms, p95=___ms, p99=___ms, RPS=___, err=___%

## Step 4: Fill in the comparison table

```text
+----------+----------+----------+----------+----------+-----------+
|  Cloud   |  p50(ms) |  p95(ms) |  p99(ms) |  RPS     | Error %   |
+----------+----------+----------+----------+----------+-----------+
|  AWS     |          |          |          |          |           |
|  GCP     |          |          |          |          |           |
|  Azure   |          |          |          |          |           |
+----------+----------+----------+----------+----------+-----------+
```

## Step 5: Identify the performance winner

Which cloud has the lowest p95? The highest RPS? The most consistent p99?

## Verify

You have three JSON result files in `results/` and a completed comparison table. All three tests used the identical `baseline.js` script with the same VU count and duration. The results feed into Stage 7.
