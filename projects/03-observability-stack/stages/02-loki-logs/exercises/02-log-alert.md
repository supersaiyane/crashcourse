# Exercise 2: Build a Log-Based Alert

1. In Grafana, go to Alerting → Alert Rules → New
2. Create a rule that fires when the error log rate exceeds 5/minute for any service
3. Query: `sum(rate({container=~"observashop.*"} | json | level="error" [5m])) by (service) > 0.083`
4. Set evaluation interval to 1m, pending period to 5m
5. Add a notification contact point (use webhook to localhost for testing)
6. Trigger the alert by making 10 rapid requests that cause payment failures
