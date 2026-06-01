# FinOps — A 2-Day Crash Course

> Cloud spend is infrastructure debt made visible — FinOps is how you pay it down deliberately.

---

## Part 0 — Why This Matters

Think of your cloud account like a household budget where every light you leave on, every appliance you forget to unplug, and every subscription you signed up for shows up on one giant bill at the end of the month. Except in the cloud, those lights can cost $50,000/month instead of $50.

The problem is not that cloud is expensive. The problem is that cloud spend is almost completely invisible until it isn't. Engineers provision resources to solve immediate problems. Teams don't see the bill. Finance sees the bill but not the resources. Nobody connects the two — until someone in a quarterly review asks why AWS costs went up 40% and nobody has an answer.

FinOps is the practice that closes that loop. It is not a cost-cutting mandate. It is not Finance telling Engineering to use smaller machines. It is a shared operating model where engineering, finance, and product look at the same data and make decisions together.

The outcome you are aiming for is not "spend less." It is "spend with intention." You want every dollar of cloud spend to be a deliberate choice, not an accident.

---

## Vocabulary

**Unit Economics**
The cost to produce one unit of business value — one API call, one user, one processed transaction. When you know your unit cost, you can decide whether growth is profitable. Without it, you are flying blind.

**Showback**
Reporting cloud costs back to the teams that incurred them, without requiring those teams to actually pay the bill. It creates visibility and accountability without changing financial structures. A good starting point for most organizations.

**Chargeback**
The teams that incur costs actually pay for them — either via internal billing or real budget transfers. More complex to implement than showback, but creates harder incentives.

**Reserved Instances (RIs)**
A commitment to use a specific instance type in a specific region for 1 or 3 years, in exchange for a significant discount (up to 72% on AWS). You pay whether you use it or not. The tradeoff: predictability vs. flexibility.

**Savings Plans**
A more flexible alternative to RIs. You commit to a minimum spend ($/hour) rather than a specific instance type. AWS, GCP, and Azure all have variants. Generally preferred over RIs for workloads that change instance types over time.

**Spot / Preemptible Instances**
Unused cloud capacity sold at deep discounts (up to 90%). The catch: the provider can reclaim the instance with a 2-minute warning. Best for stateless, fault-tolerant, or batch workloads.

**Right-sizing**
Matching the instance size to actual workload requirements. A machine running at 5% CPU utilization is over-provisioned. Right-sizing means picking the instance that runs at 60–80% utilization under normal load.

**Cost Allocation Tags**
Key-value metadata attached to cloud resources (e.g., `team=payments`, `env=prod`, `service=checkout`). Without tags, you cannot answer "who owns this cost?" With tags, you can slice your bill by team, environment, or product line.

**FinOps Lifecycle**
The three-phase cycle defined by the FinOps Foundation:
1. **Inform** — Make costs visible. Build dashboards. Tag everything.
2. **Optimize** — Reduce waste. Right-size. Reserve. Spot. Architect efficiently.
3. **Operate** — Embed cost awareness into daily engineering and product decisions.

---

## DAY 1 — See the Money Before You Touch It

### Morning: Cost Allocation and Tagging

You cannot optimize what you cannot see. Before you touch a single resource, get your tagging strategy right.

Start with four mandatory tags on every resource:

| Tag Key | Example Values |
|---------|---------------|
| `team` | payments, platform, data |
| `env` | prod, staging, dev |
| `service` | checkout, auth, ml-pipeline |
| `cost-center` | engineering, marketing, infra |

In AWS, go to Cost Explorer → Tag Editor and find all untagged resources. In GCP, use the Resource Manager Labels report. In Azure, use the Policy blade to enforce tags at resource creation.

⚠️ Untagged resources are a real problem. At scale, 20–30% of spend often lands in an "unallocated" bucket. That bucket is where waste hides.

Set up tag enforcement policies now, before the next resource gets created. In AWS, use Service Control Policies (SCPs) or AWS Config rules. In GCP, use Organization Policies. In Azure, use Azure Policy with `deny` effects.

