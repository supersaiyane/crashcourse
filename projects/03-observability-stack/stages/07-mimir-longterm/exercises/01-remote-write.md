# Exercise 1: Configure Remote Write to Mimir

1. Add `remote_write` section to `prometheus.yml` pointing to Mimir
2. Set `X-Scope-OrgID: observashop` header
3. Restart Prometheus: `docker-compose restart prometheus`
4. Add Mimir as a new Prometheus datasource in Grafana
5. Query `gateway_requests_total` from both Prometheus and Mimir — verify they return the same data
6. Wait 20 minutes, then query a 30-minute range from Mimir — verify data spans the full window
