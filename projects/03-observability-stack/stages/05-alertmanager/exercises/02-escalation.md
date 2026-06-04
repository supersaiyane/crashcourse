# Exercise 2: Configure Escalation

1. Edit `alerts/alertmanager.yml`
2. Add a new route: if severity=critical AND alertname=HighPaymentFailureRate, send to both pagerduty AND slack
3. Add `continue: true` to the critical route so it falls through to the next matching route
4. Reload Alertmanager: `curl -X POST http://localhost:9093/-/reload`
5. Verify by generating payment failures (stop and restart payment-svc rapidly)
