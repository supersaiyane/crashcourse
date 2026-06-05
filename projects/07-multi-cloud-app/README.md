# Project 7: Cloud-Native Multi-Cloud App

**App:** CloudPlatform — a real-time analytics platform deployed on AWS, GCP, and Azure for an apples-to-apples multi-cloud comparison.

**What you'll build:** A complete analytics platform with event ingestion (Kafka), processing, API (Flask), and dashboard — then deploy it identically on all three major clouds using Terraform and Kubernetes. You'll load-test each deployment with k6, compare costs, latency, and developer experience, and develop a multi-cloud strategy.

**Tier:** Intermediate (3-7 years experience)

**Duration:** 8-10 weeks

**Courses covered:** AWS, GCP, Azure, PostgreSQL, Redis, Kafka, Kubernetes, Nginx, k6

## Stages

| # | Stage | Course | What you'll do |
|---|-------|--------|---------------|
| 1 | AWS Foundation | `AWS.md` | VPC, EKS, RDS, S3 — full AWS infra with Terraform |
| 2 | GCP Foundation | `GCP.md` | VPC, GKE, Cloud SQL, GCS — equivalent GCP infra |
| 3 | Azure Foundation | `Azure.md` | VNet, AKS, Azure DB, Blob — equivalent Azure infra |
| 4 | Data Layer | `PostgreSQL.md`, `Redis.md`, `Kafka.md` | Database, cache, event streaming |
| 5 | App Deployment | `Kubernetes.md`, `Nginx.md` | Deploy on all 3 clouds with K8s + Nginx |
| 6 | Load Testing | `k6.md` | Stress test each cloud deployment |
| 7 | Comparison | *(synthesis)* | Cost, latency, DX comparison across clouds |
| 8 | Multi-Cloud Strategy | `Cloud-Architecture.md` | When to multi-cloud, abstractions, DR |

## The app: CloudPlatform

A real-time analytics platform with event ingestion, processing, and visualization.

```text
                    +------------------+
   Events -------->| API (Flask:5000)  |-----> PostgreSQL
                    +------------------+        (events store)
                          |
                          v
                    +------------------+
                    | Kafka            |-----> Event Stream
                    +------------------+
                          |
                          v
                    +------------------+
                    | Processor        |-----> Redis (realtime)
                    +------------------+

   Dashboard <----- Nginx (:8000) -----> API
```

- **API** (Flask, port 5000) — event ingestion, analytics queries, health checks
- **Processor** — Kafka consumer, event enrichment, stores to PostgreSQL + Redis
- **Frontend** (port 8000) — real-time analytics dashboard with charts
- **PostgreSQL** — persistent event storage with partitioning
- **Redis** — realtime counters and caching
- **Kafka** — event streaming (KRaft mode, no ZooKeeper)

## Getting started

```bash
cd CloudPlatform
make up            # start all services
make test          # run API tests
make status        # check service health
make logs          # tail all logs
```

Then work through each stage starting at `stages/01-aws-foundation/README.md`.

## Cloud deployment

```bash
# AWS
cd terraform/aws && terraform init && terraform apply

# GCP
cd terraform/gcp && terraform init && terraform apply

# Azure
cd terraform/azure && terraform init && terraform apply
```

## Load testing

```bash
cd k6
k6 run load-test.js                    # baseline load test
k6 run stress-test.js                  # find breaking points
k6 run spike-test.js                   # simulate traffic spikes
CLOUD_PROVIDER=aws k6 run cloud-comparison.js  # per-cloud comparison
```
