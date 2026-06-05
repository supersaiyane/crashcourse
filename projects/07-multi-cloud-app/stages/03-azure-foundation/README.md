# Stage 3: Azure Foundation

**Goal:** Build the Azure leg of the multi-cloud deployment — a VNet with subnets, an AKS cluster for workloads, Azure Database for PostgreSQL Flexible Server, and Blob Storage for analytics data. By the end, you have three Kubernetes clusters across three clouds, and a clear mental map of how the same concepts translate across AWS, GCP, and Azure.

**Prerequisites:** Azure CLI installed and authenticated (`az account show` works). Terraform >= 1.5 installed. kubectl installed. Stages 1-2 complete — see [01-aws-foundation](../01-aws-foundation/README.md) and [02-gcp-foundation](../02-gcp-foundation/README.md). Basic Azure knowledge — see `Azure.md`.

---

## 1. Theory (What & Why)

### Why Azure as the third cloud?

Azure is the second-largest cloud provider (~23% market share) and dominates in enterprises, especially those with existing Microsoft infrastructure (Active Directory, Office 365, SQL Server). In BFSI, Azure is common because of its compliance certifications, deep Active Directory (Entra ID) integration, and government cloud regions for regulated workloads.

Understanding Azure completes the three-cloud picture. After this stage, you can look at any cloud's documentation and immediately map it to concepts you already know.

### The problem Azure solves for enterprises

Many BFSI organisations have decades of Microsoft infrastructure — Active Directory forests, Exchange, SharePoint, SQL Server. Azure integrates with all of these natively. When a bank's identity team already manages 50,000 users in Active Directory, Azure is the natural cloud choice because AKS pods can authenticate via the same Entra ID identities. No separate IAM system to manage.

This is why multi-cloud strategies often include Azure even when AWS or GCP is the primary — it bridges the enterprise identity world with cloud-native infrastructure.

### VNet: Azure's version of VPC

Azure calls its isolated network a Virtual Network (VNet). The concepts are familiar from AWS and GCP, but the terminology and defaults differ. Azure introduces a unique concept — **delegated subnets** — where a subnet is exclusively reserved for a single managed service.

```text
+--------------------------- VNet (10.2.0.0/16) ---------------------------+
|                                                                            |
|  Subnet: aks-subnet (10.2.1.0/24)                                        |
|  - AKS node pool (2x Standard_B2s VMs)                                   |
|  - Azure CNI — pods get VNet IPs directly                                |
|  - NSG attached (controls inbound/outbound)                               |
|                                                                            |
|  Subnet: db-subnet (10.2.2.0/24) [DELEGATED]                             |
|  - PostgreSQL Flexible Server ONLY                                        |
|  - No other resources can be placed here                                  |
|  - Private DNS zone for name resolution                                   |
|                                                                            |
|  Resource Group: cloudplatform-rg                                         |
|  - All resources grouped for lifecycle management                         |
|  - Delete the RG = delete everything in it                                |
|                                                                            |
+----------------------------------------------------------------------------+
```

**Mental model:** Azure sits between AWS and GCP in abstraction level. Subnets are per-VNet and span all availability zones (like GCP). But Azure adds "delegated subnets" — think of them as reserved parking spaces. The PostgreSQL Flexible Server gets its own subnet that no other resource can use. This ensures network isolation without complex security group rules.

### How Azure networking differs

```text
AWS approach:                    Azure approach:
+--------+  +--------+          +--------+  +--------+
| Public |  | Private|          |  AKS   |  |   DB   |
| Subnet |  | Subnet |          | Subnet |  | Subnet |
| (ALB)  |  | (EKS)  |          | (pods) |  | (deleg)|
+--------+  +--------+          +--------+  +--------+
     |           |                    |           |
   IGW         NAT GW              implicit    Private
  (explicit)  (explicit)           routing     DNS Zone

AWS: you build each piece          Azure: delegation enforces
GCP: fewer pieces, more implicit   isolation by resource type
Azure: delegation + managed identity
```

### Three-cloud comparison table

