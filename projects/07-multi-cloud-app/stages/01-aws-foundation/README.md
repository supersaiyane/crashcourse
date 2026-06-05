# Stage 1: AWS Foundation

**Goal:** Build the AWS leg of the multi-cloud deployment — a production-grade VPC with public and private subnets, an EKS cluster for running workloads, RDS PostgreSQL for persistent storage, and S3 for analytics data. By the end, you have a working Kubernetes cluster on AWS with database and object storage ready.

**Prerequisites:** AWS CLI configured (`aws sts get-caller-identity` works). Terraform >= 1.5 installed. kubectl installed. Basic AWS knowledge — see `AWS.md`.

---

## 1. Theory (What & Why)

### Why start with AWS?

AWS has the largest market share (~32%) and the most mature managed Kubernetes offering (EKS). Most multi-cloud strategies start with AWS as the primary cloud, then extend to GCP and Azure. Understanding AWS networking deeply makes the other clouds easier — GCP and Azure borrowed many of the same concepts, with different names.

In BFSI organisations, AWS is often the first cloud adopted because of its breadth of compliance certifications (PCI DSS, SOC 2, ISO 27001) and its mature tooling for encryption, audit trails, and network isolation. When regulators ask "where does the data live?" and "who can reach it?", AWS gives you the controls to answer precisely.

### The problem AWS solves

Before cloud, provisioning infrastructure meant weeks of procurement, rack-and-stack, cabling, and OS installs. A salary-day traffic spike in a banking application meant either over-provisioning hardware year-round (expensive) or risking outages on the busiest day of the month. AWS lets you provision a complete, isolated network with compute, database, and storage in minutes — and tear it down when the spike passes.

### VPC architecture: the network foundation

Every AWS deployment starts with a Virtual Private Cloud (VPC). Think of it as your own private data centre inside AWS — isolated from every other customer.

```text
+------------------------------- VPC (10.0.0.0/16) -------------------------------+
|                                                                                   |
|  +--- AZ-a ----------------------+    +--- AZ-b ----------------------+           |
|  |                                |    |                                |           |
|  |  Public Subnet (10.0.1.0/24)  |    |  Public Subnet (10.0.3.0/24)  |           |
|  |  - NAT Gateway               |    |  - Load Balancer              |           |
|  |  - Bastion (if needed)       |    |                                |           |
|  |                                |    |                                |           |
|  |  Private Subnet (10.0.2.0/24) |    |  Private Subnet (10.0.4.0/24) |           |
|  |  - EKS worker nodes          |    |  - EKS worker nodes          |           |
|  |  - RDS (multi-AZ standby)    |    |  - RDS (primary)             |           |
|  +--------------------------------+    +--------------------------------+           |
|                                                                                   |
|  Internet Gateway -----> routes 0.0.0.0/0 to/from public subnets                 |
+-----------------------------------------------------------------------------------+
```

**Mental model:** A VPC is a building. Public subnets are the lobby — internet-facing, where visitors arrive. Private subnets are the vault — no direct internet access, outbound traffic goes through a NAT Gateway (a guarded side exit). The Internet Gateway is the front door.

### How traffic flows

Understanding the route tables is what separates a working VPC from a broken one:

```text
Public Subnet Route Table:
  10.0.0.0/16  -->  local          (traffic stays in VPC)
  0.0.0.0/0    -->  igw-xxxxx      (internet traffic goes to Internet Gateway)

Private Subnet Route Table:
  10.0.0.0/16  -->  local          (traffic stays in VPC)
  0.0.0.0/0    -->  nat-xxxxx      (internet traffic goes to NAT Gateway)
                                    (NAT Gateway lives in the public subnet)
```

This means: pods on private subnets can pull container images from the internet (via NAT), but nothing on the internet can initiate a connection to them. That is the security boundary.

### Key vocabulary

