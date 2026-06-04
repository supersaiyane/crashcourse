# Exercise 3: Add a Custom Metric

1. Open `services/inventory-svc/app.py`
2. Add a new Histogram: `inventory_check_duration_seconds`
3. Instrument the `/check` endpoint to observe this metric
4. Rebuild: `docker-compose build inventory-svc && docker-compose up -d inventory-svc`
5. Generate traffic and verify the new metric at `http://localhost:8083/metrics`
6. Write a PromQL query for the p95 of your new metric
