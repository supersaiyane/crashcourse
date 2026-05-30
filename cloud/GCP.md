# Google Cloud (GCP) — A 2-Day Crash Course

> **In one sentence:** GCP is Google's cloud — the same kinds of building blocks as AWS
> (compute, storage, networking, databases) but organized around **Projects** and driven by the
> `gcloud` CLI, with a few genuinely best-in-class services (BigQuery, GKE).

> If you know AWS, you already know 80% of this — the concepts map almost 1:1. This cheatsheet
> leads with the differences and the AWS→GCP translation.

---

## Part 0 — How GCP is organized (the one big difference from AWS)

The single most important GCP-specific idea is the **resource hierarchy**:
```
Organization              (your company)
└── Folders               (departments / environments — optional)
    └── Project           (the fundamental unit — billing, APIs, IAM all attach HERE)
        └── Resources     (VMs, buckets, databases...)
```
**Everything lives in a Project.** A project is a billing boundary, an API-enablement boundary,
and an IAM boundary. In AWS you mostly work within one account and use regions/tags to separate
things; in GCP you create *separate projects* for separate apps/environments
(`myapp-dev`, `myapp-prod`). Get comfortable switching projects — it's constant.

Two more GCP quirks worth knowing on day one:
- **APIs must be enabled per project** before you can use a service (`gcloud services enable
  compute.googleapis.com`). First-time "API not enabled" errors are normal — just enable it.
- **Regions and zones:** like AWS regions/AZs. A *region* is geographic (`asia-south1`);
  a *zone* is an isolated location within it (`asia-south1-a`).

**Mental model:** same warehouse of rentable parts as AWS, but neatly boxed into Projects, and
you must flip the "on" switch (enable the API) for each kind of part before using it.

---

## Part 1 — The AWS → GCP service translation (your real cheat sheet)

| Need | AWS | GCP |
|------|-----|-----|
| Virtual machines | EC2 | **Compute Engine (GCE)** |
| Object storage | S3 | **Cloud Storage (GCS)** |
| Managed Kubernetes | EKS | **GKE** (the original; arguably the best) |
| Serverless functions | Lambda | **Cloud Functions** |
| Serverless containers | Fargate/App Runner | **Cloud Run** (excellent) |
| Managed SQL | RDS | **Cloud SQL** |
| NoSQL | DynamoDB | **Firestore / Bigtable** |
| Data warehouse | Redshift | **BigQuery** (flagship — serverless, huge scale) |
| Networking | VPC | **VPC** (but **global**, not regional) |
| DNS | Route 53 | **Cloud DNS** |
| Identity/permissions | IAM | **IAM** (role-based, attaches to the project) |
| Secrets | Secrets Manager | **Secret Manager** |
| Container registry | ECR | **Artifact Registry** |
| Logs/metrics | CloudWatch | **Cloud Logging / Cloud Monitoring** (Operations Suite) |

Notable GCP strengths: **BigQuery** (analytics), **GKE** (Kubernetes), and **Cloud Run**
(deploy a container and get a scalable HTTPS endpoint in one command).

---

## DAY 1 — Get it working

### 1. Install the CLI, authenticate, set context
```bash
gcloud version
gcloud auth login                         # browser-based login (human)
gcloud config set project myapp-dev       # set the active PROJECT (do this constantly)
gcloud config set compute/region asia-south1
gcloud config set compute/zone asia-south1-a
gcloud config list                        # see active project/region/account
gcloud auth application-default login      # creds for local SDKs/Terraform
```
The active **project** is the GCP equivalent of "which AWS account/region am I in?" — check it
before every action.

### 2. Enable an API, then use it
```bash
gcloud services list --enabled
gcloud services enable compute.googleapis.com run.googleapis.com
```

### 3. The `gcloud` command shape
```bash
gcloud <group> <subgroup> <action> [args] [--format=...] [--filter=...]
gcloud compute instances list
gcloud storage buckets list
gcloud projects list
```
Use `--format` and `--filter` like AWS's `--query`:
```bash
gcloud compute instances list --format="table(name,zone,status,networkInterfaces[0].networkIP)"
gcloud compute instances list --filter="status=RUNNING"
```

