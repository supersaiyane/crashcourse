# Stage 5: Alertmanager

**Goal:** Configure alert routing, silences, inhibitions, and escalation policies for ObservaShop.

**Prerequisites:** Stages 1-4 complete. Prometheus alert rules loaded.

---

## 1. Theory (What & Why)

### The alerting pipeline

```text
Prometheus evaluates rules → fires alerts → Alertmanager routes them
                                                    │
                                         ┌──────────┼──────────┐
                                         v          v          v
                                      Slack    PagerDuty    Email
```

Prometheus decides *when* to alert. Alertmanager decides *who* gets notified and *how*.

### Key concepts

| Concept | What it does |
|---------|-------------|
| **Route tree** | Matches alerts to receivers based on labels |
| **Grouping** | Batches related alerts into one notification (`group_by`) |
| **Inhibition** | Suppresses warnings when a critical alert is firing |
| **Silences** | Temporarily mute alerts (during maintenance) |
| **Repeat interval** | How often to re-send unresolved alerts |

### ObservaShop alert rules

The project ships with four rules in `alerts/prometheus-rules.yml`:

1. **ServiceDown** — any scrape target is unreachable (critical)
2. **HighLatency** — gateway p95 > 1s for 5 minutes (warning)
3. **HighPaymentFailureRate** — payment failures > 10% (critical)
4. **LowInventory** — stock < 5 units for 10 minutes (warning)

---

## 2. Hands-On

### 2.1 View active alerts

Open Prometheus UI → Alerts tab. You'll see all four rules — most should be green (inactive).

### 2.2 Trigger an alert

Stop the inventory service to trigger ServiceDown:
```bash
docker-compose stop inventory-svc
```

Wait 1 minute. Check Prometheus Alerts — `ServiceDown` should go from inactive → pending → firing.

### 2.3 View in Alertmanager

Open `http://localhost:9093`. The firing alert appears with:
- Alert name, severity, labels
- Which receiver it's routed to
- How long it's been firing

### 2.4 Create a silence

In Alertmanager UI → Silences → New Silence:
- Matchers: `alertname=ServiceDown`, `job=inventory-svc`
- Duration: 1 hour
- Comment: "Planned maintenance — restocking inventory service"

The alert stops notifying. This is how you handle planned downtime.

### 2.5 Restore and verify

```bash
docker-compose start inventory-svc
```

The alert should resolve within 1-2 minutes. Check Alertmanager — it shows the resolved notification.

### 2.6 Understand the route tree

Look at `alerts/alertmanager.yml`:

```yaml
route:
  group_by: ["alertname", "service"]
  routes:
    - match: { severity: critical }
      receiver: "pagerduty"
    - match: { severity: warning }
      receiver: "slack"
```

Critical alerts go to PagerDuty (wake someone up). Warnings go to Slack (check it in the morning). The `group_by` ensures one notification per alert+service combination, not one per instance.

---

## 3. Key patterns

### Inhibition rules

```yaml
inhibit_rules:
  - source_match: { severity: "critical" }
    target_match: { severity: "warning" }
    equal: ["alertname", "service"]
```

If `ServiceDown` (critical) is firing for payment-svc, suppress `HighLatency` (warning) for payment-svc — it's obviously slow because it's down.

### Alert fatigue prevention

- **group_wait: 30s** — wait 30s for related alerts before sending
- **group_interval: 5m** — send new alerts in the same group every 5m
- **repeat_interval: 4h** — re-send unresolved alerts every 4h, not every minute

---

## Exercises

1. [Exercise 1 — Trigger and route alerts](exercises/01-trigger-alerts.md)
2. [Exercise 2 — Configure escalation](exercises/02-escalation.md)

**Next stage:** [06-opentelemetry](../06-opentelemetry/README.md) — OTel SDK and collector pipelines.
