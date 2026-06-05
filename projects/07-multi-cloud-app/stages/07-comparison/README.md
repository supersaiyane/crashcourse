# Stage 7: Multi-Cloud Comparison

**Goal:** Synthesise everything from stages 1-6 into a structured comparison of AWS, GCP, and Azure — cost, performance, and developer experience — so you can make an informed, evidence-based cloud choice rather than defaulting to whatever someone used at their last job.

**Prerequisites:** Stage 6 complete. k6 results from all three clouds. Access to the billing/pricing pages for all three providers.

---

## Part 1 — Theory: What & Why

### The problem comparison solves

Most teams pick a cloud provider based on habit, hype, or the hiring manager's resume. "We used AWS at my last company" is not a strategy — it is inertia. A structured comparison removes bias and gives you defensible evidence when leadership asks "why not Azure?" or when finance asks "can we save 30% by switching?"

Without a methodology, comparisons devolve into cherry-picking. AWS advocates cite service breadth. GCP advocates cite Kubernetes. Azure advocates cite enterprise integration. Each is correct in isolation and misleading in aggregate. A fair comparison requires the same application, equivalent infrastructure, and identical test conditions — which is exactly what stages 1-6 built.

### The three dimensions of cloud comparison

No single dimension determines the right cloud. Cost, performance, and developer experience interact — a cheaper cloud with terrible DX costs you in engineer hours, and a fast cloud with unpredictable pricing costs you in budget overruns.

```text
The cloud decision triangle:

              Cost
             /    \
            /      \
           /  Your  \
          /  choice   \
         /    sits     \
        /   somewhere   \
       /    in here      \
      /                   \
     +---------------------+
  Performance          Developer
                      Experience

  No cloud wins all three.
  You choose which dimension to optimise for.
```

| Dimension | What to measure | Who cares most |
|-----------|----------------|----------------|
| **Cost** | Monthly spend for equivalent deployments | Finance, CTO |
| **Performance** | Latency (p50/p95/p99), throughput, error rate under load | SRE, engineering |
| **Developer experience** | CLI quality, docs, console UX, Terraform maturity | Engineering team |

### Vocabulary

| Term | Meaning |
|------|---------|
| **On-demand pricing** | Pay-per-hour with no commitment. The fairest baseline for comparison — no negotiated discounts muddy the numbers. |
| **Reserved / Committed use** | 1-3 year commitment for 30-60% discount. All three clouds offer this; compare on-demand first, then apply discounts. |
| **Egress** | Data transfer out of the cloud. The hidden cost that catches teams who query across regions or clouds. |
| **p95 latency** | 95th percentile response time — 95% of requests are faster than this. The standard SLO metric. |
| **Breaking VU** | The Virtual User count at which errors exceed your tolerance (e.g. 5%). Found via stress testing. |
| **Recovery time** | How long after a spike passes until latency returns to baseline. Measures system resilience. |
| **DX (Developer Experience)** | The friction (or lack of it) an engineer feels when using a cloud's tools daily. CLI, docs, console, error messages. |
| **TCO (Total Cost of Ownership)** | The full cost including compute, storage, egress, support contracts, and engineer time spent fighting tooling. |

### Comparison methodology — what makes it fair

A fair comparison requires controlling variables. Without this, you are comparing apples to orangutans.

```text
Controlled variables (same across all three clouds):

  +-------------------+     +-------------------+     +-------------------+
  | Application code  | === | Application code  | === | Application code  |
  | Docker images     |     | Docker images     |     | Docker images     |
  | K8s manifests     |     | K8s manifests     |     | K8s manifests     |
  | k6 test scripts   |     | k6 test scripts   |     | k6 test scripts   |
  +--------+----------+     +--------+----------+     +--------+----------+
           |                          |                          |
           v                          v                          v
  +--------+----------+     +--------+----------+     +--------+----------+
  | AWS EKS           |     | GCP GKE           |     | Azure AKS         |
  | 3x m5.large       |     | 3x e2-standard-2  |     | 3x Standard_D2s   |
  | RDS (db.t3.med)   |     | Cloud SQL (2/8)   |     | Flex Server (B2s) |
  | ap-south-1        |     | asia-south1       |     | centralindia      |
  +-------------------+     +-------------------+     +-------------------+

  What differs: only the cloud infrastructure underneath.
  What stays the same: code, containers, manifests, tests, region proximity.
```

