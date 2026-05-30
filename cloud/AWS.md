# AWS — A 2-Day Crash Course

> **In one sentence:** AWS is a giant menu of on-demand building blocks — compute, storage,
> networking, databases — that you rent by the second and wire together to run anything,
> controlled by an API, a CLI, and an IAM permission system.

---

## Part 0 — How to think about "the cloud"

AWS has 200+ services and the names are alphabet soup. Don't try to learn them all. Learn the
**handful of primitives** every architecture is built from, plus the **mental model** that ties
them together. Everything else is a variation.

**The model:** You rent resources via an API. Every resource lives in a **Region** (a
geographic area like `us-east-1`) made of **Availability Zones** (AZs — isolated datacenters;
you spread across AZs for resilience). Access to everything is gated by **IAM** (who can do what
to which resource). You pay only for what you use, by the second/GB/request.

**The five primitives you must know cold:**
1. **Compute** — where code runs: **EC2** (virtual machines), **Lambda** (functions, no servers
   to manage), containers (**ECS/EKS**).
2. **Storage** — **S3** (object storage: files, backups, static sites — effectively infinite),
   **EBS** (disks attached to EC2).
3. **Networking** — **VPC** (your private network), subnets, security groups (instance
   firewalls), load balancers, **Route 53** (DNS).
4. **Database** — **RDS** (managed SQL: Postgres/MySQL), **DynamoDB** (managed NoSQL).
5. **Identity** — **IAM** (users, roles, policies — the permission system that fronts everything).

**Mental model:** AWS is a warehouse of rentable parts. You assemble compute + storage +
network + database inside a region, spread across AZs for resilience, and IAM decides who can
touch what. Master the five primitives and the rest of the catalog clicks into place.

---

## Part 1 — The vocabulary

| Term | Meaning |
|------|---------|
| **Region** | Geographic location (`us-east-1`, `ap-south-1`) — resources are region-scoped |
| **AZ** | Availability Zone — isolated datacenter within a region (deploy across ≥2) |
| **IAM** | Identity & Access Management — users, roles, policies |
| **Role** | An identity that *services/instances* assume (no long-lived keys) |
| **VPC** | Virtual Private Cloud — your isolated network |
| **Security Group** | Stateful firewall attached to resources |
| **S3 bucket** | A container for objects (files) in S3 |
| **ARN** | Amazon Resource Name — the unique ID of any resource |

---

## DAY 1 — Get it working (CLI-first)

### 1. Set up the CLI and verify identity
```bash
aws --version
aws configure --profile dev        # set access key, secret, region, output format
export AWS_PROFILE=dev
aws sts get-caller-identity        # "who am I?" — proves auth works; run this constantly
```
Better than long-lived keys: use **SSO**.
```bash
aws configure sso                  # set up SSO once
aws sso login --profile dev        # temporary creds, refreshed on login
```

### 2. The CLI shape (it's the same for every service)
```bash
aws <service> <operation> [--parameters] [--query JMESPath] [--output table|json]
aws ec2 describe-instances
aws s3 ls
aws iam list-users
```
`--query` filters output server-side using JMESPath; `--output table` makes it readable. Learn
these two and the CLI becomes pleasant:
```bash
aws ec2 describe-instances \
  --query 'Reservations[].Instances[].[InstanceId,State.Name,PrivateIpAddress]' \
  --output table
```

### 3. S3 — the easiest service to feel productive with
```bash
aws s3 mb s3://my-unique-bucket-12345        # make bucket
aws s3 cp file.txt s3://my-unique-bucket-12345/
aws s3 ls s3://my-unique-bucket-12345/ --recursive --human-readable
aws s3 sync ./site s3://my-unique-bucket-12345/   # upload only changed files
aws s3 presign s3://my-bucket/key --expires-in 3600   # temporary shareable URL
```
S3 stores "objects" (files) in "buckets." It's durable (11 nines), cheap, and the backbone of
backups, data lakes, and static sites.

