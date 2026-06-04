# Exercise 2: Multi-Tenant Queries

1. Create a second remote_write config with `X-Scope-OrgID: test-team`
2. Add a second Grafana datasource pointing to Mimir with the `test-team` org ID
3. Verify that querying from `test-team` datasource shows no data from `observashop` tenant
4. Write a recording rule in Mimir for `observashop:p95_latency:5m`
5. Query the recording rule — verify it returns pre-computed results
