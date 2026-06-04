# Exercise 1: Trace a Request End-to-End

1. Generate an order via the gateway API
2. Open Grafana → Explore → Tempo
3. Find the trace by searching for service="gateway"
4. Screenshot the waterfall — identify all 4 services in the trace
5. Click through to Loki logs for the payment-svc span
6. Verify the trace ID matches across all log entries
