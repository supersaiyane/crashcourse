# Capacity Planning — A 2-Day Crash Course

> **In one sentence:** Capacity planning is the practice of making sure your systems have *enough*
> resources (compute, memory, storage, connections) to handle current and future demand —
> reliably and without overspending — by measuring usage, modeling growth, and provisioning ahead
> of need.

> Companion to `SRE-Process.md`. It's the discipline that keeps "saturation" (one of the golden
> signals) from becoming an outage.

---

## Part 0 — Why capacity planning exists, and the core tension

Every system has limits. Run too close to them and you get slow responses, errors, and outages
when traffic spikes. Provision way above them "to be safe" and you burn money on idle resources.
Capacity planning is managing that tension: **enough headroom to stay reliable, not so much that
you waste budget.** Get it wrong in one direction and you have a 3am saturation incident; wrong in
the other and finance asks why the cloud bill doubled.

The reason it's a *practice* and not a one-time calculation: demand changes constantly (growth,
seasonality, marketing spikes, a viral moment) and systems behave non-linearly near their limits.
A server at 50% CPU is fine; at 90% it can fall off a cliff because latency climbs sharply as you
approach saturation (queues build, contention rises). So you don't plan to the limit — you plan to
a *safe utilization target* with deliberate headroom for spikes and failures.

**The cloud changes the shape but not the need.** Autoscaling makes capacity more elastic — you
can add resources in minutes — but it doesn't make planning obsolete: autoscaling has limits
(quotas, scale-up time, downstream bottlenecks like databases that *can't* instantly scale), and
unbounded autoscaling is just an unbounded bill. You still need to know your limits, set targets,
and forecast.

**Mental model:** think of a highway. Capacity = lanes. Demand = cars. Run at 95% of capacity and
one extra car causes a jam (latency spikes). You want enough lanes for normal rush hour *plus*
headroom for a bad day — but not an empty 12-lane road you pay to maintain. Capacity planning is
deciding how many lanes, watching the traffic trend, and adding lanes *before* the jam.

---

## Part 1 — The vocabulary

| Term | Meaning |
|------|---------|
| **Utilization** | How much of a resource is in use (e.g. 70% CPU) |
| **Saturation** | How "full" a resource is / how much work is queued (a golden signal) |
| **Headroom** | The buffer you keep between normal load and the limit |
| **Demand / Load** | The work arriving (requests/sec, jobs, data growth) |
| **Forecast** | Projected future demand based on trends + known events |
| **Bottleneck** | The resource that limits the whole system first |
| **Vertical vs Horizontal scaling** | Bigger machines vs more machines |
| **Toil** | Manual, repetitive ops work (capacity work should be automated where possible) |

---

## DAY 1 — Measure and understand your capacity

### 1. You can't plan what you don't measure
Capacity planning starts with observability (see `Prometheus.md`/`Grafana.md`). For each critical
resource, know the **current utilization**, the **trend**, and the **limit**:
- **Compute** — CPU utilization, run queue, throttling.
- **Memory** — used vs available; watch for OOM kills (see `Kubernetes.md`).
- **Storage** — disk used %, growth rate, IOPS.
- **Network** — bandwidth, connections.
- **App-level** — requests/sec, connection-pool usage, queue depth, thread pools.
- **Downstream limits** — database connections, third-party API rate limits, quotas.
```promql
# example saturation queries (Prometheus)
100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)   # CPU %
node_filesystem_avail_bytes / node_filesystem_size_bytes * 100                    # disk free %
sum(rate(http_requests_total[5m]))                                               # demand (RPS)
```

### 2. Find the bottleneck (the resource that runs out first)
A system's capacity is set by its *first* limiting resource, not its average. An app might have
plenty of CPU but exhaust its database connection pool at 200 RPS — the pool is the bottleneck,
and adding app servers won't help (it'll make it *worse*). The skill is identifying which resource
saturates first under load. Load testing (Day 2) reveals this; so does watching which metric
climbs toward its limit fastest as traffic grows.

### 3. Set utilization targets and headroom (don't plan to 100%)
Pick a **target utilization** that leaves headroom for spikes, failures, and growth between
planning cycles. Common practice: target steady-state utilization around 50–70% for compute, so
that:
- A traffic spike doesn't immediately saturate you.
- If you lose an instance/AZ/node, the survivors can absorb the load (the **N+1 / N+2** idea:
  provision so you can lose 1 (or 2) units and still serve peak).
- You have time to react/scale before hitting the wall.
The right target depends on how fast you can add capacity and how spiky your traffic is. Bursty,
slow-to-scale systems need more headroom; smooth, fast-autoscaling ones need less.

### 4. The N+1 redundancy principle
If peak load needs 4 servers and you run exactly 4, losing one means the other 3 are overloaded →
cascading failure (the classic "one node dies, the rest get its traffic, they die too"). Run **N+1**
(or N+2 for critical systems): enough that you can lose a unit *at peak* and still serve. This is
capacity planning *for failure*, not just for growth — and it's why "CPU is only at 60%" can still
be correctly provisioned.

