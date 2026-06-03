# -----------------------------------------------------------------------------
# Root Module — FinStack infrastructure orchestrator
#
# Calls all child modules in dependency order:
#   IAM (KMS + roles) → VPC → Security Groups → EKS + RDS + S3
#
# Run: terraform init && terraform plan -var-file="terraform.tfvars"
# -----------------------------------------------------------------------------

locals {
  cluster_name = "${var.project}-eks"

  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = var.owner
  }
}

# ---------------------------------------------------------------------------
# IAM — roles, policies, KMS key (no VPC dependency, so it goes first)
# ---------------------------------------------------------------------------

module "iam" {
  source = "./modules/iam"

  project               = var.project
  oidc_provider_arn     = module.eks.oidc_provider_arn
  oidc_issuer_url       = replace(module.eks.cluster_oidc_issuer_url, "https://", "")
  app_namespace         = var.app_namespace
  app_service_account   = var.app_service_account
  statements_bucket_arn = module.s3.statements_bucket_arn
  audit_logs_bucket_arn = module.s3.audit_logs_bucket_arn
  tags                  = local.common_tags
}

# ---------------------------------------------------------------------------
# VPC — network foundation
# ---------------------------------------------------------------------------

module "vpc" {
  source = "./modules/vpc"

  project      = var.project
  vpc_cidr     = var.vpc_cidr
  azs          = var.azs
  cluster_name = local.cluster_name
  tags         = local.common_tags
}

# ---------------------------------------------------------------------------
# Security Groups — three-tier: ALB → App → DB
# ---------------------------------------------------------------------------

module "security_groups" {
  source = "./modules/security-groups"

  project = var.project
  vpc_id  = module.vpc.vpc_id
  tags    = local.common_tags
}

# ---------------------------------------------------------------------------
# EKS — Kubernetes cluster + managed node group
# ---------------------------------------------------------------------------

module "eks" {
  source = "./modules/eks"

  cluster_name           = local.cluster_name
  cluster_version        = var.eks_cluster_version
  cluster_role_arn       = module.iam.eks_cluster_role_arn
  node_role_arn          = module.iam.eks_node_role_arn
  private_subnet_ids     = module.vpc.private_subnet_ids
  cluster_sg_id          = module.security_groups.cluster_sg_id
  kms_key_arn            = module.iam.kms_key_arn
  endpoint_public_access = var.eks_public_access
  node_instance_types    = var.eks_node_instance_types
  node_desired_size      = var.eks_node_desired_size
  node_max_size          = var.eks_node_max_size
  node_min_size          = var.eks_node_min_size
  tags                   = local.common_tags
}

# ---------------------------------------------------------------------------
# RDS — PostgreSQL database for the payment ledger
# ---------------------------------------------------------------------------

module "rds" {
  source = "./modules/rds"

  project             = var.project
  private_subnet_ids  = module.vpc.private_subnet_ids
  db_sg_id            = module.security_groups.db_sg_id
  kms_key_arn         = module.iam.kms_key_arn
  engine_version      = var.rds_engine_version
  instance_class      = var.rds_instance_class
  allocated_storage   = var.rds_allocated_storage
  db_name             = var.rds_db_name
  db_username         = var.rds_db_username
  db_password         = var.rds_db_password
  multi_az            = var.rds_multi_az
  skip_final_snapshot = var.rds_skip_final_snapshot
  deletion_protection = var.rds_deletion_protection
  tags                = local.common_tags
}

# ---------------------------------------------------------------------------
# S3 — statements + audit log buckets
# ---------------------------------------------------------------------------

module "s3" {
  source = "./modules/s3"

  project     = var.project
  environment = var.environment
  kms_key_arn = module.iam.kms_key_arn
  tags        = local.common_tags
}