| Term | Meaning | BFSI relevance |
|------|---------|----------------|
| **VPC** | Isolated virtual network — your private address space in AWS | Network boundary for compliance audits |
| **Public subnet** | Subnet with a route to the Internet Gateway (ALB, NAT GW live here) | Minimise what sits here — attack surface |
| **Private subnet** | Subnet with no inbound internet route (EKS nodes, RDS) | Where all sensitive workloads run |
| **NAT Gateway** | Allows private subnet resources outbound internet access | Auditable egress point — all outbound traffic logged |
| **Security Group** | Stateful firewall per resource (e.g. allow port 5432 from EKS only) | Least-privilege access enforcement |
| **Route Table** | Directs traffic between subnets and gateways | Controls traffic flow — misconfigure and connectivity breaks |
| **Internet Gateway** | Connects VPC to the public internet | Single ingress/egress point |
| **IRSA** | IAM Roles for Service Accounts — fine-grained IAM for K8s pods | Principle of least privilege for workloads |

### Why EKS?

EKS is AWS-managed Kubernetes. AWS runs the control plane (API server, etcd, scheduler) — you just run worker nodes. This eliminates the hardest part of Kubernetes: keeping the control plane healthy, backed up, and upgraded.

**The one idea:** EKS separates the control plane (AWS manages) from the data plane (you manage worker nodes). You pay $0.10/hr for AWS to keep the hard part running.

### Why RDS over self-managed PostgreSQL?

RDS handles backups, patching, failover, and encryption at rest. In BFSI, these are compliance requirements — an auditor will ask for backup schedules, encryption key rotation, and failover test results. Self-managed PostgreSQL on EC2 means you own all of that operational burden. For a multi-cloud project, spend your time on the application, not database operations.

### AWS managed vs self-managed comparison

| Concern | Self-managed (EC2) | AWS managed (EKS/RDS/S3) |
|---------|-------------------|--------------------------|
| **Control plane HA** | You configure, you fix | AWS guarantees 99.95% SLA |
| **Database backups** | Cron job + S3 + testing | Automated daily snapshots, point-in-time recovery |
| **Encryption at rest** | You set up LUKS/dm-crypt | One checkbox, KMS-managed |
| **Patching** | You schedule downtime | Maintenance window, zero-downtime for multi-AZ |
| **Audit trail** | You configure CloudTrail | Built-in for managed services |
| **Cost** | Lower hourly, higher ops | Higher hourly, near-zero ops |

---

## 2. Hands-On: Build the AWS Foundation

### 2.1 Create VPC with Terraform

Navigate to the AWS Terraform configuration:

```bash
cd projects/07-multi-cloud-app/terraform/aws   # all AWS infra lives here
```

Review the VPC module:

```hcl
# vpc.tf — the network foundation for CloudPlatform on AWS
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"    # community module — battle-tested
  version = "5.5.0"

  name = "cloudplatform-vpc"                    # descriptive name for the project
  cidr = "10.0.0.0/16"                         # 65,536 IPs — more than enough

  azs             = ["us-east-1a", "us-east-1b"]       # two AZs for HA
  public_subnets  = ["10.0.1.0/24", "10.0.3.0/24"]    # ALB, NAT Gateway
  private_subnets = ["10.0.2.0/24", "10.0.4.0/24"]    # EKS nodes, RDS

  enable_nat_gateway   = true          # allow private subnets outbound internet
  single_nat_gateway   = true          # one NAT GW for cost savings (use two in prod)
  enable_dns_hostnames = true          # required for EKS service discovery

  tags = {
    Project     = "CloudPlatform"
    Environment = "dev"
    ManagedBy   = "terraform"
  }
}
```

Deploy the VPC:

```bash
terraform init                          # download providers + modules
# Output: Initializing modules... Downloading terraform-aws-modules/vpc/aws 5.5.0...

terraform plan -out=plan.tfplan         # preview what will be created
# Output: Plan: 23 to add, 0 to change, 0 to destroy.
# (VPC, subnets, route tables, NAT GW, IGW, EIPs)

terraform apply plan.tfplan             # create the VPC — takes ~2 minutes
# Output: Apply complete! Resources: 23 added, 0 changed, 0 destroyed.
```

Verify the network was created:

```bash
# List subnets — expect 4 (2 public, 2 private)
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$(terraform output -raw vpc_id)" \
  --query "Subnets[].{ID:SubnetId,CIDR:CidrBlock,AZ:AvailabilityZone,Public:MapPublicIpOnLaunch}" \
  --output table
# Expected:
# +------------------+----------------+-----------+--------+
# |        ID        |      CIDR      |    AZ     | Public |
# +------------------+----------------+-----------+--------+
# | subnet-0a1b2c3d  | 10.0.1.0/24   | us-east-1a| True   |
# | subnet-0e5f6g7h  | 10.0.2.0/24   | us-east-1a| False  |
# | subnet-0i9j0k1l  | 10.0.3.0/24   | us-east-1b| True   |
# | subnet-0m2n3o4p  | 10.0.4.0/24   | us-east-1b| False  |
# +------------------+----------------+-----------+--------+

# Verify route tables — public subnets route to IGW, private to NAT GW
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=$(terraform output -raw vpc_id)" \
  --query "RouteTables[].Routes[].{Dest:DestinationCidrBlock,Target:GatewayId||NatGatewayId}" \
  --output table
# Look for: igw-xxx for public, nat-xxx for private
```

### 2.2 Deploy EKS cluster

Review the EKS configuration:

```hcl
# eks.tf — managed Kubernetes cluster for CloudPlatform
module "eks" {
  source  = "terraform-aws-modules/eks/aws"    # community module
  version = "20.8.0"

  cluster_name    = "cloudplatform-eks"         # cluster name used in kubeconfig
  cluster_version = "1.29"                      # latest stable K8s version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets       # nodes run in private subnets ONLY

  eks_managed_node_groups = {
    default = {
      instance_types = ["t3.medium"]            # 2 vCPU, 4 GB — sufficient for dev
      min_size       = 2                        # minimum nodes (HA)
      max_size       = 4                        # autoscaling ceiling
      desired_size   = 2                        # starting count
    }
  }

  # Enable IRSA — pods get fine-grained IAM roles via service accounts
  # e.g. only the S3-writer pod gets s3:PutObject, not every pod
  enable_irsa = true

  tags = {
    Project = "CloudPlatform"
  }
}
```

Deploy (this takes 10-15 minutes — EKS control plane provisioning is slow):

```bash
terraform apply -auto-approve
# Output: module.eks.aws_eks_cluster.this[0]: Creating...
# ... (wait 10-15 min) ...
# Apply complete! Resources: 12 added, 0 changed, 0 destroyed.
```

Configure kubectl:

```bash
# Update kubeconfig to point at the new cluster
aws eks update-kubeconfig \
  --name cloudplatform-eks \
  --region us-east-1
# Output: Added new context arn:aws:eks:us-east-1:123456789:cluster/cloudplatform-eks

# Verify access — should see 2 nodes in Ready state
kubectl get nodes
# Expected:
# NAME                          STATUS   ROLES    AGE   VERSION
# ip-10-0-2-45.ec2.internal    Ready    <none>   5m    v1.29.x
# ip-10-0-4-78.ec2.internal    Ready    <none>   5m    v1.29.x

kubectl get ns                          # default namespaces: default, kube-system, kube-public
```

Deploy a test pod to confirm the cluster works end-to-end:

```bash
# Run a simple nginx pod — tests image pull (NAT GW), scheduling, networking
kubectl run cloudplatform-test --image=nginx:1.25-alpine --port=80
kubectl get pods -w                     # wait for Running status
# Expected: cloudplatform-test   1/1   Running   0   30s

kubectl logs cloudplatform-test         # nginx startup logs confirm container runs
kubectl delete pod cloudplatform-test   # clean up
```

### 2.3 Set up RDS PostgreSQL

Review the RDS configuration:

```hcl
# rds.tf — managed PostgreSQL for CloudPlatform analytics
resource "aws_db_subnet_group" "main" {
  name       = "cloudplatform-db-subnet"
  subnet_ids = module.vpc.private_subnets       # database in private subnets ONLY
}

resource "aws_db_instance" "postgres" {
  identifier     = "cloudplatform-postgres"
  engine         = "postgres"
  engine_version = "16.2"
  instance_class = "db.t3.micro"                # 2 vCPU, 1 GB — smallest for dev

  allocated_storage = 20                        # 20 GB gp2
  storage_encrypted = true                      # mandatory for BFSI — uses default KMS key

  db_name  = "analytics"
  username = "dbadmin"
  password = var.db_password                    # NEVER hardcode — use tfvars or Vault

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  skip_final_snapshot = true                    # dev only — set false in prod
  # In prod, also set:
  # multi_az                = true              # automatic failover
  # backup_retention_period = 7                 # 7-day backup window
  # deletion_protection     = true              # prevent accidental terraform destroy
}
```

