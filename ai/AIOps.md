# AIOps — A 2-Day Crash Course

> **In one sentence:** AIOps applies machine learning and LLMs to operations — anomaly detection, alert correlation, noise reduction, root cause analysis, and auto-remediation — turning your monitoring data from a firehose into actionable intelligence. Prerequisite: see `SRE-Process.md` and `Prometheus.md`.

---

## Part 0 — Why AIOps exists

Your Prometheus instance is scraping 200,000 time series. Alertmanager fires 400 alerts on a bad Friday night. The on-call engineer wakes up, stares at Grafana, and has no idea which of the 400 alerts actually matters — or if they're all the same root cause wearing different hats.

This is alert fatigue, and it's the normalized state of modern operations. Not because engineers are bad, but because the systems are too large and too interconnected for human pattern matching at 3am. A single deployment can ripple into dozens of downstream symptoms: latency spikes, error rate bumps, queue depth climbs, pod restarts — each one generating its own alert, each one landing in the same Slack channel, each one requiring the same context to triage.

AIOps is the discipline of applying statistical models, machine learning, and large language models to operational data — metrics, logs, traces, events, change records — to do what humans can't do at scale: correlate across systems continuously, distinguish signal from noise, surface root causes, and eventually close the loop with automated remediation.

The value isn't replacing the on-call engineer. It's making that engineer's first five minutes of a 3am incident dramatically more productive. Instead of pivoting between dashboards, they get: "Three alerts are the same issue — a memory leak in payment-service introduced by deploy `v2.4.1` at 02:47. Suggested runbook: `restart-payment-pods.sh`."

**Mental model:** AIOps is a junior on-call engineer that never sleeps — it watches everything, filters noise, groups related alerts, suggests root causes, and (eventually) auto-remediates known issues. You're still the decision-maker on anything novel or risky. It handles the known patterns so you can focus on the unknown ones.

---

## Part 1 — The vocabulary

| Term | What it means |
|---|---|
| **Anomaly Detection** | Identifying data points that deviate significantly from expected behavior — either via static thresholds, statistical baselines, or ML models trained on historical patterns. |
| **Alert Correlation** | Grouping multiple alerts that share a common root cause into a single incident, reducing duplicate notifications and giving the on-call a coherent picture. |
| **Noise Reduction** | Suppressing alerts that are transient, redundant, or below actionability threshold — e.g., a pod that restarts once and recovers immediately. |
| **Root Cause Analysis (RCA)** | The process of tracing a symptom back to its origin — identifying which service, deployment, config change, or infrastructure event triggered the cascade. |
| **Auto-remediation** | Executing a predefined fix automatically when a known failure pattern is detected — e.g., scaling a deployment when CPU saturation is sustained. |
| **Event Correlation** | Linking alerts and events across time, services, and layers — correlating a Kubernetes node NotReady event with downstream HTTP 503s, for instance. |
| **Baseline** | A learned representation of "normal" for a given metric — computed over a rolling window, accounting for trend and seasonality. Anomalies are deviations from baseline. |
| **Seasonality** | Predictable periodic patterns in metrics — daily traffic cycles, weekly batch jobs, month-end spikes. Models that don't account for seasonality generate false positives during expected peaks. |
| **Signal vs Noise** | Signal: an alert that represents a real, actionable problem. Noise: an alert that's transient, already resolving, or a symptom of something already paged. Most raw alerting pipelines are 60–90% noise. |
| **Runbook Automation** | Encoding the steps an on-call engineer would take for a known failure into an executable script or workflow that can be triggered — manually or automatically — when that failure pattern is detected. |

---

## DAY 1 — The AIOps landscape

### 1.1 Anomaly detection — three schools

The first capability you'll build or buy is anomaly detection: finding metric values that are unexpected given historical behavior.

**Statistical methods** are the simplest starting point. Z-score measures how many standard deviations a current value is from the rolling mean. Interquartile range (IQR) flags values outside the 25th–75th percentile band. These work well for stationary, low-seasonality metrics — a queue depth that should hover around 50 and never exceed 200. They break down on metrics with strong seasonality because Monday morning traffic looks like an anomaly when compared against Sunday night.

