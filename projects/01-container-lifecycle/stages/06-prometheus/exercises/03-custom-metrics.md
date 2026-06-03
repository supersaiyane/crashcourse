# Exercise 3: Custom Metrics, ServiceMonitors, and Alerting

In this exercise, you will connect Cutlink's application metrics to Prometheus, write alerting rules, and trigger real alerts to verify your setup.

## Prerequisites

- Prometheus and Grafana deployed (Exercise 1)
- Cutlink running in the `cutlink` namespace
- Your Prometheus UI and Grafana are accessible via port-forward

---

## Step 1: Verify Cutlink Exposes Metrics

First, confirm that Cutlink's Flask application exposes Prometheus metrics.

```bash
# Port-forward to Cutlink's backend
kubectl port-forward svc/cutlink-backend 8080:80 -n cutlink
```

In a separate terminal:

```bash
# Check the /metrics endpoint
curl http://localhost:8080/metrics | head -30
```

Expected output (the exact metrics depend on Cutlink's instrumentation):

```
# HELP flask_http_request_total Total number of HTTP requests
# TYPE flask_http_request_total counter
flask_http_request_total{method="GET",status="200",endpoint="/links"} 15.0
flask_http_request_total{method="POST",status="201",endpoint="/links"} 5.0
flask_http_request_total{method="GET",status="200",endpoint="/"} 20.0

# HELP flask_http_request_duration_seconds HTTP request duration in seconds
# TYPE flask_http_request_duration_seconds histogram
flask_http_request_duration_seconds_bucket{le="0.005",endpoint="/links"} 10.0
flask_http_request_duration_seconds_bucket{le="0.01",endpoint="/links"} 18.0
flask_http_request_duration_seconds_bucket{le="0.025",endpoint="/links"} 20.0
flask_http_request_duration_seconds_bucket{le="+Inf",endpoint="/links"} 20.0
flask_http_request_duration_seconds_count{endpoint="/links"} 20.0
flask_http_request_duration_seconds_sum{endpoint="/links"} 0.45

# HELP flask_http_request_exceptions_total Total number of exceptions
# TYPE flask_http_request_exceptions_total counter
flask_http_request_exceptions_total{endpoint="/links"} 0.0
```

If Cutlink does not expose metrics yet, add `prometheus_flask_exporter` to the application:

```python
from prometheus_flask_exporter import PrometheusMetrics

app = Flask(__name__)
metrics = PrometheusMetrics(app)
# This automatically instruments all Flask routes
# and exposes /metrics endpoint
```

## Step 2: Create the ServiceMonitor

Apply the ServiceMonitor that tells Prometheus to scrape Cutlink's metrics:

```bash
kubectl apply -f ../config/servicemonitor.yaml
```

Verify it was created:

```bash
kubectl get servicemonitor cutlink-backend -n monitoring
```

Expected output:

```
NAME              AGE
cutlink-backend   10s
```

### What Happened?

1. You created a `ServiceMonitor` CRD in the `monitoring` namespace.
2. It matches Services with label `app: cutlink-backend` in the `cutlink` namespace.
3. It tells Prometheus to scrape port `metrics` every 15 seconds at the `/metrics` path.
4. The Prometheus Operator detected the new CRD and updated Prometheus's scrape configuration.
5. Prometheus reloaded its configuration and started scraping Cutlink.

### Verify Scraping

In the Prometheus UI at `http://localhost:9090`:

1. Go to **Status > Targets**.
2. Look for `serviceMonitor/monitoring/cutlink-backend/0`.
3. Its status should be **UP**.

If the status is **DOWN**, check:

```bash
# Verify the Service exists and has the right port name
kubectl get svc -n cutlink cutlink-backend -o yaml | grep -A5 ports

# Check ServiceMonitor details
kubectl describe servicemonitor cutlink-backend -n monitoring
```

## Step 3: Run PromQL Queries Against Cutlink Metrics

Generate some traffic to Cutlink so metrics have data:

```bash
# Generate traffic in a loop
for i in $(seq 1 100); do
  curl -s -o /dev/null http://localhost:8080/
  curl -s -o /dev/null http://localhost:8080/links
  sleep 0.1
done
```

Now run these queries in the Prometheus UI:

**Request rate:**
```promql
rate(flask_http_request_total[5m])
```

**Request rate by endpoint:**
```promql
sum by(endpoint) (rate(flask_http_request_total[5m]))
```

**Average request duration:**
```promql
rate(flask_http_request_duration_seconds_sum[5m])
/
rate(flask_http_request_duration_seconds_count[5m])
```

**p99 latency:**
```promql
histogram_quantile(0.99, sum by(le) (rate(flask_http_request_duration_seconds_bucket[5m])))
```

## Step 4: Create PrometheusRules

Apply the alerting and recording rules:

```bash
kubectl apply -f ../config/prometheusrule.yaml
```

Verify:

```bash
kubectl get prometheusrule -n monitoring
```

Expected output:

```
NAME              AGE
cutlink-alerts    10s
```

### Recording Rules in Action

Wait 30 seconds for the first evaluation, then query one of the recording rules:

```promql
namespace:flask_http_request_total:rate5m
```

This should return the same value as:

```promql
sum by(namespace) (rate(flask_http_request_total[5m]))
```

The recording rule pre-computes the result every 30 seconds, so dashboards and other queries can read it instantly without recomputing the `rate()` aggregation.

### Understanding Rule Evaluation

Prometheus evaluates rules on a schedule. You can see rule evaluation metrics:

```promql
# How long each rule evaluation takes
prometheus_rule_evaluation_duration_seconds

# Rule evaluations that have failed
prometheus_rule_evaluation_failures_total
```

These metrics are useful for diagnosing slow rules that might need optimization or conversion to recording rules.

## Step 5: Trigger and Observe Alerts

### Simulate High Error Rate

Create a Cutlink endpoint that always returns a 500 error, or temporarily break the app to trigger the `CutlinkHighErrorRate` alert:

```bash
# Generate 500 errors by hitting a non-existent endpoint
for i in $(seq 1 50); do
  curl -s -o /dev/null http://localhost:8080/error-endpoint
  sleep 0.2
done
```

Wait 5 minutes (the `for: 5m` duration in the alert rule). Then check alerts in Prometheus:

**Prometheus UI:** Go to **Alerts** tab. Look for `CutlinkHighErrorRate`.

**States:**
- **Inactive** — the condition is not met (alert is not firing)
- **Pending** — the condition is met but hasn't lasted long enough (`for` duration)
- **Firing** — the condition has been met for the full `for` duration

If the alert is **Pending**, wait until it becomes **Firing**.

### Simulate Service Down

To trigger `CutlinkDown`:

```bash
# Scale Cutlink to zero replicas
kubectl scale deployment cutlink-backend --replicas=0 -n cutlink
```

Wait 5 minutes, then check the Alerts page for `CutlinkDown`. The alert should show as **Firing**.

Don't forget to scale Cutlink back up:

```bash
kubectl scale deployment cutlink-backend --replicas=1 -n cutlink
```

## Step 6: View Alerts in Alertmanager

Port-forward to Alertmanager:

```bash
kubectl port-forward svc/prometheus-kube-prometheus-alertmanager 9093:9093 -n monitoring
```

Open `http://localhost:9093` in a browser.

Alertmanager shows:
- **Active alerts** — currently firing alerts that Alertmanager has received
- **Silences** — muted alerts (for maintenance windows)
- **Status** — Alertmanager cluster status (if running in HA mode)

### Alert Lifecycle in Alertmanager

1. Prometheus fires an alert → sends HTTP POST to Alertmanager
2. Alertmanager receives the alert → applies grouping, inhibition, routing
3. Alertmanager sends notification to configured receivers (email, Slack, PagerDuty)

In our setup, no receivers are configured (we installed with defaults), so alerts will appear in Alertmanager but won't trigger notifications. To add notification channels, update the Alertmanager configuration Secret.

### Configuring a Slack Notification (Optional)

Get the current Alertmanager config:

```bash
kubectl get secret alertmanager-prometheus-kube-prometheus-alertmanager \
  -n monitoring -o jsonpath="{.data.alertmanager\.yaml}" | base64 --decode
```

Edit the secret to add a Slack receiver:

```bash
kubectl edit secret alertmanager-prometheus-kube-prometheus-alertmanager -n monitoring
```

Add a receiver configuration (update the Slack URL with your webhook):

```yaml
alertmanager.yaml: |
  global:
    resolve_timeout: 5m
  route:
    group_by: ['alertname', 'severity']
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    receiver: 'default'
    routes:
    - matchers:
        - severity = critical
      receiver: 'pagerduty-critical'
  receivers:
  - name: 'default'
    slack_configs:
    - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
      channel: '#alerts'
      title: '{{ .GroupLabels.alertname }}'
      text: '{{ .CommonAnnotations.description }}'
  - name: 'pagerduty-critical'
    # Configure PagerDuty integration here
```

Note: After changing the secret, Alertmanager detects the change and reloads automatically within minutes. For immediate reload, send a SIGHUP to the Alertmanager pod.

## Step 7: Create a Grafana Dashboard (Optional)

1. Open Grafana at `http://localhost:3000` (login: `admin` / `prom-operator`).
2. Click **Dashboards > New Dashboard > Add a new panel**.
3. Configure a panel:

**Query for request rate:**
```promql
sum by(endpoint) (rate(flask_http_request_total{namespace="cutlink"}[5m]))
```

**Panel settings:**
- Title: "Request Rate by Endpoint"
- Type: Time series
- Unit: requests/sec (cps)
- Legend: `{{ endpoint }}`

4. Add another panel for p99 latency:
```promql
histogram_quantile(0.99, sum by(le) (rate(flask_http_request_duration_seconds_bucket{namespace="cutlink"}[5m])))
```

5. Click **Apply** and **Save dashboard** with name "Cutlink Application Metrics".

---

## Troubleshooting

### ServiceMonitor not appearing in Prometheus targets

```bash
# Check Prometheus is selecting the ServiceMonitor
kubectl get prometheus -n monitoring -o yaml | grep -A10 serviceMonitorSelector

# Verify labels match
kubectl get servicemonitor cutlink-backend -n monitoring --show-labels
```

The Prometheus CRD must have `serviceMonitorSelector.matchLabels.release: prometheus` to discover ServiceMonitors with that label.

### Recording rules not showing up

```bash
# Check if Prometheus has any rules loaded
kubectl get prometheus -n monitoring -o yaml | grep -A10 ruleSelector

# Manually trigger rule eval (Prometheus exposes this endpoint)
curl http://localhost:9090/api/v1/rules
```

### Alerts not firing

```bash
# Check alerting rules are loaded
curl http://localhost:9090/api/v1/rules | grep CutlinkHighErrorRate

# Check if Prometheus can reach Alertmanager
curl http://localhost:9090/api/v1/alertmanagers
```

If Alertmanager is unreachable, check Alertmanager pod status and the Prometheus `alerting` configuration:

```bash
kubectl get pods -n monitoring | grep alertmanager
kubectl logs -n monitoring prometheus-prometheus-kube-prometheus-prometheus-0
```

---

## Summary

In this exercise, you:

1. Connected Cutlink's application metrics to Prometheus via a ServiceMonitor
2. Applied alerting rules that fire based on error rate, latency, and service uptime
3. Created recording rules that pre-compute expensive PromQL queries
4. Triggered real alerts and observed their lifecycle (Pending → Firing → Resolved)
5. Explored the Alertmanager UI

Your monitoring stack is now complete: Prometheus collects metrics, Grafana visualizes them, and alerts notify you when something goes wrong.