Rules for a valid comparison:
- **Same application** — identical code, identical containers, identical Kubernetes manifests (Stage 5)
- **Equivalent infrastructure** — same VM sizes (2 vCPU, 8 GB RAM), same database tier, same region proximity to user base
- **Same test conditions** — identical k6 scripts, run from the same source location (Stage 6)
- **Same time window** — run all tests within the same week to avoid infrastructure changes skewing results

### BFSI context — why comparison is not optional

In regulated industries, cloud selection is not just a technical decision. RBI (Reserve Bank of India) guidelines require banks to demonstrate due diligence in vendor selection, including cost analysis and risk assessment. A structured comparison document — with actual numbers, not vendor slide decks — satisfies the audit requirement and protects the decision-maker.

---

## Part 2 — Hands-on

### 1. Cost comparison

Calculate the monthly cost for equivalent CloudPlatform deployments on each cloud. Use on-demand pricing (no reserved instances) for a fair baseline.

**Compute — Kubernetes nodes:**

```text
CloudPlatform requirements:
  - 3 nodes (2 vCPU, 8 GB RAM each) for app workloads
  - Region: closest to user base (ap-south-1 / asia-south1 / centralindia)

+---------------------+------------------+------------------+------------------+
| Service             |  AWS (EKS)       |  GCP (GKE)       |  Azure (AKS)     |
+---------------------+------------------+------------------+------------------+
| K8s control plane   |  $73/mo          |  $0 (free tier)  |  $0 (free tier)  |
| Nodes (3x 2vCPU/8G) |  3 x $70 = $210  |  3 x $52 = $156  |  3 x $66 = $198  |
|   (instance type)   |  (m5.large)      |  (e2-standard-2) |  (Standard_D2s)  |
| Node total          |  $283/mo         |  $156/mo         |  $198/mo         |
+---------------------+------------------+------------------+------------------+

Note: EKS charges $73/mo for the control plane. GKE and AKS offer a free tier
for a single cluster. This is GCP's most impactful pricing advantage for small
teams — you pay $0 before running a single pod.
```

**Database:**

```text
+---------------------+------------------+------------------+------------------+
| Service             |  AWS (RDS)       |  GCP (Cloud SQL) |  Azure (Flex)    |
+---------------------+------------------+------------------+------------------+
| PostgreSQL          |  db.t3.medium    |  db-custom-2-8   |  B2s             |
|   (2 vCPU, 8 GB)   |  $67/mo          |  $78/mo          |  $55/mo          |
| Storage (50 GB SSD) |  $5.75/mo        |  $8.50/mo        |  $6.90/mo        |
| Backups (7-day)     |  included        |  included        |  included        |
| DB total            |  $72.75/mo       |  $86.50/mo       |  $61.90/mo       |
+---------------------+------------------+------------------+------------------+

Note: Azure Flexible Server is the cheapest database option, but its
burstable B-series instances can throttle under sustained load. For
BFSI workloads with consistent database pressure, standard-tier
instances are safer (and more expensive).
```

**Storage and networking:**

```text
+---------------------+------------------+------------------+------------------+
| Service             |  AWS             |  GCP             |  Azure           |
+---------------------+------------------+------------------+------------------+
| Object storage      |  S3: $2.30       |  GCS: $2.00      |  Blob: $2.10     |
|   (100 GB std)      |                  |                  |                  |
| Data egress         |  $9.00/100GB     |  $12.00/100GB    |  $8.70/100GB     |
| Load balancer       |  $18 + LCU       |  $18 + usage     |  $18 + rules     |
| Networking total    |  ~$30/mo         |  ~$32/mo         |  ~$29/mo         |
+---------------------+------------------+------------------+------------------+

Note: GCP has the highest egress costs. If your architecture involves
significant cross-region or cross-cloud data transfer, this compounds fast.
```