**ML-based methods** handle seasonality and trend explicitly. Facebook Prophet is the most commonly deployed open-source option — it decomposes a time series into trend, seasonality, and residual components, then predicts an expected range. Values outside the prediction interval are anomalies. ARIMA and Holt-Winters are alternatives in the same family. These models require training data (typically 2–4 weeks minimum), periodic retraining, and per-metric configuration — manageable at hundreds of metrics, painful at tens of thousands.

**LLM-based approaches** are emerging for log and event anomaly detection where the signal isn't numerical. You embed log lines as vectors, cluster them, and flag log patterns that are rare or that haven't appeared before. This is particularly useful for detecting novel error messages that no threshold rule would catch. See `OpenTelemetry.md` for log collection pipelines that feed this.

The practical choice: start with statistical baselines for your top 20 SLI metrics, add Prophet for anything with clear daily cycles, and layer LLM-based log analysis on top.

### 1.2 Alert correlation and grouping

Raw alerts from Prometheus fire per rule, per instance. A single root cause can generate 50 alerts across 10 services. Alert correlation turns those 50 into one incident.

The mechanics break down into three approaches:

**Time-based grouping** — Alertmanager's `group_by` and `group_wait` settings are your starting point. Alerts with the same labels within the same window get merged. This is not AI; it's a prerequisite. See `Alertmanager.md` for configuration details.

**Topology-based correlation** — You know that `payment-service` calls `postgres-primary` which runs on `node-3`. When `node-3` goes down, alerts cascade upward through the dependency graph. If you have a service dependency map, you can suppress downstream alerts when the root node is already alerting. This requires a CMDB or service graph — Kubernetes service topology, OpenTelemetry trace data, or a manually maintained dependency map.

**ML-based correlation** — Trained on historical incidents, these models learn which alert patterns co-occur. When they see that combination again, they group the alerts and assign a confidence score. This is what commercial AIOps platforms (Moogsoft, BigPanda, Dynatrace Davis) primarily sell. You can replicate a simplified version by clustering alert vectors using cosine similarity on alert label embeddings.

The key insight: correlation without topology context generates false positives. An alert on `auth-service` and an alert on `billing-service` might both be high-severity but completely unrelated. Use deployment events and dependency graphs as features in your correlation model.

### 1.3 Noise reduction strategies

Noise reduction is distinct from correlation. Correlation groups related alerts. Noise reduction suppresses alerts that aren't worth waking anyone up.

The main strategies:

**Transient suppression** — An alert that fires and auto-resolves within 2 minutes is probably not actionable. Add a `for: 5m` duration to your Prometheus alert rules so they only fire after sustained deviation. This alone reduces alert volume by 30–50% in most environments.

**Inhibition rules** — If a critical alert is firing for a service, inhibit its warning-level alerts. Alertmanager supports `inhibit_rules` natively. Define a hierarchy: critical inhibits warning, infrastructure alerts inhibit application alerts when the infrastructure is the root cause. See `Alertmanager.md`.

**Flap detection** — An alert that fires, resolves, and fires again repeatedly within a short window is flapping. Flapping indicates instability but also drowns out other pages. Many AIOps platforms detect flap and apply exponential backoff to notifications. You can implement this with a stateful Alertmanager receiver or an external webhook.

**Business-hours routing** — Some alerts matter at 2pm but not at 2am. Route P3 alerts to a Slack channel during business hours, suppress them overnight. This isn't ML — it's policy — but it has significant quality-of-life impact.

**Confidence thresholds** — For ML-derived anomalies, only page when confidence exceeds a threshold (e.g., 90%). Surface lower-confidence anomalies in a dashboard for daytime review. This prevents the ML model from generating its own alert fatigue.

### 1.4 LLM-powered log analysis

Logs are the richest data source in your stack — and the hardest to query programmatically. Free-text error messages, stack traces, JSON payloads of variable shape. Traditional log analysis relies on regex patterns and saved queries. LLMs change the interface.

The pattern that works today:

1. Collect logs via OpenTelemetry or Fluentd into Loki (see `Loki.md` for setup).
2. On an alert trigger, pull the relevant log window — last 15 minutes, filtered to the alerting service.
3. Send to an LLM with a prompt: "You are an SRE. Analyze these logs and identify the most likely cause of the current service degradation. Highlight specific error patterns, their frequency, and any correlation with timestamps."
4. Return the analysis to the incident channel alongside the alert.

This doesn't replace structured log analysis — it augments it. The LLM handles the "read and summarize 2000 log lines" task that would take a human 10 minutes. The structured query (rate of 5xx, unique error types, affected endpoints) still comes from PromQL and LogQL.

