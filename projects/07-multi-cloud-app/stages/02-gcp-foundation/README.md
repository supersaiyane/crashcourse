# Stage 2: GCP Foundation

**Goal:** Build the GCP leg of the multi-cloud deployment — a VPC with regional subnets, a GKE cluster for workloads, Cloud SQL PostgreSQL for persistent storage, and GCS for analytics data. By the end, you have a second Kubernetes cluster running on a different cloud, and you understand where GCP differs from AWS.

**Prerequisites:** `gcloud` CLI installed and authenticated (`gcloud auth list` shows your account). Terraform >= 1.5 installed. kubectl installed. Stage 1 complete — see [01-aws-foundation](../01-aws-foundation/README.md). Basic GCP knowledge — see `GCP.md`.

---

## 1. Theory (What & Why)

### Why GCP as the second cloud?

GCP has the strongest Kubernetes offering — Google invented Kubernetes, and GKE reflects a decade of internal container orchestration experience (Borg). GKE Autopilot removes node management entirely. GCP networking is simpler than AWS in several ways: subnets are regional (span all zones), and there is no explicit Internet Gateway resource.

Understanding GCP after AWS reveals a key insight: the same concepts exist everywhere, but the defaults and boundaries differ. Learning to map between clouds is the core skill of multi-cloud engineering.

### The problem GCP solves differently

Where AWS gives you building blocks and you assemble them (explicit IGW, per-AZ subnets, separate NAT Gateway resources), GCP gives you higher-level constructs. A single regional subnet spans all zones. Internet access works by default on public VMs. Cloud NAT is configured through a Cloud Router, not as a standalone resource.

This is not better or worse — it is a different philosophy. AWS optimises for control; GCP optimises for simplicity. In BFSI, both matter: control for compliance, simplicity for reducing operational burden.

### GCP networking: what is different

In AWS, a subnet lives in one Availability Zone. In GCP, a subnet is **regional** — it spans all zones in that region automatically. This means you need fewer subnets for the same availability.

```text
+--------------------------- VPC (custom mode) ----------------------------+
|                                                                           |
|  +--- Region: us-central1 -----------------------------------------+    |
|  |                                                                    |    |
|  |  Subnet: app-subnet (10.1.0.0/20)                                |    |
|  |  Spans: us-central1-a, us-central1-b, us-central1-c              |    |
|  |                                                                    |    |
|  |  +--- Zone a --------+  +--- Zone b --------+  +--- Zone c ---+  |    |
|  |  | GKE nodes (pool)  |  | GKE nodes (pool)  |  | GKE nodes   |  |    |
|  |  | Cloud SQL replica |  | Cloud SQL primary |  | (standby)   |  |    |
|  |  +-------------------+  +-------------------+  +-------------+  |    |
|  |                                                                    |    |
|  |  Secondary ranges (overlay):                                      |    |
|  |  - pods:     10.2.0.0/16   (65k pod IPs)                        |    |
|  |  - services: 10.3.0.0/20   (4k service IPs)                     |    |
|  |                                                                    |    |
|  |  Cloud Router --> Cloud NAT (outbound for private nodes)          |    |
|  +--------------------------------------------------------------------+    |
|                                                                           |
+---------------------------------------------------------------------------+
```

**Mental model:** AWS gives you Lego bricks — you choose each piece and connect them. GCP gives you pre-assembled kits — fewer decisions, more built-in behaviour. Both build the same house.

### The one idea that unlocks GCP networking

GCP uses **VPC-native (alias IP) networking** for GKE. Instead of an overlay network (flannel, calico) that encapsulates pod traffic, GKE assigns each pod a real VPC IP from a secondary range. This means pods are routable within the VPC without any tunneling — simpler debugging, better performance, and native integration with firewall rules.

### AWS vs GCP networking terms