**Total monthly comparison:**

```text
+---------------------+----------+----------+----------+
|                     |   AWS    |   GCP    |  Azure   |
+---------------------+----------+----------+----------+
| Compute (K8s)       |   $283   |   $156   |   $198   |
| Database            |   $73    |   $87    |   $62    |
| Storage/Networking  |   $30    |   $32    |   $29    |
+---------------------+----------+----------+----------+
| TOTAL (on-demand)   |   $386   |   $275   |   $289   |
+---------------------+----------+----------+----------+
| With 1-yr reserved  |  ~$250   |  ~$180   |  ~$195   |
+---------------------+----------+----------+----------+
| 3-year projection   | $13,896  |  $9,900  | $10,404  |
|   (on-demand)       |          |          |          |
+---------------------+----------+----------+----------+

Winner: GCP ($275/mo) — 29% cheaper than AWS, 5% cheaper than Azure.
The EKS control plane fee ($73/mo) is AWS's largest disadvantage at this scale.
```

> Prices vary by region and change frequently. Always verify with the provider's pricing calculator for your exact configuration. The numbers above are illustrative for ap-south-1 / asia-south1 / centralindia as of mid-2025.

**Hidden costs most teams forget:**

```text
+---------------------------+-------------------------------------------+
| Hidden cost               | Impact                                    |
+---------------------------+-------------------------------------------+
| Egress between regions    | $0.01-0.02/GB within cloud, $0.08-0.12   |
|                           | /GB cross-cloud. Multi-cloud DR with      |
|                           | continuous replication adds $50-200/mo.   |
+---------------------------+-------------------------------------------+
| NAT Gateway (AWS)         | $32/mo + $0.045/GB. GCP and Azure include |
|                           | NAT in their VPC at lower cost.           |
+---------------------------+-------------------------------------------+
| Log storage               | CloudWatch Logs ingestion: $0.50/GB.      |
|                           | Cloud Logging: $0.50/GB. Both add up      |
|                           | fast with verbose apps.                   |
+---------------------------+-------------------------------------------+
| Support plans             | AWS Business: $100/mo min. GCP Enhanced:  |
|                           | $500/mo min. Azure Standard: $100/mo.     |
+---------------------------+-------------------------------------------+
```

### 2. Performance comparison

Tabulate the k6 results from Stage 6. All tests ran with the same script, same VU count, from the same source location.

**Baseline test (10 VUs, 3 minutes):**

```text
+----------+----------+----------+----------+----------+----------+-----------+
|  Cloud   |  avg(ms) |  p50(ms) |  p95(ms) |  p99(ms) |  RPS     | Error %   |
+----------+----------+----------+----------+----------+----------+-----------+
|  AWS     |    38    |    32    |    85    |   210    |   41.6   |   0.00%   |
|  GCP     |    31    |    28    |    72    |   185    |   43.2   |   0.00%   |
|  Azure   |    42    |    35    |    91    |   240    |   40.1   |   0.00%   |
+----------+----------+----------+----------+----------+----------+-----------+
  Winner: GCP — lowest latency across all percentiles, highest throughput.
```

**Stress test (ramp to 800 VUs):**

```text
+----------+----------------+----------------+-----------+-----------+
|  Cloud   |  Breaking VU   |  p95 at break  |  Max RPS  | Peak err% |
+----------+----------------+----------------+-----------+-----------+
|  AWS     |     ~350       |     920ms      |    580    |   4.8%    |
|  GCP     |     ~400       |     780ms      |    640    |   3.2%    |
|  Azure   |     ~300       |    1100ms      |    510    |   6.1%    |
+----------+----------------+----------------+-----------+-----------+
  Winner: GCP — breaks later, lower latency at break point, higher max RPS.
```