⚠️ LLM log analysis sends potentially sensitive data to an external API. Use local models (Ollama, vLLM) or on-premise deployments for regulated environments. BFSI and healthcare teams: check your data classification policy before piping logs to OpenAI.

### 1.5 LLM-powered RCA from traces, metrics, and logs

Root cause analysis is where the integration gets interesting. A single incident has three data streams: metrics (what changed numerically), logs (what errors were generated), and traces (which service calls were slow or failed). Correlating across all three manually during an incident is cognitively expensive.

The AIOps approach: build a context assembly pipeline.

When an alert fires:
- Pull the relevant Prometheus metrics for the alerting service and its dependencies (PromQL, last 30 minutes).
- Pull logs from Loki for the same window and services.
- Pull trace summaries from Tempo or Jaeger — specifically, slow spans and error spans.
- Pull recent deployment events from your CI/CD system (see `GitHub-Actions.md` or `GitLab-CI.md`).
- Assemble into a structured prompt context.
- Query the LLM: "Given this telemetry context, what is the most likely root cause of the current incident? List your reasoning step by step."

The output is not a verdict — it's a hypothesis with supporting evidence. The on-call engineer validates or rejects it. Over time, if you track which hypotheses were correct, you can build a feedback loop that improves future RCA quality.

**By end of Day 1 you can:**
- Explain the difference between statistical, ML-based, and LLM-based anomaly detection and when to use each.
- Describe how alert correlation reduces incident noise using time, topology, and ML approaches.
- Configure basic noise reduction in Alertmanager (duration filters, inhibition, flap suppression).
- Design an LLM log analysis pipeline for incident triage.
- Sketch a multi-signal RCA context assembly workflow.

---

## DAY 2 — Make it real

### 2.1 Building anomaly detection on Prometheus metrics

The entry point is recording rules and alerting rules in Prometheus. Before adding ML, squeeze everything out of the built-in tooling.

Use `avg_over_time` and `stddev_over_time` to build a statistical baseline inline:

```yaml
# Detect when error rate exceeds mean + 3 stddev over past 1 hour
- alert: AnomalousErrorRate
  expr: |
    rate(http_requests_total{status=~"5.."}[5m])
    > (
      avg_over_time(rate(http_requests_total{status=~"5.."}[5m])[1h:5m])
      + 3 * stddev_over_time(rate(http_requests_total{status=~"5.."}[5m])[1h:5m])
    )
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Error rate anomaly — {{ $labels.service }}"
```

This is a rolling z-score threshold. It doesn't account for seasonality but catches sudden spikes relative to recent baseline. For production use, extend the lookback window to 7 days using `offset` to compare against the same time yesterday:

```yaml
expr: |
  rate(http_requests_total{status=~"5.."}[5m])
  > 2 * rate(http_requests_total{status=~"5.."}[5m] offset 1d)
```

For Prophet-based anomaly detection, the standard architecture is: Prometheus → Metric exporter → Python service running Prophet → writes anomaly signals back as a Prometheus gauge → alert on the gauge. Libraries: `prophet`, `prometheus-api-client`. Schedule retraining weekly via a Kubernetes CronJob.

### 2.2 LLM-powered alert summarization

The goal: when an incident opens, the on-call receives a plain-English summary instead of raw alert YAML.

Architecture:
1. Alertmanager sends webhook to your AIOps service on alert group fire.
2. Service fetches context: alert labels, current metric values via PromQL, recent log excerpts via LogQL.
3. Assembles prompt with structured context.
4. Calls LLM (GPT-4o, Claude, or local model).
5. Posts summary to PagerDuty incident description or Slack incident channel.

Sample prompt template:

```
You are an SRE assistant. An alert has fired in production.

Alert: {{ alert.name }}
Service: {{ labels.service }}
Environment: {{ labels.env }}
Current value: {{ current_value }} (threshold: {{ threshold }})

Recent error logs (last 10 minutes):
{{ log_excerpt }}

Recent deployments:
{{ deployment_events }}

Provide a 3-sentence incident summary: what is happening, what is the likely cause,
and what is the recommended first action.
```

Keep the prompt focused and bounded. LLMs with 10,000 tokens of log context produce worse summaries than LLMs with 500 tokens of curated, relevant context. Pre-filter logs to error-level, deduplicate repeated lines, and truncate to the most recent occurrences.