| AWS concept | GCP equivalent | Key difference |
|------------|---------------|----------------|
| VPC | VPC | Same concept, different defaults |
| Subnet (per-AZ) | Subnet (per-region) | GCP subnets span all zones in a region |
| NAT Gateway | Cloud NAT | Cloud NAT is regional, managed via Cloud Router |
| Internet Gateway | Default route (implicit) | GCP does not have a separate IGW resource |
| Security Group (per-resource, stateful) | Firewall Rule (VPC-level) | GCP firewall rules apply by tags/service accounts |
| Route Table (per-subnet) | Routes (VPC-level) | GCP routes are VPC-level, not per-subnet |
| Availability Zone | Zone | Same concept, same purpose |
| EKS | GKE | GKE has Autopilot mode (no node management) |
| RDS | Cloud SQL | Similar managed database, GCP has simpler private networking |
| S3 (`s3://`) | GCS (`gs://`) | Nearly identical; different CLI tools |
| IRSA | Workload Identity | Both map K8s service accounts to cloud IAM |

### Key vocabulary

| Term | Meaning |
|------|---------|
| **Custom-mode VPC** | VPC where you define subnets explicitly (vs auto-mode which creates one per region) |
| **Regional subnet** | Subnet spanning all zones in a region — no per-zone subnet planning needed |
| **Secondary IP range** | Additional CIDR blocks on a subnet, used by GKE for pod and service IPs |
| **Cloud Router** | Regional resource that manages routing for Cloud NAT and VPN |
| **Cloud NAT** | Regional NAT service — private nodes get outbound internet without public IPs |
| **Private Google Access** | Allows private VMs to reach Google APIs (GCS, Cloud SQL) without public IPs |
| **Workload Identity** | Maps GKE service accounts to GCP IAM service accounts (equivalent to IRSA) |
| **VPC-native cluster** | GKE cluster using alias IPs — pods get real VPC addresses |

### GKE Autopilot vs Standard

| Aspect | Standard | Autopilot |
|--------|----------|-----------|
| **What you manage** | Node pools, sizing, scaling, OS patches | Nothing — just deploy pods |
| **Cost model** | Pay per node (running or idle) | Pay per pod resource request |
| **DaemonSets** | Supported | Limited (Google manages system DaemonSets) |
| **GPUs** | Supported | Supported (since late 2023) |
| **Best for** | Need custom kernels, DaemonSets, full control | Most workloads, especially dev/staging |

For CloudPlatform, we use **Standard mode** to match the EKS experience (you manage nodes). In production, Autopilot is often the better choice — less operational burden, and you stop paying for idle node capacity.

---

## 2. Hands-On: Build the GCP Foundation

### 2.1 Create VPC with Terraform

Navigate to the GCP Terraform configuration:

```bash
cd projects/07-multi-cloud-app/terraform/gcp   # all GCP infra lives here
```

Review the VPC configuration:

```hcl
# vpc.tf — GCP network foundation for CloudPlatform
resource "google_compute_network" "main" {
  name                    = "cloudplatform-vpc"
  auto_create_subnetworks = false               # custom mode — we control subnets
  # auto mode creates one subnet per region (20+ subnets) — too many, uncontrolled CIDRs
}

resource "google_compute_subnetwork" "app" {
  name          = "app-subnet"
  ip_cidr_range = "10.1.0.0/20"                 # regional — spans all zones automatically
  region        = "us-central1"
  network       = google_compute_network.main.id

  # Secondary ranges for GKE VPC-native networking
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.2.0.0/16"               # 65k pod IPs — enough for growth
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.3.0.0/20"               # 4k service IPs
  }

  private_ip_google_access = true                # access Google APIs without public IP
  # Critical: without this, private nodes cannot pull from gcr.io or access GCS
}
```

```hcl
# nat.tf — outbound internet for private GKE nodes
resource "google_compute_router" "main" {
  name    = "cloudplatform-router"
  region  = "us-central1"
  network = google_compute_network.main.id
  # Cloud Router is also used for Cloud VPN — setting it up now saves work later
}

resource "google_compute_router_nat" "main" {
  name                               = "cloudplatform-nat"
  router                             = google_compute_router.main.name
  region                             = "us-central1"
  nat_ip_allocate_option             = "AUTO_ONLY"   # GCP assigns NAT IPs automatically
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
  # Covers both primary and secondary (pod) IP ranges
}
```

Deploy the VPC:

```bash
terraform init                                  # download google provider
terraform plan -out=plan.tfplan                 # preview resources
# Output: Plan: 4 to add (network, subnet, router, NAT)

terraform apply plan.tfplan                     # create the VPC
# Output: Apply complete! Resources: 4 added.
```

