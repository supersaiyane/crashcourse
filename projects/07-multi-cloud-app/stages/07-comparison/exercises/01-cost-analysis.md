# Exercise 1: Cost Analysis

**Goal:** Calculate the monthly cost of running CloudPlatform on each cloud using the providers' pricing calculators.

## Step 1: Open the pricing calculators

- AWS: https://calculator.aws/
- GCP: https://cloud.google.com/products/calculator
- Azure: https://azure.microsoft.com/en-us/pricing/calculator/

## Step 2: Configure Kubernetes compute costs

For each cloud, price 3 nodes with 2 vCPU and 8 GB RAM in the region closest to your users:
- AWS: `m5.large` in `ap-south-1`
- GCP: `e2-standard-2` in `asia-south1`
- Azure: `Standard_D2s_v3` in `centralindia`

Include the K8s control plane cost (EKS charges $73/mo; GKE and AKS have a free tier).

```text
+---------------------+----------+----------+----------+
| Component           |   AWS    |   GCP    |  Azure   |
+---------------------+----------+----------+----------+
| Control plane       |          |          |          |
| 3 nodes (on-demand) |          |          |          |
| Compute total       |          |          |          |
+---------------------+----------+----------+----------+
```

## Step 3: Configure database costs

Price a managed PostgreSQL instance with 2 vCPU, 8 GB RAM, and 50 GB SSD storage:
- AWS: RDS `db.t3.medium`
- GCP: Cloud SQL `db-custom-2-8192`
- Azure: Flexible Server `B2s`

## Step 4: Add storage and networking

Price 100 GB of object storage and estimate 100 GB/mo of data egress.

## Step 5: Calculate totals

```text
+---------------------+----------+----------+----------+
|                     |   AWS    |   GCP    |  Azure   |
+---------------------+----------+----------+----------+
| Compute             |          |          |          |
| Database            |          |          |          |
| Storage/Networking  |          |          |          |
+---------------------+----------+----------+----------+
| TOTAL (on-demand)   |          |          |          |
+---------------------+----------+----------+----------+
```

## Step 6: Calculate 1-year reserved pricing

Check each provider's committed use discounts (1-year) and recalculate.

## Verify

You have a completed cost comparison table with on-demand and reserved pricing for all three clouds. You can identify which cloud is cheapest at this scale and explain why (control plane fee, instance pricing, egress costs).