Security group for RDS — least-privilege access:

```hcl
# sg.tf — only EKS nodes can reach the database
resource "aws_security_group" "rds" {
  name_prefix = "cloudplatform-rds-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432                      # PostgreSQL port
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]    # only EKS nodes
    # NOT cidr_blocks — never open 5432 to 0.0.0.0/0
  }

  # No egress rule needed — security groups are stateful
  # (response traffic to allowed ingress is automatically permitted)
}
```

### 2.4 Set up S3 for analytics data

```hcl
# s3.tf — analytics data lake for CloudPlatform
resource "aws_s3_bucket" "analytics" {
  bucket = "cloudplatform-analytics-${data.aws_caller_identity.current.account_id}"
  # Account ID suffix ensures global uniqueness

  tags = {
    Project = "CloudPlatform"
  }
}

resource "aws_s3_bucket_versioning" "analytics" {
  bucket = aws_s3_bucket.analytics.id
  versioning_configuration {
    status = "Enabled"                          # protect against accidental deletes/overwrites
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "analytics" {
  bucket = aws_s3_bucket.analytics.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"                 # KMS encryption — required for BFSI compliance
    }
  }
}

resource "aws_s3_bucket_public_access_block" "analytics" {
  bucket = aws_s3_bucket.analytics.id

  block_public_acls       = true                # no public ACLs
  block_public_policy     = true                # no public bucket policies
  ignore_public_acls      = true                # ignore any existing public ACLs
  restrict_public_buckets = true                # restrict public bucket policies
  # All four set to true = bucket is NEVER publicly accessible
}
```

Deploy RDS + S3:

```bash
# Set database password securely — never pass on command line (shows in shell history)
export TF_VAR_db_password="$(openssl rand -base64 24)"

terraform apply -auto-approve
# Output: aws_db_instance.postgres: Creating... (takes 5-8 minutes)
# Apply complete! Resources: 6 added.
```

Test database connectivity from an EKS pod:

```bash
# Get the RDS endpoint
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)

# Run a temporary pod with psql — --rm deletes it after exit
kubectl run pg-test --rm -it --image=postgres:16-alpine -- \
  psql "host=${RDS_ENDPOINT} dbname=analytics user=dbadmin password=${TF_VAR_db_password}"

# Inside psql:
# \conninfo                             -- verify connection details
# SELECT version();                     -- confirm PostgreSQL 16.2
# \dt                                   -- list tables (empty for now)
# \q                                    -- exit
```

Test S3 access:

```bash
# Upload test data
echo '{"event":"test","source":"aws","timestamp":"2024-01-01T00:00:00Z"}' > /tmp/test-event.json
aws s3 cp /tmp/test-event.json \
  s3://$(terraform output -raw s3_bucket_name)/raw/test-event.json
# Output: upload: /tmp/test-event.json to s3://cloudplatform-analytics-123456789/raw/test-event.json

# Verify the upload
aws s3 ls s3://$(terraform output -raw s3_bucket_name)/raw/
# Output: 2024-01-15 10:30:00   65 test-event.json

# Verify encryption
aws s3api head-object \
  --bucket $(terraform output -raw s3_bucket_name) \
  --key raw/test-event.json \
  --query "ServerSideEncryption"
# Output: "aws:kms"
```

---

## 3. Key patterns

### Cost awareness — know what you are paying

| Resource | Hourly cost (us-east-1) | Monthly estimate | Teardown priority |
|----------|------------------------|-----------------|-------------------|
| EKS control plane | $0.10/hr | $73 | Medium — fixed cost |
| 2x t3.medium nodes | $0.042/hr each | $61 | High — runs 24/7 |
| NAT Gateway | $0.045/hr + $0.045/GB | $33+ | High — charges even idle |
| RDS db.t3.micro | $0.018/hr | $13 | Medium |
| S3 | $0.023/GB/month | <$1 | Low — negligible |
| **Total dev environment** | | **~$180/month** | |

Tear down when not in use: `terraform destroy`. This is dev — no reason to run 24/7. Set a calendar reminder or configure AWS Budgets to alert at $50.