### Late Morning: Billing Dashboards

**AWS**: Open AWS Cost Explorer. Set the time range to the last 3 months. Group by Service first, then by Tag. Look for:
- Services you don't recognize
- Costs growing faster than usage
- Large data transfer line items (usually a red flag)
- EC2 "Other" charges (usually EBS snapshots, Elastic IPs, or NAT Gateway)

**GCP**: Cloud Billing → Reports. Use the "SKU" grouping to find granular charges. BigQuery exports to your own dataset give you the most powerful querying capability.

**Azure**: Cost Management + Billing → Cost Analysis. Use the "Resource" view and sort by cost descending. Look for orphaned disks and public IP addresses.

Spend two hours just reading the bill. Resist the urge to act yet. Understand the shape of the spend first.

### Afternoon: Identifying Waste

The most common sources of waste, in order of how often they appear:

**1. Idle resources**
Instances running with <5% CPU utilization for 7+ days. EC2 instances that were spun up for a proof of concept and never terminated. RDS instances in dev environments running 24/7 when they are used 8 hours a day.

In AWS: Trusted Advisor → Cost Optimization, or Cost Explorer's "EC2 Right Sizing Recommendations."
In GCP: Recommender API → `google.compute.instance.MachineTypeRecommender`.
In Azure: Advisor → Cost recommendations.

**2. Orphaned storage**
EBS volumes not attached to any instance. S3 buckets with objects that haven't been accessed in 90+ days. Snapshots from instances that were terminated years ago. These are pure waste — you are paying for storage you will never read.

**3. NAT Gateway and data transfer**
NAT Gateway charges in AWS are notorious budget killers. Every GB of traffic through a NAT Gateway costs $0.045. If your services are making inter-AZ calls through NAT instead of using VPC endpoints or private DNS, you can be spending tens of thousands per month on network plumbing.

Check your data transfer line items. Cross-region and cross-AZ traffic adds up faster than almost anything else.

**4. Oversized databases**
RDS and Cloud SQL instances are almost always over-provisioned. A db.r5.4xlarge running at 10% CPU is not a high-availability setup — it is an expensive mistake. Multi-AZ adds cost but is often enabled in dev environments where it serves no purpose.

**5. Forgotten dev/test environments**
Dev environments that run on nights and weekends. Staging environments that mirror production in size. These should be scheduled to shut down when not in use.

### End of Day 1: Unit Economics

Pick one key business metric. Something your product team already tracks — API calls, active users, transactions processed, documents analyzed.

Now divide your total cloud spend by that metric for the same time period. That is your unit cost.

If you process 10 million API calls per month and your cloud bill is $100,000, your unit cost is $0.01 per API call. Now you can ask: is that good? Is it getting better or worse? Does growth drive cost proportionally, or is cost growing faster?

Build a simple spreadsheet or dashboard tracking unit cost over the last 6 months. If unit cost is increasing while volume increases, you have a scaling problem. If it is flat or declining, your architecture is working.

Unit economics is the bridge between engineering decisions and business outcomes. Bring it to your next product review.

---

## DAY 2 — Optimize, Automate, Culture

### Morning: Reservations and Savings Plans

Once you have 3–6 months of stable spend data, you are ready to commit.

The rule of thumb: reserve the base, spot the burst, on-demand the unknown.

**How to approach reservations:**

1. Export 90 days of EC2 usage from Cost Explorer. Look at the "Coverage" report — it shows what percentage of your usage was covered by reservations.
2. Identify your steady-state workload. If you run 20 `m5.xlarge` instances 24/7 in `us-east-1`, that is your reservation candidate.
3. Start with 1-year, no-upfront Savings Plans. The discount is smaller than 3-year or all-upfront, but the commitment is lower.
4. Layer in Compute Savings Plans before instance-family Savings Plans — they give you more flexibility as your fleet changes.

In GCP, Committed Use Discounts (CUDs) work similarly — commit to a minimum vCPU/memory for 1 or 3 years. In Azure, Reserved VM Instances follow the same model.

