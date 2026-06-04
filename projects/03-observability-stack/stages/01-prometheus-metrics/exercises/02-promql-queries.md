# Exercise 2: Write PromQL Queries

Open Prometheus UI at `http://localhost:9090`. Write queries for:

1. Total requests to the gateway in the last hour (`increase()`)
2. Request rate per second, grouped by HTTP method (`rate()` + `by`)
3. p95 and p99 latency for the `/api/orders` endpoint (`histogram_quantile()`)
4. Payment failure rate as a percentage
5. Which SKU has the lowest inventory? (`bottomk()` + `inventory_stock_level`)
6. Average order processing time (`rate(sum)` / `rate(count)`)