### Security checklist for BFSI

- [x] RDS in private subnets only (no public access)
- [x] Security group limits database access to EKS nodes only
- [x] S3 encryption at rest with KMS
- [x] S3 versioning enabled (accidental delete protection)
- [x] S3 public access block (all four flags true)
- [x] Database password not hardcoded (uses variable)
- [x] EKS nodes in private subnets (no public IPs)
- [x] IRSA enabled (pod-level IAM, not node-level)
- [ ] Enable RDS automated backups (`backup_retention_period = 7`)
- [ ] Enable VPC Flow Logs for network audit trail
- [ ] Enable CloudTrail for API audit trail
- [ ] Enable RDS `multi_az = true` for production

### Network isolation pattern

The principle behind this architecture applies to every cloud:

```text
Internet
    |
    v
[Internet Gateway]
    |
    v
[Public Subnet: ALB / NAT GW only]
    |                          |
    | (ALB routes to pods)     | (NAT GW for outbound)
    v                          v
[Private Subnet: EKS nodes]   [Private Subnet: RDS]
    |                               ^
    +--- Security Group: 5432 ------+
         (only EKS -> RDS allowed)
```

This pattern — public-facing load balancer, private compute, private database with security group restrictions — is the standard for any workload handling sensitive data. You will see the same pattern in GCP (Stage 2) and Azure (Stage 3) with different resource names.

---

## 4. Common mistakes

- **Public RDS endpoint:** Never set `publicly_accessible = true` on RDS. The database belongs in private subnets with security group restrictions. An auditor finding a public database endpoint in a BFSI environment is a critical finding.
- **Hardcoded credentials in Terraform:** Use `var.db_password` with a secret manager or environment variable, never a string literal in `.tf` files. Secrets in Git history persist even after deletion — they require key rotation.
- **Single AZ for production:** The config above uses 2 AZs. Production BFSI workloads need multi-AZ RDS (`multi_az = true`) and nodes spread across AZs. During a salary-day run, an AZ outage without multi-AZ means the payment batch stops.
- **Skipping NAT Gateway:** Without NAT, private subnet pods cannot pull container images from ECR or Docker Hub. The cluster appears to work but pods stay in `ImagePullBackOff` forever.
- **Over-sized instances for dev:** `t3.medium` and `db.t3.micro` are sufficient for development. Scale up for load testing in Stage 6. Running `m5.xlarge` in dev wastes ~$100/month per node.
- **Forgetting to destroy:** A forgotten EKS cluster costs $180+/month. Set a calendar reminder, use AWS Budgets alerts at $50, or tag resources with `ttl = 48h` and use a cleanup Lambda.
- **No S3 public access block:** Without the four-flag public access block, a single misconfigured bucket policy can expose data. Always set all four to `true` and use IAM for access.
- **Node-level IAM instead of IRSA:** Without IRSA, every pod on a node shares the node's IAM role. If any pod is compromised, it has all permissions. IRSA gives each pod only the permissions it needs.

---

## Exercises

See the `exercises/` directory for detailed, step-by-step walkthroughs:

- [Exercise 1 — Deploy VPC](exercises/01-deploy-vpc.md): Create the VPC with Terraform, verify 4 subnets and route tables.
- [Exercise 2 — Launch EKS cluster](exercises/02-launch-eks-cluster.md): Deploy EKS, configure kubectl, run a test pod.
- [Exercise 3 — Set up RDS + S3](exercises/03-setup-rds-s3.md): Create RDS and S3, test connectivity and encryption.

---

## What you have learned

- How to build an AWS VPC with public and private subnets across multiple availability zones
- How traffic flows through route tables, Internet Gateway, and NAT Gateway
- How EKS provides managed Kubernetes with worker nodes in private subnets and IRSA for pod IAM
- How RDS provides managed PostgreSQL with encryption, network isolation, and security groups
- How S3 provides durable object storage with versioning, KMS encryption, and public access blocks
- The cost profile of a minimal AWS environment (~$180/month) and how to tear it down
- The network isolation pattern that applies identically across all three clouds

**Next stage:** [02-gcp-foundation](../02-gcp-foundation/README.md) — build the same infrastructure on Google Cloud Platform, and start seeing where the clouds differ.