### 4. Cloud Storage (the S3 equivalent)
```bash
gcloud storage buckets create gs://my-unique-bucket --location=asia-south1
gcloud storage cp file.txt gs://my-unique-bucket/
gcloud storage ls gs://my-unique-bucket/ --recursive
gcloud storage rsync ./site gs://my-unique-bucket/   # sync changed files
```
Buckets use the `gs://` scheme. (The older `gsutil` tool still works; `gcloud storage` is the
modern replacement.)

### 5. Compute Engine (the EC2 equivalent)
```bash
gcloud compute instances create web1 \
  --machine-type=e2-small --image-family=debian-12 --image-project=debian-cloud
gcloud compute instances list
gcloud compute ssh web1                   # SSH in — gcloud manages keys for you
gcloud compute instances stop web1
gcloud compute instances delete web1
```
`gcloud compute ssh` handles key provisioning automatically — no manual key management.

### 6. Cloud Run — deploy a container in one command (GCP's killer convenience)
```bash
gcloud run deploy myapp \
  --image=asia-south1-docker.pkg.dev/myapp-dev/repo/myapp:1.0 \
  --region=asia-south1 --allow-unauthenticated
```
That builds out a fully managed, autoscaling (to zero), HTTPS-served container endpoint. For
stateless web services this is dramatically simpler than the AWS equivalent.

**By end of Day 1 you can:** authenticate, set the active project, enable APIs, use Cloud
Storage and Compute Engine, and deploy a container to Cloud Run. That's a real foothold.

---

## DAY 2 — Make it real

### 1. IAM — roles bound to a project
GCP IAM grants **roles** to **members** (users, groups, service accounts) on a resource
(usually the project):
```bash
gcloud projects add-iam-policy-binding myapp-dev \
  --member="serviceAccount:app@myapp-dev.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
gcloud projects get-iam-policy myapp-dev
```
Roles come in three flavors: **basic** (Owner/Editor/Viewer — too broad, avoid in prod),
**predefined** (`roles/storage.objectViewer` — use these), and **custom**. Principle of least
privilege, same as AWS.

### 2. Service Accounts (the secure identity for workloads)
A **service account** is a non-human identity your VMs/Cloud Run/GKE workloads run as — the
GCP equivalent of an AWS role. Attach one to a resource and it gets credentials automatically;
you never handle static keys:
```bash
gcloud iam service-accounts create app-sa --display-name="App SA"
gcloud run deploy myapp --service-account=app-sa@myapp-dev.iam.gserviceaccount.com ...
```
Avoid downloading service-account *key files* — use attached identities (Workload Identity on
GKE) instead. (Downloaded JSON keys are the GCP version of leaked AWS keys.)

### 3. GKE — managed Kubernetes
```bash
gcloud container clusters create-auto mycluster --region=asia-south1   # Autopilot (managed nodes)
gcloud container clusters get-credentials mycluster --region=asia-south1   # wire up kubectl
kubectl get nodes                                                          # your K8s skills apply
```
**Autopilot** mode manages nodes for you (you pay per pod). Then it's all standard Kubernetes —
see `Kubernetes.md`.

### 4. Cloud SQL (managed databases)
```bash
gcloud sql instances create mydb --database-version=POSTGRES_16 \
  --tier=db-g1-small --region=asia-south1
gcloud sql instances describe mydb
```
Connect securely via the **Cloud SQL Auth Proxy** (no public IP needed) rather than exposing
the database.

### 5. Networking (VPC is global)
A GCP **VPC is global** — its subnets are regional but live under one network, so resources in
different regions can talk privately without peering. **Firewall rules** (≈ AWS security
groups) gate traffic. **Cloud Load Balancing** is also global (one anycast IP, worldwide).
```bash
gcloud compute networks create myvpc --subnet-mode=custom
gcloud compute firewall-rules create allow-https --network=myvpc \
  --allow=tcp:443 --source-ranges=0.0.0.0/0
```