⚠️ Do not reserve before you have stable usage patterns. Reserving a workload you are about to migrate or deprecate is paying a cancellation fee on top of wasted spend.

### Mid-Morning: Spot Instances in Practice

Spot instances require your application to handle interruption gracefully. If it cannot survive a sudden termination, do not use spot.

Good spot candidates:
- Batch jobs and data pipelines (Spark, Flink, Airflow workers)
- CI/CD build agents
- ML training jobs with checkpoint support
- Stateless web tier with auto-scaling groups

Bad spot candidates:
- Databases (any of them)
- Stateful services without replication
- Single-instance workloads with no failover

In AWS, use Spot Instance Advisor to check interruption frequency by instance type and region. Choose instance families with <5% interruption rate. Use mixed instance policies in Auto Scaling Groups — combine on-demand base capacity with spot for the rest.

In GCP, Spot VMs (formerly preemptible) have a maximum lifetime of 24 hours. Design your batch jobs to checkpoint progress and restart cleanly.

### Late Morning: Right-Sizing

Pull the CPU and memory utilization for your top 20 most expensive instances over the last 30 days. You want p95 utilization, not average — average hides spikes.

The target range is 60–80% CPU at p95 for compute-optimized workloads. Below 30% p95 means you are likely over-provisioned.

Steps:
1. Use AWS Compute Optimizer, GCP Recommender, or Azure Advisor to get automated right-sizing suggestions.
2. Filter recommendations by estimated monthly savings.
3. Test the smaller instance type in staging first. Measure actual performance impact.
4. Roll out in production using blue-green deployment or canary — don't resize in place during business hours.

Memory is harder to right-size because most cloud providers don't instrument it by default. In Kubernetes, look at `kubectl top pods` or Prometheus `container_memory_working_set_bytes`. For EC2, you need the CloudWatch agent or a custom metric.

### Afternoon: Kubernetes Cost Visibility — Kubecost and OpenCost

Standard cloud billing tools cannot allocate costs at the pod or namespace level. You get an EC2 line item for your node group, but nothing that tells you the `payments` namespace costs $8,000/month and `logging` costs $2,000.

**OpenCost** is the CNCF-incubating open-source project that solves this. It runs as a pod in your cluster, reads node pricing from cloud APIs, and allocates costs to namespaces, deployments, labels, and teams.

Install it:
```bash
helm install opencost opencost/opencost \
  --namespace opencost \
  --create-namespace \
  --set opencost.exporter.defaultClusterId=my-cluster
```

**Kubecost** is the commercial product built on top of OpenCost. It adds multi-cluster views, request right-sizing recommendations, and integration with Slack for cost alerts.

Key metrics to track in Kubernetes:
- Cost per namespace (who is spending what)
- CPU request vs. actual usage ratio (over-requested = wasted reservation)
- Memory request vs. actual usage ratio
- Cost efficiency score (actual spend / requested spend)

Set namespace-level resource quotas in Kubernetes to enforce budgets at the team level:
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-payments-quota
  namespace: payments
spec:
  hard:
    requests.cpu: "100"
    requests.memory: 200Gi
    limits.cpu: "200"
    limits.memory: 400Gi