### 2.2 Deploy GKE cluster

```hcl
# gke.tf — managed Kubernetes cluster for CloudPlatform
resource "google_container_cluster" "main" {
  name     = "cloudplatform-gke"
  location = "us-central1"                      # regional cluster = HA across 3 zones

  network    = google_compute_network.main.id
  subnetwork = google_compute_subnetwork.app.id

  # VPC-native (alias IP) networking — pods get real VPC IPs
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"      # use the secondary range we defined
    services_secondary_range_name = "services"
  }

  # Private cluster — nodes have no public IPs
  private_cluster_config {
    enable_private_nodes    = true               # nodes are private
    enable_private_endpoint = false              # allow kubectl from outside (dev)
    master_ipv4_cidr_block  = "172.16.0.0/28"   # control plane CIDR (must not overlap VPC)
  }

  # Remove default node pool — we create our own with explicit config
  remove_default_node_pool = true
  initial_node_count       = 1                   # required but removed immediately
}

resource "google_container_node_pool" "default" {
  name       = "cloudplatform-pool"
  cluster    = google_container_cluster.main.id
  node_count = 2                                 # 2 nodes per zone = 6 total for regional

  node_config {
    machine_type = "e2-medium"                   # 2 vCPU, 4 GB — matches AWS t3.medium
    disk_size_gb = 50                            # SSD boot disk
    disk_type    = "pd-ssd"                      # SSD for faster container startup

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"    # broad scope — use Workload Identity for fine-grained
    ]

    metadata = {
      disable-legacy-endpoints = "true"          # security: disable legacy metadata API
    }
  }
}
```

Deploy and verify:

```bash
terraform apply -auto-approve
# Output: google_container_cluster.main: Creating... (takes 8-12 minutes)
# Apply complete! Resources: 2 added.

# Configure kubectl for GKE
gcloud container clusters get-credentials cloudplatform-gke \
  --region us-central1 \
  --project $(gcloud config get-value project)
# Output: Fetching cluster endpoint... kubeconfig entry generated.

# Verify access
kubectl get nodes
# Expected (regional cluster = 2 nodes x 3 zones = 6 nodes):
# NAME                                          STATUS   ROLES    AGE   VERSION
# gke-cloudplatform-gke-pool-a1b2c3d4-abcd     Ready    <none>   3m    v1.29.x
# gke-cloudplatform-gke-pool-a1b2c3d4-efgh     Ready    <none>   3m    v1.29.x
# ... (up to 6 nodes for regional)

kubectl cluster-info                            # shows control plane endpoint

# Deploy a test pod — confirms image pull (Cloud NAT), scheduling, networking
kubectl run cloudplatform-test --image=nginx:1.25-alpine --port=80
kubectl get pods -w                             # wait for Running
kubectl delete pod cloudplatform-test           # clean up
```

### 2.3 Deploy Cloud SQL PostgreSQL

```hcl
# cloudsql.tf — managed PostgreSQL with private networking
# Step 1: Reserve a private IP range for Cloud SQL (VPC peering)
resource "google_compute_global_address" "private_ip" {
  name          = "cloudsql-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16                             # /16 range reserved for Google services
  network       = google_compute_network.main.id
}

# Step 2: Create the VPC peering connection to Google's service network
resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip.name]
  # This peers your VPC with Google's internal network — Cloud SQL gets a private IP
}

# Step 3: Create the Cloud SQL instance
resource "google_sql_database_instance" "postgres" {
  name             = "cloudplatform-postgres"
  database_version = "POSTGRES_16"
  region           = "us-central1"

  depends_on = [google_service_networking_connection.private_vpc]

  settings {
    tier = "db-f1-micro"                         # smallest for dev (shared vCPU, 614 MB)

    ip_configuration {
      ipv4_enabled    = false                    # NO public IP — private networking only
      private_network = google_compute_network.main.id
    }

    backup_configuration {
      enabled                        = true      # daily automated backups
      point_in_time_recovery_enabled = true      # recover to any second — critical for BFSI
    }
  }

  deletion_protection = false                    # dev only — set true in prod
}

resource "google_sql_database" "analytics" {
  name     = "analytics"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "dbadmin" {
  name     = "dbadmin"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password                     # never hardcode — use tfvars or Secret Manager
}
```