### 2.3 Auto-remediation pipelines

Auto-remediation is the highest-value — and highest-risk — AIOps capability. The pattern is: **detect → diagnose → remediate → verify**.

**Detect:** An anomaly or alert fires with high confidence for a known failure pattern.

**Diagnose:** Confirm preconditions are met before acting. Is this the expected failure signature? Is the service actually degraded? Has this remediation already been attempted recently (idempotency check)?

**Remediate:** Execute the fix. Common examples:
- Pod OOMKilled → rolling restart of the deployment.
- HPA at max replicas + high CPU → temporarily increase max replicas.
- Disk near-full on a log volume → trigger log rotation or archive job.
- Certificate expiry alert → trigger cert-manager renewal.

**Verify:** After remediation, check that the triggering metric has returned to normal within a timeout window. If it hasn't, escalate to a human. Never assume remediation succeeded.

Implementation options:
- **Runbook automation scripts** called via Kubernetes Jobs triggered by webhook receivers.
- **Argo Workflows** for multi-step remediation with branching logic.
- **AWS Systems Manager Automation** or **Azure Automation** for cloud resource remediation.
- **Ansible** playbooks triggered via Ansible Tower/AWX webhook.

⚠️ Blast radius is the critical risk. Before enabling auto-remediation for any action, answer: what is the worst outcome if this fires incorrectly? A restart is low blast radius — the service briefly blips. Scaling down a deployment during a traffic spike is high blast radius. Gate high blast radius remediations behind human approval (PagerDuty approval workflow, Slack approval button) even if detection is automated.

### 2.4 Integrating with PagerDuty and OpsGenie

Both platforms have Event Intelligence capabilities that overlap with AIOps:

**PagerDuty Event Intelligence** — Ingests events via the Events API v2. Supports event grouping (time-based and ML-based), alert suppression, and intelligent triage. Integrate by pointing Alertmanager's webhook receiver at PagerDuty's Events API endpoint. Add `dedup_key` in the payload for correlation.

```yaml
# alertmanager.yml receiver
- name: pagerduty-aiops
  pagerduty_configs:
    - routing_key: <integration_key>
      description: '{{ template "pagerduty.default.description" . }}'
      details:
        aiops_summary: '{{ .CommonAnnotations.aiops_summary }}'
        root_cause_hypothesis: '{{ .CommonAnnotations.rca_hypothesis }}'
```

Enrich the PagerDuty alert with the LLM-generated summary in the `details` field before it reaches the on-call. This is the highest-leverage integration point — the engineer sees the AI summary as the first thing in the incident.

**OpsGenie** — Similar pattern via the OpsGenie Alert API. Use the `description` and `details` fields for AI-generated content. OpsGenie's Mute & Suppress rules can implement noise reduction at the routing layer.

For both: track mean time to acknowledge (MTTA) and mean time to resolve (MTTR) before and after AIOps integration. This is your primary effectiveness metric.

### 2.5 GenAI for observability — natural-language metric queries

The newest capability: instead of writing PromQL, you ask a question.

"Show me the p99 latency for payment-service over the last 6 hours broken down by region."

The LLM translates this to PromQL, executes it against Prometheus, and returns a chart or summary. This lowers the barrier for developers and product managers who aren't fluent in PromQL.

Implementation options:
- **Grafana's AI-assisted query editor** — available in Grafana 10+ with a configured LLM backend (see `Grafana.md`).
- **Custom chatbot** — Build a Slack bot that accepts natural-language queries, translates them to PromQL via LLM, executes against your Prometheus API, and returns results. The critical prompt component is injecting your metric catalog (metric names, labels, units) into the system prompt so the LLM generates valid queries for your specific metrics.
- **OpenAI function calling** — Define `execute_promql_query` as a function. The LLM decides when to call it and with what query based on the user's question.

The failure mode: LLM generates syntactically valid PromQL that answers the wrong question. Always display the generated query alongside the result so users can verify. See `Prometheus.md` for PromQL fundamentals.

### 2.6 Measuring AIOps effectiveness

You need metrics for your metrics pipeline. Track these:

| Metric | How to measure | Target |
|---|---|---|
| Alert noise ratio | Alerts fired / actionable incidents | < 5:1 |
| MTTA (mean time to acknowledge) | PagerDuty/OpsGenie reporting | Trending down |
| MTTR (mean time to resolve) | Incident timestamps | Trending down |
| False positive rate | Anomalies detected / anomalies confirmed | < 20% |
| Correlation accuracy | Correctly grouped incidents / total grouped | > 80% |
| Auto-remediation success rate | Remediations that resolved without human / total attempted | Track per action type |
| RCA hypothesis accuracy | LLM RCA hypotheses confirmed correct / total | Track and improve |

Review these metrics monthly. AIOps systems drift — metrics change shape, deployments introduce new patterns, models go stale. Treat your AIOps stack like any other service: monitor it, alert on degradation, retrain regularly.

### 2.7 Avoiding automation pitfalls — blast radius control

Auto-remediation at scale introduces operational risk that doesn't exist in manual operations. The three failure modes to design against:

**Cascading remediations** — Auto-restart triggers a restart loop. Auto-scale triggers a cost explosion. Set hard limits: max 3 automated restarts per service per hour, max replica counts per namespace, spend caps on cloud resource scaling. Use a circuit breaker — if a remediation fires more than N times for the same alert pattern in a window, halt automation and page a human.

**Remediation during maintenance** — If a deployment is in progress, automated restarts will fight the rollout. Implement a maintenance mode flag — a Kubernetes annotation, a feature flag, or a simple key in Redis — that your remediation pipeline checks before acting.

**Correlated failures triggering simultaneous remediations** — A node failure triggers 20 pods to restart simultaneously. Each pod's restart alert triggers its own remediation job. Implement a global remediation rate limiter. No more than N remediations across all services per minute.

The principle: automation should reduce pressure on humans, not create new pressure when it misbehaves. Design every automated action to fail safely — prefer doing nothing over doing the wrong thing.

### 2.8 OTel GenAI semantic conventions for AI workload monitoring

If you're operating AI services — inference endpoints, embedding pipelines, RAG systems — OpenTelemetry has GenAI semantic conventions for standardized observability. See `OpenTelemetry.md` for OTel setup fundamentals.

Key GenAI span attributes:

```
gen_ai.system           # The model provider (openai, anthropic, etc.)
gen_ai.request.model    # Model name (gpt-4o, claude-3-5-sonnet)
gen_ai.request.max_tokens
gen_ai.response.model
gen_ai.usage.input_tokens
gen_ai.usage.output_tokens
gen_ai.operation.name   # chat, embeddings, etc.
```

These attributes let you build dashboards and alerts for:
- Token consumption rate per model (cost management).
- Latency p99 per model and operation type.
- Error rates by model provider (fallback triggering).
- Throughput per endpoint for capacity planning.

For Prometheus, use the OTel Collector with the `prometheusexporter` to scrape these as metrics. Then apply the same AIOps patterns — anomaly detection, alerting, auto-remediation — to your AI inference infrastructure.

```yaml
# Example: alert on inference latency anomaly
- alert: GenAIInferenceLatencyAnomaly
  expr: |
    histogram_quantile(0.99,
      rate(gen_ai_client_operation_duration_bucket[5m])
    ) > 10
  for: 3m
  labels:
    severity: warning
  annotations:
    summary: "GenAI p99 latency > 10s — {{ $labels.gen_ai_system }}/{{ $labels.gen_ai_request_model }}"
```

---

## Worked example — AI-powered incident triage

**Scenario:** BFSI production, Friday 23:47. Payment processing service in a large Indian private bank.

**02:47:13** — Deploy `v2.4.1` of `payment-service` completes via ArgoCD. The deployment includes a connection pool configuration change.

**02:49:41** — Prometheus fires `PaymentServiceErrorRateCritical` — 5xx rate exceeds 5% for 2 minutes. Simultaneously: `PostgreSQLConnectionPoolExhausted` fires on `postgres-primary`, and `PaymentGatewayTimeouts` fires from the upstream gateway health check.

Without AIOps, the on-call sees three critical alerts in PagerDuty, opens three separate Grafana dashboards, and spends 8–12 minutes manually correlating before identifying the connection pool issue.

**With AIOps:**

**Step 1 — Correlation.** The AIOps webhook receiver receives all three alerts within 90 seconds of each other. Topology lookup shows `payment-service → postgres-primary` and `payment-gateway → payment-service`. Time proximity + topology = high-confidence correlation. All three grouped into incident `INC-20241129-003`.