**Spike test (20 to 300 VUs in 10s):**

```text
+----------+------------------+------------------+-------------------+
|  Cloud   |  p95 during spike|  Recovery time   |  Errors in spike  |
+----------+------------------+------------------+-------------------+
|  AWS     |      380ms       |      25s         |      0.8%         |
|  GCP     |      310ms       |      18s         |      0.4%         |
|  Azure   |      450ms       |      35s         |      1.2%         |
+----------+------------------+------------------+-------------------+
  Winner: GCP — lowest spike latency, fastest recovery, fewest errors.
```

**Key findings:**

```text
Performance ranking:   1. GCP   2. AWS   3. Azure

Why GCP leads:
  - GKE uses VPC-native pods (no overlay network) — lower network latency
  - GKE node auto-provisioning responds faster to scaling events
  - Cloud SQL connection handling is more efficient under burst

Why Azure trails:
  - AKS networking adds overhead under high concurrency
  - Azure Flex Server (burstable) throttles CPU under sustained stress
  - Higher p99 suggests more variable infrastructure performance

Important caveat:
  These results are for THIS application, THIS region, THIS instance size.
  Different workloads (GPU, memory-intensive, storage-heavy) may rank differently.
```

### 3. Developer experience comparison

Rate each cloud's tooling on a 1-5 scale (5 = excellent). Rate based on specific, observable criteria — not vague feelings.

**CLI quality:**

```text
+---------------------+----------+----------+----------+
| Criteria            |   AWS    |   GCP    |  Azure   |
+---------------------+----------+----------+----------+
| Installation ease   |    4     |    5     |    3     |
| Command consistency |    3     |    5     |    3     |
| Output readability  |    3     |    4     |    3     |
| Auto-completion     |    4     |    5     |    4     |
| Auth flow           |    3     |    4     |    3     |
| Error messages      |    3     |    4     |    2     |
+---------------------+----------+----------+----------+
| CLI average         |   3.3    |   4.5    |   3.0    |
+---------------------+----------+----------+----------+

Notes:
  - gcloud's consistent "gcloud <service> <resource> <verb>" pattern is
    easier to remember than AWS's service-specific CLIs (aws eks, aws rds,
    aws s3 — each with different flag conventions).
  - Azure CLI's error messages often include internal resource IDs that
    are unhelpful for debugging.
```

**Console (web UI):**

```text
+---------------------+----------+----------+----------+
| Criteria            |   AWS    |   GCP    |  Azure   |
+---------------------+----------+----------+----------+
| Navigation clarity  |    3     |    4     |    3     |
| Search quality      |    4     |    5     |    3     |
| Resource visibility |    3     |    4     |    4     |
| Load speed          |    3     |    4     |    3     |
| IAM management      |    2     |    3     |    3     |
+---------------------+----------+----------+----------+
| Console average     |   3.0    |   4.0    |   3.2    |
+---------------------+----------+----------+----------+

Notes:
  - AWS Console has 200+ services in the sidebar. Finding anything requires
    the search bar. GCP groups services more intuitively.
  - Azure Portal's "blade" navigation is unique and divisive — some love it,
    many find it disorienting compared to standard page navigation.
```

**Documentation and ecosystem:**

```text
+---------------------+----------+----------+----------+
| Criteria            |   AWS    |   GCP    |  Azure   |
+---------------------+----------+----------+----------+
| Docs quality        |    4     |    5     |    3     |
| Example code        |    4     |    4     |    3     |
| Community (SO/GH)   |    5     |    4     |    4     |
| Terraform provider  |    5     |    4     |    4     |
| K8s integration     |    4     |    5     |    4     |
+---------------------+----------+----------+----------+
| Ecosystem average   |   4.4    |   4.4    |   3.6    |
+---------------------+----------+----------+----------+

Notes:
  - AWS has the largest community because of market share. This matters
    when debugging at 3 AM — more Stack Overflow answers, more blog posts.
  - GCP docs are consistently well-written with working examples.
    AWS docs vary in quality by service. Azure docs often feel auto-generated.
```