**By end of Day 1 you can:** identify and measure the resources that constrain your system, find
the bottleneck, and set utilization targets with headroom and N+1 redundancy. That's the
foundation.

---

## DAY 2 — Forecast, test, and provision

### 1. Forecasting demand
Project future load from three inputs:
- **Organic growth trend** — extrapolate from historical metrics (linear or exponential fit).
  Prometheus even has `predict_linear()` for short-term ("will the disk fill in 4 hours?").
- **Seasonality** — daily/weekly/annual patterns (lunch peaks, Monday spikes, holiday shopping;
  in BFSI: salary days, month-end, tax deadlines).
- **Known events** — a marketing launch, a sale, onboarding a big customer, a regulatory deadline.
  These are step-changes you must plan for explicitly; trends won't predict them.
```promql
predict_linear(node_filesystem_avail_bytes[6h], 24*3600) < 0   # disk full within 24h?
```
Translate forecast demand into resource needs using your measured relationship ("each 100 RPS
needs ~1 app server and ~20 DB connections").

### 2. Load testing — find limits *before* production does
Don't guess your ceiling — measure it. Drive synthetic load and watch where it breaks:
- **Load test** — ramp traffic to expected peak; confirm you serve it within SLO.
- **Stress test** — push past the peak to find the actual breaking point and the bottleneck.
- **Soak test** — sustained load over hours to catch leaks (memory creeping up, connection
  exhaustion, disk filling).
Tools: `k6`, `wrk`, `vegeta`, `hey`, JMeter, Locust. Watch latency, error rate, and saturation as
you ramp — latency turning upward sharply marks your usable ceiling (often well below 100% CPU).

### 3. Scaling strategies — vertical, horizontal, auto
- **Vertical** (bigger machine) — simple, but has a ceiling and usually means downtime to resize;
  good for things that don't scale out (some databases).
- **Horizontal** (more machines) — the cloud-native default; near-limitless if the app is
  stateless. Pair with a load balancer (see `Kubernetes.md` HPA, cloud autoscaling).
- **Autoscaling** — add/remove capacity automatically on a metric (CPU, RPS, queue depth). Powerful
  but: set sensible **min/max** bounds (min for baseline + warm capacity, max to cap cost and
  protect downstreams), account for **scale-up lag** (new instances aren't instant — keep headroom
  to cover the warm-up), and remember **autoscaling can't fix a non-scalable bottleneck** (scaling
  app servers when the database is the limit just overwhelms the database faster).

### 4. The database / stateful caveat (where capacity planning bites hardest)
Stateless services autoscale beautifully; **databases and stateful systems usually don't.** They
have hard connection limits, can't be resized instantly, and replicas have lag. The database is
the most common true bottleneck and the hardest to scale reactively — so it needs the *most*
deliberate forward planning: connection pooling, read replicas, sharding, caching to offload reads,
and capacity bought ahead of need. Always check: "if the app tier scales 5x, can the data tier
take it?"

### 5. Cost as a first-class dimension (FinOps)
Capacity and cost are two sides of one coin. Over-provisioning is the silent budget killer (idle
instances, oversized requests, forgotten resources). Right-sizing practices:
- Match resource **requests/limits** to actual usage (over-requesting wastes whole nodes in
  Kubernetes).
- Use **reserved/committed/spot** capacity for predictable baseline load (big discounts) and
  on-demand/autoscale for spikes.
- **Scale down** non-prod and off-peak; turn off what's idle.
- Track cost per service and watch the trend (cloud Cost Explorer; see `AWS.md`/`GCP.md`/`Azure.md`).
The goal is *efficient* reliability — enough headroom to be safe, not so much you're paying for a
mostly-empty fleet.

### 6. Make it a cycle, not a one-off
Capacity planning is continuous: measure → forecast → provision → re-measure. Re-plan on a regular
cadence and ahead of known events. Automate the routine parts (autoscaling, alerts on saturation
trends, `predict_linear` warnings on disk) so humans focus on the step-changes and the bottlenecks
autoscaling can't solve. Alert on *trends approaching limits*, not just on already-saturated —
"disk will be full in 24h" beats "disk is full now."

---

## Worked example — planning for a sale event
```text
1. MEASURE: normal peak = 500 RPS, served by 4 app servers at ~55% CPU; DB pool peaks at 60/100
   connections. Bottleneck check: DB pool, not CPU, will limit first.
2. FORECAST: marketing expects 4x traffic for the sale -> ~2000 RPS peak (a known step-change,
   not a trend).
3. TRANSLATE: 2000 RPS -> ~16 app servers at target util; DB pool would need ~240 connections.
4. BOTTLENECK ALERT: the DB caps at 100 connections -> app scaling alone fails. Plan: add a read
   replica + connection pooler (pgbouncer) + cache hot reads to cut DB load BEFORE the event.
5. LOAD TEST: ramp to 2500 RPS in staging; confirm SLO holds and find the new ceiling. Soak for
   2h to catch leaks.
6. PROVISION: pre-scale to N+1 for the expected peak (autoscaling lag means don't rely on
   reactive scale-up for a known spike); set autoscaling max to cap cost; warm the fleet before
   doors open.
7. AFTER: scale back down; review actuals vs forecast to improve the next estimate.
```

