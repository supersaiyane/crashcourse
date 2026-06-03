# Exercise 2: PromQL Queries — From Basics to Aggregations

In this exercise, you will run PromQL queries against real cluster metrics to understand how Prometheus data works. You'll start with simple lookups and progress to multi-step aggregations used in production alerting.

## Prerequisites

- Prometheus UI accessible at `http://localhost:9090` (from Exercise 1)
- The monitoring stack is scraping cluster metrics
- Cutlink is deployed and generating traffic (run `curl http://localhost:8080/links` a few times)

---

## Part 1: Understanding Metric Types

Prometheus has four metric types. Understanding them is essential for writing correct queries.

### Counter

A counter only increases (or resets to zero on restart). It represents a cumulative count.

**Examples:** `http_requests_total`, `node_cpu_seconds_total`, `container_restarts_total`

**How to query counters:**
- Never query a counter raw — the value means "total since process started."
- Always use `rate()`, `irate()`, or `increase()` to make them meaningful.

**Try it:**
```promql
# Raw counter — not useful (just a big number that grows)
node_cpu_seconds_total

# Rate — useful: per-second CPU time averaged over 5m
rate(node_cpu_seconds_total[5m])

# Increase — useful: total CPU time in the last hour
increase(node_cpu_seconds_total[1h])
```

### Gauge

A gauge goes up and down. It represents a current value.

**Examples:** `node_memory_usage_bytes`, `container_memory_usage_bytes`, `node_load1`

**How to query gauges:**
- Raw values are meaningful (current state).
- Use `avg_over_time()`, `max_over_time()`, `min_over_time()` for historical aggregations.

**Try it:**
```promql
# Raw gauge — current memory usage
container_memory_usage_bytes{namespace="cutlink"}

# Average over 5m (smooths out spikes)
avg_over_time(container_memory_usage_bytes{namespace="cutlink"}[5m])

# Maximum in the last 30m (peak usage)
max_over_time(container_memory_usage_bytes{namespace="cutlink"}[30m])
```

### Histogram

A histogram samples observations and counts them in configurable buckets. It also tracks sum and count.

**Examples:** `flask_http_request_duration_seconds_bucket`, `flask_http_request_duration_seconds_sum`, `flask_http_request_duration_seconds_count`

**How to query histograms:**
- Calculate percentiles with `histogram_quantile()`.
- Calculate averages with `sum(rate(..._sum)) / sum(rate(..._count))`.

**Try it** (once Cutlink metrics are available):
```promql
# p95 request duration
histogram_quantile(0.95, rate(flask_http_request_duration_seconds_bucket[5m]))

# Average request duration
rate(flask_http_request_duration_seconds_sum[5m])
/
rate(flask_http_request_duration_seconds_count[5m])
```

### Summary

Similar to a histogram but pre-computes quantiles on the client side. Less flexible than histograms because you can't aggregate them across dimensions. Prefer histograms in your own instrumentation.

---

## Part 2: Instant Vectors vs Range Vectors

Understanding this distinction is critical. It's the most common source of PromQL confusion.

### Instant Vector

A set of time series, each with **one sample value** at the query timestamp.

```promql
# Returns one value per time series at "now"
up
```

Output:
```
up{instance="10.0.0.1:9100", job="node-exporter"}  1
up{instance="10.0.0.2:9100", job="node-exporter"}  1
up{instance="10.0.0.3:9100", job="node-exporter"}  0
```

### Range Vector

A set of time series, each with **multiple samples** over a time window.

```promql
# Returns all samples from the last 5 minutes for each time series
up[5m]
```

You typically don't display range vectors directly. You pass them to functions like `rate()`, `avg_over_time()`, `increase()` that consume range vectors and return instant vectors.

**Key rule:** Functions like `rate()` need a range vector (`[5m]`). Metrics like `up` return an instant vector. You must add the range selector:

```promql
# Wrong — rate() needs a range vector
rate(up)

# Correct
rate(up[5m])
```

### Common Range Selectors

| Duration | Use Case |
|----------|----------|
| `[5m]` | Standard for alerting (balances recency vs stability) |
| `[1m]` | Fast-reacting dashboards (noisier) |
| `[30m]` | Slow-moving metrics (disk usage trends) |
| `[1h]` | Capacity planning queries |

---

## Part 3: Label Matching

Labels are how Prometheus achieves multi-dimensional data. Every metric has labels, and you filter and aggregate using them.

### Exact Match (`=`)

```promql
# Only metrics where namespace equals "cutlink"
container_memory_usage_bytes{namespace="cutlink"}
```

### Negative Match (`!=`)

```promql
# All metrics except idle CPU mode
node_cpu_seconds_total{mode!="idle"}
```

### Regex Match (`=~`)

```promql
# All 4xx and 5xx status codes
http_requests_total{status=~"[45].."}

# Pods with names containing "api"
container_memory_usage_bytes{pod=~".*api.*"}
```

### Negative Regex (`!~`)

```promql
# Exclude idle and iowait CPU modes
node_cpu_seconds_total{mode!~"idle|iowait"}
```

### Multiple Label Matchers

Combine conditions with commas (they AND together):

```promql
# Memory usage of cutlink pods that are not idle
container_memory_usage_bytes{namespace="cutlink", pod!=""}
```

The `pod=""` condition excludes cAdvisor aggregated metrics that don't belong to a specific pod.

---

## Part 4: Aggregation Operators

### `sum by()`

Sum values, grouped by specific labels:

```promql
# Total memory usage per namespace
sum by(namespace) (container_memory_usage_bytes)

# Request rate per endpoint
sum by(endpoint) (rate(flask_http_request_total[5m]))
```

### `avg by()`

Average values, grouped by labels:

```promql
# Average CPU utilization per node
avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))
```

### `topk()` / `bottomk()`

Top or bottom K values:

```promql
# Top 5 memory-consuming pods
topk(5, sum by(pod) (container_memory_usage_bytes{namespace="cutlink"}))

# Bottom 3 nodes by available disk
bottomk(3, node_filesystem_avail_bytes{mountpoint="/"})
```

### `count by()`

Count the number of time series:

```promql
# How many pods are running in each namespace
count by(namespace) (kube_pod_status_phase{phase="Running"})
```

### `quantile by()`

Calculate a quantile across all values (not to be confused with `histogram_quantile`):

```promql
# The memory usage value at which 95% of pods are below
quantile by(namespace) (0.95, container_memory_usage_bytes)
```

---

## Part 5: Common Query Patterns

### Pattern 1: Error Ratio

```promql
# Fraction of requests returning 5xx
rate(http_requests_total{status=~"5.."}[5m])
/
rate(http_requests_total[5m])
```

**Why this works:** Both `rate()` calls return values in "per second" units, so the division gives a unitless ratio between 0 and 1. Multiply by 100 for a percentage.

### Pattern 2: Utilization Percentage

```promql
# CPU utilization percentage per node
100 * (1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))
```

**Why this works:** `node_cpu_seconds_total` sums all CPU modes. If idle is 80%, then non-idle is 20%. We compute `1 - idle_fraction` to get utilization.

### Pattern 3: Average Request Duration

```promql
# Average request duration in seconds
rate(http_request_duration_seconds_sum[5m])
/
rate(http_request_duration_seconds_count[5m])
```

**Why this works:** `_sum` is the total seconds spent serving requests. `_count` is the total number of requests. Their ratio is the average duration. Using `rate()` makes it a sliding window average.

### Pattern 4: Predict Remaining Capacity

```promql
# Predict when disk will fill up (linear regression)
predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[6h], 86400) < 0
```

**Why this works:** `predict_linear()` fits a linear regression to 6 hours of data and projects forward 86400 seconds (24 hours). If the projection is below zero, you'll run out of disk within a day.

### Pattern 5: Comparing Current to Previous

```promql
# Compare current error rate to 1 hour ago
(
  rate(http_requests_total{status=~"5.."}[5m])
  /
  rate(http_requests_total[5m])
)
/
(
  rate(http_requests_total{status=~"5.."}[5m] offset 1h)
  /
  rate(http_requests_total[5m] offset 1h)
)
```

**Why this works:** The `offset 1h` modifier shifts the query window back by 1 hour. The ratio tells you "current error rate divided by error rate 1 hour ago." A value > 1 means errors are increasing.

---

## Part 6: Hands-On Query Lab

Run these queries against your cluster. Write down the results and understand what each one tells you.

### Infrastructure Health

```promql
# 1. Which targets are up?
up

# 2. Give me the UP status specifically for kubelet
up{job="kubelet"}

# 3. How many nodes are in the cluster?
count(kube_node_info)

# 4. Which nodes are not ready?
kube_node_status_condition{condition="Ready", status="true"} != 1
```

### Node Resource Usage

```promql
# 5. CPU utilization per node (as a fraction, 0 = idle, 1 = fully busy)
1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))

# 6. Memory utilization per node
1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes

# 7. Disk utilization per node (root filesystem)
node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}

# 8. 1-minute load average per node
node_load1
```

### Pod Resource Usage

```promql
# 9. CPU usage per pod (as a rate, so "per second" — typically small decimal values)
sum by(pod) (rate(container_cpu_usage_seconds_total{namespace="cutlink"}[5m]))

# 10. Memory usage per pod
sum by(pod) (container_memory_usage_bytes{namespace="cutlink"})

# 11. Network receive bytes per pod
sum by(pod) (rate(container_network_receive_bytes_total{namespace="cutlink"}[5m]))

# 12. Which pods have restarted?
increase(kube_pod_container_status_restarts_total[10m]) > 0
```

### Application Metrics (requires Cutlink instrumentation)

```promql
# 13. Request rate to Cutlink
rate(flask_http_request_total[5m])

# 14. Request rate by endpoint
sum by(endpoint) (rate(flask_http_request_total[5m]))

# 15. 5xx error rate
rate(flask_http_request_total{status=~"5.."}[5m])

# 16. Error ratio
rate(flask_http_request_total{status=~"5.."}[5m]) / rate(flask_http_request_total[5m])
```

---

## Part 7: Binary Operators and Vector Matching

Sometimes you need to combine two different metrics. PromQL supports binary operators (`+`, `-`, `*`, `/`, `%`) with vector matching.

### One-to-One Matching

```promql
# Memory usage as a fraction of memory limit (per container)
container_memory_usage_bytes / container_spec_memory_limit_bytes
```

This works when both sides have identical label sets. If labels don't match exactly, you may get no results or unexpected results.

### Many-to-One Matching with `group_left`

```promql
# Memory usage with pod info labels attached
container_memory_usage_bytes{namespace="cutlink"}
  / on(namespace, pod) group_left(node)
  container_spec_memory_limit_bytes{namespace="cutlink"}
```

**Use `group_left`** when the left side has more labels than the right side. The `on(...)` clause specifies the join keys.

---

## Summary

You should now be able to:

1. Distinguish between counter, gauge, and histogram metrics
2. Understand instant vectors vs range vectors
3. Filter metrics using label matching (exact, negative, regex)
4. Aggregate metrics with `sum`, `avg`, `topk`, `count`
5. Compute error ratios, utilization percentages, and average durations
6. Use `offset` to compare current metrics against historical baselines

In the next exercise, you will create a ServiceMonitor for Cutlink, write alerting rules, and trigger real alerts.
