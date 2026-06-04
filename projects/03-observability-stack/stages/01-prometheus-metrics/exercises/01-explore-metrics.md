# Exercise 1: Explore Metrics Endpoints

1. Start the stack: `cd ObservaShop && docker-compose up -d`
2. Curl each service's `/metrics` endpoint and identify: one Counter, one Histogram, one Gauge
3. Create 5 orders via the gateway API
4. Curl `/metrics` again — verify the counters incremented
5. Find the `payment_processing_seconds_bucket` lines — how many buckets are there? What are the boundaries?