Deploy and test connectivity:

```bash
terraform apply -auto-approve
# Output: google_sql_database_instance.postgres: Creating... (takes 5-10 minutes)

# Get the private IP
CLOUDSQL_IP=$(terraform output -raw cloudsql_private_ip)

# Test from a GKE pod — pod is in the same VPC, can reach private IP directly
kubectl run pg-test --rm -it --image=postgres:16-alpine -- \
  psql "host=${CLOUDSQL_IP} dbname=analytics user=dbadmin password=${TF_VAR_db_password}"

# Inside psql:
# SELECT version();                     -- confirm PostgreSQL 16
# \conninfo                             -- verify private IP connection
# \q                                    -- exit
```

### 2.4 Set up GCS bucket

```hcl
# gcs.tf — analytics data storage for CloudPlatform
resource "google_storage_bucket" "analytics" {
  name     = "cloudplatform-analytics-${data.google_project.current.number}"
  location = "US"                                # multi-region for durability

  uniform_bucket_level_access = true             # consistent IAM — no legacy ACLs
  # ACL-based access is error-prone and hard to audit; uniform access uses IAM only

  versioning {
    enabled = true                               # protect against accidental deletes
  }

  # Lifecycle rules — automatically move old data to cheaper tiers
  lifecycle_rule {
    condition {
      age = 90                                   # after 90 days...
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"                 # ...move to Nearline ($0.010/GB/mo)
    }
  }

  lifecycle_rule {
    condition {
      age = 365                                  # after 1 year...
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"                 # ...move to Coldline ($0.004/GB/mo)
    }
  }
}
```

Deploy and test:

```bash
terraform apply -auto-approve

# Upload test data using gsutil
echo '{"event":"test","source":"gcp","timestamp":"2024-01-01T00:00:00Z"}' > /tmp/test-event.json
gsutil cp /tmp/test-event.json \
  gs://$(terraform output -raw gcs_bucket_name)/raw/test-event.json
# Output: Copying file:///tmp/test-event.json [Content-Type=application/json]...

# List contents
gsutil ls gs://$(terraform output -raw gcs_bucket_name)/raw/
# Output: gs://cloudplatform-analytics-123456/raw/test-event.json

# Verify lifecycle rules are applied
gsutil lifecycle get gs://$(terraform output -raw gcs_bucket_name)
# Output: {"rule": [{"action": {"type": "SetStorageClass", ...}, "condition": {"age": 90}}, ...]}

# Verify uniform bucket-level access
gsutil uniformbucketlevelaccess get gs://$(terraform output -raw gcs_bucket_name)
# Output: Enabled: True
```

---

## 3. Key patterns

### GCP vs AWS cost comparison

| Component | AWS (us-east-1) | GCP (us-central1) | Notes |
|-----------|-----------------|-------------------|-------|
| K8s control plane | $73/mo (EKS) | $73/mo (GKE Standard) | Identical pricing |
| 2x worker nodes | $61/mo (t3.medium) | $49/mo (e2-medium) | GCP ~20% cheaper |
| NAT | $33+/mo (NAT GW) | $32/mo (Cloud NAT) | Similar |
| Database | $13/mo (db.t3.micro) | $8/mo (db-f1-micro) | GCP cheaper at micro |
| Object storage | $0.023/GB | $0.020/GB (Standard) | GCP slightly cheaper |
| **Total dev** | **~$180/mo** | **~$162/mo** | GCP ~10% cheaper |

### Object storage CLI comparison

| Operation | AWS (S3) | GCP (GCS) |
|-----------|---------|-----------|
| Copy file | `aws s3 cp file s3://bucket/key` | `gsutil cp file gs://bucket/key` |
| List | `aws s3 ls s3://bucket/` | `gsutil ls gs://bucket/` |
| Sync dir | `aws s3 sync dir/ s3://bucket/` | `gsutil -m rsync -r dir/ gs://bucket/` |
| Presigned URL | `aws s3 presign s3://bucket/key` | `gsutil signurl -d 1h key.json gs://bucket/key` |
| Set lifecycle | Via Terraform or console | `gsutil lifecycle set rules.json gs://bucket/` |

### GCP-specific operational patterns