### 4. EC2 — a virtual machine
```bash
aws ec2 describe-instances --filters "Name=tag:Env,Values=dev" \
  --query 'Reservations[].Instances[].[InstanceId,State.Name]' --output table
aws ec2 start-instances  --instance-ids i-0abc123
aws ec2 stop-instances   --instance-ids i-0abc123
# connect WITHOUT SSH keys or a bastion (needs SSM agent + IAM):
aws ssm start-session --target i-0abc123
```
`ssm start-session` is the modern way in — no open SSH ports, no key management.

### 5. IAM — the thing that says "no" (understand it early)
Three concepts:
- **Policy** — a JSON document listing allowed/denied actions on resources.
- **User** — a human/long-lived identity (prefer SSO over IAM users).
- **Role** — an identity that *something* assumes temporarily (an EC2 instance, a Lambda, a
  CI job). Roles give short-lived credentials and are the secure default.
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject"],
    "Resource": "arn:aws:s3:::my-bucket/*"
  }]
}
```
The golden rule: **least privilege** — grant only the actions needed. "Access Denied" errors
mean an IAM policy is missing the action or resource; read the error, it names what's missing.

**By end of Day 1 you can:** authenticate, drive any service via the CLI pattern, use S3 and
EC2, connect to instances via SSM, and read the basics of IAM. That's a working foundation.

---

## DAY 2 — Make it real

### 1. The networking foundation (VPC)
Every workload lives in a **VPC** (a private network you control). Inside it:
- **Subnets** split the VPC by AZ; **public** subnets reach the internet (via an Internet
  Gateway), **private** subnets don't (they egress via a NAT Gateway).
- **Security Groups** are stateful firewalls on resources (allow port 443 from anywhere, etc.).
- **Route 53** is DNS; **ELB/ALB** load-balances traffic across instances/containers.
Architecture rule of thumb: put databases and app servers in *private* subnets, put only the
load balancer in *public* subnets, spread across ≥2 AZs.

### 2. Managed databases (RDS / DynamoDB)
```bash
aws rds describe-db-instances \
  --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceStatus,Endpoint.Address]' \
  --output table
```
**RDS** runs managed Postgres/MySQL/etc. — AWS handles backups, patching, failover (Multi-AZ).
**DynamoDB** is a managed key-value/NoSQL store with single-digit-ms latency at any scale. Use
RDS for relational data, DynamoDB for high-scale simple-access patterns.

### 3. Serverless compute (Lambda)
Run code with no servers to manage; pay per invocation:
```bash
aws lambda list-functions
aws lambda invoke --function-name myfn --payload '{"k":"v"}' out.json
```
Lambda + S3 + DynamoDB + API Gateway is the classic serverless stack — no instances to patch.

### 4. Containers (ECS / EKS / ECR)
- **ECR** — private container registry (push your Docker images here).
- **ECS (Fargate)** — run containers without managing servers (AWS's own orchestrator).
- **EKS** — managed Kubernetes (use your `kubectl` skills — see `Kubernetes.md`).
```bash
aws ecr get-login-password | docker login --username AWS --password-stdin <acct>.dkr.ecr.us-east-1.amazonaws.com
aws eks update-kubeconfig --name mycluster --region us-east-1   # wire kubectl to EKS
```

### 5. Observability (CloudWatch)
```bash
aws logs tail /aws/lambda/myfn --follow            # live log tail
aws logs filter-log-events --log-group-name /app --filter-pattern "ERROR"
aws cloudwatch describe-alarms --state-value ALARM
```
CloudWatch is metrics + logs + alarms. (Many teams ship metrics to Prometheus/Grafana too —
see `Prometheus.md`.)

### 6. Secrets, config, and cost
```bash
aws secretsmanager get-secret-value --secret-id mysecret --query SecretString --output text
aws ssm get-parameter --name /app/db/url --with-decryption --query Parameter.Value --output text
aws ce get-cost-and-usage --time-period Start=2026-05-01,End=2026-06-01 \
  --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE
