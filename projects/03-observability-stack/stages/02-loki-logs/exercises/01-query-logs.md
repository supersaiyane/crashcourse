# Exercise 1: Query Logs in Grafana

1. Open Grafana Explore → Loki datasource
2. Write a LogQL query that shows only payment service errors
3. Use `| json` to parse and filter by `amount > 1000`
4. Use `| line_format` to show only `{{.service}}: {{.msg}} ({{.order_id}})`
5. Create a metric query: error rate per service over the last 30 minutes