**Overall DX summary:**

```text
+---------------------+----------+----------+----------+
|                     |   AWS    |   GCP    |  Azure   |
+---------------------+----------+----------+----------+
| CLI                 |   3.3    |   4.5    |   3.0    |
| Console             |   3.0    |   4.0    |   3.2    |
| Ecosystem           |   4.4    |   4.4    |   3.6    |
+---------------------+----------+----------+----------+
| DX overall          |   3.6    |   4.3    |   3.3    |
+---------------------+----------+----------+----------+

DX ranking: 1. GCP   2. AWS   3. Azure
```

### 4. Decision matrix — when to choose which cloud

```text
+----------------------------+------------------+------------------------------------------+
| Scenario                   |  Recommended     |  Why                                     |
+----------------------------+------------------+------------------------------------------+
| Startup, speed matters     |  GCP             | Free K8s control plane, best DX, lowest  |
|                            |                  | on-demand compute cost                   |
+----------------------------+------------------+------------------------------------------+
| Enterprise, AWS ecosystem  |  AWS             | Deepest service catalog, largest talent   |
| already in place           |                  | pool, best Terraform provider, most      |
|                            |                  | Stack Overflow answers at 3 AM           |
+----------------------------+------------------+------------------------------------------+
| Microsoft shop (AD, O365,  |  Azure           | Native AD integration, seamless with     |
| Teams, SharePoint)         |                  | existing Microsoft licensing, Azure AD   |
|                            |                  | Conditional Access for compliance        |
+----------------------------+------------------+------------------------------------------+
| BFSI with data residency   |  Depends on      | Choose the cloud with the required       |
| requirements (RBI, SEBI)   |  regulation      | regional presence and certifications.    |
|                            |                  | All three have Mumbai regions.           |
+----------------------------+------------------+------------------------------------------+
| Multi-cloud mandate        |  GCP primary,    | GCP for lowest cost + best K8s. AWS as   |
| (regulatory/contractual)   |  AWS secondary   | DR target for service breadth. Azure     |
|                            |                  | for compliance if Microsoft stack.       |
+----------------------------+------------------+------------------------------------------+
| ML/AI-heavy workload       |  GCP or AWS      | GCP for Vertex AI + TPUs. AWS for        |
|                            |                  | SageMaker + Bedrock. Azure for OpenAI.   |
+----------------------------+------------------+------------------------------------------+
```

### 5. Create the comparison summary document

Combine all three dimensions into a single-page summary for stakeholders:

```text
CloudPlatform Multi-Cloud Comparison — Executive Summary

+---------------------+----------+----------+----------+
| Dimension           |   AWS    |   GCP    |  Azure   |
+---------------------+----------+----------+----------+
| Monthly cost        |   $386   |   $275   |   $289   |
| Cost rank           |    3     |    1     |    2     |
+---------------------+----------+----------+----------+
| Baseline p95        |   85ms   |   72ms   |   91ms   |
| Stress breaking VU  |   350    |   400    |   300    |
| Performance rank    |    2     |    1     |    3     |
+---------------------+----------+----------+----------+
| DX score (/5)       |   3.6    |   4.3    |   3.3    |
| DX rank             |    2     |    1     |    3     |
+---------------------+----------+----------+----------+
| OVERALL RANK        |    2     |    1     |    3     |
+---------------------+----------+----------+----------+

Recommendation: GCP as primary cloud for CloudPlatform.
Caveat: If the organisation is deeply invested in AWS tooling and talent,
the migration cost may outweigh the $111/mo savings. Evaluate switching
cost before deciding.
```

---

## Part 3 — Key Patterns

### Pattern 1: Normalise before comparing