```
Store secrets in **Secrets Manager**/**SSM Parameter Store**, never in code or env files in Git.
Watch **Cost Explorer** — the cloud's pay-per-use model rewards turning off what you don't use.

### 7. Don't click — codify it (IaC)
Everything above can and should be defined in **Terraform** (see `Terraform.md`) or
CloudFormation/CDK rather than created by hand in the console. The CLI is for inspection and
quick actions; production infrastructure should be code.

---

## Worked example — a simple, resilient web app
```text
1. VPC across 2 AZs: public subnets (ALB) + private subnets (app + db).
2. ALB (public) -> ECS Fargate service (private) running your Docker image from ECR.
3. RDS Postgres (Multi-AZ, private) for data; Secrets Manager holds the DB password.
4. App's task role (IAM) grants least-privilege access to S3 + Secrets Manager — no static keys.
5. Route 53 -> ALB; ACM provides the TLS cert.
6. CloudWatch logs + alarms; autoscaling on the ECS service.
7. ALL of it defined in Terraform; the console is only for looking, not building.
```

---

## Common pitfalls
- **Long-lived IAM user keys.** They leak and they're forever. Use SSO + roles + temporary
  creds. Never commit keys to Git.
- **Over-permissive IAM (`"Action": "*"`).** Least privilege always; a wildcard policy is a
  breach waiting to happen.
- **Wrong region.** Resources are region-scoped; "it's not there" is usually "you're in the
  wrong region." Set a default and confirm it.
- **Single-AZ deployments.** One AZ outage takes you down. Spread across ≥2 AZs.
- **Public S3 buckets / open security groups.** The classic data-leak cause. Default to private;
  open only what's needed, to the narrowest source.
- **ClickOps.** Manual console changes aren't reproducible or reviewable. Codify with Terraform.
- **Ignoring cost.** Idle instances, unattached EBS volumes, and forgotten NAT gateways quietly
  burn money. Tag resources and watch Cost Explorer.

---

## Quick command reference
```bash
# Auth / identity
aws configure [--profile p]        aws configure sso       aws sso login --profile p
aws sts get-caller-identity        export AWS_PROFILE=p AWS_REGION=us-east-1

# General pattern
aws <svc> <op> --query 'JMESPath' --output table|json
aws ec2 describe-instances --filters "Name=tag:Env,Values=prod"

# S3
aws s3 ls|cp|sync|rm|mb|rb         aws s3 presign s3://b/k --expires-in 3600
aws s3api put-bucket-versioning --bucket b --versioning-configuration Status=Enabled

# EC2 / SSM
aws ec2 describe-instances|start-instances|stop-instances
aws ssm start-session --target i-xxxx

# IAM
aws iam list-users|list-roles      aws iam get-role --role-name r
aws iam list-attached-role-policies --role-name r

# Containers
aws ecr get-login-password | docker login ...
aws eks update-kubeconfig --name c --region r

# Logs / secrets / cost
aws logs tail /path --follow       aws logs filter-log-events --log-group-name g --filter-pattern P
aws secretsmanager get-secret-value --secret-id s --query SecretString --output text
aws ssm get-parameter --name /p --with-decryption --query Parameter.Value --output text
aws ce get-cost-and-usage ...
```

---

## Next steps after Day 2
- Learn the **Well-Architected Framework** (5 pillars: operational excellence, security,
  reliability, performance, cost) — AWS's design checklist.
- Go deeper on **VPC networking** (NAT, peering, Transit Gateway, PrivateLink).
- **CDK** (infrastructure in real languages on top of CloudFormation) or **Terraform** for IaC.
- Compare the equivalents on **GCP** and **Azure** (see those cheatsheets) — the primitives map
  almost 1:1.

**The mantra:** five primitives (compute, storage, network, database, identity), in a region
across AZs, gated by least-privilege IAM, defined as code. Check `sts get-caller-identity` and
your region before you do anything.