| Concept | AWS | GCP | Azure |
|---------|-----|-----|-------|
| **Isolated network** | VPC | VPC | VNet |
| **Subnet scope** | Per-AZ | Per-region | Per-VNet (spans all AZs) |
| **Firewall** | Security Group (per-resource, stateful) | Firewall Rule (VPC-level) | NSG (per-subnet or per-NIC) |
| **NAT for private subnets** | NAT Gateway | Cloud NAT | NAT Gateway |
| **Internet access** | Internet Gateway (explicit) | Default route (implicit) | Implicit (no IGW resource) |
| **Managed Kubernetes** | EKS | GKE | AKS |
| **K8s control plane cost** | $73/mo | $73/mo (Standard) | Free (Basic), $73/mo (Standard) |
| **Managed PostgreSQL** | RDS | Cloud SQL | Flexible Server |
| **Object storage** | S3 | GCS | Blob Storage |
| **Storage prefix** | `s3://` | `gs://` | `https://<account>.blob.core.windows.net/` |
| **IAM model** | IAM users/roles + policies | IAM + service accounts | RBAC + managed identities |
| **CLI** | `aws` | `gcloud` | `az` |
| **IaC provider** | `hashicorp/aws` | `hashicorp/google` | `hashicorp/azurerm` |

### Key vocabulary

| Term | Meaning |
|------|---------|
| **Resource Group** | Logical container for Azure resources — delete the group, delete everything in it |
| **VNet** | Virtual Network — Azure's isolated network, equivalent to VPC |
| **NSG** | Network Security Group — firewall rules attached to subnets or NICs |
| **Delegated subnet** | Subnet exclusively reserved for a single managed service (e.g. PostgreSQL) |
| **Managed Identity** | Azure's keyless authentication — no secrets to manage or rotate |
| **Azure CNI** | Container Networking Interface — pods get real VNet IPs (like GKE VPC-native) |
| **Flexible Server** | Azure's current-gen managed PostgreSQL (replaces Single Server) |
| **Private DNS Zone** | Custom DNS zone scoped to a VNet — resolves managed service FQDNs privately |

### AKS: Azure's managed Kubernetes

AKS has one major advantage over EKS and GKE Standard: the control plane is **free** in the Basic tier. You only pay for worker nodes. This makes AKS the cheapest option for development clusters.

AKS also integrates deeply with Entra ID (formerly Azure Active Directory), which matters in enterprises where identity is centrally managed. A developer authenticates to AKS using the same credentials they use for email and VPN — no separate kubeconfig secrets.

**The one idea:** Azure's strength is enterprise integration. AKS + Managed Identity + Entra ID means zero secrets management for cluster access and workload identity. In a BFSI organisation managing thousands of identities, this reduces operational risk significantly.

---

## 2. Hands-On: Build the Azure Foundation

### 2.1 Create Resource Group + VNet + AKS

Navigate to the Azure Terraform configuration:

```bash
cd projects/07-multi-cloud-app/terraform/azure   # all Azure infra lives here
```

Review the VNet configuration:

```hcl
# vnet.tf — Azure network foundation for CloudPlatform
resource "azurerm_resource_group" "main" {
  name     = "cloudplatform-rg"                  # all resources go here
  location = "East US"                           # region — matches us-east-1
  # Delete this RG and everything inside is destroyed — clean teardown
}

resource "azurerm_virtual_network" "main" {
  name                = "cloudplatform-vnet"
  address_space       = ["10.2.0.0/16"]          # /16 = 65k IPs
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_subnet" "aks" {
  name                 = "aks-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.2.1.0/24"]         # 254 usable IPs for AKS nodes + pods
}

resource "azurerm_subnet" "db" {
  name                 = "db-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.2.2.0/24"]

  # Delegate this subnet exclusively to PostgreSQL Flexible Server
  delegation {
    name = "postgres-delegation"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action"
      ]
    }
  }
  # After delegation, no other resource type can be deployed to this subnet
}
```

Review the AKS configuration:

```hcl
# aks.tf — managed Kubernetes cluster for CloudPlatform
resource "azurerm_kubernetes_cluster" "main" {
  name                = "cloudplatform-aks"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = "cloudplatform"          # forms the FQDN for the API server

  default_node_pool {
    name           = "default"
    node_count     = 2                           # 2 nodes for HA
    vm_size        = "Standard_B2s"              # 2 vCPU, 4 GB — matches t3.medium / e2-medium
    vnet_subnet_id = azurerm_subnet.aks.id       # nodes run in VNet subnet
  }

  identity {
    type = "SystemAssigned"                      # managed identity — no service principal secrets
    # Azure creates and manages the identity lifecycle automatically
    # No client_id/client_secret to rotate — ever
  }

  network_profile {
    network_plugin = "azure"                     # Azure CNI — pods get VNet IPs directly
    service_cidr   = "10.3.0.0/16"              # K8s service IPs
    dns_service_ip = "10.3.0.10"                # CoreDNS IP
  }

  tags = {
    Project = "CloudPlatform"
  }
}
```