```

### Late Afternoon: FinOps Culture

The tooling is the easy part. The hard part is making cost a shared responsibility.

What does embedding FinOps culture look like in practice?

**Weekly cost reviews**
A 30-minute standing meeting with representatives from engineering, finance, and product. Review the top cost movers from the previous week. Assign owners to anomalies. Celebrate wins.

**Cost anomaly alerting**
Set up AWS Cost Anomaly Detection, GCP Budget Alerts, or Azure Cost Alerts. Route alerts to Slack. If a service's cost spikes 50% in a single day, the owning team should hear about it before Finance does.

**Engineering OKRs that include efficiency**
If your engineering OKRs only measure features shipped and uptime, you will never make cost a first-class concern. Add a unit cost metric or a monthly savings target to the OKR.

**Making cost visible in PR reviews**
Before merging a PR that adds a new database or a new data pipeline, someone should ask: what does this cost? This does not require a formal process — it requires a norm.

**Tagging as a deployment gate**
Use CI/CD hooks to reject Terraform plans that provision untagged resources. Make the tagging policy part of your infrastructure-as-code review checklist.

### AI/ML Costs — A Special Case

AI and ML workloads are the fastest-growing cost category for most organizations, and they behave differently from general compute.

**Training costs** are bursty and high. A single large model training run can cost $10,000–$100,000. Use spot/preemptible instances with checkpointing. Use managed services like SageMaker, Vertex AI, or Azure ML, which handle spot interruption and checkpoint recovery for you. Always set a budget cap and a hard stop on training jobs.

**Inference costs** are continuous and scale with traffic. Before deploying a model to production, measure tokens per second per dollar. A GPT-4-class model served via API costs 10–50x more than a fine-tuned smaller model at equivalent quality for your specific task.

**LLM API costs** compound quickly. $0.01/1K tokens sounds cheap until you have 100,000 users sending 10 requests per day. Build a cost calculator into your LLM product design phase, not after launch.

Watch for:
- Models running on GPU instances at idle (no auto-scaling)
- Training jobs that ran once and left behind large S3/GCS datasets
- Development teams calling production LLM APIs for testing (use cheaper models or mocks in non-prod)

---

## Worked Example — Cutting a $50K/Month AWS Bill by 40%

**Starting point:** A 40-person SaaS company spending $52,000/month on AWS. No cost allocation tags. No reservations. Engineering team unaware of cloud costs.

**Month 1 — Inform**

- Audited all resources with AWS Resource Groups Tagging Editor. Found 38% of spend was untagged.
- Applied `team`, `env`, `service` tags to all resources. Added SCP to enforce tagging on new resources.
- Discovered a Redshift cluster running in dev at $4,200/month, provisioned for a proof of concept 14 months ago and never used again. Terminated it.
- Found 12 EBS volumes not attached to any instance totaling 14 TB. Took snapshots, deleted volumes. Saved $1,120/month.
- Identified 4 NAT Gateways generating $3,800/month in data processing charges. Audit showed that S3 and DynamoDB traffic was routing through NAT instead of VPC endpoints. Added S3 and DynamoDB gateway endpoints (free). Saved $2,900/month.

**Running savings after Month 1: $8,220/month (16%)**

**Month 2 — Optimize**

- Ran Compute Optimizer on the entire EC2 fleet. Found 23 instances over-provisioned by 2+ size classes.
- Right-sized 18 instances (5 were production-critical and kept as-is pending load testing). Saved $3,600/month.
- Scheduled dev and staging EC2 instances to stop at 7pm and restart at 7am on weekdays. Dev RDS instances stopped on weekends. Saved $4,100/month.
- Purchased 1-year Compute Savings Plans covering 60% of steady-state EC2 spend. Expected savings: $5,800/month when annualized.

**Running savings after Month 2: $21,720/month (42%)**

**Month 3 — Operate**

- Established weekly cost review meeting. Added unit cost ($/active user/month) to engineering OKRs.
- Built Grafana dashboard pulling from Cost Explorer API showing per-team spend week-over-week.
- Created cost anomaly alerts routing to `#cloud-costs` Slack channel.
- Added "cost impact" section to the PR template for infrastructure changes.

Final monthly spend: $30,800. Savings: $21,200/month, or 41%. Ongoing discipline keeps the savings compounding.

---

## Pitfalls

**Tagging after the fact is painful.** It is significantly harder to apply tags retroactively than to enforce them from day one. The longer you wait, the more untagged resources accumulate. Start tagging enforcement now, even if it means some initial friction.

**Reserving too early locks in the wrong shape.** If you commit to `m5.xlarge` instances and migrate to Graviton (`m6g.xlarge`) six months later, you either pay a modification penalty or sit on unused reservations. Use Compute Savings Plans over instance-family reservations wherever possible.

