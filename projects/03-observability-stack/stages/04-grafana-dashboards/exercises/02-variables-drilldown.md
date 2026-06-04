# Exercise 2: Variables and Drill-Down Links

1. Add a template variable `$service` using `label_values(up, job)`
2. Update all panels to filter by `{job="$service"}`
3. Verify the dropdown switches between gateway, order-svc, payment-svc, inventory-svc
4. Add a data link on the latency panel that opens Tempo with the time range
5. Add an annotation for "deployment" and verify it appears on all panels