**Step 2 — Context assembly.** The pipeline pulls:
- PromQL: `pg_stat_activity_count` spiked from 95 to 500 (pool max = 100) at 02:47:15.
- Loki logs from `payment-service`: 847 occurrences of `connection pool exhausted — max_connections=100` in the last 10 minutes.
- ArgoCD event: deployment `payment-service:v2.4.1` completed at 02:47:13.
- Git diff summary for v2.4.1: `config/db.yaml` — `max_connections` changed from 20 to 100 per pod, 10 pods = 1000 total connections exceeding DB max of 500.

**Step 3 — LLM RCA.** Prompt assembled with above context. LLM output (posted to PagerDuty incident and `#incidents` Slack channel):

> "Root cause hypothesis (high confidence): The v2.4.1 deployment increased per-pod DB connection pool size from 20 to 100. With 10 pods running, total configured connections (1000) now exceeds PostgreSQL `max_connections` (500). The database is rejecting new connection requests, causing payment-service to return 5xx errors. Recommended action: roll back payment-service to v2.4.0 immediately, then revisit the connection pool sizing with the DBA team. Rollback estimated recovery time: 3–5 minutes."

**Step 4 — Runbook automation.** The incident is tagged `connection-pool-exhaustion`, which has a configured runbook: `notify-dba-team` and `prepare-rollback-command`. The rollback requires human approval due to financial transaction blast radius — approval button presented in PagerDuty.

**Step 5 — Verify.** On-call approves rollback at 02:52. ArgoCD rolls back. At 02:56, PromQL confirms error rate < 0.1%, connection count back to 95. Incident auto-closes with MTTR of 9 minutes vs. historical mean of 27 minutes for similar incidents.

---

## Common pitfalls

- **Training on too little data.** Prophet and ML correlation models trained on less than 2 weeks of data have poor seasonality handling and generate high false-positive rates. Collect baseline data before enabling ML-based alerting.

- **Skipping the correlation prerequisite.** Before AIOps correlation, ensure basic Alertmanager grouping is configured. AI correlation on top of un-grouped raw alerts amplifies noise rather than reducing it.

- **Auto-remediation without verification.** Executing a restart without checking if it resolved the issue means you'll miss when the remediation doesn't work — and page nobody until the next threshold breach.

- **Treating LLM RCA as ground truth.** LLMs hallucinate. An LLM that confidently suggests the wrong root cause sends the on-call down the wrong path. Always show the supporting evidence alongside the hypothesis. Train engineers to verify before acting.

- **No feedback loop.** If you never capture whether the LLM RCA hypothesis was correct, your models don't improve. Build a simple "was this helpful?" button into your incident tooling. Log the outcomes.

- **Ignoring model drift.** A seasonality model trained before a major traffic growth event will under-estimate new baselines and fire false positives on normal traffic. Schedule monthly retraining minimums and alert on anomaly detection false-positive rate.

- **One-size-fits-all blast radius.** Applying the same auto-remediation confidence threshold to a static content CDN and a payment processing service is a category error. Calibrate thresholds by service criticality and remediation reversibility.

- **No maintenance mode.** Running automated remediation through a production deployment is the fastest way to make deployments unreliable. Wire your deployment pipeline to set a global inhibition flag before applying changes.

---

## Quick reference

### AIOps maturity model

| Level | Capability | Indicator |
|---|---|---|
| **0 — Manual** | Raw alerting, no grouping | Alert volume = incident volume |
| **1 — Grouped** | Alertmanager time/label grouping | Noise ratio < 10:1 |
| **2 — Correlated** | Topology-aware alert correlation | Noise ratio < 5:1, single incident per root cause |
| **3 — Intelligent** | ML anomaly detection, LLM RCA | MTTA trending down, on-call sees hypothesis first |
| **4 — Automated** | Auto-remediation for known patterns | MTTR trending down, human only on novel failures |
| **5 — Self-healing** | Feedback loop, continuous learning | Automation success rate > 90% for known patterns |

### Tool comparison

