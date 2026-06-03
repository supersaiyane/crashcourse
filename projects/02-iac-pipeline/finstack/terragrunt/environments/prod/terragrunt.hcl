# -----------------------------------------------------------------------------
# Production Environment — Terragrunt Configuration
#
# Full-scale, multi-AZ, encrypted, hardened. Handles salary-day and month-end
# transaction spikes. Every change here goes through plan-on-PR and requires
# manual approval before apply.
#
# ⚠️  Never run `terragrunt apply` against prod without a reviewed plan.
# ⚠️  Never store secrets in this file — use Vault dynamic credentials.
# -----------------------------------------------------------------------------

include "root" {
  path = find_in_parent_folders()
}

# ---------------------------------------------------------------------------
# Override root locals for production
# ---------------------------------------------------------------------------

locals {
  environment = "prod"
  aws_region  = "ap-south-1"
}

# ---------------------------------------------------------------------------
# Production-specific inputs — full scale, high availability
# ---------------------------------------------------------------------------

inputs = {
  environment = local.environment

  # VPC
  vpc_cidr = "10.2.0.0/16"                        # isolated CIDR for prod
  azs      = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]  # 3 AZs for HA

  # EKS
  cluster_name    = "finstack-prod"
  node_group_size = 5                              # handle salary-day spikes
  instance_types  = ["m5.xlarge"]                  # production-grade compute

  # RDS
  db_instance_class    = "db.r5.large"             # memory-optimised for transaction workload
  db_allocated_storage = 200
  db_multi_az          = true                      # mandatory for BFSI production
  db_name              = "finstack_prod"
  db_backup_retention  = 35                        # 35-day retention for RBI compliance
  db_deletion_protection = true                    # prevent accidental destruction

  # S3
  s3_bucket_prefix     = "finstack-prod"
  s3_versioning        = true
  s3_lifecycle_days    = 2555                       # ~7 years for audit retention

  # Vault
  vault_addr           = "https://vault.prod.finstack.internal:8200"
  vault_token_ttl      = "15m"                     # short-lived tokens in production

  # Tags
  tags = {
    Project     = "finstack"
    Environment = "prod"
    ManagedBy   = "terragrunt"
    CostCentre  = "payments-platform"
    Compliance  = "rbi-pci-dss"
    DataClass   = "confidential"                   # BFSI data classification
  }
}