Deploy:

```bash
terraform init                                   # download azurerm provider
terraform plan -out=plan.tfplan                  # preview resources
# Output: Plan: 5 to add (RG, VNet, 2 subnets, AKS)

terraform apply plan.tfplan                      # create resources — AKS takes 5-8 minutes
# Output: azurerm_kubernetes_cluster.main: Creating...
# Apply complete! Resources: 5 added.
```

Get kubeconfig and verify:

```bash
# Configure kubectl for AKS
az aks get-credentials \
  --resource-group cloudplatform-rg \
  --name cloudplatform-aks
# Output: Merged "cloudplatform-aks" as current context in ~/.kube/config

# Verify access
kubectl get nodes
# Expected:
# NAME                              STATUS   ROLES    AGE   VERSION
# aks-default-12345678-vmss000000   Ready    <none>   5m    v1.29.x
# aks-default-12345678-vmss000001   Ready    <none>   5m    v1.29.x

kubectl cluster-info                             # shows API server endpoint

# Deploy a test pod
kubectl run cloudplatform-test --image=nginx:1.25-alpine --port=80
kubectl get pods -w                              # wait for Running
# Expected: cloudplatform-test   1/1   Running   0   25s
kubectl delete pod cloudplatform-test            # clean up

# Verify all three clusters are in kubeconfig
kubectl config get-contexts
# Expected: three contexts — cloudplatform-eks, cloudplatform-gke, cloudplatform-aks
```

### 2.2 Deploy Azure PostgreSQL Flexible Server

```hcl
# postgres.tf — managed PostgreSQL with VNet integration
# Step 1: Private DNS zone for PostgreSQL name resolution
resource "azurerm_private_dns_zone" "postgres" {
  name                = "cloudplatform.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.main.name
  # Private DNS zones resolve managed service FQDNs within the VNet
}

# Step 2: Link the DNS zone to the VNet
resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  name                  = "postgres-vnet-link"
  private_dns_zone_name = azurerm_private_dns_zone.postgres.name
  resource_group_name   = azurerm_resource_group.main.name
  virtual_network_id    = azurerm_virtual_network.main.id
  # Now any resource in the VNet can resolve the PostgreSQL FQDN
}

# Step 3: Create the Flexible Server
resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "cloudplatform-postgres"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location

  version                = "16"                  # PostgreSQL 16 — matches AWS/GCP
  sku_name               = "B_Standard_B1ms"     # burstable, 1 vCPU, 2 GB — dev tier

  storage_mb             = 32768                 # 32 GB
  storage_tier           = "P4"                  # performance tier

  delegated_subnet_id    = azurerm_subnet.db.id  # use the delegated subnet
  private_dns_zone_id    = azurerm_private_dns_zone.postgres.id

  administrator_login    = "dbadmin"
  administrator_password = var.db_password        # NEVER hardcode

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]
}

resource "azurerm_postgresql_flexible_server_database" "analytics" {
  name      = "analytics"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}
```

Deploy and test:

```bash
terraform apply -auto-approve
# Output: azurerm_postgresql_flexible_server.main: Creating... (takes 5-10 minutes)

# Get the FQDN
PG_FQDN=$(terraform output -raw postgres_fqdn)

# Test from an AKS pod — SSL required by default on Flexible Server
kubectl run pg-test --rm -it --image=postgres:16-alpine -- \
  psql "host=${PG_FQDN} dbname=analytics user=dbadmin password=${TF_VAR_db_password} sslmode=require"

# Inside psql:
# SELECT version();                     -- confirm PostgreSQL 16
# \conninfo                             -- verify SSL connection and private FQDN
# SHOW ssl;                             -- should return "on"
# \q                                    -- exit
```

### 2.3 Set up Storage Account + Blob container