**Committed use discounts (CUDs):** GCP offers 1-year (37% off) and 3-year (55% off) committed use discounts for compute. For a multi-cloud production deployment running 24/7, CUDs significantly reduce costs. AWS has Reserved Instances (similar concept, different mechanics).

**Private Google Access:** Enabling `private_ip_google_access = true` on a subnet lets private VMs access Google APIs (GCS, Cloud SQL, BigQuery) without needing a public IP or Cloud NAT. This is free and reduces NAT data-processing costs.

**Cloud SQL Auth Proxy:** In production, use the Cloud SQL Auth Proxy sidecar instead of direct IP connections. It handles IAM authentication, TLS, and connection pooling automatically. For dev, direct private IP is simpler.

### GCP storage class tiers

```text
Access frequency vs cost per GB:

  Standard ($0.020)  -->  Nearline ($0.010)  -->  Coldline ($0.004)  -->  Archive ($0.001)
  (hot, any access)      (30-day min)            (90-day min)            (365-day min)

  CloudPlatform lifecycle:
  Day 1-90:  Standard   (dashboard queries hit this data)
  Day 91-365: Nearline  (occasional audit queries)
  Day 366+:   Coldline  (regulatory retention — 7-year requirement in BFSI)
```

---

## 4. Common mistakes

- **Using default VPC:** The default VPC has `auto_create_subnetworks = true`, creating one subnet per region (~40 subnets) with Google-chosen CIDRs. You lose control of IP planning. Always use custom mode.
- **Public Cloud SQL:** Setting `ipv4_enabled = true` exposes the database to the internet. Use private networking via VPC peering — set `ipv4_enabled = false` and configure `private_network`.
- **Forgetting secondary IP ranges:** GKE VPC-native networking requires separate CIDR ranges for pods and services. Without them, cluster creation fails with a cryptic error about alias IP ranges.
- **Ignoring lifecycle rules on GCS:** Without lifecycle policies, analytics data accumulates at Standard pricing ($0.020/GB) forever. For CloudPlatform's event data, 90-day Nearline + 365-day Coldline saves ~70% on older data.
- **Not enabling private nodes:** GKE nodes with public IPs are reachable from the internet. Set `enable_private_nodes = true` for any workload handling sensitive data. In BFSI, public nodes are a compliance violation.
- **Skipping Cloud NAT:** Private nodes cannot pull container images without Cloud NAT. Pods stay in `ImagePullBackOff` indefinitely. Cloud NAT covers both primary and secondary (pod) IP ranges.
- **Auto-mode VPC with GKE:** Auto-mode VPCs do not support secondary IP ranges, so GKE cannot use VPC-native networking. The cluster falls back to routes-based networking, which has scalability limits (max ~1500 nodes).
- **Forgetting Private Google Access:** Without `private_ip_google_access = true`, private nodes cannot reach GCS, Container Registry, or other Google APIs. Pods that need to pull from gcr.io will fail silently.

---

## Exercises

See the `exercises/` directory for detailed, step-by-step walkthroughs:

- [Exercise 1 — Create VPC + GKE](exercises/01-create-vpc-gke.md): Deploy GCP VPC and GKE cluster with Terraform.
- [Exercise 2 — Set up Cloud SQL](exercises/02-setup-cloud-sql.md): Create Cloud SQL PostgreSQL with private networking.
- [Exercise 3 — Configure GCS](exercises/03-configure-gcs.md): Set up GCS bucket with lifecycle rules.

---

## What you have learned

- How GCP networking differs from AWS: regional subnets, implicit routing, VPC-level firewall rules
- How VPC-native networking gives GKE pods real VPC IPs via secondary ranges
- How to deploy a GKE Standard cluster with private nodes
- How Cloud SQL provides managed PostgreSQL with private IP via VPC peering
- How GCS compares to S3 for object storage, including lifecycle policies and uniform bucket access
- The cost profile of a minimal GCP environment (~$162/month) alongside the AWS environment from Stage 1
- How to map AWS concepts to GCP equivalents — the translation skill that defines multi-cloud engineering

**Next stage:** [03-azure-foundation](../03-azure-foundation/README.md) — build the third cloud leg on Azure, completing the three-cloud foundation with a full comparison table.