### 6. Observability, secrets, cost
```bash
gcloud logging read "resource.type=cloud_run_revision severity>=ERROR" --limit=50
gcloud secrets create db-pass --replication-policy=automatic
echo -n "s3cr3t" | gcloud secrets versions add db-pass --data-file=-
gcloud secrets versions access latest --secret=db-pass
gcloud billing accounts list
```
Cloud Logging/Monitoring is the CloudWatch equivalent; Secret Manager holds secrets. Set
**budgets and alerts** early.

### 7. Codify it
Define GCP infrastructure with **Terraform** (the `google` provider) — see `Terraform.md`.
The console/CLI are for inspection and quick tasks; production infra is code.

---

## Worked example — container service with managed data
```text
1. Create project myapp-prod; enable run, sqladmin, secretmanager, artifactregistry APIs.
2. Push image to Artifact Registry (asia-south1-docker.pkg.dev/myapp-prod/repo/app:1.0).
3. Cloud SQL Postgres instance (private IP); store its password in Secret Manager.
4. Create service account app-sa with roles/cloudsql.client + secret accessor (least privilege).
5. gcloud run deploy app --service-account=app-sa ... --no-allow-unauthenticated
6. Cloud Run autoscales the container; Cloud Logging captures logs; a budget alert watches cost.
7. All defined in Terraform; gcloud only for inspection.
```

---

## Common pitfalls
- **Forgetting which project is active.** `gcloud` acts on the configured project — the GCP
  version of the wrong-account/region accident. `gcloud config list` before acting.
- **"API not enabled" surprise.** Enable each service's API per project before first use.
- **Downloading service-account key files.** They leak like AWS keys. Use attached service
  accounts / Workload Identity instead.
- **Basic roles (Owner/Editor) in production.** Too broad. Use predefined/custom roles, least
  privilege.
- **Public Cloud Storage buckets.** Default to private; `--allow-unauthenticated` on Cloud Run
  and public buckets are deliberate, audited choices, not defaults.
- **Confusing region vs zone.** Some resources are zonal (a single VM), some regional, some
  global (VPC, load balancers). Mismatches cause "not found."

---

## Quick command reference
```bash
# Auth / context
gcloud auth login                  gcloud auth application-default login
gcloud config set project P        gcloud config set compute/region R
gcloud config list                 gcloud projects list

# APIs
gcloud services list --enabled     gcloud services enable <api>.googleapis.com

# Storage
gcloud storage buckets create gs://b --location=R
gcloud storage cp|ls|rsync|rm ...

# Compute
gcloud compute instances create|list|ssh|stop|delete
gcloud compute instances list --format="table(name,zone,status)"

# Cloud Run / containers
gcloud run deploy NAME --image=IMG --region=R
gcloud container clusters create-auto C --region=R
gcloud container clusters get-credentials C --region=R

# Cloud SQL
gcloud sql instances create|describe|list

# IAM / service accounts
gcloud projects add-iam-policy-binding P --member=... --role=roles/...
gcloud iam service-accounts create NAME

# Logs / secrets / billing
gcloud logging read 'QUERY' --limit=N
gcloud secrets create|versions add|versions access
gcloud billing accounts list
```

---

## Next steps after Day 2
- **BigQuery** — if you touch analytics/data, this is GCP's standout; learn `bq query`.
- **Cloud Build** for CI/CD; **Workload Identity** for keyless auth between GCP and GKE/GitHub.
- **Anthos / GKE** deeper for multi-cluster, and **Cloud Armor** for WAF.
- Map this back to AWS/Azure — the primitives are the same; only names and a few defaults differ.

**The mantra:** everything lives in a Project, enable the API before you use the service, run
workloads as service accounts (not key files), and remember VPC and load balancing are global.
Check your active project before every command.
