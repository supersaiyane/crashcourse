# -----------------------------------------------------------------------------
# GCP Infrastructure — CloudPlatform (Project 7)
# All resources in one file: VPC, GKE, Cloud SQL (PostgreSQL), GCS bucket.
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  labels = {
    project     = "cloudplatform"
    environment = var.environment
    managed-by  = "terraform"
  }
}

# =============================================================================
# NETWORKING — VPC + Subnets
# =============================================================================

resource "google_compute_network" "main" {
  name                    = "${var.environment}-vpc"
  auto_create_subnetworks = false                 # we manage subnets explicitly
}

# Private subnet for GKE nodes
resource "google_compute_subnetwork" "private" {
  name          = "${var.environment}-private-subnet"
  network       = google_compute_network.main.id
  ip_cidr_range = "10.0.0.0/20"                   # primary range for nodes
  region        = var.region

  # Secondary ranges for GKE pods and services
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"                  # up to ~65k pod IPs
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/20"                  # up to ~4k service IPs
  }

  private_ip_google_access = true                  # nodes can reach Google APIs without NAT
}

# Cloud Router + NAT for outbound internet from private nodes
resource "google_compute_router" "main" {
  name    = "${var.environment}-router"
  network = google_compute_network.main.id
  region  = var.region
}

resource "google_compute_router_nat" "main" {
  name                               = "${var.environment}-nat"
  router                             = google_compute_router.main.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

# Firewall — allow internal traffic within VPC
resource "google_compute_firewall" "internal" {
  name    = "${var.environment}-allow-internal"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "icmp"
  }

  source_ranges = ["10.0.0.0/8"]                   # all internal ranges
}

# =============================================================================
# COMPUTE — GKE Cluster
# =============================================================================

resource "google_container_cluster" "main" {
  name     = var.cluster_name
  location = var.region                            # regional cluster for HA

  # We manage the node pool separately
  remove_default_node_pool = true
  initial_node_count       = 1                     # required but removed immediately

  network    = google_compute_network.main.name
  subnetwork = google_compute_subnetwork.private.name

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  # Workload Identity — the GKE equivalent of IRSA
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Enable network policy enforcement
  network_policy {
    enabled = true
  }

  resource_labels = local.labels
}

# Managed node pool — 2 nodes, e2-medium (GCP equivalent of t3.medium)
resource "google_container_node_pool" "primary" {
  name       = "${var.cluster_name}-primary-pool"
  cluster    = google_container_cluster.main.name
  location   = var.region
  node_count = 2

  node_config {
    machine_type = "e2-medium"                     # 2 vCPU, 4 GB — cost-effective
    disk_size_gb = 50
    disk_type    = "pd-standard"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    labels = local.labels

    # Workload Identity on nodes
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }

  management {
    auto_upgrade = true                            # keep nodes patched
    auto_repair  = true                            # replace unhealthy nodes
  }
}

# =============================================================================
# DATABASE — Cloud SQL (PostgreSQL 15)
# =============================================================================

resource "google_sql_database_instance" "main" {
  name             = "${var.environment}-cloudplatform-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = "db-f1-micro"              # cost-effective for dev/staging
    availability_type = "ZONAL"                    # single zone (use REGIONAL in prod)
    disk_size         = 20                         # GB

    ip_configuration {
      ipv4_enabled    = false                      # no public IP
      private_network = google_compute_network.main.id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"     # 3 AM UTC backup window
    }

    user_labels = local.labels
  }

  deletion_protection = false                      # set true in prod
}

resource "google_sql_database" "main" {
  name     = "cloudplatform"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "admin" {
  name     = "cloudplatform_admin"
  instance = google_sql_database_instance.main.name
  password = var.db_password                       # from variable, never hardcoded
}

# =============================================================================
# OBJECT STORAGE — GCS Bucket
# =============================================================================

resource "google_storage_bucket" "analytics" {
  name          = "cloudplatform-analytics-${var.environment}-${var.project_id}"
  location      = var.region
  force_destroy = false
  storage_class = "STANDARD"

  # Versioning — keep object history
  versioning {
    enabled = true
  }

  # Uniform bucket-level access (no per-object ACLs)
  uniform_bucket_level_access = true

  # Server-side encryption uses Google-managed keys by default
  # For CMEK, add encryption { default_kms_key_name = "..." }

  labels = local.labels
}
