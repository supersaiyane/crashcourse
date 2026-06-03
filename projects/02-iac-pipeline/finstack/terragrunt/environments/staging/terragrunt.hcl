# -----------------------------------------------------------------------------
# Staging Environment — Terragrunt Configuration
#
# Mirrors production topology at reduced scale. Used for integration testing,
# load testing before month-end deployments, and regulatory dry-runs.
# Multi-AZ is enabled to catch HA issues before they reach prod.
# -----------------------------------------------------------------------------

include "root" {
  path = find_in_parent_folders()
}

# ---------------------------------------------------------------------------
# Override root locals for staging
# ---------------------------------------------------------------------------

locals {
  environment = "staging"
  aws_region  = "ap-south-1"
}

# ---------------------------------------------------------------------------
# Staging-specific inputs — production-like but smaller
# ---------------------------------------------------------------------------

inputs = {
  environment = local.environment

  # VPC
  vpc_cidr = "10.1.0.0/16"                        # separate CIDR from dev
  azs      = ["ap-south-1a", "ap-south-1b"]

  # EKS
  cluster_name    = "finstack-staging"
  node_group_size = 3
  instance_types  = ["t3.large"]                   # closer to prod sizing

  # RDS
  db_instance_class    = "db.t3.medium"
  db_allocated_storage = 50
  db_multi_az          = true                      # test HA failover in staging
  db_name              = "finstack_staging"

  # S3
  s3_bucket_prefix     = "finstack-staging"
  s3_versioning        = true
  s3_lifecycle_days    = 90

  # Vault
  vault_addr           = "https://vault.staging.finstack.internal:8200"
  vault_token_ttl      = "30m"

  # Tags
  tags = {
    Project     = "finstack"
    Environment = "staging"
    ManagedBy   = "terragrunt"
    CostCentre  = "payments-platform"
    Compliance  = "rbi-pci-dss"
  }
}