Raw numbers are misleading without normalisation. A $386/mo AWS bill vs $275/mo GCP bill looks decisive — until you realise the AWS deployment includes a $73 control plane fee that disappears at scale (it is flat regardless of node count). At 20 nodes, the per-node cost difference shrinks dramatically. Always compare cost-per-unit (per pod, per request, per GB stored).

### Pattern 2: Weight dimensions by business context

Not all dimensions matter equally. Create a weighted scorecard:

```text
Example weighting for a BFSI startup:
  Cost:        40%  (budget-constrained)
  Performance: 35%  (SLO commitments to regulators)
  DX:          25%  (small team, DX = velocity)

Example weighting for a large enterprise:
  Cost:        20%  (budget is less constrained)
  Performance: 30%  (SLO matters but not primary driver)
  DX:          50%  (100 engineers, DX = millions in salary efficiency)
```

### Pattern 3: Re-run comparison quarterly

Cloud pricing changes, infrastructure improves, and new instance types launch. A comparison done in Q1 may not hold in Q3. Schedule a quarterly re-run of the k6 tests and pricing check. Automate what you can — the k6 scripts from Stage 6 are reusable.

### Pattern 4: Include switching cost in the decision

If you are already on AWS with 50 Terraform modules, 200 IAM policies, and a team trained on AWS, the cost of switching to GCP is not $0. Estimate the migration effort (weeks of engineering time, retraining, re-certification) and add it to the TCO comparison. Often, the "cheaper" cloud is only cheaper if you are starting from scratch.

### Pattern 5: Document assumptions explicitly

Every comparison rests on assumptions (region, instance type, workload pattern, growth projection). Document them. When someone challenges the comparison in six months, you need to show what was assumed and what changed.

---

## Part 4 — Common Mistakes

- **Comparing list prices without accounting for discounts:** Every cloud offers committed use discounts (30-60% off). Compare on-demand AND reserved pricing. A cloud that is 20% cheaper on-demand may be more expensive with 3-year committed use.

- **Ignoring egress costs:** Data transfer out is the hidden cost of cloud. A service that queries across regions or syncs data to a DR site can spend more on egress than on compute. GCP's egress pricing is the highest of the three — factor it in.

- **Benchmarking once and extrapolating:** Cloud performance varies by region, time of day, instance type, and even underlying hardware generation. Run tests multiple times across different days and average the results. A single run on a quiet Sunday morning is not representative of Tuesday at 10 AM.

- **Letting DX preference override cost/performance data:** "I like the GCP console" is valid input but should not override a 40% cost difference if budget matters. Quantify DX impact (estimated engineer-hours saved per month) to make it comparable to cost and performance numbers.

- **Comparing services that are not equivalent:** AWS RDS Multi-AZ is not the same as GCP Cloud SQL basic tier. Azure Flex Server burstable (B2s) is not the same as a dedicated compute instance. Match the configuration — vCPU count, RAM, storage type, HA mode — not just the service name.

- **Forgetting to include the team's existing expertise:** A team of 10 AWS-certified engineers switching to GCP loses 6-12 months of productivity during the learning curve. This cost is real and often larger than the infrastructure savings.

- **Presenting a 200-line spreadsheet instead of a one-page summary:** Decision-makers need a single-page comparison with clear rankings and a recommendation. Save the detailed tables for the appendix. Lead with the conclusion.

---

## Exercises

See the `exercises/` directory for guided walkthroughs:

1. [Cost analysis](exercises/01-cost-analysis.md) — calculate monthly costs per cloud using pricing calculators
2. [Performance analysis](exercises/02-performance-analysis.md) — tabulate k6 results into comparison tables
3. [DX comparison](exercises/03-dx-comparison.md) — rate CLI, console, and docs per cloud with specific criteria

---

**Next stage:** [08-multi-cloud-strategy](../08-multi-cloud-strategy/README.md) — decide when multi-cloud makes sense and build the strategy.
