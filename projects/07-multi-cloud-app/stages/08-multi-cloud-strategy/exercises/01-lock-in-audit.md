# Exercise 1: Lock-In Audit

**Goal:** Audit every component of CloudPlatform for cloud-specific dependencies and classify each by lock-in level.

## Step 1: List all components

Walk through the CloudPlatform architecture and list every infrastructure component:

```text
Components to audit:
  - Container orchestration (EKS / GKE / AKS)
  - Container registry (ECR / GCR / ACR)
  - Database (RDS / Cloud SQL / Flex Server)
  - Object storage (S3 / GCS / Blob)
  - DNS (Route53 / Cloud DNS / Azure DNS)
  - Monitoring (CloudWatch / Cloud Ops / Azure Monitor)
  - Secrets management (Secrets Manager / Secret Manager / Key Vault)
  - IaC tool (Terraform)
  - CI/CD (GitHub Actions)
```

## Step 2: Classify each component

For each component, answer four questions:
1. What cloud-specific SDK or API does it call?
2. How long would it take to replace with a portable alternative?
3. What features would you lose by switching?
4. Is the lock-in deliberate (chosen for good reason) or accidental?

## Step 3: Fill in the audit table

```text
+---------------------------+----------------+------------------+---------------------+
| Component                 | Current impl   | Lock-in level    | Portable alternative|
+---------------------------+----------------+------------------+---------------------+
|                           |                | LOW / MED / HIGH |                     |
|                           |                |                  |                     |
|                           |                |                  |                     |
|                           |                |                  |                     |
|                           |                |                  |                     |
+---------------------------+----------------+------------------+---------------------+
```

## Step 4: Identify the riskiest lock-in

Which component has the highest lock-in level? What would it cost (time, effort, lost features) to make it portable?

## Step 5: Classify deliberate vs accidental

Mark each lock-in as DELIBERATE (chosen for operational benefit) or ACCIDENTAL (default choice, no analysis done). Accidental lock-in is technical debt.

## Verify

You have a completed audit table with all components classified as LOW, MEDIUM, or HIGH lock-in. You can explain which lock-ins are deliberate tradeoffs and which are accidental debt worth addressing.