| Category | Open Source | Commercial | Cloud-native |
|---|---|---|---|
| Anomaly detection | Prophet, Prometheus rolling stats | Dynatrace Davis, Datadog Watchdog | AWS DevOps Guru, Azure Monitor AI |
| Alert correlation | Alertmanager grouping | BigPanda, Moogsoft, PagerDuty Event Intelligence | OpsGenie Alert Intelligence |
| LLM log analysis | LangChain + Loki + Ollama | Coralogix AI, Elastic AI Assistant | AWS CloudWatch AI insights |
| Auto-remediation | Argo Workflows, Ansible AWX | xMatters, Shoreline | AWS Systems Manager Automation |
| NL metric queries | Grafana LLM plugin | Datadog NLP, Dynatrace Davis Copilot | Azure Monitor Copilot |

### Integration architecture (ASCII)

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│  Prometheus  │───▶│ Alertmanager │───▶│  AIOps Service  │
└─────────────┘    └──────────────┘    │                 │
                                        │ ┌─────────────┐ │
┌─────────────┐                        │ │Context       │ │
│    Loki      │────────────────────────▶│ │Assembler    │ │
└─────────────┘                        │ └──────┬──────┘ │
                                        │        │        │
┌─────────────┐                        │ ┌──────▼──────┐ │
│    Tempo     │────────────────────────▶│ │LLM API      │ │
└─────────────┘                        │ └──────┬──────┘ │
                                        │        │        │
┌─────────────┐                        │ ┌──────▼──────┐ │
│  CI/CD      │────────────────────────▶│ │Correlation  │ │
│  Events     │                        │ │Engine       │ │
└─────────────┘                        │ └──────┬──────┘ │
                                        └────────┼────────┘
                                                 │
                          ┌──────────────────────┼──────────────────┐
                          ▼                      ▼                  ▼
                   ┌────────────┐       ┌─────────────┐    ┌──────────────┐
                   │ PagerDuty  │       │    Slack    │    │ Auto-        │
                   │ OpsGenie   │       │  #incidents │    │ Remediation  │
                   └────────────┘       └─────────────┘    └──────────────┘
```

### Alert correlation flowchart

```
Alert fires
    │
    ▼
Is there an active incident with same service topology? ──Yes──▶ Attach to existing incident
    │ No
    ▼
Are 3+ alerts firing within 90s with overlapping labels? ──Yes──▶ Group as new correlated incident
    │ No
    ▼
Is this alert within 10 min of a deployment event? ──Yes──▶ Tag as deployment-related, assemble deploy context
    │ No
    ▼
Does ML correlation model score > 0.8 with any active incident? ──Yes──▶ Attach with low-confidence flag
    │ No
    ▼
Create standalone alert ──▶ Assemble LLM context ──▶ Generate summary ──▶ Page on-call
```

---

## Next steps after Day 2

- `SRE-Process.md` — SLOs, error budgets, and the operational framework that determines when AIOps should page vs. suppress.
- `Incident-Response.md` — Incident lifecycle, runbook standards, and how AIOps integrates into your incident management process.
- `Prometheus.md` — PromQL for building the metric queries that feed your anomaly detection and context assembly pipelines.
- `LLM-Fundamentals.md` — Prompt engineering, context window management, and evaluation — the foundations for reliable LLM-based RCA.
- `OpenTelemetry.md` — Distributed tracing, the GenAI semantic conventions, and the collector pipelines that feed AIOps with trace data.

---

## Recommended learning resources

**YouTube channels & playlists:**
- [DeepLearning.AI — AI for Operations](https://www.youtube.com/@Deeplearningai) — short courses on applying ML and LLMs to operational workflows, anomaly detection, and automated remediation
- [AI Engineer — AIOps Talks](https://www.youtube.com/@aiaboratories) — conference talks on integrating LLMs into incident management, log analysis, and alert correlation
- [Sam Witteveen — AI Agents for SRE](https://www.youtube.com/@samwitteveen) — agent patterns applied to operational use cases: RCA, runbook execution, and metric correlation
- [Yannic Kilcher — Anomaly Detection Papers](https://www.youtube.com/@YannicKilcher) — research reviews on time-series anomaly detection and log analysis with transformers

**Official docs & blogs:**
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — the standard for instrumenting AI systems with traces, metrics, and logs
- [Anthropic Cookbook](https://github.com/anthropics/anthropic-cookbook) — patterns for building LLM-powered tools relevant to operational workflows
- [Chip Huyen — MLOps & Operations](https://huyenchip.com/blog/) — practical writing on deploying ML systems reliably, applicable to AIOps pipelines

---

**The mantra:** Machines watch the firehose so humans can focus on the fire.