**Over-indexing on unit cost in isolation.** Unit cost can decrease while absolute spend skyrockets, if volume grows faster than efficiency improves. Watch both the unit cost trend and absolute spend trend. Neither alone tells the full story.

**Treating FinOps as a Finance problem.** If only Finance cares about cloud costs, nothing changes. Engineering needs to feel the feedback loop. Showback is step one. OKRs with efficiency metrics are step two. Engineers who get paged when costs spike change behavior faster than any policy.

**Chasing the last 5% at the cost of reliability.** Right-sizing to the bone, removing all redundancy, and using spot for stateful workloads to save 10% more is not FinOps — it is recklessness. Every optimization decision has a reliability tradeoff. Make it explicitly, not accidentally.

**Ignoring data egress.** Data egress charges are often the biggest surprise on a cloud bill. Moving data out of a cloud provider, across regions, or across AZs all has costs. Design your data architecture to minimize cross-boundary traffic before you provision anything.

**Letting savings erode.** Right-sized instances get replaced with larger ones when a developer finds the smaller one "slow." Scheduled shutdowns get disabled for "just one weekend" and never re-enabled. FinOps requires ongoing enforcement, not a one-time audit.

---

## Quick Reference

| Action | Tool | Expected Impact |
|--------|------|----------------|
| Find untagged resources | AWS Tag Editor / GCP Labels Report | Visibility |
| Identify idle EC2 | AWS Trusted Advisor / Compute Optimizer | 5–20% savings |
| Terminate orphaned EBS | AWS Console / CLI | 1–5% savings |
| Add VPC endpoints | AWS Console | Eliminate NAT costs |
| Schedule dev shutdowns | Instance Scheduler / scripts | 10–30% on non-prod |
| Purchase Savings Plans | AWS Cost Explorer | 20–40% on compute |
| Use Spot for batch | ASG mixed policy | 50–80% on eligible |
| Kubernetes cost visibility | OpenCost / Kubecost | Visibility |
| LLM cost tracking | Custom metric + budget alert | Prevents surprises |
| Weekly cost review | Meeting + dashboard | Cultural anchor |

---

## Top 10 Interview Questions

<details>
<summary><strong>Q: What is FinOps and how does it differ from traditional cost-cutting?</strong></summary>

FinOps is a shared operating model where engineering, finance, and product collaborate on cloud spending decisions using real-time data. It is not about spending less — it is about spending with intention. Traditional cost-cutting is top-down and periodic; FinOps is continuous, data-driven, and embedded into engineering workflows. The lifecycle is Inform → Optimize → Operate, repeated continuously.

</details>

<details>
<summary><strong>Q: What are unit economics and why do they matter more than total spend?</strong></summary>

Unit economics is the cost to produce one unit of business value — one API call, one active user, one transaction. Total spend can increase with growth, which is healthy. Unit cost trending upward while volume grows means your architecture is not scaling efficiently. Tracking cost-per-unit connects engineering decisions to business outcomes and gives product teams a metric they can reason about.

</details>

<details>
<summary><strong>Q: What is the difference between Reserved Instances and Savings Plans?</strong></summary>

Reserved Instances commit to a specific instance type in a specific region for 1-3 years. Savings Plans commit to a minimum spend ($/hour) across any instance family in a region (Compute Savings Plan) or specific instance family (EC2 Instance Savings Plan). Savings Plans are more flexible — if you change instance types during the commitment period, the discount still applies. Generally prefer Compute Savings Plans unless you are certain your instance family will not change.

</details>

<details>
<summary><strong>Q: When should you use Spot instances, and when should you avoid them?</strong></summary>

Use Spot for stateless, fault-tolerant, or batch workloads — CI/CD agents, data pipelines, ML training with checkpointing, and stateless web tiers behind auto-scaling groups. Avoid Spot for databases, stateful services without replication, and single-instance workloads with no failover. Design for interruption: checkpoint progress, use mixed instance policies, and choose instance families with low interruption rates.

</details>