---

## Common pitfalls
- **Planning to 100%.** Latency spikes sharply near saturation; run to a target with headroom.
  "It's only at 90%" is often already in the danger zone.
- **Ignoring N+1.** Running exactly enough capacity means one failure cascades. Provision to
  survive losing a unit at peak.
- **Trusting averages.** Average CPU hides peaks and per-instance hotspots. Plan to the peak and
  the bottleneck, not the mean.
- **Forgetting the bottleneck.** Scaling the wrong tier (app servers when the DB is the limit)
  wastes money and can worsen the outage. Find what saturates first.
- **Believing autoscaling solves everything.** It has lag, limits, cost, and can't scale a
  non-scalable downstream (the database). Set min/max; plan stateful tiers manually.
- **No load testing.** Discovering your ceiling during a real spike is the expensive way. Test in
  staging.
- **Over-provisioning "to be safe."** The silent budget killer. Right-size; use committed/spot for
  baseline; turn off idle.
- **Treating it as one-time.** Demand moves. Re-plan on a cadence and before known events; alert on
  trends approaching limits.

---

## Quick reference
```text
THE LOOP:  measure -> find bottleneck -> set target+headroom -> forecast -> load test ->
           provision (N+1) -> re-measure  (repeat on a cadence + before known events)

MEASURE (per resource: utilization, trend, limit)
  CPU · memory (OOM) · disk %/IOPS · network · RPS · connection pools · queue depth · quotas
  -> the FIRST resource to hit its limit is your capacity bottleneck

TARGETS & HEADROOM
  steady-state ~50–70% for compute · headroom for spikes + scale-up lag + failures
  N+1 / N+2: survive losing a unit AT PEAK

FORECAST = organic trend + seasonality + known events (step-changes)
  predict_linear(metric[window], horizon)   for "will it run out?" alerts

LOAD TESTING:  load (to peak) · stress (past peak, find breaking point) · soak (leaks)
  tools: k6, wrk, vegeta, hey, Locust, JMeter

SCALING:  vertical (ceiling, downtime) · horizontal (stateless, cloud default) ·
  autoscaling (set min/max, mind lag, can't fix downstream bottlenecks)
  STATEFUL/DB: plan ahead — pooling, replicas, sharding, caching (doesn't autoscale)

COST (FinOps):  right-size requests/limits · reserved/committed/spot for baseline ·
  scale down off-peak · kill idle · track cost-per-service trend
```

---

## Next steps after Day 2
- Wire **saturation alerts on trends** (Prometheus `predict_linear`, Alertmanager) so you're warned
  *before* hitting limits — see `Prometheus.md`/`Alertmanager.md`.
- Right-size with usage data (Kubernetes VPA recommendations, cloud right-sizing reports).
- Build a simple capacity model (RPS → resources) and revisit it each planning cycle.
- Tie to **SLOs/error budgets** (`SRE-Process.md`): saturation that threatens SLOs justifies
  capacity investment; load tests validate you can meet SLOs at peak.

## Recommended learning resources

**YouTube channels & playlists:**
- [Google SRE — Capacity Planning](https://www.youtube.com/results?search_query=google+SRE+capacity+planning) — load testing, traffic forecasting, and N+1 redundancy from Google's SRE practice
- [USENIX SREcon — Capacity and Scaling](https://www.youtube.com/results?search_query=usenix+srecon+capacity+planning) — real-world capacity planning frameworks and war stories
- [PagerDuty — Operational Readiness](https://www.youtube.com/@PagerDuty) — connecting capacity planning to SLO targets and incident prevention
- [DevOps Enterprise Summit — Scaling](https://www.youtube.com/results?search_query=devops+enterprise+summit+capacity+scaling) — enterprise capacity planning, cloud cost management, and forecasting
- [Gremlin — Load Testing and Capacity](https://www.youtube.com/@GremlinInc) — finding real ceilings through chaos experiments and load tests

**Official docs & blogs:**
- [sre.google — Software Engineering for SRE](https://sre.google/sre-book/software-engineering-in-sre/) — capacity planning principles from Google's SRE Book
- [AWS Well-Architected — Performance Efficiency](https://docs.aws.amazon.com/wellarchitected/latest/performance-efficiency-pillar/welcome.html) — right-sizing, auto-scaling, and load testing guidance

---

**The mantra:** measure utilization and trends, find the bottleneck (it's often the database, not
CPU), run to a safe target with N+1 headroom, forecast demand (trend + seasonality + events), load
test to find your real ceiling, and right-size for efficient reliability — enough headroom to be
safe, not so much you're paying for empty lanes.