```hcl
# storage.tf — analytics data storage for CloudPlatform
resource "random_id" "suffix" {
  byte_length = 4                                # 8 hex chars for uniqueness
}

resource "azurerm_storage_account" "analytics" {
  name                     = "cpanalytics${random_id.suffix.hex}"
  # Storage account names: globally unique, 3-24 chars, lowercase alphanumeric ONLY
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"               # locally redundant — dev only (use GRS in prod)

  min_tls_version          = "TLS1_2"            # enforce modern TLS — older versions vulnerable

  blob_properties {
    versioning_enabled = true                    # protect against accidental deletes
  }

  tags = {
    Project = "CloudPlatform"
  }
}

resource "azurerm_storage_container" "analytics" {
  name                  = "analytics-data"
  storage_account_name  = azurerm_storage_account.analytics.name
  container_access_type = "private"              # no anonymous access — ever
}

# Lifecycle policy — move old data to Cool then Archive tier
resource "azurerm_storage_management_policy" "lifecycle" {
  storage_account_id = azurerm_storage_account.analytics.id

  rule {
    name    = "archive-old-data"
    enabled = true
    filters {
      prefix_match = ["analytics-data/raw/"]     # only apply to raw event data
      blob_types   = ["blockBlob"]
    }
    actions {
      base_blob {
        tier_to_cool_after_days_since_modification_greater_than    = 30
        tier_to_archive_after_days_since_modification_greater_than = 90
        # Day 1-30: Hot (frequent dashboard access)
        # Day 31-90: Cool (occasional audit queries, cheaper storage)
        # Day 91+: Archive (regulatory retention, cheapest, requires rehydration)
      }
    }
  }
}
```

Deploy and test:

```bash
terraform apply -auto-approve

# Get the storage account name
STORAGE_ACCOUNT=$(terraform output -raw storage_account_name)

# Upload test data
echo '{"event":"test","source":"azure","timestamp":"2024-01-01T00:00:00Z"}' > /tmp/test-event.json
az storage blob upload \
  --account-name ${STORAGE_ACCOUNT} \
  --container-name analytics-data \
  --name raw/test-event.json \
  --file /tmp/test-event.json \
  --auth-mode login                              # use Entra ID, not storage key
# Output: Finished[#######] 100.0000%

# List blobs
az storage blob list \
  --account-name ${STORAGE_ACCOUNT} \
  --container-name analytics-data \
  --output table
# Expected:
# Name                  Blob Type    Length
# --------------------  -----------  ------
# raw/test-event.json   BlockBlob    66

# Check access tier
az storage blob show \
  --account-name ${STORAGE_ACCOUNT} \
  --container-name analytics-data \
  --name raw/test-event.json \
  --query "properties.blobTier" \
  --output tsv
# Expected: Hot (moves to Cool after 30 days, Archive after 90 days)

# Verify lifecycle policy exists
az storage account management-policy show \
  --account-name ${STORAGE_ACCOUNT} \
  --resource-group cloudplatform-rg
# Output: JSON showing the archive-old-data rule
```

---

## 3. Key patterns

### Three-cloud storage CLI comparison

| Operation | AWS (S3) | GCP (GCS) | Azure (Blob) |
|-----------|---------|-----------|--------------|
| Upload | `aws s3 cp f s3://b/k` | `gsutil cp f gs://b/k` | `az storage blob upload --file f --name k` |
| List | `aws s3 ls s3://b/` | `gsutil ls gs://b/` | `az storage blob list --container c` |
| Download | `aws s3 cp s3://b/k f` | `gsutil cp gs://b/k f` | `az storage blob download --name k --file f` |
| Cold tier | S3 Glacier | Coldline / Archive | Cool / Archive |
| Auth method | IAM role/user | Service account | Managed Identity / `--auth-mode login` |

### Three-cloud kubectl configuration

```bash
# AWS — update kubeconfig from EKS
aws eks update-kubeconfig --name cloudplatform-eks --region us-east-1

# GCP — get credentials from GKE
gcloud container clusters get-credentials cloudplatform-gke --region us-central1

# Azure — get credentials from AKS
az aks get-credentials --resource-group cloudplatform-rg --name cloudplatform-aks

# Switch between clusters
kubectl config get-contexts             # list all three clusters
kubectl config use-context <name>       # switch active cluster
kubectl config current-context          # confirm which cluster is active
```

### Three-cloud cost comparison

| Component | AWS | GCP | Azure | Notes |
|-----------|-----|-----|-------|-------|
| K8s control plane | $73/mo | $73/mo | Free (Basic) | Azure wins on cost |
| 2x worker nodes | $61/mo | $49/mo | $55/mo | GCP cheapest |
| NAT | $33/mo | $32/mo | $32/mo | Similar across all three |
| Database | $13/mo | $8/mo | $13/mo | GCP cheapest at micro tier |
| Object storage (GB) | $0.023 | $0.020 | $0.018 | Azure cheapest per GB |
| **Total dev** | **~$180/mo** | **~$162/mo** | **~$100/mo** | Azure cheapest (free AKS control plane) |