<details>
<summary><strong>Q: What are the most common sources of cloud waste?</strong></summary>

In order of frequency: idle resources running at under 5% CPU for weeks, orphaned storage (unattached EBS volumes, old snapshots, unused S3 data), NAT Gateway data transfer charges, oversized databases in non-production environments, and dev/staging environments running 24/7 when they are used 8 hours a day. Together these typically account for 20-40% of an unoptimized bill.

</details>

<details>
<summary><strong>Q: How do you implement cost allocation in a multi-team organization?</strong></summary>

Start with four mandatory tags on every resource: `team`, `env`, `service`, and `cost-center`. Enforce tagging at creation time using SCPs (AWS), Organization Policies (GCP), or Azure Policy with deny effects. Use Cost Explorer grouped by tag to build showback reports per team. Graduate to chargeback once teams trust the data. The biggest challenge is untagged legacy resources — audit and tag them before the numbers are meaningful.

</details>

<details>
<summary><strong>Q: How do you right-size instances in production without causing outages?</strong></summary>

Pull p95 CPU and memory utilization for the top 20 most expensive instances over 30 days. Target 60-80% CPU at p95. Use AWS Compute Optimizer, GCP Recommender, or Azure Advisor for automated suggestions. Test the smaller instance type in staging first, measuring actual latency and throughput impact. Roll out in production via blue-green or canary deployment — never resize in place during business hours.

</details>

<details>
<summary><strong>Q: How do you handle cost visibility for Kubernetes workloads?</strong></summary>

Cloud billing shows node-level costs, not pod or namespace costs. Install OpenCost (CNCF open-source) or Kubecost to allocate costs to namespaces, deployments, and labels. Track the ratio of CPU/memory requests to actual usage — over-requesting is the Kubernetes equivalent of over-provisioning. Set namespace-level ResourceQuotas to enforce per-team budgets and prevent runaway requests.

</details>

<details>
<summary><strong>Q: What is the biggest mistake teams make with cloud reservations?</strong></summary>

Reserving too early, before usage patterns are stable. If you commit to `m5.xlarge` instances and then migrate to Graviton six months later, you either pay a modification penalty or waste the reservation. Wait for 3-6 months of stable usage data. Start with 1-year no-upfront Compute Savings Plans — lower discount but lower risk. Never reserve workloads you are planning to migrate or deprecate.

</details>

<details>
<summary><strong>Q: How do you embed FinOps culture so it sticks beyond the initial optimization?</strong></summary>

Three things make FinOps stick: weekly 30-minute cost reviews with engineering, finance, and product; cost anomaly alerts routed to Slack so the owning team hears about spikes before finance does; and engineering OKRs that include a unit cost metric alongside features and uptime. Without cultural embedding, right-sized instances get upsized, scheduled shutdowns get disabled, and savings erode within a quarter.

</details>

---

## Next Steps

The files below are the natural companions to this crash course. After you have your FinOps foundation in place, go deeper in the platforms you actually use:

- **`AWS.md`** — EC2 pricing models, Savings Plans, Cost Explorer, Trusted Advisor, and AWS-specific cost patterns
- **`GCP.md`** — Committed Use Discounts, Billing exports to BigQuery, Recommender API, and GCP-specific egress costs
- **`Azure.md`** — Reserved VM Instances, Azure Advisor, Cost Management + Billing, and Enterprise Agreement nuances
- **`Kubernetes.md`** — Resource requests and limits, Vertical Pod Autoscaler, Cluster Autoscaler, and namespace quotas
- **`Capacity-Planning.md`** — Forecasting, demand modeling, and how to connect FinOps data to capacity decisions

---

## The Mantra

**Visibility before optimization. Optimization before commitment. Culture before tooling.**

You cannot optimize what you cannot see. You should not commit (reservations, contracts) before you have optimized your baseline. And no tool will save you if the people provisioning infrastructure never see the bill.

FinOps is not a project. It is a practice. Start this week with one thing: tag every new resource, and look at your Cost Explorer dashboard on Friday. Everything else builds from there.
