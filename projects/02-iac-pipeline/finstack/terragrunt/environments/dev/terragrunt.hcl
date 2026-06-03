# -----------------------------------------------------------------------------
# Dev Environment — Terragrunt Configuration
#
# Lightweight, cost-conscious settings for development and LocalStack testing.
# Uses smaller instance types, single-AZ where possible, and shorter TTLs.
# -----------------------------------------------------------------------------

include "root" {
  path = find_in_parent_folders()
}

# ---------------------------------------------------------------------------
# Override root locals for dev
# ---------------------------------------------------------------------------

locals {
  environment = "dev"
  aws_region  = "ap-south-1"
}

# ---------------------------------------------------------------------------
# Dev-specific inputs — smaller, cheaper, faster feedback
# ---------------------------------------------------------------------------

inputs = {
  environment = local.environment

  # VPC
  vpc_cidr = "10.0.0.0/16"
  azs      = ["ap-south-1a", "ap-south-1b"]

  # EKS
  cluster_name    = "finstack-dev"
  node_group_size = 2
  instance_types  = ["t3.medium"]                # cost-conscious for dev

  # RDS
  db_instance_class    = "db.t3.micro"
  db_allocated_storage = 20                       # 20 GB — minimal for dev
  db_multi_az          = false                    # single-AZ saves cost in dev
  db_name              = "finstack_dev"

  # S3
  s3_bucket_prefix     = "finstack-dev"
  s3_versioning        = true
  s3_lifecycle_days    = 30                       # shorter retention in dev

  # Vault
  vault_addr           = "http://127.0.0.1:8200" # local dev server
  vault_token_ttl      = "1h"

  # Tags
  tags = {
    Project     = "finstack"
    Environment = "dev"
    ManagedBy   = "terragrunt"
    CostCentre  = "payments-platform"
    Compliance  = "rbi-pci-dss"
  }
}
