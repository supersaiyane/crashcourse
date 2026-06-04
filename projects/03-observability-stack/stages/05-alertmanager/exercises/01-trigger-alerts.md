# Exercise 1: Trigger and Route Alerts

1. Stop payment-svc: `docker-compose stop payment-svc`
2. Wait 1 minute — verify ServiceDown fires in Prometheus Alerts
3. Check Alertmanager — which receiver did it route to?
4. Create a silence for this alert with a 30-minute duration
5. Restart payment-svc — verify the alert resolves
6. Delete the silence
