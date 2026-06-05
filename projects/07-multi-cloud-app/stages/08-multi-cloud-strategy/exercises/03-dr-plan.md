# Exercise 3: Disaster Recovery Plan

**Goal:** Design a multi-cloud disaster recovery plan for CloudPlatform with RTO and RPO targets.

## Step 1: Define your DR topology

Choose primary, failover, and backup clouds:

```text
Primary:   _________________ (e.g., AWS EKS in ap-south-1)
Failover:  _________________ (e.g., GCP GKE in asia-south1)
Backup:    _________________ (e.g., Azure Blob in centralindia)
```

## Step 2: Set RTO and RPO targets

Based on business requirements (BFSI reference: RTO < 4 hours, RPO < 30 minutes):

```text
RTO (max downtime):     _________________ (e.g., 5 minutes)
RPO (max data loss):    _________________ (e.g., 1 minute)
```

## Step 3: Design the data replication strategy

For each data type, specify how it replicates to the failover cloud:

```text
+---------------------------+------------------+------------------+
| Data type                 | Replication      | RPO achieved     |
+---------------------------+------------------+------------------+
| Database (transactions)   |                  |                  |
| Object storage (reports)  |                  |                  |
| Configuration (K8s YAML)  |                  |                  |
| Secrets                   |                  |                  |
+---------------------------+------------------+------------------+
```

## Step 4: Write the failover steps

List the numbered steps from "failure detected" to "traffic flowing on failover cloud":

```text
1. Health check detects failure          (automated, target: <60s)
2. DNS failover triggers                 (target: <60s)
3. Database promoted to primary          (target: <5 min)
4. Application verified on failover      (target: <5 min)
5. Stakeholders notified                 (target: <10 min)
```

## Step 5: Estimate DR infrastructure cost

```text
+---------------------------+------------------+
| Component                 | Monthly cost     |
+---------------------------+------------------+
| Failover compute          |                  |
| Failover database replica |                  |
| Backup storage            |                  |
| Cross-cloud egress        |                  |
+---------------------------+------------------+
| DR total                  |                  |
+---------------------------+------------------+
```

## Step 6: Answer the key question

Does the DR cost justify the RTO/RPO improvement over a single-cloud multi-region approach?

## Verify

You have a complete DR plan with defined topology, RTO/RPO targets, data replication strategy, numbered failover steps, and a cost estimate. You can present this plan to auditors and explain why multi-cloud DR is (or is not) justified for your application.
