# Exercise 3: Grafana Unified Alerting

In this exercise, you will configure Grafana Unified Alerting to monitor Cutlink's error rate and latency, route alerts to Slack, and manage silences.

## Prerequisites

- Exercises 1 and 2 completed
- Grafana accessible at `http://localhost:3000`
- A Slack workspace where you can create a webhook (or use a generic webhook receiver for testing)

---

## Part A: Create a Contact Point

Grafana sends notifications through **contact points**. We will create a Slack contact point.

### Step 1: Get a Slack Webhook URL

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps).
2. Click **Create New App** > **From scratch**.
3. Name it `Grafana Alerts` and select your workspace.
4. Go to **Incoming Webhooks** > **Activate Incoming Webhooks**.
5. Click **Add New Webhook to Workspace**.
6. Select a channel (e.g., `#alerts`) and click **Allow**.
7. Copy the webhook URL — it looks like: `https://hooks.slack.com/services/T00/B00/xxxxx`

### Step 2: Create the Contact Point in Grafana

1. In Grafana, click **Alerting** (bell icon) in the left sidebar.
2. Click **Contact points**.
3. Click **Add contact point**.
4. Configure:
   - **Name**: `Slack Alerts`
   - **Contact point type**: Slack
   - **Webhook URL**: Paste your Slack webhook URL
   - **Title**: `{{ .CommonLabels.alertname }}`
   - **Text**: `{{ .CommonAnnotations.description }}`
   - **Optional Slack settings**:
     - **Username**: `Grafana`
     - **Icon emoji**: `:grafana:`
5. Click **Test** to send a test notification. You should see a message appear in your Slack channel.
6. Click **Save contact point**.

If you don't have a Slack workspace, use a **Webhook** contact point with a request bin (e.g., [webhook.site](https://webhook.site)) to verify delivery.

---

## Part B: Create an Alert Rule

Grafana alert rules are evaluated by the Grafana alert engine on a schedule. We will create an alert that fires when the error ratio exceeds 5% for 2 minutes.

### Step 1: Navigate to Alert Rules

1. In Grafana, click **Alerting** > **Alert rules**.
2. Click **New alert rule**.

### Step 2: Define the Query

1. **Name**: `Cutlink High Error Rate`
2. **Folder**: Select the folder where your dashboard lives (or `General`).
3. **Data source**: Prometheus

**Query (Condition A):**
```promql
sum(rate(flask_http_request_total{namespace="cutlink", status=~"5.."}[5m])) / sum(rate(flask_http_request_total{namespace="cutlink"}[5m]))
```

This is the same error ratio query from your dashboard. It returns a value between 0 and 1.

### Step 3: Set the Condition

1. Click **+** next to the query to add a condition expression.
2. **Expression**: `B`
3. **Operation**: `Reduce` — `Last`
4. **Condition**: `C`
5. **Type**: Classic condition
6. **WHEN**: `last()` `OF` `query(B, 5m)` `IS ABOVE` `0.05`
7. **Evaluate**:
   - **Evaluate every**: `30s`
   - **Evaluate for**: `2m` (prevents flapping — the condition must be breached for 2 minutes before firing)

### Step 4: Configure Alert Details

1. **Alert type**: Grafana managed alert
2. **Labels**:
   - `severity`: `critical`
   - `team`: `backend`
   - `alertname`: `CutlinkHighErrorRate`
3. **Annotations**:
   - `summary`: `Cutlink error rate is above 5%`
   - `description`: `Error rate is {{ $values.B.Value | humanize }}% for the last 5 minutes`
   - `runbook_url`: `https://wiki.team.com/runbooks/cutlink/high-error-rate`

### Step 5: Add Notification

1. Under **Notifications**, select the **Slack Alerts** contact point you created.
2. Click **Save rule**.

### Step 6: Create a Second Alert — High Latency

Repeat the process for a P95 latency alert:

- **Name**: `Cutlink High Latency`
- **Query**: `histogram_quantile(0.95, sum(rate(flask_http_request_duration_seconds_bucket{namespace="cutlink"}[5m])) by (le))`
- **Condition**: `IS ABOVE` `1.0` (seconds)
- **Evaluate for**: `2m`
- **Labels**: `severity=warning`, `team=backend`
- **Annotations**: `summary=Cutlink P95 latency exceeds 1s`
- **Contact point**: Slack Alerts (same as above)

---