### Database private networking comparison

```text
AWS (RDS):
  Private subnets + Security Group (port 5432 from EKS SG only)
  --> Simple, explicit allow-list model

GCP (Cloud SQL):
  VPC Peering + Private IP + no public IP
  --> Peering creates a network bridge to Google's managed network

Azure (Flexible Server):
  Delegated Subnet + Private DNS Zone + VNet link
  --> Subnet delegation enforces exclusive access by resource type
  --> Private DNS zone resolves FQDN without public DNS
```

### Resource group pattern

Azure's Resource Group is a powerful lifecycle management tool. Unlike AWS (where you tag resources and hope your cleanup script catches them) or GCP (where you delete resources individually), Azure lets you delete an entire Resource Group to remove every resource inside it:

```bash
# Tear down EVERYTHING in one command — VNet, AKS, PostgreSQL, Storage, DNS
az group delete --name cloudplatform-rg --yes --no-wait
# This is cleaner than terraform destroy for emergency teardowns
```

---

## 4. Common mistakes

- **Public database endpoint:** Azure PostgreSQL Flexible Server supports public access, but always use VNet integration with a delegated subnet for BFSI workloads. Set `delegated_subnet_id` and use Private DNS. Public endpoints are a compliance violation in regulated environments.
- **Forgetting subnet delegation:** PostgreSQL Flexible Server requires a delegated subnet. Deploying to a regular subnet fails with a cryptic error about service delegation. The delegation must specify `Microsoft.DBforPostgreSQL/flexibleServers` exactly.
- **Storage Account naming:** Storage account names must be globally unique, 3-24 characters, lowercase alphanumeric only — no hyphens, no underscores. Use a random suffix or project identifier to avoid collisions.
- **Not enforcing TLS:** Set `min_tls_version = "TLS1_2"` on storage accounts. TLS 1.0 and 1.1 have known vulnerabilities. Azure defaults to TLS 1.0 for backward compatibility — you must opt in to security.
- **Ignoring managed identity:** AKS with `SystemAssigned` identity avoids storing service principal credentials. Always prefer managed identity over service principal + secret. Service principal secrets expire and must be rotated manually.
- **Mixing up access tiers:** Azure has Hot, Cool, and Archive tiers for Blob Storage. Archive requires rehydration (can take hours) before data is accessible — do not use for data that might be queried on demand. Use lifecycle policies to automate transitions.
- **LRS in production:** Locally Redundant Storage replicates within one data centre. For production BFSI workloads, use GRS (Geo-Redundant Storage) or ZRS (Zone-Redundant Storage) to survive facility-level failures.
- **Not linking Private DNS zone:** Creating the Private DNS zone is not enough — you must link it to the VNet. Without the link, pods cannot resolve the PostgreSQL FQDN and connections fail with DNS resolution errors.

---

## Exercises

See the `exercises/` directory for detailed, step-by-step walkthroughs:

- [Exercise 1 — Deploy VNet + AKS](exercises/01-deploy-vnet-aks.md): Create Azure VNet and AKS cluster.
- [Exercise 2 — Set up Azure PostgreSQL](exercises/02-setup-azure-postgresql.md): Deploy Flexible Server with VNet integration.
- [Exercise 3 — Configure Blob Storage](exercises/03-configure-blob-storage.md): Create Storage Account and Blob container with lifecycle policies.

---

## What you have learned

- How Azure VNet compares to AWS VPC and GCP VPC: similar isolation, different subnet scoping and delegation model
- How AKS provides free-tier managed Kubernetes with Azure CNI networking and managed identity
- How Azure PostgreSQL Flexible Server uses delegated subnets and Private DNS for network isolation
- How Blob Storage compares to S3 and GCS, including access tiers and lifecycle policies
- How Resource Groups provide clean lifecycle management for all resources
- The full three-cloud comparison: networking, compute, database, storage, and identity — side by side
- The cost profile of a minimal Azure environment (~$100/month) — the cheapest of the three clouds for dev

**Next stage:** [04-data-layer](../04-data-layer/README.md) — design the data layer that runs on all three clouds: PostgreSQL schemas, Redis caching, and Kafka event streaming.