## Part C: Configure Notification Policies

Notification policies define how alerts are routed to contact points. By default, all alerts go to a single policy. We will create a team-specific policy.

### Step 1: View Default Policy

1. In Grafana, go to **Alerting** > **Notification policies**.
2. You will see a default policy that sends all alerts to the Slack Alerts contact point.

### Step 2: Add a Specific Policy

1. Click **+ Add specific policy** under the default policy.
2. Configure:
   - **Matching labels**: `team` = `backend`
   - **Contact point**: Slack Alerts
   - **Override grouping**: Group by `alertname`
   - **Timing options**:
     - **Group wait**: `30s`
     - **Group interval**: `5m`
     - **Repeat interval**: `4h`
3. Click **Save policy**.

Now alerts with the label `team=backend` match this specific policy. All other alerts fall through to the default policy.

### Step 3: Test the Policy

1. In a terminal, generate errors against Cutlink:
   ```bash
   curl http://localhost:8080/invalid-route
   curl http://localhost:8080/api/nonexistent
   ```
2. Wait for the alert to evaluate (up to 2m 30s: 30s evaluation + 2m pending).
3. Check Slack — you should see an alert notification from Grafana.

---

## Part D: Create a Silence

Silences suppress notifications for a specific time period. Use them for planned maintenance or known issues.

### Step 1: Navigate to Silences

1. In Grafana, go to **Alerting** > **Silences**.
2. Click **Add silence**.

### Step 2: Create a Silence

Configure:
- **Name**: `Database Migration — 2026-06-04`
- **Duration**: `2h` (start now, end in 2 hours)
- **Matchers**:
  - `severity` = `critical`
  - `alertname` = `CutlinkHighErrorRate`
- **Comment**: `Planned database migration. Expected elevated error rates during cutover.`
- **Created by**: `admin`

### Step 3: Verify the Silence

1. The silence appears in the Silences list with status `Active`.
2. While the silence is active, the `CutlinkHighErrorRate` alert will still fire (the alert state changes in the UI), but Slack notifications will be suppressed.

### Step 4: Expire the Silence

Silences auto-expire when their duration elapses. To manually expire:

1. Click the silence in the list.
2. Click **Expire silence**.

---

## Part E: View Alert History

Alert state changes are logged. To view history:

1. Go to **Alerting** > **Alert rules**.
2. Click on the `Cutlink High Error Rate` rule.
3. Click the **State history** tab.
4. You will see a timeline of state transitions: OK → Pending → Alerting → OK.

This history is useful for post-incident review. You can correlate state transitions with dashboard annotations to understand what caused the alert.

---

## Troubleshooting

### Alert Never Fires

- Run the query in Explore: does it return a value above the threshold?
- Check the alert evaluation interval: `Evaluate every 30s` + `Evaluate for 2m` = ~2.5m minimum to fire.
- Check if a silence is active: go to **Alerting** > **Silences**.

### Slack Notification Not Received

- Test the contact point: **Alerting** > **Contact points** > **Test**.
- Check the webhook URL: it must start with `https://hooks.slack.com/services/`.
- Check notification policy routing: does the alert's labels match a specific policy?

### Alert Fires Too Often (Alert Fatigue)

- Increase the `Evaluate for` duration (e.g., `5m` instead of `2m`).
- Raise the threshold (e.g., `0.10` instead of `0.05`).
- Add a mute timing to suppress alerts during known quiet hours.

### "No Data" Alert State

When an alert query returns no data (e.g., Prometheus is down), Grafana can be configured to:
- **Alerting**: Treat no data as a firing alert (you want to know when monitoring is down).
- **NoData**: Explicitly set to NoData state (informational).
- **OK**: Ignore and remain OK.
- **KeepLast**: Keep the last known state.

Configure this in the alert rule's **Alert conditions** > **No data & error handling**.

---

## Summary

You have configured Grafana Unified Alerting with:
- A **Slack contact point** for notification delivery
- **2 alert rules** for high error rate (critical) and high latency (warning)
- A **notification policy** routing team=backend alerts to Slack
- A **silence** for planned maintenance
- **State history** for post-incident review

Alerting completes the operational feedback loop:
1. Cutlink exposes metrics (Stage 6).
2. Grafana visualizes them (Exercise 2).
3. Grafana alerts you when thresholds are breached (this exercise).
4. You investigate using Explore and dashboard annotations (Exercise 1).
